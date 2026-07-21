import type { SessionItem, WeightUnit } from '../../domain/types';

// Shape of the analytics-service getLastPerformance result, redeclared here so
// this stays a pure helper (no service/Dexie import).
export type LastPerformance =
  | { date: string; sets: Array<{ setNumber: number; reps?: number; weight?: number; weightUnit: WeightUnit }> }
  | undefined;

export type AggregateDraft = {
  sets: number;
  reps?: number;
  weight?: number;
  weightUnit: WeightUnit;
};

// Prefill precedence for the basic-mode aggregate row:
//   1. last performance (first set's weight/reps + set count + unit)
//   2. planned (setsPlanned/repsPlanned, weight empty, unit from preference)
//   3. sets 3 / reps empty / weight empty / preference unit
export function computeAggregatePrefill(
  item: Pick<SessionItem, 'setsPlanned' | 'repsPlanned'>,
  last: LastPerformance,
  preferenceUnit: WeightUnit
): AggregateDraft {
  if (last && last.sets.length > 0) {
    const first = last.sets[0]!;
    return {
      sets: last.sets.length,
      reps: first.reps,
      weight: first.weight,
      weightUnit: first.weightUnit,
    };
  }

  if (item.setsPlanned !== undefined || item.repsPlanned !== undefined) {
    return {
      sets: item.setsPlanned ?? 3,
      reps: item.repsPlanned,
      weight: undefined,
      weightUnit: preferenceUnit,
    };
  }

  return { sets: 3, reps: undefined, weight: undefined, weightUnit: preferenceUnit };
}
