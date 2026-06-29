import { WorkoutEngine } from "../../services/workout/workout-engine.js";
import { pushWorkout } from "../fixtures/coach-context.fixture.js";
import type { EvalScenario } from "../types.js";

const engine = new WorkoutEngine({} as never);

export const workoutMediaScenarios: EvalScenario[] = [
  {
    name: "workout media request labels unreviewed links as search",
    run: () => ({
      reply: engine.buildWorkoutMediaMessage(pushWorkout),
      actions: []
    }),
    expect: {
      replyIncludes: [
        "🎞️",
        "Form guide for Push",
        "Bench Press",
        "_Setup:_",
        "_Cues:_",
        "image search",
        "video search",
        "unreviewed media is labeled as search"
      ],
      replyExcludes: ["replace today's workout"]
    }
  }
];
