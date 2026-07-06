import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActiOutDB } from '../db/schema';
import { getPreferences, updatePreferences } from './preference-service';

describe('preference-service', () => {
  let testDb: ActiOutDB;

  beforeEach(() => {
    testDb = new ActiOutDB(`test-db-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  describe('getPreferences', () => {
    it('creates the singleton with spec defaults if missing', async () => {
      const prefs = await getPreferences(testDb);

      expect(prefs).toEqual({
        id: 'default',
        theme: 'system',
        weightUnit: 'lb',
        distanceUnit: 'mi',
        defaultDraftConflictAction: 'ask',
        confirmBeforeReplacingDraft: true,
      });

      const count = await testDb.preferences.count();
      expect(count).toBe(1);
    });

    it('handles concurrent calls when the singleton is missing: no rejection, one row', async () => {
      const [first, second] = await Promise.all([getPreferences(testDb), getPreferences(testDb)]);

      expect(first.id).toBe('default');
      expect(second.id).toBe('default');
      const count = await testDb.preferences.count();
      expect(count).toBe(1);
    });

    it('does not duplicate the singleton on repeated calls', async () => {
      await getPreferences(testDb);
      await getPreferences(testDb);
      const count = await testDb.preferences.count();
      expect(count).toBe(1);
    });
  });

  describe('updatePreferences', () => {
    it('persists a patch such as weightUnit: kg', async () => {
      await getPreferences(testDb);
      const updated = await updatePreferences({ weightUnit: 'kg' }, testDb);

      expect(updated.weightUnit).toBe('kg');

      const stored = await testDb.preferences.get('default');
      expect(stored?.weightUnit).toBe('kg');
    });

    it('creates the singleton first if missing, then applies the patch', async () => {
      const updated = await updatePreferences({ theme: 'dark' }, testDb);
      expect(updated.theme).toBe('dark');
      expect(updated.id).toBe('default');
    });
  });
});
