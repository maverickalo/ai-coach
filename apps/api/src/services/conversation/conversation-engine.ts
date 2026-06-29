import { and, asc, eq, ilike } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import {
  coachEvents,
  conversations,
  exercises,
  messages,
  substitutions,
  users
} from "../../db/schema.js";
import { env } from "../../env.js";
import type {
  CoachAction,
  CoachResult
} from "../../types/domain.js";
import { dateInTimeZone } from "../../utils/dates.js";
import { COACH_PROMPT_VERSION } from "../coach/coach-prompts.js";
import type { CoachContextBuilder } from "../coach/coach-context-builder.js";
import type { CoachEngine } from "../coach/coach-engine.js";
import type { MemoryEngine } from "../memory/memory-engine.js";
import type { OpenAiClient } from "../openai/openai.client.js";
import type { WorkoutEngine } from "../workout/workout-engine.js";
import { parseWorkoutLog } from "../workout/workout-log-parser.js";
import {
  classifyDeterministicIntent,
  classifyIntent
} from "./intent-classifier.js";

const START_REPLY =
  "Coach AI: Reminders are on. Send workout results, questions, pain updates, or schedule changes here. Reply HELP for examples or STOP to pause reminders.";

const HELP_REPLY =
  'Coach AI: Send workout results, questions, or updates like "wrist hurts", "I only have 30 minutes", or "squat 225 5x8 felt good". Reply STOP to pause reminders.';

const STOP_REPLY =
  "Coach AI: Reminders are paused. Reply START when you want them back on.";

export class ConversationEngine {
  constructor(
    private readonly db: Database,
    private readonly contextBuilder: CoachContextBuilder,
    private readonly coachEngine: CoachEngine,
    private readonly workoutEngine: WorkoutEngine,
    private readonly memoryEngine: MemoryEngine,
    private readonly openai: OpenAiClient
  ) {}

  async handleWebMessage(userId: string, body: string): Promise<CoachResult> {
    return this.processMessage({
      userId,
      channel: "web",
      body,
      metadata: {
        requestId: crypto.randomUUID()
      }
    });
  }

  async handleSlackMessage(userId: string, body: string): Promise<CoachResult> {
    return this.processMessage({
      userId,
      channel: "slack",
      body,
      metadata: {
        requestId: crypto.randomUUID()
      }
    });
  }

  async simulate(email: string, body: string): Promise<CoachResult> {
    const user = await this.findUserByEmail(email);
    return this.processMessage({
      userId: user.id,
      channel: "web",
      body,
      metadata: {
        requestId: crypto.randomUUID(),
        simulated: true
      }
    });
  }

  private async processMessage(input: {
    userId: string;
    channel: "web" | "slack";
    body: string;
    metadata: Record<string, unknown>;
  }): Promise<CoachResult> {
    const conversationId = await this.findOrCreateConversation(
      input.userId,
      input.channel
    );

    await this.db.insert(messages).values({
      conversationId,
      direction: "inbound",
      body: input.body,
      metadata: input.metadata
    });

    const deterministicIntent = classifyDeterministicIntent(input.body);
    let result: CoachResult;

    if (deterministicIntent) {
      result = await this.handleDeterministicIntent(
        input.userId,
        deterministicIntent
      );
    } else {
      const context = await this.contextBuilder.build(input.userId);
      const intent = await classifyIntent(input.body, this.openai);
      const shouldParse =
        intent === "log_workout" ||
        intent === "report_pain" ||
        intent === "request_substitution";
      const parsedWorkout = shouldParse
        ? await parseWorkoutLog(
            input.body,
            context.currentWorkout,
            this.openai.configured ? this.openai : undefined
          )
        : null;

      result = await this.coachEngine.respond({
        message: input.body,
        intent,
        context,
        parsedWorkout
      });

      await this.applyActions(
        input.userId,
        context.currentWorkout?.id ?? null,
        result.actions
      );

      if (context.currentWorkout && parsedWorkout) {
        const status =
          parsedWorkout.workoutCompletion === "complete"
            ? "completed"
            : parsedWorkout.workoutCompletion === "partial" ||
                parsedWorkout.exercises.some(
                  (entry) =>
                    entry.status === "skipped" || entry.status === "partial"
                )
              ? "partially_completed"
              : "in_progress";
        await this.workoutEngine.updateWorkoutStatus(
          context.currentWorkout.id,
          status
        );
      }
    }

    await this.db.insert(messages).values({
      conversationId,
      direction: "outbound",
      body: result.reply,
      intent: result.intent,
      metadata: {
        actionCount: result.actions.length,
        model: env.OPENAI_MODEL,
        promptVersion: COACH_PROMPT_VERSION
      }
    });

    return result;
  }

