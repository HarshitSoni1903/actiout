import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActiOutDB } from '../db/schema';
import { initializeDb } from '../db/seed';
import type { SessionStatus, WeightUnit } from '../domain/types';
import { KG_PER_LB } from '../domain/units';
import { localDateDaysAgo, nowIso, weekdayOf } from '../utils/dates';
import { newId } from '../utils/ids';
import { normalizeExerciseName } from './exercise-service';
import {
  getBodyweightTrend,
  getConsistency,
  getExerciseHistory,
  getLastPerformance,
  getLoggedExerciseNames,
  getPRs,
  getSequenceStats,
} from './analytics-service';

describe('analytics-service', () => {
  let dbx: ActiOutDB;

  beforeEach(async () => {
    dbx = new ActiOutDB(`test-db-${crypto.randomUUID()}`);
    await initializeDb(dbx);
  });

  afterEach(async () => {
    await dbx.delete();
  });

  // --- Direct-insert fixture helpers (full control over per-set values) ------

  async function addSession(
    id: string,
    date: string,
    status: SessionStatus,
    createdAt: string = nowIso()
  ): Promise<void> {
    await dbx.sessions.add({
      id,
      sessionDate: date,
      status,
      sourceMode: 'quick',
      startedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
  }

  async function addItem(id: string, sessionId: string, name: string, position: number): Promise<void> {
    const now = nowIso();
    await dbx.sessionItems.add({
      id,
      sessionId,
      exerciseNameSnapshot: name,
      sequencePosition: position,
      createdAt: now,
      updatedAt: now,
    });
  }

  async function addSet(
    sessionItemId: string,
    opts: {
      setNumber: number;
      reps?: number;
      weight?: number;
      weightUnit?: WeightUnit;
      isWarmup?: boolean;
      completed?: boolean;
    }
  ): Promise<void> {
    const item = await dbx.sessionItems.get(sessionItemId);
    if (!item) {
      throw new Error(`addSet: item ${sessionItemId} does not exist`);
    }
    const now = nowIso();
    await dbx.sessionSets.add({
      id: newId(),
      sessionId: item.sessionId,
      sessionItemId,
      setNumber: opts.setNumber,
      reps: opts.reps,
      weight: opts.weight,
      weightUnit: opts.weightUnit ?? 'lb',
      isWarmup: opts.isWarmup ?? false,
      completed: opts.completed ?? true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Adds a warmup set (reps x weight) to the single item matching exerciseName.
  async function addWarmupSet(
    database: ActiOutDB,
    exerciseName: string,
    reps: number,
    weight: number,
    weightUnit: WeightUnit = 'lb'
  ): Promise<void> {
    const target = normalizeExerciseName(exerciseName);
    const items = await database.sessionItems.toArray();
    const item = items.find((i) => normalizeExerciseName(i.exerciseNameSnapshot) === target);
    if (!item) {
      throw new Error(`addWarmupSet: no item for ${exerciseName}`);
    }
    const sets = await database.sessionSets.where('sessionItemId').equals(item.id).toArray();
    const maxSetNumber = sets.reduce((max, s) => Math.max(max, s.setNumber), 0);
    const now = nowIso();
    await database.sessionSets.add({
      id: newId(),
      sessionId: item.sessionId,
      sessionItemId: item.id,
      setNumber: maxSetNumber + 1,
      reps,
      weight,
      weightUnit,
      isWarmup: true,
      completed: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // --- Brief fixture ---------------------------------------------------------
  // Exercise "Squat", one completed session 2026-07-01:
  //   set1 warmup 5x60lb completed; set2 8x100lb completed; set3 6x105lb completed
  // working volume = 8*100 + 6*105 = 1430 ; topSet = 105 ; totalReps = 14
  async function seedSquat(): Promise<void> {
    await addSession('s1', '2026-07-01', 'completed');
    await addItem('squat-item', 's1', 'Squat', 1);
    await addSet('squat-item', { setNumber: 1, reps: 5, weight: 60, isWarmup: true });
    await addSet('squat-item', { setNumber: 2, reps: 8, weight: 100 });
    await addSet('squat-item', { setNumber: 3, reps: 6, weight: 105 });
  }

  describe('per-set metrics (brief fixture)', () => {
    beforeEach(seedSquat);

    it('getExerciseHistory summarizes non-warmup completed sets', async () => {
      const h = (await getExerciseHistory('Squat', false, dbx))[0]!;
      expect(h.topSet).toBe(105);
      expect(h.totalReps).toBe(14);
      expect(h.totalVolume).toBe(1430);
      expect(h.setCount).toBe(2); // warmup excluded
    });

    it('getPRs weight PR is the heaviest single working set', async () => {
      const prs = await getPRs('Squat', 'lb', false, dbx);
      expect(prs.weight?.value).toBe(105);
      expect(prs.volume?.value).toBe(1430); // single-session total
    });

    it('getPRs converts to displayUnit', async () => {
      const prs = await getPRs('Squat', 'kg', false, dbx);
      // 105 lb -> 47.6272... kg
      expect(prs.weight?.value).toBeCloseTo(47.6272, 3);
    });

    it('warmups are excluded from volume and PRs', async () => {
      // add a heavy WARMUP set 1x200lb -> must NOT become the weight PR
      await addWarmupSet(dbx, 'Squat', 1, 200);
      const prs = await getPRs('Squat', 'lb', false, dbx);
      expect(prs.weight?.value).toBe(105);
    });

    it('getSequenceStats averages per-set weight by position', async () => {
      const stats = await getSequenceStats('Squat', 'lb', false, dbx);
      const pos1 = stats.find((s) => s.position === 1)!;
      // working sets at position1: 100 and 105 -> avg 102.5
      expect(pos1.avgWeight).toBeCloseTo(102.5, 4);
    });

    it('getLastPerformance returns the latest completed session sets', async () => {
      const last = await getLastPerformance('Squat', dbx);
      expect(last?.date).toBe('2026-07-01');
      expect(last?.sets.map((s) => s.reps)).toEqual([8, 6]); // warmup excluded
    });

    it('getLastPerformance returns undefined with no completed history', async () => {
      expect(await getLastPerformance('Deadlift', dbx)).toBeUndefined();
    });
  });

  // --- Multi-session status / unit / tie-break coverage ---------------------

  describe('status filtering and units', () => {
    const dateA = localDateDaysAgo(3); // completed, lb
    const dateB = localDateDaysAgo(2); // completed, pos1 kg + pos2 lb
    const dateC = localDateDaysAgo(1); // dnf, 200 lb
    const dateD = localDateDaysAgo(0); // draft, 150 lb + Squat

    // A(completed): Bench pos1 3x10 @100 lb
    // B(completed): Bench pos1 3x10 @40 kg + Bench pos2 3x10 @80 lb
    // C(dnf):       Bench pos1 3x10 @200 lb
    // D(draft):     Bench 3x10 @150 lb + Squat 5x5 @300 lb (never counted)
    async function seedFixture(): Promise<void> {
      await addSession('A', dateA, 'completed');
      await addItem('A-bench', 'A', 'Bench Press', 1);
      await addSet('A-bench', { setNumber: 1, reps: 10, weight: 100 });
      await addSet('A-bench', { setNumber: 2, reps: 10, weight: 100 });
      await addSet('A-bench', { setNumber: 3, reps: 10, weight: 100 });

      await addSession('B', dateB, 'completed');
      await addItem('B-bench-kg', 'B', 'Bench Press', 1);
      await addSet('B-bench-kg', { setNumber: 1, reps: 10, weight: 40, weightUnit: 'kg' });
      await addSet('B-bench-kg', { setNumber: 2, reps: 10, weight: 40, weightUnit: 'kg' });
      await addSet('B-bench-kg', { setNumber: 3, reps: 10, weight: 40, weightUnit: 'kg' });
      await addItem('B-bench-lb', 'B', 'Bench Press', 2);
      await addSet('B-bench-lb', { setNumber: 1, reps: 10, weight: 80 });
      await addSet('B-bench-lb', { setNumber: 2, reps: 10, weight: 80 });
      await addSet('B-bench-lb', { setNumber: 3, reps: 10, weight: 80 });

      await addSession('C', dateC, 'dnf');
      await addItem('C-bench', 'C', 'Bench Press', 1);
      await addSet('C-bench', { setNumber: 1, reps: 10, weight: 200 });

      await addSession('D', dateD, 'draft');
      await addItem('D-bench', 'D', 'Bench Press', 1);
      await addSet('D-bench', { setNumber: 1, reps: 10, weight: 150 });
      await addItem('D-squat', 'D', 'Squat', 2);
      await addSet('D-squat', { setNumber: 1, reps: 5, weight: 300 });
    }

    it('getLoggedExerciseNames excludes draft-only exercises', async () => {
      await seedFixture();
      expect(await getLoggedExerciseNames(dbx)).toEqual(['Bench Press']);
    });

    it('weight PR takes the max completed working set (100 lb), never DNF/draft', async () => {
      await seedFixture();
      const prs = await getPRs('Bench Press', 'lb', false, dbx);
      expect(prs.weight?.value).toBe(100);
      expect(prs.weight?.date).toBe(dateA);
    });

    it('includes the DNF 200 lb PR when includeDnf is set', async () => {
      await seedFixture();
      const prs = await getPRs('Bench Press', 'lb', true, dbx);
      expect(prs.weight?.value).toBe(200);
      expect(prs.weight?.date).toBe(dateC);
    });

    it('reports the weight PR in the requested displayUnit (kg ~= 45.36)', async () => {
      await seedFixture();
      const prs = await getPRs('Bench Press', 'kg', false, dbx);
      expect(prs.weight?.value).toBeCloseTo(45.359237, 3);
    });

    it('volume PR = best per-session total (session B sums its two items)', async () => {
      await seedFixture();
      const prs = await getPRs('Bench Press', 'lb', false, dbx);
      // B: (3*10*40 kg -> lb) + (3*10*80 lb) = 1200/KG_PER_LB + 2400 = 5045.547...
      // which beats A's single-item 3000.
      const kgVolAsLb = 1200 / KG_PER_LB;
      expect(prs.volume?.value).toBeCloseTo(kgVolAsLb + 2400, 3);
      expect(prs.volume?.date).toBe(dateB);
    });

    it('returns empty PRs for an unlogged exercise', async () => {
      await seedFixture();
      const prs = await getPRs('Deadlift', 'lb', false, dbx);
      expect(prs.weight).toBeUndefined();
      expect(prs.volume).toBeUndefined();
    });

    it('getExerciseHistory returns completed rows newest-first, excluding DNF/draft', async () => {
      await seedFixture();
      const history = await getExerciseHistory('Bench Press', false, dbx);
      expect(history).toHaveLength(3); // A(1 item) + B(2 items)
      expect(history.every((h) => h.status === 'completed')).toBe(true);
      expect(history.map((h) => h.date)).toEqual([dateB, dateB, dateA]);
    });

    it('getExerciseHistory carries per-item unit and volume in that unit', async () => {
      await seedFixture();
      const history = await getExerciseHistory('Bench Press', false, dbx);
      const kgRow = history.find((h) => h.weightUnit === 'kg')!;
      expect(kgRow.totalVolume).toBe(1200); // 3*(10*40) in the row's own unit
      expect(kgRow.topSet).toBe(40);
    });

    it('getExerciseHistory includes DNF rows when includeDnf is set', async () => {
      await seedFixture();
      const history = await getExerciseHistory('Bench Press', true, dbx);
      expect(history).toHaveLength(4);
      expect(history[0]!.date).toBe(dateC);
      expect(history[0]!.status).toBe('dnf');
    });

    it('getSequenceStats groups by position with per-set conversion before averaging', async () => {
      await seedFixture();
      const stats = await getSequenceStats('Bench Press', 'lb', false, dbx);
      expect(stats.map((s) => s.position)).toEqual([1, 2]);
      const [pos1, pos2] = stats;
      const kgAsLb = 88.184904874; // 40 kg -> lb (anchored in units.test.ts)

      expect(pos1!.count).toBe(2); // A + B sessions at pos1
      expect(pos1!.avgWeight).toBeCloseTo((100 + kgAsLb) / 2, 3); // per-set mean over all sets
      expect(pos1!.avgVolume).toBeCloseTo((3000 + kgAsLb * 10 * 3) / 2, 3);

      expect(pos2!.count).toBe(1);
      expect(pos2!.avgWeight).toBeCloseTo(80, 6);
      expect(pos2!.avgVolume).toBeCloseTo(2400, 6);
    });

    it('getLastPerformance picks the most recent completed session, ignoring DNF/draft', async () => {
      await seedFixture();
      const last = await getLastPerformance('Bench Press', dbx);
      // B (completed, dateB) is newer than A; C is dnf and D is draft.
      expect(last?.date).toBe(dateB);
      expect(last?.sets).toHaveLength(3);
    });
  });

  describe('tie-breaks (I1)', () => {
    it('on a tied weight, reports the earliest sessionDate regardless of insertion order', async () => {
      const earlier = localDateDaysAgo(10);
      const later = localDateDaysAgo(5);
      await addSession('a-later', later, 'completed');
      await addSession('b-earlier', earlier, 'completed');
      await addItem('item-a', 'a-later', 'Deadlift', 1);
      await addItem('item-b', 'b-earlier', 'Deadlift', 1);
      await addSet('item-a', { setNumber: 1, reps: 10, weight: 100 });
      await addSet('item-b', { setNumber: 1, reps: 10, weight: 100 });

      const prs = await getPRs('Deadlift', 'lb', false, dbx);
      expect(prs.weight?.value).toBe(100);
      expect(prs.weight?.date).toBe(earlier);
    });

    it('on a tied volume, reports the earliest sessionDate regardless of insertion order', async () => {
      const earlier = localDateDaysAgo(10);
      const later = localDateDaysAgo(5);
      await addSession('a-later', later, 'completed');
      await addSession('b-earlier', earlier, 'completed');
      await addItem('item-a', 'a-later', 'Deadlift', 1);
      await addItem('item-b', 'b-earlier', 'Deadlift', 1);
      await addSet('item-a', { setNumber: 1, reps: 30, weight: 100 });
      await addSet('item-b', { setNumber: 1, reps: 30, weight: 100 });

      const prs = await getPRs('Deadlift', 'lb', false, dbx);
      expect(prs.volume?.value).toBeCloseTo(3000, 6);
      expect(prs.volume?.date).toBe(earlier);
    });
  });

  describe('getLastPerformance skips sessions with no working sets', () => {
    it('falls back to the earlier session when the most recent one has only a warmup for the exercise', async () => {
      // Earlier session (2026-07-01): Bench has 2 completed working sets.
      await addSession('early', '2026-07-01', 'completed');
      await addItem('early-bench', 'early', 'Bench', 1);
      await addSet('early-bench', { setNumber: 1, reps: 8, weight: 135 });
      await addSet('early-bench', { setNumber: 2, reps: 6, weight: 145 });

      // Later session (2026-07-10): Bench item is ONLY a warmup (no working
      // sets), but a second item (Squat) is fully completed so the session
      // itself satisfies completeSession's >=1-complete-item rule.
      await addSession('late', '2026-07-10', 'completed');
      await addItem('late-bench', 'late', 'Bench', 1);
      await addSet('late-bench', { setNumber: 1, reps: 5, weight: 45, isWarmup: true });
      await addItem('late-squat', 'late', 'Squat', 2);
      await addSet('late-squat', { setNumber: 1, reps: 5, weight: 225 });

      const last = await getLastPerformance('Bench', dbx);
      expect(last?.date).toBe('2026-07-01');
      expect(last?.sets.map((s) => s.reps)).toEqual([8, 6]);
      expect(last?.sets.map((s) => s.weight)).toEqual([135, 145]);
    });

    it('returns undefined when the exercise has completed sessions but never a completed working set', async () => {
      await addSession('late', '2026-07-10', 'completed');
      await addItem('late-bench', 'late', 'Bench', 1);
      await addSet('late-bench', { setNumber: 1, reps: 5, weight: 45, isWarmup: true });
      await addItem('late-squat', 'late', 'Squat', 2);
      await addSet('late-squat', { setNumber: 1, reps: 5, weight: 225 });

      expect(await getLastPerformance('Bench', dbx)).toBeUndefined();
    });
  });

  describe('getSequenceStats undefined-weight handling', () => {
    it('excludes undefined-weight sets from avgWeight/avgVolume but still counts the session', async () => {
      await addSession('s1', localDateDaysAgo(5), 'completed');
      await addItem('i1', 's1', 'Squat', 1);
      await addSet('i1', { setNumber: 1, reps: 25, weight: 100 }); // volume 2500

      await addSession('s2', localDateDaysAgo(4), 'completed');
      await addItem('i2', 's2', 'Squat', 1);
      await addSet('i2', { setNumber: 1, reps: 25 }); // no weight

      const stats = await getSequenceStats('Squat', 'lb', false, dbx);
      expect(stats).toHaveLength(1);
      expect(stats[0]!.position).toBe(1);
      expect(stats[0]!.count).toBe(2); // both sessions counted
      expect(stats[0]!.avgWeight).toBeCloseTo(100, 6); // only the weighed set
      expect(stats[0]!.avgVolume).toBeCloseTo(2500, 6); // only the fully-defined session
    });
  });

  describe('getConsistency', () => {
    it('counts completed sessions per weekday (index 0 = Sunday); ignores DNF and draft', async () => {
      const dateA = localDateDaysAgo(3);
      const dateB = localDateDaysAgo(2);
      const dateC = localDateDaysAgo(1);
      const dateD = localDateDaysAgo(0);
      await addSession('A', dateA, 'completed');
      await addSession('B', dateB, 'completed');
      await addSession('C', dateC, 'dnf');
      await addSession('D', dateD, 'draft');

      const { byDate, byWeekday } = await getConsistency(30, dbx);
      expect(byWeekday).toHaveLength(7);
      expect(byWeekday[weekdayOf(dateA)]).toBe(1);
      expect(byWeekday[weekdayOf(dateB)]).toBe(1);
      expect(byWeekday.reduce((a, b) => a + b, 0)).toBe(2);

      const dates = byDate.map((d) => d.date);
      expect(dates).toContain(dateA);
      expect(dates).toContain(dateB);
      expect(dates).not.toContain(dateC);
      expect(dates).not.toContain(dateD);
      expect(dates).toEqual([...dates].sort());
    });
  });

  describe('getBodyweightTrend', () => {
    it('converts each row to displayUnit and sorts ascending by date', async () => {
      const dateA = localDateDaysAgo(3);
      const dateB = localDateDaysAgo(2);
      await dbx.bodyweightEntries.add({
        id: crypto.randomUUID(),
        entryDate: dateB,
        weightValue: 90,
        weightUnit: 'kg',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      await dbx.bodyweightEntries.add({
        id: crypto.randomUUID(),
        entryDate: dateA,
        weightValue: 200,
        weightUnit: 'lb',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      const trend = await getBodyweightTrend('kg', dbx);
      expect(trend.map((t) => t.date)).toEqual([dateA, dateB]);
      expect(trend[0]!.value).toBeCloseTo(200 * KG_PER_LB, 3);
      expect(trend[1]!.value).toBeCloseTo(90, 6);
    });
  });
});
