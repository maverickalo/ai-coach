import { and, asc, eq, ilike } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import {
  coachEvents,
  conversations,
  exercises,
  messages,
  processedWebhooks,
  substitutions,
  users
} from "../../db/schema.js";
import { env } from "../../env.js";
import type {
  CoachAction,
  CoachResult,
  InboundMessage
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
  "Coach AI: You are now opted in to receive workout reminders, workout logging prompts, and coaching messages. Message frequency varies. Msg & data rates may apply. Reply HELP for help. Reply STOP to opt out.";

const HELP_REPLY =
  'Coach AI: Reply with your workout results, questions, or updates like "wrist hurts" or "I only have 30 minutes." Message frequency varies. Msg & data rates may apply. Reply STOP to opt out.';

const STOP_REPLY =
  "Coach AI: You have been opted out and will no longer receive messages. Reply START to opt back in.";

export class ConversationEngine {
  constructor(
    private readonly db: Database,
    private readonly contextBuilder: CoachContextBuilder,
    private readonly coachEngine: CoachEngine,
    private readonly workoutEngine: WorkoutEngine,
    private readonly memoryEngine: MemoryEngine,
    private readonly openai: OpenAiClient
  ) {}

  async handleInbound(message: InboundMessage): Promise<CoachResult> {
    const duplicate = await this.db
      .select()
      .from(processedWebhooks)
      .where(
        and(
          eq(processedWebhooks.provider, "twilio"),
          eq(processedWebhooks.externalId, message.messageSid)
        )
      )
      .limit(1);

    if (duplicate.length > 0) {
      return {
        intent: "unknown",
        actions: [],
        reply: "Already received. Send another message if you need anything else."
      };
    }

    const user = await this.findOrCreateUser(message.from);
    const conversationId = await this.findOrCreateConversation(user.id);

    await this.db.insert(messages).values({
      conversationId,
      direction: "inbound",
      body: message.body,
      metadata: {
        messageSid: message.messageSid,
        from: message.from,
        to: message.to
      }
    });

    const deterministicIntent = classifyDeterministicIntent(message.body);
    let result: CoachResult;

    if (deterministicIntent) {
      result = await this.handleDeterministicIntent(
        user.id,
        deterministicIntent
      );
    } else {
      const context = await this.contextBuilder.build(user.id);
      const intent = await classifyIntent(message.body, this.openai);
      const shouldParse =
        intent === "log_workout" ||
        intent === "report_pain" ||
        intent === "request_substitution";
      const parsedWorkout = shouldParse
        ? await parseWorkoutLog(
            message.body,
            context.currentWorkout,
            this.openai.configured ? this.openai : undefined
          )
        : null;

      result = await this.coachEngine.respond({
        message: message.body,
        intent,
        context,
        parsedWorkout
      });

      await this.applyActions(
        user.id,
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

    await this.db.insert(processedWebhooks).values({
      provider: "twilio",
      externalId: message.messageSid
    });

    return result;
  }

  async simulate(phoneNumber: string, body: string): Promise<CoachResult> {
    return this.handleInbound({
      messageSid: `dev-${crypto.randomUUID()}`,
      from: phoneNumber,
      to: "dev",
      body
    });
  }

  private async findOrCreateUser(phoneNumber: string) {
    const [existing] = await this.db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, phoneNumber))
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await this.db
      .insert(users)
      .values({ phoneNumber })
      .returning();

    if (!created) {
      throw new Error("Failed to create user");
    }
    return created;
  }

  private async findOrCreateConversation(userId: string): Promise<string> {
    const [existing] = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          eq(conversations.channel, "sms")
        )
      )
      .orderBy(asc(conversations.createdAt))
      .limit(1);

    if (existing) {
      return existing.id;
    }

    const [created] = await this.db
      .insert(conversations)
      .values({ userId, channel: "sms" })
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
