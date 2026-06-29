import { buildWorkoutVariationMessage } from "../../services/workout/workout-variation-library.js";
import { pushWorkout } from "../fixtures/coach-context.fixture.js";
import type { EvalScenario } from "../types.js";

export const workoutVariationScenarios: EvalScenario[] = [
  {
    name: "equipment combinations are optional and do not replace strength",
    run: () => ({
      reply: buildWorkoutVariationMessage(pushWorkout),
      actions: []
    }),
    expect: {
      replyIncludes: ["Optional workout combinations", "do not replace", "Equipment:"],
      replyExcludes: ["skip today's strength", "replace the strength plan"]
    }
  }
];
