import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActiOutDB } from '../db/schema';
import { initializeDb } from '../db/seed';
import { todayLocalDate } from '../utils/dates';
import { addBodyweight, deleteBodyweight, listBodyweight } from './bodyweight-service';

describe('bodyweight-service (db-backed)', () => {
  let testDb: ActiOutDB;

  beforeEach(async () => {
    testDb = new ActiOutDB(`test-db-${crypto.randomUUID()}`);
    await initializeDb(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  describe('addBodyweight', () => {
    it('creates an entry with the given value, unit, and notes, defaulting date to today', async () => {
      const entry = await addBodyweight(180.5, 'lb', undefined, 'morning weigh-in', testDb);

      expect(entry.id).toBeDefined();
      expect(entry.weightValue).toBe(180.5);
      expect(entry.weightUnit).toBe('lb');
      expect(entry.notes).toBe('morning weigh-in');
      expect(entry.entryDate).toBe(todayLocalDate());
      expect(entry.createdAt).toBeDefined();
      expect(entry.updatedAt).toBeDefined();

      const stored = await testDb.bodyweightEntries.get(entry.id);
      expect(stored).toEqual(entry);
    });

    it('uses the explicit date when provided', async () => {
      const entry = await addBodyweight(75, 'kg', '2026-01-15', undefined, testDb);
      expect(entry.entryDate).toBe('2026-01-15');
    });

    it('logs a bodyweight "created" event', async () => {
      const entry = await addBodyweight(180, 'lb', undefined, undefined, testDb);
      const events = await testDb.appEvents.where('[entityType+entityId]').equals(['bodyweight', entry.id]).toArray();
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe('created');
    });

    it('rejects a value of 0', async () => {
      await expect(addBodyweight(0, 'lb', undefined, undefined, testDb)).rejects.toThrow();
    });

    it('rejects negative values', async () => {
      await expect(addBodyweight(-5, 'lb', undefined, undefined, testDb)).rejects.toThrow();
    });
  });

  describe('listBodyweight', () => {
    it('returns entries sorted descending by entryDate', async () => {
      await addBodyweight(180, 'lb', '2026-01-01', undefined, testDb);
      await addBodyweight(179, 'lb', '2026-01-15', undefined, testDb);
      await addBodyweight(178, 'lb', '2026-01-08', undefined, testDb);

      const list = await listBodyweight(testDb);
      expect(list.map((e) => e.entryDate)).toEqual(['2026-01-15', '2026-01-08', '2026-01-01']);
    });

    it('returns an empty array when there are no entries', async () => {
      const list = await listBodyweight(testDb);
      expect(list).toEqual([]);
    });
  });

  describe('deleteBodyweight', () => {
    it('removes the entry', async () => {
      const entry = await addBodyweight(180, 'lb', undefined, undefined, testDb);
      await deleteBodyweight(entry.id, testDb);

      const stored = await testDb.bodyweightEntries.get(entry.id);
      expect(stored).toBeUndefined();

      const list = await listBodyweight(testDb);
      expect(list).toEqual([]);
    });

    it('is a no-op for a non-existent id', async () => {
      await expect(deleteBodyweight('does-not-exist', testDb)).resolves.not.toThrow();
    });

    it('logs a bodyweight "deleted" event', async () => {
      const entry = await addBodyweight(180, 'lb', undefined, undefined, testDb);
      await deleteBodyweight(entry.id, testDb);

      const events = await testDb.appEvents.where('[entityType+entityId]').equals(['bodyweight', entry.id]).toArray();
      expect(events).toHaveLength(2);
      expect(events.map((e) => e.eventType).sort()).toEqual(['created', 'deleted']);
    });
  });
});
