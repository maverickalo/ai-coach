import { CoachEngine } from "../../services/coach/coach-engine.js";
import { deriveWorkoutStatusFromParsedWorkout } from "../../services/conversation/conversation-engine.js";
import type { OpenAiClient } from "../../services/openai/openai.client.js";
import { parseWorkoutLogFallback } from "../../services/workout/workout-log-parser.js";
import { coachContext, lowerWorkout } from "../fixtures/coach-context.fixture.js";
import type { EvalScenario } from "../types.js";

const coachEngine = new CoachEngine({
  configured: false
} as unknown as OpenAiClient);

export const workoutLoggingScenarios: EvalScenario[] = [
  {
    name: "workout log persists completed and skipped exercises",
    run: async () => {
      const parsedWorkout = parseWorkoutLogFallback(
        "Squat 225 5x8 RPE 7, skipped step-ups",
        lowerWorkout
      );

      return coachEngine.respond({
        message: "Squat 225 5x8 RPE 7, skipped step-ups",
        intent: "log_workout",
        context: {
          ...coachContext,
          currentWorkout: lowerWorkout
        },
        parsedWorkout
      });
    },
    expect: {
      replyIncludes: ["Logged", "step"],
      actionsInclude: [
        {
          type: "log_exercise",
          payloadIncludes: {
            exerciseName: "Back Squat",
            status: "completed"
          }
        },
        {
          type: "log_exercise",
          payloadIncludes: {
            exerciseName: "Box Step-Up",
            status: "skipped"
          }
        },
        {
          type: "ask_follow_up"
        }
      ]
    }
  },
  {
    name: "warmup completion does not complete workout",
    run: () => {
      const status = deriveWorkoutStatusFromParsedWorkout({
        exercises: [],
        conditioning: [],
        pain: [],
        notes: ["finished warmup"],
        workoutCompletion: "complete"
      });

      return {
        reply:
          status === "in_progress"
            ? "warmup stays in progress"
            : `warmup incorrectly became ${status}`,
        actions: []
      };
    },
    expect: {
      replyIncludes: ["warmup stays in progress"],
      replyExcludes: ["Workout Complete", "incorrectly"]
    }
  },
  {
    name: "completed logged work can complete workout",
    run: () => {
      const status = deriveWorkoutStatusFromParsedWorkout({
        exercises: [
          {
            exerciseName: "Bench Press",
            status: "completed",
            sets: 5,
            reps: "8",
            weight: 185,
            rpe: 7,
            difficulty: "moderate",
            skippedReason: null,
            substituteExerciseName: null,
            notes: null
          }
        ],
        conditioning: [],
        pain: [],
        notes: [],
        workoutCompletion: "complete"
      });

      return {
        reply:
          status === "completed"
            ? "logged work can complete workout"
            : `logged work incorrectly became ${status}`,
        actions: []
      };
    },
    expect: {
      replyIncludes: ["logged work can complete workout"],
      replyExcludes: ["incorrectly"]
    }
  }
];
