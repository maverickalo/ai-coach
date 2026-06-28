import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { env } from "../../env.js";
import type {
  CoachContext,
  CoachIntent,
  CurrentWorkout,
  ParsedWorkoutLog
} from "../../types/domain.js";
import {
  coachSystemPrompt,
  intentClassifierPrompt,
  weeklyReviewPrompt,
  workoutParserPrompt
} from "../coach/coach-prompts.js";

const intentSchema = z.object({
  intent: z.enum([
    "log_workout",
    "answer_exercise_question",
    "report_pain",
    "request_substitution",
    "request_shortened_workout",
    "schedule_change",
    "general_chat",
    "unknown"
  ])
});

const parsedExerciseSchema = z.object({
  exerciseName: z.string(),
  status: z.enum(["completed", "partial", "skipped", "substituted"]),
  sets: z.number().int().positive().nullable(),
  reps: z.string().nullable(),
  weight: z.number().nonnegative().nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  difficulty: z.enum(["easy", "moderate", "hard"]).nullable(),
  skippedReason: z.string().nullable(),
  substituteExerciseName: z.string().nullable(),
  notes: z.string().nullable()
});

const parsedWorkoutSchema = z.object({
  exercises: z.array(parsedExerciseSchema),
  pain: z.array(
    z.object({
      bodyArea: z.string(),
      description: z.string(),
      severity: z.number().int().min(1).max(10).nullable()
    })
  ),
  notes: z.array(z.string()),
  workoutCompletion: z.enum(["complete", "partial", "unknown"])
});

const coachReplySchema = z.object({
  reply: z.string().min(1).max(1200),
  memories: z.array(
    z.object({
      category: z.enum([
        "equipment",
        "preference",
        "injury",
        "schedule",
        "nutrition",
        "training",
        "coaching_style"
      ]),
      key: z.string().min(1),
      value: z.string().min(1),
      confidence: z.number().min(0).max(1),
      source: z.enum(["explicit", "inferred"])
    })
  )
});

const weeklyReviewSchema = z.object({
  summary: z.string().min(1).max(1200),
  recommendations: z.array(z.string().min(1)).min(1).max(4)
});

export type GeneratedCoachReply = z.infer<typeof coachReplySchema>;
export type GeneratedWeeklyReview = z.infer<typeof weeklyReviewSchema>;

export class OpenAiClient {
  private readonly client: OpenAI | null;

  constructor() {
    this.client = env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
      : null;
  }

  get configured(): boolean {
    return this.client !== null;
  }

  async classifyIntent(message: string): Promise<CoachIntent> {
    if (!this.client) {
      return this.classifyIntentFallback(message);
    }

    const response = await this.client.responses.parse({
      model: env.OPENAI_MODEL,
      input: [
        { role: "system", content: intentClassifierPrompt },
        { role: "user", content: message }
      ],
      text: {
        format: zodTextFormat(intentSchema, "coach_intent")
      }
    });

    return response.output_parsed?.intent ?? "unknown";
  }

  async parseWorkoutLog(
    message: string,
    currentWorkout: CurrentWorkout | null
  ): Promise<ParsedWorkoutLog> {
    if (!this.client) {
      throw new Error("OpenAI is not configured");
    }

    const response = await this.client.responses.parse({
      model: env.OPENAI_MODEL,
      input: [
        { role: "system", content: workoutParserPrompt },
        {
          role: "user",
          content: JSON.stringify({
            message,
            prescribedWorkout:
              currentWorkout?.exercises.map((item) => ({
                name: item.exercise.name,
                sets: item.prescribedSets,
                reps: item.prescribedReps
              })) ?? []
          })
        }
      ],
      text: {
        format: zodTextFormat(parsedWorkoutSchema, "parsed_workout_log")
      }
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI returned no parsed workout log");
    }

    return response.output_parsed;
  }

  async generateCoachReply(input: {
    message: string;
    intent: CoachIntent;
    context: CoachContext;
    parsedWorkout: ParsedWorkoutLog | null;
    proposedActions: unknown[];
    missingExercises: string[];
  }): Promise<GeneratedCoachReply> {
    if (!this.client) {
      throw new Error("OpenAI is not configured");
    }

    const response = await this.client.responses.parse({
      model: env.OPENAI_MODEL,
      input: [
        { role: "system", content: coachSystemPrompt },
        {
          role: "user",
          content: JSON.stringify(input)
        }
      ],
      text: {
        format: zodTextFormat(coachReplySchema, "coach_reply")
      }
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI returned no coach reply");
    }

    return response.output_parsed;
  }

  async generateWeeklyReview(data: unknown): Promise<GeneratedWeeklyReview> {
    if (!this.client) {
      throw new Error("OpenAI is not configured");
    }

    const response = await this.client.responses.parse({
      model: env.OPENAI_MODEL,
      input: [
        { role: "system", content: weeklyReviewPrompt },
        { role: "user", content: JSON.stringify(data) }
      ],
      text: {
        format: zodTextFormat(weeklyReviewSchema, "weekly_review")
      }
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI returned no weekly review");
    }

    return response.output_parsed;
  }

  private classifyIntentFallback(message: string): CoachIntent {
    const normalized = message.toLowerCase();

    if (/(hurt|pain|sore|injur|tweak)/i.test(normalized)) {
      return "report_pain";
    }
    if (/(swap|substitute|instead of|alternative)/i.test(normalized)) {
      return "request_substitution";
    }
    if (/(how do i|form|technique|how should)/i.test(normalized)) {
      return "answer_exercise_question";
    }
    if (/(only have|shorten|minutes today)/i.test(normalized)) {
      return "request_shortened_workout";
    }
    if (
      /(\d+\s*[xX]\s*\d+|rpe|skipped|finished|completed|\bdone\b)/i.test(
        normalized
      )
    ) {
      return "log_workout";
    }

    return "general_chat";
  }
}
