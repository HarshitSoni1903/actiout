import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActiOutDB } from './schema';
import { initializeDb, STARTER_EXERCISES } from './seed';

describe('initializeDb', () => {
  let testDb: ActiOutDB;

  beforeEach(() => {
    testDb = new ActiOutDB(`test-db-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('STARTER_EXERCISES has exactly 40 entries', () => {
    expect(STARTER_EXERCISES.length).toBe(40);
  });

  it('seeds exactly 40 catalog rows, all non-custom', async () => {
    await initializeDb(testDb);
    const entries = await testDb.exerciseCatalog.toArray();
    expect(entries.length).toBe(40);
    for (const entry of entries) {
      expect(entry.isCustom).toBe(false);
    }
  });

  it('seeds one preference row with the spec defaults', async () => {
    await initializeDb(testDb);
    const prefs = await testDb.preferences.toArray();
    expect(prefs).toHaveLength(1);
    expect(prefs[0]).toEqual({
      id: 'default',
      theme: 'system',
      weightUnit: 'lb',
      distanceUnit: 'mi',
      defaultDraftConflictAction: 'ask',
      loggingMode: 'basic',
    });
  });

  it('is idempotent: calling twice does not duplicate rows', async () => {
    await initializeDb(testDb);
    await initializeDb(testDb);
    const catalogCount = await testDb.exerciseCatalog.count();
    const prefCount = await testDb.preferences.count();
    expect(catalogCount).toBe(40);
    expect(prefCount).toBe(1);
  });

  it('is concurrency-safe: two overlapping calls resolve without a ConstraintError and seed exactly once (I2)', async () => {
    await expect(Promise.all([initializeDb(testDb), initializeDb(testDb)])).resolves.toBeDefined();

    const prefCount = await testDb.preferences.count();
    const catalogCount = await testDb.exerciseCatalog.count();
    expect(prefCount).toBe(1);
    expect(catalogCount).toBe(40);
  });

  it('produces unique, lowercased, single-spaced normalizedName values', async () => {
    await initializeDb(testDb);
    const entries = await testDb.exerciseCatalog.toArray();
    const normalizedNames = entries.map((e) => e.normalizedName);

    const uniqueNames = new Set(normalizedNames);
    expect(uniqueNames.size).toBe(normalizedNames.length);

    for (const name of normalizedNames) {
      expect(name).toBe(name.toLowerCase());
      expect(name).toBe(name.trim());
      expect(name).not.toMatch(/\s{2,}/);
    }
  });
});
