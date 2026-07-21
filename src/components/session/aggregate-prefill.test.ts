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
      'kg'
    );
    expect(draft).toEqual({ sets: 3, reps: 12, weight: 25, weightUnit: 'lb' });
  });

  it('falls back to planned values with empty weight and preference unit', () => {
    const draft = computeAggregatePrefill({ setsPlanned: 4, repsPlanned: 6 }, undefined, 'kg');
    expect(draft).toEqual({ sets: 4, reps: 6, weight: undefined, weightUnit: 'kg' });
  });

  it('defaults set count to 3 when only reps are planned', () => {
    const draft = computeAggregatePrefill({ repsPlanned: 10 }, undefined, 'lb');
    expect(draft).toEqual({ sets: 3, reps: 10, weight: undefined, weightUnit: 'lb' });
  });

  it('falls back to sets 3 / empty / preference unit with no history or plan', () => {
    const draft = computeAggregatePrefill({}, undefined, 'lb');
    expect(draft).toEqual({ sets: 3, reps: undefined, weight: undefined, weightUnit: 'lb' });
  });

  it('ignores an empty last-performance set list', () => {
    const draft = computeAggregatePrefill({ setsPlanned: 2 }, { date: '2026-07-10', sets: [] }, 'kg');
    expect(draft).toEqual({ sets: 2, reps: undefined, weight: undefined, weightUnit: 'kg' });
  });
});
