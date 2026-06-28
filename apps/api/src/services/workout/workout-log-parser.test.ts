import { describe, expect, it } from "vitest";
import type { CurrentWorkout } from "../../types/domain.js";
import {
  findMissingExercises,
  parseWorkoutLogFallback
} from "./workout-log-parser.js";

const workout: CurrentWorkout = {
  id: "workout-1",
  name: "Lower Body Strength",
  focus: null,
  scheduledDate: "2026-06-27",
  status: "scheduled",
  exercises: [
    {
      templateExerciseId: "warmup-1",
      exercise: {
        id: "warmup-exercise",
        name: "Assault Bike",
        category: "warm-up",
        primaryMuscles: [],
        equipment: [],
        instructions: null,
        commonSubstitutions: []
      },
      sortOrder: 1,
      prescribedSets: 1,
      prescribedReps: "5 minutes",
      prescribedWeight: null,
      notes: "Warm-up"
    },
    ...["Back Squat", "Romanian Deadlift", "Box Step-Up"].map(
      (name, index) => ({
      templateExerciseId: `template-${index}`,
      exercise: {
        id: `exercise-${index}`,
        name,
        category: null,
        primaryMuscles: [],
        equipment: [],
        instructions: null,
        commonSubstitutions: []
      },
      sortOrder: index + 2,
      prescribedSets: null,
      prescribedReps: null,
      prescribedWeight: null,
      notes: null
      })
    )
  ]
};

describe("parseWorkoutLogFallback", () => {
  it("parses common weight and sets x reps formats", () => {
    const parsed = parseWorkoutLogFallback(
      "Squat 225 5x8 felt easy, RDL 185 hard, skipped step ups",
      workout
    );

    expect(parsed.exercises).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exerciseName: "Back Squat",
          weight: 225,
          sets: 5,
          reps: "8",
          difficulty: "easy"
        }),
        expect.objectContaining({
          exerciseName: "Romanian Deadlift",
          weight: 185,
          difficulty: "hard"
        }),
        expect.objectContaining({
          exerciseName: "Box Step-Up",
          status: "skipped"
        })
      ])
    );
  });

  it("detects pain mentions", () => {
    const parsed = parseWorkoutLogFallback(
      "bench 205 all sets, missed last rep on set 5, wrist sore",
      workout
    );

    expect(parsed.pain).toEqual([
      expect.objectContaining({ bodyArea: "wrist" })
    ]);
  });
});

describe("findMissingExercises", () => {
  it("returns prescribed exercises that were not logged", () => {
    const parsed = parseWorkoutLogFallback("Squat 225 5x8", workout);
    expect(findMissingExercises(workout, parsed)).toEqual([
      "Romanian Deadlift",
      "Box Step-Up"
    ]);
  });
});
