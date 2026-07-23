import { describe, expect, it } from 'vitest';
import { computeAggregatePrefill } from './aggregate-prefill';

describe('computeAggregatePrefill', () => {
  it('prefers last performance (first set weight/reps + set count + unit)', () => {
    const draft = computeAggregatePrefill(
      { setsPlanned: 5, repsPlanned: 8 },
      {
        date: '2026-07-10',
        sets: [
          { setNumber: 1, reps: 12, weight: 25, weightUnit: 'lb' },
          { setNumber: 2, reps: 10, weight: 25, weightUnit: 'lb' },
          { setNumber: 3, reps: 9, weight: 25, weightUnit: 'lb' },
        ],
      },
      'kg',
      'weight_reps',
      'mi'
    );
    expect(draft).toEqual({ sets: 3, reps: 12, weight: 25, weightUnit: 'lb' });
  });

  it('falls back to planned values with empty weight and preference unit', () => {
    const draft = computeAggregatePrefill({ setsPlanned: 4, repsPlanned: 6 }, undefined, 'kg', 'weight_reps', 'mi');
    expect(draft).toEqual({ sets: 4, reps: 6, weight: undefined, weightUnit: 'kg' });
  });

  it('defaults set count to 3 when only reps are planned', () => {
    const draft = computeAggregatePrefill({ repsPlanned: 10 }, undefined, 'lb', 'weight_reps', 'mi');
    expect(draft).toEqual({ sets: 3, reps: 10, weight: undefined, weightUnit: 'lb' });
  });

  it('falls back to sets 3 / empty / preference unit with no history or plan', () => {
    const draft = computeAggregatePrefill({}, undefined, 'lb', 'weight_reps', 'mi');
    expect(draft).toEqual({ sets: 3, reps: undefined, weight: undefined, weightUnit: 'lb' });
  });

  it('ignores an empty last-performance set list', () => {
    const draft = computeAggregatePrefill({ setsPlanned: 2 }, { date: '2026-07-10', sets: [] }, 'kg', 'weight_reps', 'mi');
    expect(draft).toEqual({ sets: 2, reps: undefined, weight: undefined, weightUnit: 'kg' });
  });

  it('distance_duration: leaves reps undefined and sets distanceUnit from preference', () => {
    const draft = computeAggregatePrefill({ setsPlanned: 4 }, undefined, 'lb', 'distance_duration', 'km');
    expect(draft.reps).toBeUndefined();
    expect(draft.distanceUnit).toBe('km');
  });

  it('reps type: still returns reps from planned/last, unchanged behavior', () => {
    const draft = computeAggregatePrefill({ setsPlanned: 4, repsPlanned: 6 }, undefined, 'lb', 'reps', 'mi');
    expect(draft.reps).toBe(6);
    expect(draft.sets).toBe(4);
    expect(draft.weightUnit).toBe('lb');
  });

  it('duration: has zero reps history source and never leaks distanceUnit', () => {
    const draft = computeAggregatePrefill({ setsPlanned: 4, repsPlanned: 6 }, undefined, 'lb', 'duration', 'km');
    expect(draft.reps).toBeUndefined();
    expect(draft.distanceUnit).toBeUndefined();
  });

  it('weight prefill from last performance is retained for duration (non-weight_reps type)', () => {
    const draft = computeAggregatePrefill(
      { setsPlanned: 3 },
      { date: '2026-07-10', sets: [{ setNumber: 1, weight: 20, weightUnit: 'kg' }] },
      'lb',
      'duration',
      'mi'
    );
    expect(draft.weight).toBe(20);
    expect(draft.weightUnit).toBe('kg');
    expect(draft.reps).toBeUndefined();
  });

  it('weight prefill from last performance is retained for distance_duration (non-weight_reps type)', () => {
    const draft = computeAggregatePrefill(
      { setsPlanned: 3 },
      { date: '2026-07-10', sets: [{ setNumber: 1, weight: 15, weightUnit: 'lb' }] },
      'kg',
      'distance_duration',
      'km'
    );
    expect(draft.weight).toBe(15);
    expect(draft.weightUnit).toBe('lb');
    expect(draft.reps).toBeUndefined();
    expect(draft.distanceUnit).toBe('km');
  });
});
