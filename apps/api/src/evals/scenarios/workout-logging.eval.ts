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
    name: "next set log uses current workout set instead of weight as set number",
    run: () => {
      const parsedWorkout = parseSetOnlyLog(
        "Next set 135 x8 RPE 6",
        "Bench Press",
        3
      );
      const exercise = parsedWorkout?.exercises[0];
      const set = exercise?.setDetails?.[0];

      return {
        reply:
          exercise?.sets === 3 &&
          set?.setNumber === 3 &&
          set.weight === 135 &&
          set.reps === 8 &&
          set.rpe === 6
            ? "attached next set as set 3"
            : `failed: set=${exercise?.sets} weight=${set?.weight}`,
        actions: []
      };
    },
    expect: {
      replyIncludes: ["attached next set as set 3"],
      replyExcludes: ["failed", "set=135"]
    }
  },
  {
    name: "out-of-five set log uses stated set number",
    run: () => {
      const parsedWorkout = parseSetOnlyLog(
        "4 out of 5 logged 145 x 8 RPE 8",
        "Bench Press",
        3
      );
      const exercise = parsedWorkout?.exercises[0];
      const set = exercise?.setDetails?.[0];

      return {
        reply:
          exercise?.sets === 4 &&
          set?.setNumber === 4 &&
          set.weight === 145 &&
          set.reps === 8 &&
          set.rpe === 8
            ? "attached 4 out of 5 as set 4"
            : `failed: set=${exercise?.sets} weight=${set?.weight}`,
        actions: []
      };
    },
    expect: {
      replyIncludes: ["attached 4 out of 5 as set 4"],
      replyExcludes: ["failed"]
    }
  },
  {
    name: "dumbbell reps x weight set log preserves reps and load",
    run: () => {
      const parsedWorkout = parseSetOnlyLog(
        "First set done 10 x 35 pound dbs in each hand rpe 7",
        "Incline Dumbbell Press",
        1
      );
      const exercise = parsedWorkout?.exercises[0];
      const set = exercise?.setDetails?.[0];

      return {
        reply:
          exercise?.sets === 1 &&
          exercise.reps === "10" &&
          exercise.weight === 35 &&
          set?.setNumber === 1 &&
          set.reps === 10 &&
          set.weight === 35 &&
          set.rpe === 7
            ? "logged DB set as 35 lb x 10"
            : `failed: weight=${exercise?.weight} reps=${exercise?.reps}`,
        actions: []
      };
    },
    expect: {
      replyIncludes: ["logged DB set as 35 lb x 10"],
      replyExcludes: ["failed", "weight=10", "reps=35"]
    }
  },
  {
    name: "barbell weight x reps set log still preserves load and reps",
    run: () => {
      const parsedWorkout = parseSetOnlyLog(
        "Last set 145x8 RPE 8",
        "Bench Press",
        5
      );
      const exercise = parsedWorkout?.exercises[0];
      const set = exercise?.setDetails?.[0];

      return {
        reply:
          exercise?.sets === 5 &&
          exercise.reps === "8" &&
          exercise.weight === 145 &&
          set?.setNumber === 5 &&
          set.reps === 8 &&
          set.weight === 145
            ? "logged barbell set as 145 lb x 8"
            : `failed: weight=${exercise?.weight} reps=${exercise?.reps}`,
        actions: []
      };
    },
    expect: {
      replyIncludes: ["logged barbell set as 145 lb x 8"],
      replyExcludes: ["failed", "weight=8", "reps=145"]
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
