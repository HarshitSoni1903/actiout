import { ExerciseTypeahead } from '../routines/ExerciseTypeahead';

export type AddExerciseRowProps = {
  onPick(name: string): void;
};

export function AddExerciseRow({ onPick }: AddExerciseRowProps) {
  return <ExerciseTypeahead onPick={onPick} placeholder="+ Add exercise" />;
}
