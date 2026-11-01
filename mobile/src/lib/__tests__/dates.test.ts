import { describe, expect, it } from '@jest/globals';

import { addDays, formatDayLabel } from '@/lib/dates';

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('keeps the day when the offset is zero', () => {
    expect(addDays('2026-11-03', 0)).toBe('2026-11-03');
  });
});

describe('formatDayLabel', () => {
  it('includes the day of the month', () => {
    expect(formatDayLabel('2026-11-03', 'en-US')).toContain('3');
  });
});
