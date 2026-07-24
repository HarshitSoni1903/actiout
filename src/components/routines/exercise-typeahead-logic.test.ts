import { describe, expect, it } from 'vitest';
import type { ExerciseCatalogEntry, ExerciseCategory } from '../../domain/types';
import { normalizeExerciseName } from '../../utils';
import { CATEGORY_SELECT_OPTIONS, findExactMatch, groupByCategory } from './exercise-typeahead-logic';

function makeEntry(
  canonicalName: string,
  category?: ExerciseCategory,
  overrides: Partial<ExerciseCatalogEntry> = {}
): ExerciseCatalogEntry {
  return {
    id: `id-${canonicalName}`,
    canonicalName,
    normalizedName: normalizeExerciseName(canonicalName),
    category,
    isCustom: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('groupByCategory', () => {
  it('groups entries under their category label', () => {
    const groups = groupByCategory([makeEntry('Squat', 'legs'), makeEntry('Bench Press', 'chest')]);
    expect(groups).toEqual([
      { group: 'Legs', items: [{ value: 'Squat', label: 'Squat' }] },
      { group: 'Chest', items: [{ value: 'Bench Press', label: 'Bench Press' }] },
    ]);
  });

  it('buckets entries with a missing category under "Other"', () => {
    const groups = groupByCategory([makeEntry('Mystery Move', undefined)]);
    expect(groups).toEqual([{ group: 'Other', items: [{ value: 'Mystery Move', label: 'Mystery Move' }] }]);
  });

  it('keeps multiple entries in the same category together, in input order', () => {
    const groups = groupByCategory([
      makeEntry('Squat', 'legs'),
      makeEntry('Lunge', 'legs'),
      makeEntry('Bench Press', 'chest'),
    ]);
    expect(groups).toEqual([
      {
        group: 'Legs',
        items: [
          { value: 'Squat', label: 'Squat' },
          { value: 'Lunge', label: 'Lunge' },
        ],
      },
      { group: 'Chest', items: [{ value: 'Bench Press', label: 'Bench Press' }] },
    ]);
  });

  it('orders groups by first-seen category, not alphabetically', () => {
    const groups = groupByCategory([
      makeEntry('Treadmill Run', 'cardio'),
      makeEntry('Squat', 'legs'),
      makeEntry('Sprint Intervals', 'cardio'),
    ]);
    expect(groups.map((g) => g.group)).toEqual(['Cardio', 'Legs']);
  });

  it('returns an empty array for no entries', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe('CATEGORY_SELECT_OPTIONS', () => {
  it('covers all 8 ExerciseCategory values', () => {
    expect(CATEGORY_SELECT_OPTIONS).toHaveLength(8);
    expect(CATEGORY_SELECT_OPTIONS.map((o) => o.value)).toContain('other');
  });
});

describe('findExactMatch', () => {
  const entries = [makeEntry('Bench Press', 'chest'), makeEntry('Squat', 'legs')];

  it('matches on exact canonical name', () => {
    expect(findExactMatch('Bench Press', entries)).toBe(entries[0]);
  });

  it('is case-insensitive', () => {
    expect(findExactMatch('bench press', entries)).toBe(entries[0]);
    expect(findExactMatch('BENCH PRESS', entries)).toBe(entries[0]);
  });

  it('is whitespace-insensitive (collapses runs, trims ends)', () => {
    expect(findExactMatch('  Bench   Press  ', entries)).toBe(entries[0]);
  });

  it('returns undefined for a brand-new name', () => {
    expect(findExactMatch('Deadlift', entries)).toBeUndefined();
  });

  it('returns undefined for an empty or whitespace-only name', () => {
    expect(findExactMatch('', entries)).toBeUndefined();
    expect(findExactMatch('   ', entries)).toBeUndefined();
  });

  it('does not partial/substring match', () => {
    expect(findExactMatch('Bench', entries)).toBeUndefined();
  });
});
