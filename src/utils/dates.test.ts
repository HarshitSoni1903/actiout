import { describe, expect, it } from 'vitest';
import { localDateDaysAgo, todayLocalDate, weekdayOf } from './dates';

describe('weekdayOf', () => {
  it('returns 0 (Sunday) for 2026-07-05', () => {
    expect(weekdayOf('2026-07-05')).toBe(0);
  });
});

describe('todayLocalDate', () => {
  it('matches YYYY-MM-DD format', () => {
    expect(todayLocalDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('localDateDaysAgo', () => {
  it('returns todayLocalDate() when n is 0', () => {
    expect(localDateDaysAgo(0)).toBe(todayLocalDate());
  });
});
