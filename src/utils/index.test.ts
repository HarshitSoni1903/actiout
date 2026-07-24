import { describe, expect, it } from 'vitest';
import { localDateDaysAgo, newId, normalizeExerciseName, todayLocalDate, weekdayOf } from './index';

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

describe('newId', () => {
  it('returns a non-empty string', () => {
    expect(newId().length).toBeGreaterThan(0);
  });

  it('returns different values on two calls', () => {
    expect(newId()).not.toBe(newId());
  });
});

describe('normalizeExerciseName', () => {
  it('lowercases, collapses internal whitespace, and trims', () => {
    expect(normalizeExerciseName('  Bench   Press  ')).toBe('bench press');
  });
});
