import type { WorkoutState } from "../../types/domain.js";
import type { EvalScenario } from "../types.js";

const state: WorkoutState = {
  workoutId: "workout-push",
  workoutName: "Push",
  currentExercise: "Bench Press",
  currentSet: 2,
  completedExercises: ["Overhead Press"],
  skippedExercises: ["Cable Fly"],
  optionalWork: ["rower 500m"],
  nextExercise: "Bench Press"
};

export const workoutStateScenarios: EvalScenario[] = [
  {
    name: "workout state tracks current, completed, skipped, optional, and next",
    run: () => ({
      reply: [
        `current=${state.currentExercise}`,
        `set=${state.currentSet}`,
        `completed=${state.completedExercises.join(",")}`,
        `skipped=${state.skippedExercises.join(",")}`,
        `optional=${state.optionalWork.join(",")}`,
        `next=${state.nextExercise}`
      ].join(" | "),
      actions: []
    }),
    expect: {
      replyIncludes: [
        "current=Bench Press",
        "set=2",
        "completed=Overhead Press",
        "skipped=Cable Fly",
        "optional=rower 500m",
        "next=Bench Press"
      ]
    }
  }
];
