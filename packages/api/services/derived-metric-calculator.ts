/**
 * Derived Metric Calculator Service
 *
 * Automatically calculates derived metric values from source measurements.
 * Handles date matching strategies, direct measurement priority, and recalculation.
 */

import type { db as dbType } from '../db';
import {
  measurements,
  siteMetrics,
  users,
  type Measurement,
  type InsertMeasurement,
  type SiteMetric,
} from '@shared/schema';
import { eq, and, gte, lte, sql, or, desc, asc } from 'drizzle-orm';
import { evaluateFormula } from './formula-service';

export class DerivedMetricCalculator {
  constructor(private db: typeof dbType) {}

  /**
   * Called after a measurement is created/updated.
   * Finds derived metrics that depend on this measurement's metric
   * and calculates their values if possible.
   */
  async processNewMeasurement(measurement: Measurement): Promise<Measurement[]> {
    // Find all active derived metrics
    const derivedMetrics = await this.db
      .select()
      .from(siteMetrics)
      .where(
        and(
          eq(siteMetrics.isDerived, true),
          eq(siteMetrics.isActive, true)
        )
      );

    // Filter to only those that depend on this measurement's metric
    const dependentDerivedMetrics = derivedMetrics.filter(
      (metric: SiteMetric) =>
        metric.dependentMetrics &&
        metric.dependentMetrics.includes(measurement.metric)
    );

    if (dependentDerivedMetrics.length === 0) {
      return [];
    }

    const calculatedMeasurements: Measurement[] = [];

    // Process each derived metric
    for (const derivedMetric of dependentDerivedMetrics) {
      try {
        // Check if athlete already has a direct (non-calculated) measurement for this derived metric on this date
        const hasDirectMeasurement = await this.hasDirectMeasurement(
          measurement.userId,
          derivedMetric.code,
          measurement.date
        );

        if (hasDirectMeasurement) {
          // Direct measurements take priority - skip calculation
          continue;
        }

        // Find source measurements for the formula
        const sourceMeasurementsMap = await this.findSourceMeasurements(
          measurement.userId,
          derivedMetric.dependentMetrics || [],
          measurement.date,
          derivedMetric.calculationConfig || {
            dateMatchStrategy: 'same_date',
            missingSourceBehavior: 'skip',
          }
        );

        if (!sourceMeasurementsMap) {
          // Missing source measurements - skip based on missingSourceBehavior
          continue;
        }

        // Build source values for formula evaluation
        const sourceValues: Record<string, number> = {};
        const sourceMeasurementIds: string[] = [];

        for (const [metricCode, sourceMeasurement] of sourceMeasurementsMap.entries()) {
          sourceValues[metricCode] = parseFloat(sourceMeasurement.value);
          sourceMeasurementIds.push(sourceMeasurement.id);
        }

        // Evaluate the formula
        const calculatedValue = evaluateFormula(
          derivedMetric.formula || '',
          sourceValues
        );

        if (calculatedValue === null) {
          // Formula evaluation failed
          continue;
        }

        // Check for invalid results (Infinity, NaN)
        if (!isFinite(calculatedValue)) {
          continue;
        }

        // Get user info for age calculation
        const [user] = await this.db
          .select()
          .from(users)
          .where(eq(users.id, measurement.userId));

        if (!user) {
          continue;
        }

        // Calculate age at measurement date
        const measurementDate = new Date(measurement.date);
        let age = 0;
        if (user.birthDate) {
          const birthDate = new Date(user.birthDate);
          age = measurementDate.getFullYear() - birthDate.getFullYear();
          const birthdayThisYear = new Date(
            measurementDate.getFullYear(),
            birthDate.getMonth(),
            birthDate.getDate()
          );
          if (measurementDate < birthdayThisYear) {
            age -= 1;
          }
        }

        // Check if calculated measurement already exists (update scenario)
        const existingCalculated = await this.db
          .select()
          .from(measurements)
          .where(
            and(
              eq(measurements.userId, measurement.userId),
              eq(measurements.metric, derivedMetric.code),
              eq(measurements.date, measurement.date),
              eq(measurements.isCalculated, true)
            )
          );

        let createdMeasurement: Measurement;

        if (existingCalculated.length > 0) {
          // Update existing calculated measurement
          const [updated] = await this.db
            .update(measurements)
            .set({
              value: calculatedValue.toFixed(3),
              calculatedFromMeasurementIds: sourceMeasurementIds,
              calculationMetadata: {
                formula: derivedMetric.formula || '',
                sourceValues,
                calculatedAt: new Date().toISOString(),
              },
            })
            .where(eq(measurements.id, existingCalculated[0].id))
            .returning();

          createdMeasurement = updated;
        } else {
          // Create new calculated measurement
          const [newMeasurement] = await this.db
            .insert(measurements)
            .values({
              userId: measurement.userId,
              submittedBy: measurement.submittedBy,
              date: measurement.date,
              metric: derivedMetric.code,
              value: calculatedValue.toFixed(3),
              units: derivedMetric.unit || '',
              age,
              isVerified: measurement.isVerified,
              teamId: measurement.teamId,
              season: measurement.season,
              teamContextAuto: measurement.teamContextAuto,
              teamNameSnapshot: measurement.teamNameSnapshot,
              organizationId: measurement.organizationId,
              isCalculated: true,
              calculatedFromMeasurementIds: sourceMeasurementIds,
              calculationMetadata: {
                formula: derivedMetric.formula || '',
                sourceValues,
                calculatedAt: new Date().toISOString(),
              },
            })
            .returning();

          createdMeasurement = newMeasurement;
        }

        calculatedMeasurements.push(createdMeasurement);
      } catch (error) {
        // Log error but continue processing other derived metrics
        console.error(
          `Error calculating derived metric ${derivedMetric.code}:`,
          error
        );
      }
    }

    return calculatedMeasurements;
  }

