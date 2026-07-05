import { isCurrentExerciseSkipRequest } from "../../services/conversation/conversation-engine.js";
import { WorkoutEngine } from "../../services/workout/workout-engine.js";
import { pushWorkout } from "../fixtures/coach-context.fixture.js";
import type { EvalScenario } from "../types.js";

const engine = new WorkoutEngine({} as never);

export const checkInFlowScenarios: EvalScenario[] = [
  {
    name: "daily workout starts the check-in flow",
    run: () => ({
      reply: engine.buildDailyWorkoutMessage("Sean", pushWorkout),
      actions: []
    }),
    expect: {
      replyIncludes: ["Quick breakdown", "Details", "starting now", "check in", "Bench Press"],
      replyExcludes: ["SMS"]
    }
  },
  {
    name: "skip during check-in does not advance as completed work",
    run: () => ({
      reply: isCurrentExerciseSkipRequest("skip")
        ? "skip will log the checked exercise as skipped and ask why"
        : "skip may advance as completed work",
      actions: []
    }),
    expect: {
      replyIncludes: ["log the checked exercise as skipped", "ask why"],
      replyExcludes: ["completed work"]
    }
  }
];
