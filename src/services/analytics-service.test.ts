import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActiOutDB } from '../db/schema';
import { initializeDb } from '../db/seed';
import { KG_PER_LB, convertWeight } from '../domain/units';
import { localDateDaysAgo, nowIso, weekdayOf } from '../utils/dates';
import { updatePreferences } from './preference-service';
import {
  addSessionItem,
  completeSession,
  dnfSession,
  startQuickSession,
  updateSessionItem,
} from './session-service';
import {
  getBodyweightTrend,
  getConsistency,
  getExerciseHistory,
  getLoggedExerciseNames,
  getPRs,
  getSequenceStats,
} from './analytics-service';

describe('analytics-service', () => {
  let testDb: ActiOutDB;

  const dateA = localDateDaysAgo(3); // completed A
  const dateB = localDateDaysAgo(2); // completed B (mixed lb + kg)
  const dateC = localDateDaysAgo(1); // DNF C
  const dateD = localDateDaysAgo(0); // draft D (today)

  beforeEach(async () => {
    testDb = new ActiOutDB(`test-db-${crypto.randomUUID()}`);
    await initializeDb(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  // The exact fixture the brief prescribes:
  //   A (completed): Bench Press @ pos1, 100 lb, 3x10
  //   B (completed): Bench Press @ pos1 in KG (40 kg, 3x10) + Bench Press @ pos2, 80 lb, 3x10
  //   C (dnf):       Bench Press @ pos1, 200 lb, 3x10
  //   D (draft):     Bench Press + Squat  (must never be counted anywhere)
  async function seedFixture(): Promise<void> {
    // A — completed, all rows in lb (seeded default preference)
    const a = await startQuickSession(dateA, testDb);
    const aBench = await addSessionItem(a.id, 'Bench Press', testDb);
    await updateSessionItem(aBench.id, { setsActual: 3, repsActual: 10, weightActual: 100, completed: true }, testDb);
    await completeSession(a.id, testDb);

    // B — completed. pos1 stamped kg, pos2 stamped lb (per-row unit mix).
    await updatePreferences({ weightUnit: 'kg' }, testDb);
    const b = await startQuickSession(dateB, testDb);
    const bKg = await addSessionItem(b.id, 'Bench Press', testDb); // pos1, unit kg
    await updateSessionItem(bKg.id, { setsActual: 3, repsActual: 10, weightActual: 40, completed: true }, testDb);
    await updatePreferences({ weightUnit: 'lb' }, testDb);
    const bLb = await addSessionItem(b.id, 'Bench Press', testDb); // pos2, unit lb
    await updateSessionItem(bLb.id, { setsActual: 3, repsActual: 10, weightActual: 80, completed: true }, testDb);
    await completeSession(b.id, testDb);

    // C — DNF, 200 lb (should beat the PR only when includeDnf is set)
    const c = await startQuickSession(dateC, testDb);
    const cBench = await addSessionItem(c.id, 'Bench Press', testDb);
    await updateSessionItem(cBench.id, { setsActual: 3, repsActual: 10, weightActual: 200, completed: true }, testDb);
    await dnfSession(c.id, testDb);

    // D — draft, left open. Bench 150 lb + a Squat that must never surface.
    const d = await startQuickSession(dateD, testDb);
    const dBench = await addSessionItem(d.id, 'Bench Press', testDb);
    await updateSessionItem(dBench.id, { setsActual: 3, repsActual: 10, weightActual: 150 }, testDb);
    const dSquat = await addSessionItem(d.id, 'Squat', testDb);
    await updateSessionItem(dSquat.id, { setsActual: 5, repsActual: 5, weightActual: 300 }, testDb);
  }

  describe('getLoggedExerciseNames', () => {
    it('returns distinct snapshots from non-draft sessions, sorted; excludes draft-only exercises', async () => {
      await seedFixture();
      const names = await getLoggedExerciseNames(testDb);
      // Squat lives only in the draft D, so it must not appear.
      expect(names).toEqual(['Bench Press']);
    });
  });

  describe('getPRs', () => {
    it('takes the max completed weight (100 lb), never the DNF 200 or the draft 150', async () => {
      await seedFixture();
      const prs = await getPRs('Bench Press', 'lb', undefined, testDb);
      expect(prs.weight?.value).toBe(100);
      expect(prs.weight?.date).toBe(dateA);
    });

    it('reports the weight PR in the requested displayUnit (kg ~= 45.4)', async () => {
      await seedFixture();
      const prs = await getPRs('Bench Press', 'kg', undefined, testDb);
      expect(prs.weight?.value).toBeCloseTo(100 * KG_PER_LB, 3); // ~45.359
    });

    it('computes the volume PR = 3000 (3x10x100) in displayUnit', async () => {
      await seedFixture();
      const prs = await getPRs('Bench Press', 'lb', undefined, testDb);
      expect(prs.volume?.value).toBeCloseTo(3000, 6);
      expect(prs.volume?.date).toBe(dateA);
    });

    it('includes the DNF 200 lb PR when includeDnf is set', async () => {
      await seedFixture();
      const prs = await getPRs('Bench Press', 'lb', true, testDb);
      expect(prs.weight?.value).toBe(200);
      expect(prs.weight?.date).toBe(dateC);
    });

    it('returns empty PRs for an unlogged exercise', async () => {
      await seedFixture();
      const prs = await getPRs('Deadlift', 'lb', undefined, testDb);
      expect(prs.weight).toBeUndefined();
      expect(prs.volume).toBeUndefined();
    });
  });

  describe('getSequenceStats', () => {
    it('groups by position with per-row conversion before averaging', async () => {
      await seedFixture();
      const stats = await getSequenceStats('Bench Press', 'lb', undefined, testDb);
      expect(stats.map((s) => s.position)).toEqual([1, 2]);

      const [pos1, pos2] = stats;
      const kgAsLb = convertWeight(40, 'kg', 'lb'); // ~88.185

      expect(pos1!.count).toBe(2); // A(100 lb) + B(40 kg)
      expect(pos1!.avgWeight).toBeCloseTo((100 + kgAsLb) / 2, 3);
      expect(pos1!.avgVolume).toBeCloseTo((3000 + kgAsLb * 3 * 10) / 2, 3);

      expect(pos2!.count).toBe(1); // B(80 lb)
      expect(pos2!.avgWeight).toBeCloseTo(80, 6);
      expect(pos2!.avgVolume).toBeCloseTo(2400, 6);
    });

    it('excludes undefined-weight rows from avgWeight but still counts them', async () => {
      // Two completed sessions, Squat @ pos1: one weighed, one not.
      const s1 = await startQuickSession(localDateDaysAgo(5), testDb);
      const i1 = await addSessionItem(s1.id, 'Squat', testDb);
      await updateSessionItem(i1.id, { setsActual: 5, repsActual: 5, weightActual: 100 }, testDb);
      await completeSession(s1.id, testDb);

      const s2 = await startQuickSession(localDateDaysAgo(4), testDb);
      const i2 = await addSessionItem(s2.id, 'Squat', testDb); // no weight set
      await updateSessionItem(i2.id, { setsActual: 5, repsActual: 5 }, testDb);
      await completeSession(s2.id, testDb);

      const stats = await getSequenceStats('Squat', 'lb', undefined, testDb);
      expect(stats).toHaveLength(1);
      expect(stats[0]!.position).toBe(1);
      expect(stats[0]!.count).toBe(2); // both counted
      expect(stats[0]!.avgWeight).toBeCloseTo(100, 6); // only the weighed one
      expect(stats[0]!.avgVolume).toBeCloseTo(2500, 6); // only the fully-defined one
    });
  });

  describe('getExerciseHistory', () => {
    it('returns completed rows newest-first, excluding DNF and draft by default', async () => {
      await seedFixture();
      const history = await getExerciseHistory('Bench Press', undefined, testDb);
      // A(1 row) + B(2 rows) = 3; C(dnf) and D(draft) excluded.
      expect(history).toHaveLength(3);
      expect(history.every((h) => h.status === 'completed')).toBe(true);
      expect(history.map((h) => h.date)).toEqual([dateB, dateB, dateA]); // newest first
      expect(history.some((h) => h.date === dateC)).toBe(false);
      expect(history.some((h) => h.weight === 150)).toBe(false); // draft never included
    });

    it('carries per-row unit and volume in the row unit', async () => {
      await seedFixture();
      const history = await getExerciseHistory('Bench Press', undefined, testDb);
      const kgRow = history.find((h) => h.weightUnit === 'kg')!;
      expect(kgRow.weight).toBe(40);
      expect(kgRow.volume).toBe(1200); // 3*10*40 in the row's own unit
    });

    it('includes DNF rows when includeDnf is set', async () => {
      await seedFixture();
      const history = await getExerciseHistory('Bench Press', true, testDb);
      expect(history).toHaveLength(4);
      expect(history[0]!.date).toBe(dateC); // DNF is newest
      expect(history[0]!.status).toBe('dnf');
      expect(history.some((h) => h.weight === 150)).toBe(false); // draft still excluded
    });
  });

  describe('getConsistency', () => {
    it('counts completed sessions per weekday (index 0 = Sunday); ignores DNF and draft', async () => {
      await seedFixture();
      const { byDate, byWeekday } = await getConsistency(30, testDb);

      expect(byWeekday).toHaveLength(7);
      expect(byWeekday[weekdayOf(dateA)]).toBe(1);
      expect(byWeekday[weekdayOf(dateB)]).toBe(1);
      expect(byWeekday.reduce((a, b) => a + b, 0)).toBe(2); // only A and B

      const dates = byDate.map((d) => d.date);
      expect(dates).toContain(dateA);
      expect(dates).toContain(dateB);
      expect(dates).not.toContain(dateC); // dnf
      expect(dates).not.toContain(dateD); // draft
      // ascending
      expect(dates).toEqual([...dates].sort());
    });
  });

  describe('getBodyweightTrend', () => {
    it('converts each row to displayUnit and sorts ascending by date', async () => {
      await testDb.bodyweightEntries.add({
        id: crypto.randomUUID(),
        entryDate: dateB,
        weightValue: 90,
        weightUnit: 'kg',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      await testDb.bodyweightEntries.add({
        id: crypto.randomUUID(),
        entryDate: dateA,
        weightValue: 200,
        weightUnit: 'lb',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      const trend = await getBodyweightTrend('kg', testDb);
      expect(trend.map((t) => t.date)).toEqual([dateA, dateB]); // ascending
      expect(trend[0]!.value).toBeCloseTo(200 * KG_PER_LB, 3); // converted lb -> kg
      expect(trend[1]!.value).toBeCloseTo(90, 6); // already kg
    });
  });
});
