/**
 * Tests for BenchmarkComparison component
 * Verifies display of range-based benchmarks alongside traditional operators
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BenchmarkComparison } from '../BenchmarkComparison';

describe('BenchmarkComparison', () => {
  describe('Traditional Operators (lte, gte, eq)', () => {
    it('displays lte operator (lower is better)', () => {
      render(
        <BenchmarkComparison
          athleteValue={0.95}
          benchmarkValue={1.0}
          comparisonOperator="lte"
          metricCode="FLY10_TIME"
          isMet={true}
        />
      );

      expect(screen.getByText('Your Value')).toBeInTheDocument();
      expect(screen.getByText('0.950')).toBeInTheDocument();
      expect(screen.getByText(/Target ≤/i)).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText(/faster than target/i)).toBeInTheDocument();
    });

    it('displays gte operator (higher is better)', () => {
      render(
        <BenchmarkComparison
          athleteValue={35}
          benchmarkValue={30}
          comparisonOperator="gte"
          metricCode="VERTICAL_JUMP"
          isMet={true}
        />
      );

      expect(screen.getByText(/Target ≥/i)).toBeInTheDocument();
      expect(screen.getByText(/above target/i)).toBeInTheDocument();
    });

    it('displays eq operator (exact match)', () => {
      render(
        <BenchmarkComparison
          athleteValue={100}
          benchmarkValue={100}
          comparisonOperator="eq"
          metricCode="WEIGHT"
          isMet={true}
        />
      );

      expect(screen.getByText(/Target =/i)).toBeInTheDocument();
      expect(screen.getByText(/Exact match!/i)).toBeInTheDocument();
    });
  });

  describe('Range Operator', () => {
    it('displays range benchmark when within range', () => {
      render(
        <BenchmarkComparison
          athleteValue={27.5}
          benchmarkValue={null}
          minValue={25}
          maxValue={30}
          comparisonOperator="range"
          metricCode="VERTICAL_JUMP"
          isMet={true}
        />
      );

      // Should show "Your Value"
      expect(screen.getByText('Your Value')).toBeInTheDocument();
      expect(screen.getByText('27.500')).toBeInTheDocument();

      // Should show "Target Range: 25 – 30"
      expect(screen.getByText('Target Range')).toBeInTheDocument();
      expect(screen.getByText('25 – 30')).toBeInTheDocument();

      // Should show "Within Range" status
      expect(screen.getByText(/Within Range/i)).toBeInTheDocument();
    });

    it('displays range benchmark when below range', () => {
      render(
        <BenchmarkComparison
          athleteValue={22}
          benchmarkValue={null}
          minValue={25}
          maxValue={30}
          comparisonOperator="range"
          metricCode="VERTICAL_JUMP"
          isMet={false}
        />
      );

      expect(screen.getByText('22.000')).toBeInTheDocument();
      expect(screen.getByText('25 – 30')).toBeInTheDocument();

      // Should show "Below Range" with distance to minValue
      expect(screen.getByText(/Below Range/i)).toBeInTheDocument();
      expect(screen.getByText(/3\.000/i)).toBeInTheDocument(); // 25 - 22 = 3
    });

    it('displays range benchmark when above range', () => {
      render(
        <BenchmarkComparison
          athleteValue={35}
          benchmarkValue={null}
          minValue={25}
          maxValue={30}
          comparisonOperator="range"
          metricCode="VERTICAL_JUMP"
          isMet={false}
        />
      );

      expect(screen.getByText('35.000')).toBeInTheDocument();
      expect(screen.getByText('25 – 30')).toBeInTheDocument();

      // Should show "Above Range" with distance to maxValue
      expect(screen.getByText(/Above Range/i)).toBeInTheDocument();
      expect(screen.getByText(/Above Range by 5\.000/i)).toBeInTheDocument(); // 35 - 30 = 5
    });

    it('handles null athlete value for range benchmark', () => {
      render(
        <BenchmarkComparison
          athleteValue={null}
          benchmarkValue={null}
          minValue={25}
          maxValue={30}
          comparisonOperator="range"
          metricCode="VERTICAL_JUMP"
          isMet={false}
        />
      );

      expect(screen.getByText('—')).toBeInTheDocument(); // No value placeholder
      expect(screen.getByText('25 – 30')).toBeInTheDocument();
      expect(screen.getByText(/No measurement recorded/i)).toBeInTheDocument();
    });

    it('displays operator info for range benchmarks', () => {
      render(
        <BenchmarkComparison
          athleteValue={27}
          benchmarkValue={null}
          minValue={25}
          maxValue={30}
          comparisonOperator="range"
          metricCode="VERTICAL_JUMP"
          isMet={true}
        />
      );

      // Should show "Target range (↔)" or similar indicator
      expect(screen.getByText(/Target range \(↔\)/i)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles range at boundary (min edge)', () => {
      render(
        <BenchmarkComparison
          athleteValue={25}
          benchmarkValue={null}
          minValue={25}
          maxValue={30}
          comparisonOperator="range"
          metricCode="VERTICAL_JUMP"
          isMet={true}
        />
      );

      expect(screen.getByText(/Within Range/i)).toBeInTheDocument();
    });

    it('handles range at boundary (max edge)', () => {
      render(
        <BenchmarkComparison
          athleteValue={30}
          benchmarkValue={null}
          minValue={25}
          maxValue={30}
          comparisonOperator="range"
          metricCode="VERTICAL_JUMP"
          isMet={true}
        />
      );

      expect(screen.getByText(/Within Range/i)).toBeInTheDocument();
    });

    it('requires minValue and maxValue for range operator', () => {
      // This should not crash even with missing values
      render(
        <BenchmarkComparison
          athleteValue={27}
          benchmarkValue={null}
          comparisonOperator="range"
          metricCode="VERTICAL_JUMP"
          isMet={false}
        />
      );

      // Should handle gracefully
      expect(screen.getByText('Your Value')).toBeInTheDocument();
    });
  });
});
