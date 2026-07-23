import type { MeasurementType, SessionItem, WeightUnit } from '../../domain/types';

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
  durationSeconds?: number;
  distance?: number;
  distanceUnit?: 'mi' | 'km';
};

// Prefill precedence for the basic-mode aggregate row:
//   1. last performance (first set's weight/reps + set count + unit)
//   2. planned (setsPlanned/repsPlanned, weight empty, unit from preference)
//   3. sets 3 / reps empty / weight empty / preference unit
// reps has no history/plan source for duration/distance_duration exercises, so
// it is never populated for those two types. durationSeconds/distance are
// always logged live (never prefilled); distance_duration additionally seeds
// distanceUnit from the user's preference.
export function computeAggregatePrefill(
  item: Pick<SessionItem, 'setsPlanned' | 'repsPlanned'>,
  last: LastPerformance,
  preferenceUnit: WeightUnit,
  measurementType: MeasurementType,
  preferenceDistanceUnit: 'mi' | 'km'
): AggregateDraft {
  const repsCapable = measurementType === 'weight_reps' || measurementType === 'reps';
  const distanceUnit = measurementType === 'distance_duration' ? preferenceDistanceUnit : undefined;

  if (last && last.sets.length > 0) {
    const first = last.sets[0]!;
    return {
      sets: last.sets.length,
      reps: repsCapable ? first.reps : undefined,
      weight: first.weight,
      weightUnit: first.weightUnit,
      distanceUnit,
    };
  }

  if (item.setsPlanned !== undefined || item.repsPlanned !== undefined) {
    return {
      sets: item.setsPlanned ?? 3,
      reps: repsCapable ? item.repsPlanned : undefined,
      weight: undefined,
      weightUnit: preferenceUnit,
      distanceUnit,
    };
  }

  return { sets: 3, reps: undefined, weight: undefined, weightUnit: preferenceUnit, distanceUnit };
}
