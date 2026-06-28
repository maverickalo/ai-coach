export type WorkoutExerciseSeed = readonly [
  exerciseName: string,
  sets: number,
  reps: string,
  notes: string | null
];

export interface WorkoutTemplateSeed {
  readonly dayOfWeek: number;
  readonly name: string;
  readonly focus: string;
  readonly estimatedMinutes: number;
  readonly exercises: readonly WorkoutExerciseSeed[];
}

export function defineWorkoutPlanSeed<const T extends readonly WorkoutTemplateSeed[]>(
  seed: T
): T {
  return seed;
}
