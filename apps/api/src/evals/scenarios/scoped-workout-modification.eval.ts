import {
  buildScopedWorkoutModificationMessage,
  isScopedWorkoutModificationRequest
} from "../../services/workout/workout-variation-library.js";
import { pushWorkout } from "../fixtures/coach-context.fixture.js";
import type { EvalScenario } from "../types.js";

export const scopedWorkoutModificationScenarios: EvalScenario[] = [
  {
    name: "scoped push strength edit does not become generic combinations",
    run: () => ({
      reply: isScopedWorkoutModificationRequest(
        "Ok find workouts around that. No hyrox. Just strength and replace overhead rope extension and tricep pushdown"
      )
        ? buildScopedWorkoutModificationMessage(
            "Ok find workouts around that. No hyrox. Just strength and replace overhead rope extension and tricep pushdown",
            pushWorkout
          )
        : "routed to optional workout combinations",
      actions: []
    }),
    expect: {
      replyIncludes: [
        "scoped edit",
        "No HYROX/cardio",
        "Targets today",
        "chest",
        "shoulders",
        "triceps",
        "Remove / avoid",
        "Overhead Rope Extension",
        "Triceps Pushdown",
        "Replacement options from your equipment"
      ],
      replyExcludes: [
        "Optional workout combinations",
        "sled",
        "rower",
        "treadmill",
        "wall ball",
        "Smith Machine",
        "Machine Chest Press",
        "EZ-Bar"
      ]
    }
  },
  {
    name: "two hour push request expands strength without rewriting base",
    run: () => ({
      reply: buildScopedWorkoutModificationMessage(
        "Lets add more around the muscles we are trying to target please I would like this to be a 2 hour workout. I dont want overhead rope extension or tricep pushdown find something else",
        pushWorkout
      ),
      actions: []
    }),
    expect: {
      replyIncludes: [
        "2-hour strength expansion",
        "Keep as the base",
        "Bench Press",
        "Incline Dumbbell Press",
        "Strength stays primary"
      ],
      replyExcludes: ["HYROX finisher", "Outdoor Run", "Landmine Legs"]
    }
  }
];
