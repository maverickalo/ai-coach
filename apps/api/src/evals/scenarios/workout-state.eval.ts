import {
  buildFirstSetTarget,
  buildNextSetRecommendation,
  buildStatusPlanLine
} from "../../services/workout/workout-engine.js";
import { pushWorkout } from "../fixtures/coach-context.fixture.js";
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
  },
  {
    name: "fresh exercise status includes prescription and target",
    run: () => {
      const incline = pushWorkout.exercises.find(
        (item) => item.exercise.name === "Incline Dumbbell Press"
      );

      return {
        reply: [
          buildStatusPlanLine(incline),
          buildFirstSetTarget(incline)
        ].join("\n"),
        actions: []
      };
    },
    expect: {
      replyIncludes: ["Plan: 4x10", "RPE", "Target", "10 reps"],
      replyExcludes: ["undefined"]
    }
  },
  {
    name: "status advice holds weight after RPE 8",
    run: () => ({
      reply: buildNextSetRecommendation({
        exerciseName: "Bench Press",
        prescribedSets: 5,
        currentSet: 3,
        loggedSets: [
          { setNumber: 1, weight: "135", reps: 8, rpe: "8" },
          { setNumber: 2, weight: "135", reps: 8, rpe: "8" }
        ]
      }),
      actions: []
    }),
    expect: {
      replyIncludes: ["set 3 of 5", "stay at 135", "RPE 8"],
      replyExcludes: ["add", "jump"]
    }
  },
  {
    name: "status advice reduces weight after RPE 9",
    run: () => ({
      reply: buildNextSetRecommendation({
        exerciseName: "Bench Press",
        prescribedSets: 5,
        currentSet: 5,
        loggedSets: [
          { setNumber: 4, weight: "135", reps: 8, rpe: "9" }
        ]
      }),
      actions: []
    }),
    expect: {
      replyIncludes: ["set 5 of 5", "take weight off", "around"],
      replyExcludes: ["add", "jump"]
    }
  }
];
