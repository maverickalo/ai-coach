import { WorkoutEngine } from "../../services/workout/workout-engine.js";
import type { EvalScenario } from "../types.js";

export const endWorkoutSummaryScenarios: EvalScenario[] = [
  {
    name: "end-of-workout summary is clean and Slack-readable",
    run: () => ({
      reply: WorkoutEngine.formatWorkoutCompletionSummary({
        workoutName: "Push",
        completed: [
          {
            exerciseName: "Bench Press",
            sets: 3,
            reps: "8",
            weight: "225",
            rpe: "7"
          }
        ],
        skipped: [
          {
            exerciseName: "Cable Fly",
            skippedReason: "out of time"
          }
        ],
        painNotes: [
          {
            exerciseName: "Bench Press",
            note: "Wrist felt tight"
          }
        ],
        nextTime: [
          "• Bench Press: hold if wrist is still tight.",
          "• Cable Fly: move earlier if time is tight."
        ]
      }),
      actions: []
    }),
    expect: {
      replyIncludes: [
        "✅ *Workout Complete*",
        "*Completed*",
        "Bench Press",
        "*Skipped*",
        "Cable Fly",
        "*Pain / notes*",
        "Wrist felt tight",
        "*Next time*"
      ]
    }
  }
];
