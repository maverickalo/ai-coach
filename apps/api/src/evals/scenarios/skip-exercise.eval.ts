import { isCurrentExerciseSkipRequest } from "../../services/conversation/conversation-engine.js";
import { parseWorkoutLogFallback } from "../../services/workout/workout-log-parser.js";
import { pushWorkout } from "../fixtures/coach-context.fixture.js";
import type { EvalScenario } from "../types.js";

export const skipExerciseScenarios: EvalScenario[] = [
  {
    name: "bare skip resolves the active check-in path",
    run: () => ({
      reply: isCurrentExerciseSkipRequest("skip")
        ? "skip resolves current checked exercise and asks why"
        : "skip fell through to general coaching",
      actions: []
    }),
    expect: {
      replyIncludes: ["resolves current checked exercise", "asks why"],
      replyExcludes: ["fell through"]
    }
  },
  {
    name: "named skip logs exercise as skipped",
    run: () => {
      const parsed = parseWorkoutLogFallback("skip bench", pushWorkout);
      return {
        reply: "parsed skip bench",
        actions: parsed.exercises.map((exercise) => ({
          type: "log_exercise" as const,
          payload: exercise
        }))
      };
    },
    expect: {
      replyIncludes: ["parsed"],
      actionsInclude: [
        {
          type: "log_exercise",
          payloadIncludes: {
            exerciseName: "Bench Press",
            status: "skipped"
          }
        }
      ],
      actionsExclude: [
        {
          type: "log_exercise",
          payloadIncludes: {
            exerciseName: "Bench Press",
            status: "completed"
          }
        }
      ]
    }
  }
];
