import {
  isCurrentExerciseSkipRequest,
  isDailyWorkoutFormatRequest,
  isWorkoutStartMessage
} from "../../services/conversation/conversation-engine.js";
import { buildModifiedStrengthWorkout } from "../../services/workout/workout-variation-library.js";
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
  },
  {
    name: "start of day formatting request does not start workout",
    run: () => ({
      reply:
        !isWorkoutStartMessage("No like if you were sending it to me to start the day") &&
        isDailyWorkoutFormatRequest("No like if you were sending it to me to start the day")
          ? "send full daily workout format"
          : "Good. Start with Bench Press.",
      actions: []
    }),
    expect: {
      replyIncludes: ["send full daily workout format"],
      replyExcludes: ["Start with Bench Press"]
    }
  },
  {
    name: "do not start correction does not start workout",
    run: () => ({
      reply: !isWorkoutStartMessage("no dont start i need you to send me it")
        ? "send full daily workout format"
        : "Good. Start with Bench Press.",
      actions: []
    }),
    expect: {
      replyIncludes: ["send full daily workout format"],
      replyExcludes: ["Start with Bench Press"]
    }
  },
  {
    name: "modified push can be sent as fresh daily workout format",
    run: () => ({
      reply: engine.buildDailyWorkoutMessage(
        "Sean",
        buildModifiedStrengthWorkout(pushWorkout)
      ),
      actions: []
    }),
    expect: {
      replyIncludes: [
        "Coach AI",
        "2-Hour Strength",
        "Quick breakdown",
        "Close-Grip Bench Press",
        "Landmine Press",
        "Dumbbell Skull Crusher",
        "Form:",
        "starting now"
      ],
      replyExcludes: ["Triceps Pushdown", "Overhead Rope Extension"]
    }
  }
];
