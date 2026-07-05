import { CoachEngine } from "../../services/coach/coach-engine.js";
import {
  deriveWorkoutStatusFromParsedWorkout,
  parseSetOnlyLog
} from "../../services/conversation/conversation-engine.js";
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
    name: "single exercise log does not ask about remaining workout",
    run: async () => {
      const parsedWorkout = parseWorkoutLogFallback(
        "Bench Press 135 x 8 RPE 8",
        coachContext.currentWorkout
      );

      return coachEngine.respond({
        message: "Bench Press 135 x 8 RPE 8",
        intent: "log_workout",
        context: coachContext,
        parsedWorkout
      });
    },
    expect: {
      replyIncludes: ["Logged", "Bench Press"],
      replyExcludes: ["Incline", "skip", "missing", "didn't see"],
      actionsInclude: [
        {
          type: "log_exercise",
          payloadIncludes: {
            exerciseName: "Bench Press",
            status: "completed"
          }
        }
      ],
      actionsExclude: [
        {
          type: "ask_follow_up"
        }
      ]
    }
  },
  {
    name: "ordinal set log attaches to current exercise",
    run: () => {
      const parsedWorkout = parseSetOnlyLog(
        "Second set logged 135 x 8 RPE 7 I am going through my sets 1 by 1",
        "Bench Press"
      );
      const exercise = parsedWorkout?.exercises[0];
      const set = exercise?.setDetails?.[0];

      return {
        reply:
          exercise?.exerciseName === "Bench Press" &&
          exercise.sets === 2 &&
          set?.setNumber === 2 &&
          set.weight === 135 &&
          set.reps === 8 &&
          set.rpe === 7
            ? "attached second set to Bench Press"
            : "failed to attach second set to Bench Press",
        actions: []
      };
    },
    expect: {
      replyIncludes: ["attached second set to Bench Press"],
      replyExcludes: ["failed"]
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
