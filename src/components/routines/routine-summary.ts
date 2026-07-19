import type { RoutineTemplate } from '../../domain/types';

// "Incline DB Press (3×10) · Chest Press (3×10) · Fly (3×12)" — each item
// falls back to the routine's own defaults, then an en-dash when neither is set.
export function summaryLine(routine: RoutineTemplate): string {
  return routine.items
    .map((item) => {
      const sets = item.defaultSets ?? routine.defaultSets ?? '–';
      const reps = item.defaultReps ?? routine.defaultReps ?? '–';
      return `${item.exerciseNameSnapshot} (${sets}×${reps})`;
    })
    .join(' · ');
}
