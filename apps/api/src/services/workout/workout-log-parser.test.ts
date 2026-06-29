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
  estimatedMinutes: 60,
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
        commonSubstitutions: [],
        demoUrl: "https://example.com/video",
        gifSearchUrl: "https://example.com/gif"
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
          commonSubstitutions: [],
          demoUrl: "https://example.com/video",
          gifSearchUrl: "https://example.com/gif"
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

  it("parses common conditioning formats", () => {
    const parsed = parseWorkoutLogFallback(
      "Ran 2 miles moderate, rower 2000 meters, assault bike 50 calories",
      null
    );

    expect(parsed.conditioning).toEqual([
      expect.objectContaining({
        modality: "run",
        distanceMeters: 3219,
        intensity: "moderate"
      }),
      expect.objectContaining({
        modality: "rower",
        distanceMeters: 2000
      }),
      expect.objectContaining({
        modality: "assault_bike",
        calories: 50
      })
    ]);
  });

  it("parses skip commands without requiring past tense", () => {
    const parsed = parseWorkoutLogFallback("skip step-ups", workout);

    expect(parsed.exercises).toEqual([
      expect.objectContaining({
        exerciseName: "Box Step-Up",
        status: "skipped"
      })
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