  private async findUserByEmail(email: string) {
    const [existing] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing) {
      return existing;
    }

    throw new Error("User was not found. Run pnpm db:seed.");
  }

  private async findOrCreateConversation(
    userId: string,
    channel: "web" | "slack"
  ): Promise<string> {
    const [existing] = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          eq(conversations.channel, channel)
        )
      )
      .orderBy(asc(conversations.createdAt))
      .limit(1);

    if (existing) {
      return existing.id;
    }

    const [created] = await this.db
      .insert(conversations)
      .values({ userId, channel })
      .returning();

    if (!created) {
      throw new Error("Failed to create conversation");
    }
    return created.id;
  }

  private async handleDeterministicIntent(
    userId: string,
    intent: "opt_in" | "opt_out" | "help"
  ): Promise<CoachResult> {
    if (intent === "opt_in") {
      await this.db
        .update(users)
        .set({
          smsOptedIn: true,
          smsConsentAt: new Date(),
          smsOptedOutAt: null,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));
      return { intent, actions: [], reply: START_REPLY };
    }

    if (intent === "opt_out") {
      await this.db
        .update(users)
        .set({
          smsOptedIn: false,
          smsOptedOutAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));
      return { intent, actions: [], reply: STOP_REPLY };
    }

    return { intent, actions: [], reply: HELP_REPLY };
  }

  private async applyActions(
    userId: string,
    workoutId: string | null,
    actions: CoachAction[]
  ): Promise<void> {
    for (const action of actions) {
      if (action.type === "log_exercise" && workoutId) {
        await this.workoutEngine.logExercise(userId, workoutId, action.payload);
      } else if (action.type === "record_pain") {
        const date = dateInTimeZone(new Date(), "America/Los_Angeles");
        await this.memoryEngine.remember(userId, {
          category: "injury",
          key: `pain_${action.payload.bodyArea}_${date}`,
          value: action.payload.description,
          confidence: 1,
          source: "explicit"
        });
        await this.db.insert(coachEvents).values({
          userId,
          workoutId,
          eventType: "PainReported",
          payload: { ...action.payload }
        });
      } else if (action.type === "create_memory") {
        await this.memoryEngine.remember(userId, action.payload);
        await this.db.insert(coachEvents).values({
          userId,
          workoutId,
          eventType: "MemoryCreated",
          payload: action.payload
        });
      } else if (action.type === "record_substitution" && workoutId) {
        const [original] = await this.db
          .select()
          .from(exercises)
          .where(ilike(exercises.name, action.payload.originalExercise))
          .limit(1);
        const [substitute] = await this.db
          .select()
          .from(exercises)
          .where(ilike(exercises.name, action.payload.substituteExercise))
          .limit(1);

        if (original && substitute) {
          await this.db.insert(substitutions).values({
            workoutId,
            originalExerciseId: original.id,
            substituteExerciseId: substitute.id,
            reason: action.payload.reason
          });
          await this.db.insert(coachEvents).values({
            userId,
            workoutId,
            eventType: "ExerciseSubstituted",
            payload: { ...action.payload }
          });
        }
      } else if (action.type === "create_event") {
        await this.db.insert(coachEvents).values({
          userId,
          workoutId,
          eventType: action.payload.eventType,
          payload: action.payload.data
        });
      }
    }
  }
}