  /**
   * Recalculate derived measurements for an athlete when source changes.
   * Called after measurement update or delete.
   */
  async recalculateForAthlete(
    userId: string,
    metricCode: string,
    date?: string
  ): Promise<void> {
    // Find all derived metrics that depend on this source metric
    const derivedMetrics = await this.db
      .select()
      .from(siteMetrics)
      .where(
        and(
          eq(siteMetrics.isDerived, true),
          eq(siteMetrics.isActive, true)
        )
      );

    const dependentDerivedMetrics = derivedMetrics.filter(
      (metric: SiteMetric) =>
        metric.dependentMetrics &&
        metric.dependentMetrics.includes(metricCode)
    );

    if (dependentDerivedMetrics.length === 0) {
      return;
    }

    // For each derived metric, recalculate or delete calculated measurements
    for (const derivedMetric of dependentDerivedMetrics) {
      try {
        // Find all calculated measurements for this derived metric and athlete
        // Build conditions array based on whether date is specified
        const conditions = [
          eq(measurements.userId, userId),
          eq(measurements.metric, derivedMetric.code),
          eq(measurements.isCalculated, true)
        ];

        if (date) {
          conditions.push(eq(measurements.date, date));
        }

        const calculatedMeasurements = await this.db
          .select()
          .from(measurements)
          .where(and(...conditions));

        for (const calculatedMeasurement of calculatedMeasurements) {
          // Try to find source measurements
          const sourceMeasurementsMap = await this.findSourceMeasurements(
            userId,
            derivedMetric.dependentMetrics || [],
            calculatedMeasurement.date,
            derivedMetric.calculationConfig || {
              dateMatchStrategy: 'same_date',
              missingSourceBehavior: 'skip',
            }
          );

          if (!sourceMeasurementsMap) {
            // Source measurements no longer available - delete calculated measurement
            await this.db
              .delete(measurements)
              .where(eq(measurements.id, calculatedMeasurement.id));
            continue;
          }

          // Build source values for formula evaluation
          const sourceValues: Record<string, number> = {};
          const sourceMeasurementIds: string[] = [];

          for (const [metricCode, sourceMeasurement] of sourceMeasurementsMap.entries()) {
            sourceValues[metricCode] = parseFloat(sourceMeasurement.value);
            sourceMeasurementIds.push(sourceMeasurement.id);
          }

          // Evaluate the formula
          const calculatedValue = evaluateFormula(
            derivedMetric.formula || '',
            sourceValues
          );

          if (calculatedValue === null || !isFinite(calculatedValue)) {
            // Formula evaluation failed - delete calculated measurement
            await this.db
              .delete(measurements)
              .where(eq(measurements.id, calculatedMeasurement.id));
            continue;
          }

          // Update calculated measurement
          await this.db
            .update(measurements)
            .set({
              value: calculatedValue.toFixed(3),
              calculatedFromMeasurementIds: sourceMeasurementIds,
              calculationMetadata: {
                formula: derivedMetric.formula || '',
                sourceValues,
                calculatedAt: new Date().toISOString(),
              },
            })
            .where(eq(measurements.id, calculatedMeasurement.id));
        }
      } catch (error) {
        console.error(
          `Error recalculating derived metric ${derivedMetric.code}:`,
          error
        );
      }
    }
  }

