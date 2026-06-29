import { WorkoutEngine } from "../../services/workout/workout-engine.js";
import { pushWorkout } from "../fixtures/coach-context.fixture.js";
import type { EvalScenario } from "../types.js";

const engine = new WorkoutEngine({} as never);

export const workoutMediaScenarios: EvalScenario[] = [
  {
    name: "workout GIF request returns all main exercise media",
    run: () => ({
      reply: engine.buildWorkoutMediaMessage(pushWorkout),
      actions: []
    }),
    expect: {
      replyIncludes: ["🎞️", "Form guide for Push", "Bench Press", "_Setup:_", "_Cues:_", "GIF", "video"],
      replyExcludes: ["replace today's workout"]
    }
  }
];
