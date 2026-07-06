import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActiOutDB } from '../db/schema';
import { initializeDb } from '../db/seed';
import { ensureExercise, normalizeExerciseName, searchExercises } from './exercise-service';

describe('normalizeExerciseName', () => {
  it('trims, collapses whitespace, and lowercases', () => {
    expect(normalizeExerciseName('  Bench   PRESS ')).toBe('bench press');
  });
});

describe('exercise-service (db-backed)', () => {
  let testDb: ActiOutDB;

  beforeEach(async () => {
    testDb = new ActiOutDB(`test-db-${crypto.randomUUID()}`);
    await initializeDb(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  describe('ensureExercise', () => {
    it('returns the seeded row for an existing exercise, without creating a duplicate', async () => {
      const before = await testDb.exerciseCatalog.count();
      const entry = await ensureExercise('Bench Press', testDb);
      const after = await testDb.exerciseCatalog.count();

      expect(entry.canonicalName).toBe('Bench Press');
      expect(entry.normalizedName).toBe('bench press');
      expect(entry.isCustom).toBe(false);
      expect(after).toBe(before);
    });

    it('creates a new custom exercise when no match exists', async () => {
      const before = await testDb.exerciseCatalog.count();
      const entry = await ensureExercise('Zercher Squat', testDb);
      const after = await testDb.exerciseCatalog.count();

      expect(entry.canonicalName).toBe('Zercher Squat');
      expect(entry.normalizedName).toBe('zercher squat');
      expect(entry.isCustom).toBe(true);
      expect(after).toBe(before + 1);
    });

    it('is idempotent: calling twice with the same name returns the same id', async () => {
      const first = await ensureExercise('Zercher Squat', testDb);
      const second = await ensureExercise('Zercher Squat', testDb);

      expect(second.id).toBe(first.id);
      const count = await testDb.exerciseCatalog.where('normalizedName').equals('zercher squat').count();
      expect(count).toBe(1);
    });

    it('handles concurrent calls for the same new name: same id, no rejection', async () => {
      const [first, second] = await Promise.all([
        ensureExercise('Same New Name', testDb),
        ensureExercise('Same New Name', testDb),
      ]);

      expect(second.id).toBe(first.id);
      const count = await testDb.exerciseCatalog.where('normalizedName').equals('same new name').count();
      expect(count).toBe(1);
    });

    it('throws on an empty or whitespace-only name', async () => {
      await expect(ensureExercise('', testDb)).rejects.toThrow();
      await expect(ensureExercise('   ', testDb)).rejects.toThrow();
    });
  });

  describe('searchExercises', () => {
    it('returns empty array for an empty query', async () => {
      const results = await searchExercises('', 8, testDb);
      expect(results).toEqual([]);
    });

    it('finds prefix matches first, e.g. "ben" includes Bench Press', async () => {
      const results = await searchExercises('ben', 8, testDb);
      const names = results.map((r) => r.canonicalName);
      expect(names).toContain('Bench Press');
    });

    it('ranks prefix matches before substring matches', async () => {
      // Seeded data: "Rowing Machine" is the only prefix match for "row";
      // "Barbell Row", "Seated Cable Row", "T-Bar Row" match only as substrings.
      const results = await searchExercises('row', 8, testDb);
      const names = results.map((r) => r.canonicalName);

      expect(names[0]).toBe('Rowing Machine');
      expect(names).toContain('Barbell Row');
      expect(names.indexOf('Barbell Row')).toBeGreaterThan(names.indexOf('Rowing Machine'));
    });

    it('respects the limit parameter', async () => {
      const results = await searchExercises('e', 3, testDb);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('defaults limit to 8', async () => {
      const results = await searchExercises('e', undefined, testDb);
      expect(results.length).toBeLessThanOrEqual(8);
    });
  });
});
