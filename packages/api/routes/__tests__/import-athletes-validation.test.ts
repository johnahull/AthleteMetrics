/**
 * Sports and Position Validation Tests for Athletes CSV Import
 *
 * These tests verify that the athletes import validates sport and position codes
 * against the database-defined site sports and positions using ImportValidationService.
 *
 * Test scenarios:
 * - Valid sport codes are accepted and stored
 * - Mix of valid/invalid sports generates warnings, keeps valid ones
 * - All invalid sports generates warning, stores empty array
 * - Valid position matching sport is stored
 * - Position not matching any sport generates warning, position not stored
 * - Position with no sports generates warning
 * - Missing position column (backwards compatibility)
 * - Case-insensitive validation for sports and positions
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { db } from '../../db';
import { siteSports, sitePositions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { ImportValidationService } from '../../services/import-validation-service';
import { generateTestUniqueSuffix } from '../../../__tests__/shared-test-helpers';

describe('Athletes Import - Sports and Position Validation', () => {
  let service: ImportValidationService;
  let testSportId: string;
  let testPositionId: string;
  let uniqueSuffix: string;

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    const allowTestDb = process.env.ALLOW_TEST_DATABASE === 'true';

    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !allowTestDb) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety.');
    }
  });

  beforeEach(async () => {
    service = new ImportValidationService();
    // Generate unique suffix for test data (compact format to fit varchar(20) and varchar(50) constraints)
    uniqueSuffix = generateTestUniqueSuffix({ compact: true }); // e.g., "123456ABC"

    // Create a test sport in the database
    const [testSport] = await db.insert(siteSports).values({
      code: `TST_${uniqueSuffix}`, // TST_123456ABC (max 13 chars, fits in varchar(50))
      name: 'Test Sport',
      isActive: true,
      isSystemDefault: false,
    }).returning();
    testSportId = testSport.id;

    // Create a test position for this sport
    const [testPosition] = await db.insert(sitePositions).values({
      sportId: testSportId,
      code: `TP_${uniqueSuffix}`, // TP_123456ABC (max 12 chars, fits in varchar(20))
      name: 'Test Position',
      isActive: true,
    }).returning();
    testPositionId = testPosition.id;
  });

  afterEach(async () => {
    // Cleanup test data (delete positions first due to foreign key constraint to sports)
    await db.delete(sitePositions).where(eq(sitePositions.id, testPositionId)).catch(() => {});
    await db.delete(siteSports).where(eq(siteSports.id, testSportId)).catch(() => {});
  });

  describe('validateSportCode integration', () => {
    it('should validate sport code and return DB sport for valid code', async () => {
      const context = await service.loadValidationContext();
      const result = service.validateSportCode(`TST_${uniqueSuffix}`, context);

      expect(result.valid).toBe(true);
      expect(result.value).toBeDefined();
      expect(result.value?.code).toBe(`TST_${uniqueSuffix}`);
      expect(result.warning).toBeUndefined();
    });

    it('should return warning for invalid sport code', async () => {
      const context = await service.loadValidationContext();
      const result = service.validateSportCode('NONEXISTENT_SPORT', context);

      expect(result.valid).toBe(false);
      expect(result.value).toBeUndefined();
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('NONEXISTENT_SPORT');
      expect(result.warning).toContain('not found');
    });

    it('should be case-insensitive', async () => {
      const context = await service.loadValidationContext();
      const lowerResult = service.validateSportCode(`tst_${uniqueSuffix}`.toLowerCase(), context);
      const upperResult = service.validateSportCode(`TST_${uniqueSuffix}`, context);

      expect(lowerResult.valid).toBe(true);
      expect(upperResult.valid).toBe(true);
      expect(lowerResult.value?.code).toBe(upperResult.value?.code);
    });
  });

  describe('validatePositionCode integration', () => {
    it('should validate position code for valid sport and position', async () => {
      const context = await service.loadValidationContext();
      const result = service.validatePositionCode(
        `TST_${uniqueSuffix}`,
        `TP_${uniqueSuffix}`,
        context
      );

      expect(result.valid).toBe(true);
      expect(result.value).toBeDefined();
      expect(result.value?.code).toBe(`TP_${uniqueSuffix}`);
      expect(result.warning).toBeUndefined();
    });

    it('should return warning for invalid position code', async () => {
      const context = await service.loadValidationContext();
      const result = service.validatePositionCode(
        `TST_${uniqueSuffix}`,
        'NONEXISTENT_POSITION',
        context
      );

      expect(result.valid).toBe(false);
      expect(result.value).toBeUndefined();
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('NONEXISTENT_POSITION');
      expect(result.warning).toContain(`TST_${uniqueSuffix}`);
    });

    it('should return warning for invalid sport code', async () => {
      const context = await service.loadValidationContext();
      const result = service.validatePositionCode(
        'NONEXISTENT_SPORT',
        `TP_${uniqueSuffix}`,
        context
      );

      expect(result.valid).toBe(false);
      expect(result.value).toBeUndefined();
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('NONEXISTENT_SPORT');
      expect(result.warning).toContain('not found');
    });

    it('should be case-insensitive for both sport and position', async () => {
      const context = await service.loadValidationContext();
      const lowerResult = service.validatePositionCode(
        `tst_${uniqueSuffix}`.toLowerCase(),
        `tp_${uniqueSuffix}`.toLowerCase(),
        context
      );
      const upperResult = service.validatePositionCode(
        `TST_${uniqueSuffix}`,
        `TP_${uniqueSuffix}`,
        context
      );

      expect(lowerResult.valid).toBe(true);
      expect(upperResult.valid).toBe(true);
      expect(lowerResult.value?.code).toBe(upperResult.value?.code);
    });
  });

  describe('Athletes import workflow - sports validation', () => {
    it('should validate and store valid sport codes', async () => {
      const context = await service.loadValidationContext();

      // Simulate CSV row with valid sports (semicolon-delimited)
      const csvRow = {
        sports: `TST_${uniqueSuffix}`,
      };

      // Parse and validate sports
      const sportsArray = csvRow.sports
        ? csvRow.sports.split(';').map((s: string) => s.trim()).filter(Boolean)
        : [];

      const validatedSports: string[] = [];
      const warnings: string[] = [];

      for (const sportCode of sportsArray) {
        const validationResult = service.validateSportCode(sportCode, context);

        if (validationResult.valid && validationResult.value) {
          validatedSports.push(validationResult.value.code);
        } else if (validationResult.warning) {
          warnings.push(validationResult.warning);
        }
      }

      expect(validatedSports).toHaveLength(1);
      expect(validatedSports[0]).toBe(`TST_${uniqueSuffix}`);
      expect(warnings).toHaveLength(0);
    });

    it('should handle mix of valid and invalid sports with warnings', async () => {
      const context = await service.loadValidationContext();

      // Simulate CSV row with mix of valid and invalid sports
      const csvRow = {
        sports: `TST_${uniqueSuffix};INVALID_SPORT;ANOTHER_INVALID`,
      };

      const sportsArray = csvRow.sports
        ? csvRow.sports.split(';').map((s: string) => s.trim()).filter(Boolean)
        : [];

      const validatedSports: string[] = [];
      const warnings: string[] = [];

      for (const sportCode of sportsArray) {
        const validationResult = service.validateSportCode(sportCode, context);

        if (validationResult.valid && validationResult.value) {
          validatedSports.push(validationResult.value.code);
        } else if (validationResult.warning) {
          warnings.push(validationResult.warning);
        }
      }

      expect(validatedSports).toHaveLength(1);
      expect(validatedSports[0]).toBe(`TST_${uniqueSuffix}`);
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain('INVALID_SPORT');
      expect(warnings[1]).toContain('ANOTHER_INVALID');
    });

    it('should handle all invalid sports with warnings and empty array', async () => {
      const context = await service.loadValidationContext();

      // Simulate CSV row with only invalid sports
      const csvRow = {
        sports: 'INVALID_SPORT1;INVALID_SPORT2',
      };

      const sportsArray = csvRow.sports
        ? csvRow.sports.split(';').map((s: string) => s.trim()).filter(Boolean)
        : [];

      const validatedSports: string[] = [];
      const warnings: string[] = [];

      for (const sportCode of sportsArray) {
        const validationResult = service.validateSportCode(sportCode, context);

        if (validationResult.valid && validationResult.value) {
          validatedSports.push(validationResult.value.code);
        } else if (validationResult.warning) {
          warnings.push(validationResult.warning);
        }
      }

      expect(validatedSports).toHaveLength(0);
      expect(warnings).toHaveLength(2);
    });

    it('should be case-insensitive for sports validation', async () => {
      const context = await service.loadValidationContext();

      // Simulate CSV row with mixed case sports
      const csvRow = {
        sports: `tst_${uniqueSuffix}`.toLowerCase(),
      };

      const sportsArray = csvRow.sports
        ? csvRow.sports.split(';').map((s: string) => s.trim()).filter(Boolean)
        : [];

      const validatedSports: string[] = [];
      const warnings: string[] = [];

      for (const sportCode of sportsArray) {
        const validationResult = service.validateSportCode(sportCode, context);

        if (validationResult.valid && validationResult.value) {
          validatedSports.push(validationResult.value.code);
        } else if (validationResult.warning) {
          warnings.push(validationResult.warning);
        }
      }

      expect(validatedSports).toHaveLength(1);
      expect(validatedSports[0]).toBe(`TST_${uniqueSuffix}`);
      expect(warnings).toHaveLength(0);
    });
  });

  describe('Athletes import workflow - position validation', () => {
    it('should validate and store position matching athlete sports', async () => {
      const context = await service.loadValidationContext();

      // Simulate CSV row with valid sport and matching position
      const csvRow = {
        sports: `TST_${uniqueSuffix}`,
        position: `TP_${uniqueSuffix}`,
      };

      // Parse and validate sports
      const sportsArray = csvRow.sports
        ? csvRow.sports.split(';').map((s: string) => s.trim()).filter(Boolean)
        : [];

      const validatedSports: string[] = [];
      for (const sportCode of sportsArray) {
        const validationResult = service.validateSportCode(sportCode, context);
        if (validationResult.valid && validationResult.value) {
          validatedSports.push(validationResult.value.code);
        }
      }

      // Validate position against athlete's sports
      let validatedPosition: string | undefined;
      const positionWarnings: string[] = [];

      if (csvRow.position && csvRow.position.trim()) {
        let positionValid = false;

        // Check if position is valid for ANY of the athlete's sports
        for (const sportCode of validatedSports) {
          const positionResult = service.validatePositionCode(
            sportCode,
            csvRow.position,
            context
          );

          if (positionResult.valid && positionResult.value) {
            validatedPosition = positionResult.value.code;
            positionValid = true;
            break;
          }
        }

        // If position not valid for any sport, generate warning
        if (!positionValid) {
          positionWarnings.push(
            `Position '${csvRow.position}' is not valid for athlete's sports (${validatedSports.join(', ')})`
          );
        }
      }

      expect(validatedPosition).toBe(`TP_${uniqueSuffix}`);
      expect(positionWarnings).toHaveLength(0);
    });

    it('should generate warning for position not matching any sport', async () => {
      const context = await service.loadValidationContext();

      // Simulate CSV row with valid sport but invalid position
      const csvRow = {
        sports: `TST_${uniqueSuffix}`,
        position: 'INVALID_POSITION',
      };

      const sportsArray = csvRow.sports
        ? csvRow.sports.split(';').map((s: string) => s.trim()).filter(Boolean)
        : [];

      const validatedSports: string[] = [];
      for (const sportCode of sportsArray) {
        const validationResult = service.validateSportCode(sportCode, context);
        if (validationResult.valid && validationResult.value) {
          validatedSports.push(validationResult.value.code);
        }
      }

      let validatedPosition: string | undefined;
      const positionWarnings: string[] = [];

      if (csvRow.position && csvRow.position.trim()) {
        let positionValid = false;

        for (const sportCode of validatedSports) {
          const positionResult = service.validatePositionCode(
            sportCode,
            csvRow.position,
            context
          );

          if (positionResult.valid && positionResult.value) {
            validatedPosition = positionResult.value.code;
            positionValid = true;
            break;
          }
        }

        if (!positionValid) {
          positionWarnings.push(
            `Position '${csvRow.position}' is not valid for athlete's sports (${validatedSports.join(', ')})`
          );
        }
      }

      expect(validatedPosition).toBeUndefined();
      expect(positionWarnings).toHaveLength(1);
      expect(positionWarnings[0]).toContain('INVALID_POSITION');
    });

    it('should generate warning for position with no sports', async () => {
      const context = await service.loadValidationContext();

      // Simulate CSV row with position but no sports
      const csvRow = {
        sports: '',
        position: `TP_${uniqueSuffix}`,
      };

      const sportsArray = csvRow.sports
        ? csvRow.sports.split(';').map((s: string) => s.trim()).filter(Boolean)
        : [];

      const validatedSports: string[] = [];
      for (const sportCode of sportsArray) {
        const validationResult = service.validateSportCode(sportCode, context);
        if (validationResult.valid && validationResult.value) {
          validatedSports.push(validationResult.value.code);
        }
      }

      let validatedPosition: string | undefined;
      const positionWarnings: string[] = [];

      if (csvRow.position && csvRow.position.trim()) {
        if (validatedSports.length === 0) {
          positionWarnings.push(
            `Position '${csvRow.position}' cannot be assigned without sports`
          );
        } else {
          let positionValid = false;
          for (const sportCode of validatedSports) {
            const positionResult = service.validatePositionCode(
              sportCode,
              csvRow.position,
              context
            );

            if (positionResult.valid && positionResult.value) {
              validatedPosition = positionResult.value.code;
              positionValid = true;
              break;
            }
          }

          if (!positionValid) {
            positionWarnings.push(
              `Position '${csvRow.position}' is not valid for athlete's sports (${validatedSports.join(', ')})`
            );
          }
        }
      }

      expect(validatedPosition).toBeUndefined();
      expect(positionWarnings).toHaveLength(1);
      expect(positionWarnings[0]).toContain('cannot be assigned without sports');
    });

    it('should handle missing position column (backwards compatibility)', async () => {
      const context = await service.loadValidationContext();

      // Simulate CSV row without position column
      const csvRow = {
        sports: `TST_${uniqueSuffix}`,
        // position field is missing/undefined
      };

      const sportsArray = csvRow.sports
        ? csvRow.sports.split(';').map((s: string) => s.trim()).filter(Boolean)
        : [];

      const validatedSports: string[] = [];
      for (const sportCode of sportsArray) {
        const validationResult = service.validateSportCode(sportCode, context);
        if (validationResult.valid && validationResult.value) {
          validatedSports.push(validationResult.value.code);
        }
      }

      let validatedPosition: string | undefined;
      const positionWarnings: string[] = [];

      // Position validation is skipped if position is undefined/empty
      if ((csvRow as any).position && (csvRow as any).position.trim()) {
        // This block should not execute
        validatedPosition = (csvRow as any).position;
      }

      expect(validatedSports).toHaveLength(1);
      expect(validatedPosition).toBeUndefined();
      expect(positionWarnings).toHaveLength(0);
    });

    it('should be case-insensitive for position validation', async () => {
      const context = await service.loadValidationContext();

      // Simulate CSV row with mixed case position
      const csvRow = {
        sports: `TST_${uniqueSuffix}`,
        position: `tp_${uniqueSuffix}`.toLowerCase(),
      };

      const sportsArray = csvRow.sports
        ? csvRow.sports.split(';').map((s: string) => s.trim()).filter(Boolean)
        : [];

      const validatedSports: string[] = [];
      for (const sportCode of sportsArray) {
        const validationResult = service.validateSportCode(sportCode, context);
        if (validationResult.valid && validationResult.value) {
          validatedSports.push(validationResult.value.code);
        }
      }

      let validatedPosition: string | undefined;
      const positionWarnings: string[] = [];

      if (csvRow.position && csvRow.position.trim()) {
        let positionValid = false;

        for (const sportCode of validatedSports) {
          const positionResult = service.validatePositionCode(
            sportCode,
            csvRow.position,
            context
          );

          if (positionResult.valid && positionResult.value) {
            validatedPosition = positionResult.value.code;
            positionValid = true;
            break;
          }
        }

        if (!positionValid) {
          positionWarnings.push(
            `Position '${csvRow.position}' is not valid for athlete's sports (${validatedSports.join(', ')})`
          );
        }
      }

      expect(validatedPosition).toBe(`TP_${uniqueSuffix}`);
      expect(positionWarnings).toHaveLength(0);
    });
  });

  describe('End-to-end validation flow', () => {
    it('should complete full validation workflow for athletes import', async () => {
      const context = await service.loadValidationContext();

      // Simulate multiple CSV rows with different validation scenarios
      const csvRows = [
        { sports: `TST_${uniqueSuffix}`, position: `TP_${uniqueSuffix}` }, // Valid sport + valid position
        { sports: 'INVALID_SPORT', position: `TP_${uniqueSuffix}` }, // Invalid sport + position
        { sports: `TST_${uniqueSuffix}`, position: 'INVALID_POSITION' }, // Valid sport + invalid position
        { sports: `TST_${uniqueSuffix}`, position: '' }, // Valid sport + no position
        { sports: '', position: `TP_${uniqueSuffix}` }, // No sports + position (warning)
      ];

      const results = csvRows.map((row, index) => {
        const sportsArray = row.sports
          ? row.sports.split(';').map((s: string) => s.trim()).filter(Boolean)
          : [];

        const validatedSports: string[] = [];
        const sportsWarnings: string[] = [];

        for (const sportCode of sportsArray) {
          const validationResult = service.validateSportCode(sportCode, context);
          if (validationResult.valid && validationResult.value) {
            validatedSports.push(validationResult.value.code);
          } else if (validationResult.warning) {
            sportsWarnings.push(validationResult.warning);
          }
        }

        let validatedPosition: string | undefined;
        const positionWarnings: string[] = [];

        if (row.position && row.position.trim()) {
          if (validatedSports.length === 0) {
            positionWarnings.push(
              `Position '${row.position}' cannot be assigned without sports`
            );
          } else {
            let positionValid = false;
            for (const sportCode of validatedSports) {
              const positionResult = service.validatePositionCode(
                sportCode,
                row.position,
                context
              );

              if (positionResult.valid && positionResult.value) {
                validatedPosition = positionResult.value.code;
                positionValid = true;
                break;
              }
            }

            if (!positionValid) {
              positionWarnings.push(
                `Position '${row.position}' is not valid for athlete's sports (${validatedSports.join(', ')})`
              );
            }
          }
        }

        return {
          row: index + 1,
          validatedSports,
          validatedPosition,
          sportsWarnings,
          positionWarnings,
        };
      });

      // Verify results
      // Row 1: Valid sport + valid position
      expect(results[0].validatedSports).toEqual([`TST_${uniqueSuffix}`]);
      expect(results[0].validatedPosition).toBe(`TP_${uniqueSuffix}`);
      expect(results[0].sportsWarnings).toHaveLength(0);
      expect(results[0].positionWarnings).toHaveLength(0);

      // Row 2: Invalid sport + position
      expect(results[1].validatedSports).toHaveLength(0);
      expect(results[1].validatedPosition).toBeUndefined();
      expect(results[1].sportsWarnings).toHaveLength(1);
      expect(results[1].positionWarnings).toHaveLength(1);

      // Row 3: Valid sport + invalid position
      expect(results[2].validatedSports).toEqual([`TST_${uniqueSuffix}`]);
      expect(results[2].validatedPosition).toBeUndefined();
      expect(results[2].sportsWarnings).toHaveLength(0);
      expect(results[2].positionWarnings).toHaveLength(1);

      // Row 4: Valid sport + no position
      expect(results[3].validatedSports).toEqual([`TST_${uniqueSuffix}`]);
      expect(results[3].validatedPosition).toBeUndefined();
      expect(results[3].sportsWarnings).toHaveLength(0);
      expect(results[3].positionWarnings).toHaveLength(0);

      // Row 5: No sports + position (warning)
      expect(results[4].validatedSports).toHaveLength(0);
      expect(results[4].validatedPosition).toBeUndefined();
      expect(results[4].sportsWarnings).toHaveLength(0);
      expect(results[4].positionWarnings).toHaveLength(1);
    });
  });
});
