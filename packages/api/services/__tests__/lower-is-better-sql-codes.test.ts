/**
 * AM-FEAT-016: the SQL decline-direction code list must treat both 5-0-5 protocols
 * and both COD deficit metrics as lower-is-better (otherwise a rising time is
 * reported as an improvement).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db', () => ({ db: {} }));

import { LOWER_IS_BETTER_SQL_CODES } from '../analytics-service';

describe('LOWER_IS_BETTER_SQL_CODES', () => {
  it.each([
    'AGILITY_505_M',
    'AGILITY_505_YD',
    'AGILITY_COD_DEFICIT_M',
    'AGILITY_COD_DEFICIT_YD',
  ])('includes %s', (code) => {
    expect(LOWER_IS_BETTER_SQL_CODES).toContain(code);
  });

  it('keeps the pre-existing lower-is-better codes and drops the retired code', () => {
    for (const code of ['FLY10_TIME', 'AGILITY_5105', 'T_TEST', 'DASH_40YD']) {
      expect(LOWER_IS_BETTER_SQL_CODES).toContain(code);
    }
    expect(LOWER_IS_BETTER_SQL_CODES).not.toContain('AGILITY_505');
  });

  it('only contains plain metric-code literals (safe for sql.raw interpolation)', () => {
    for (const code of LOWER_IS_BETTER_SQL_CODES) {
      expect(code).toMatch(/^[A-Z0-9_]+$/);
    }
  });
});
