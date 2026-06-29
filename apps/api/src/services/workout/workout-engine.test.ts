import { describe, expect, it } from "vitest";
import type { CurrentWorkout } from "../../types/domain.js";
import { WorkoutEngine } from "./workout-engine.js";

const workout: CurrentWorkout = {
  id: "workout-1",
  name: "Lower Body Strength",
  focus: "Heavy lower-body strength and HYROX durability",
  estimatedMinutes: 60,
  scheduledDate: "2026-06-28",
  status: "scheduled",
  exercises: [
    {
      templateExerciseId: "template-1",
      sortOrder: 1,
      prescribedSets: 5,
      prescribedReps: "8",
      prescribedWeight: null,
      notes: null,
      exercise: {
        id: "exercise-1",
        name: "Back Squat",
        category: "lower strength",
        primaryMuscles: ["quadriceps"],
        equipment: ["barbell"],
        instructions: null,
        commonSubstitutions: [],
        demoUrl: "https://example.com/video",
        gifSearchUrl: "https://example.com/gif"
      }
    },
    {
      templateExerciseId: "template-2",
      sortOrder: 2,
      prescribedSets: 4,
      prescribedReps: "10",
      prescribedWeight: null,
      notes: null,
      exercise: {
        id: "exercise-2",
        name: "Romanian Deadlift",
        category: "hinge",
        primaryMuscles: ["hamstrings"],
        equipment: ["barbell"],
        instructions: null,
        commonSubstitutions: [],
        demoUrl: "https://example.com/video",
        gifSearchUrl: "https://example.com/gif"
      }
    }
  ],
  conditioning: {
    mode: "run",
    sessionShape: "hyrox_bias",
    prescription: "Sprinkle controlled treadmill segments between lifts.",
    reason: "HYROX is run-heavy and this week needs run exposure.",
    caution: "Keep pace controlled."
  }
};

describe("workout engine deterministic session adjustments", () => {
  it("turns a workout into a HYROX-biased circuit when requested", () => {
    const engine = new WorkoutEngine({} as never);
    const message = engine.buildSessionAdjustmentMessage(workout, "hyrox");

    expect(message).toContain("HYROX-biased version");
    expect(message).toContain("400m controlled run");
    expect(message).toContain("Back Squat");
    expect(message).toContain("Keep runs controlled");
  });
});