  /**
   * Public method for finding source measurements (used for preview)
   * @returns Map of metric code to measurement, or null if any source is missing
   */
  async findSourceMeasurementsPublic(
    userId: string,
    dependentMetrics: string[],
    targetDate: string,
    config: {
      dateMatchStrategy: 'same_date' | 'latest_before' | 'closest';
      maxDateDifference?: number;
      missingSourceBehavior: 'skip' | 'error';
    }
  ): Promise<Map<string, Measurement> | null> {
    return this.findSourceMeasurements(userId, dependentMetrics, targetDate, config);
  }

  /**
   * Find source measurements for a formula using date matching strategy.
   * @returns Map of metric code to measurement, or null if any source is missing
   */
  private async findSourceMeasurements(
    userId: string,
    dependentMetrics: string[],
    targetDate: string,
    config: {
      dateMatchStrategy: 'same_date' | 'latest_before' | 'closest';
      maxDateDifference?: number;
      missingSourceBehavior: 'skip' | 'error';
    }
  ): Promise<Map<string, Measurement> | null> {
    const sourceMeasurementsMap = new Map<string, Measurement>();

    for (const metricCode of dependentMetrics) {
      let sourceMeasurement: Measurement | undefined;

      switch (config.dateMatchStrategy) {
        case 'same_date':
          // Only use exact date matches
          const [exactMatch] = await this.db
            .select()
            .from(measurements)
            .where(
              and(
                eq(measurements.userId, userId),
                eq(measurements.metric, metricCode),
                eq(measurements.date, targetDate),
                eq(measurements.isVerified, true)
              )
            )
            .orderBy(desc(measurements.createdAt))
            .limit(1);

          sourceMeasurement = exactMatch;
          break;

        case 'latest_before':
          // Use most recent measurement on or before target date
          const [latestBefore] = await this.db
            .select()
            .from(measurements)
            .where(
              and(
                eq(measurements.userId, userId),
                eq(measurements.metric, metricCode),
                lte(measurements.date, targetDate),
                eq(measurements.isVerified, true)
              )
            )
            .orderBy(desc(measurements.date), desc(measurements.createdAt))
            .limit(1);

          sourceMeasurement = latestBefore;
          break;

        case 'closest':
          // Use closest measurement within maxDateDifference days
          const maxDays = config.maxDateDifference || 7;

          // Calculate date range
          const targetDateObj = new Date(targetDate);
          const minDate = new Date(targetDateObj);
          minDate.setDate(minDate.getDate() - maxDays);
          const maxDate = new Date(targetDateObj);
          maxDate.setDate(maxDate.getDate() + maxDays);

          // Get all measurements within range
          const candidateMeasurements = await this.db
            .select()
            .from(measurements)
            .where(
              and(
                eq(measurements.userId, userId),
                eq(measurements.metric, metricCode),
                gte(measurements.date, minDate.toISOString().split('T')[0]),
                lte(measurements.date, maxDate.toISOString().split('T')[0]),
                eq(measurements.isVerified, true)
              )
            )
            .orderBy(measurements.date);

          // Find closest by calculating absolute date difference
          if (candidateMeasurements.length > 0) {
            const targetTime = targetDateObj.getTime();
            let closestMeasurement = candidateMeasurements[0];
            let closestDiff = Math.abs(
              new Date(closestMeasurement.date).getTime() - targetTime
            );

            for (const candidate of candidateMeasurements) {
              const diff = Math.abs(
                new Date(candidate.date).getTime() - targetTime
              );
              if (diff < closestDiff) {
                closestDiff = diff;
                closestMeasurement = candidate;
              }
            }

            sourceMeasurement = closestMeasurement;
          }
          break;
      }

      if (!sourceMeasurement) {
        // Missing source measurement
        if (config.missingSourceBehavior === 'skip') {
          return null;
        } else {
          throw new Error(
            `Missing source measurement for metric: ${metricCode}`
          );
        }
      }

      sourceMeasurementsMap.set(metricCode, sourceMeasurement);
    }

    return sourceMeasurementsMap;
  }

  /**
   * Check if athlete has a direct (non-calculated) measurement for the derived metric.
   * Direct measurements take priority over calculated ones.
   */
  private async hasDirectMeasurement(
    userId: string,
    metricCode: string,
    date: string
  ): Promise<boolean> {
    const [directMeasurement] = await this.db
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.userId, userId),
          eq(measurements.metric, metricCode),
          eq(measurements.date, date),
          eq(measurements.isCalculated, false)
        )
      )
      .limit(1);

    return !!directMeasurement;
  }
}
