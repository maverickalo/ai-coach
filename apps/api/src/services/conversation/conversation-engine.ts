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
import { buildWorkoutVariationMessage } from "../workout/workout-variation-library.js";
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

function isWorkoutStartMessage(body: string): boolean {
  return /\b(starting|start|started|begin|beginning)\b/i.test(body);
}

function isExerciseDemoRequest(body: string): boolean {
  return /\b(gif|demo|video|show me|how do i|how to)\b/i.test(body);
}

export function isWorkoutMediaRequest(body: string): boolean {
  return /\b(gifs?|demos?|videos?)\b.*\b(today|workout|all|plan|exercises?)\b|\b(today|workout|all|plan|exercises?)\b.*\b(gifs?|demos?|videos?)\b/i.test(
    body
  );
}

function isWorkoutVariationRequest(body: string): boolean {
  return /\b(more|other|extra|optional|add)\b.*\b(workouts?|options?|combinations?|finishers?)\b|\b(workouts?|options?|combinations?|finishers?)\b.*\b(more|other|extra|optional|add)\b/i.test(
    body
  );
}

export function getRequestedSessionShape(
  body: string
): "short" | "standard" | "long" | "strength" | "hyrox" | null {
  const normalized = body.trim().toLowerCase();
  if (/^(short|shorter)$|only have \d+|30 minutes|quick/i.test(normalized)) {
    return "short";
  }
  if (/^(standard|normal|as written)$/i.test(normalized)) {
    return "standard";
  }
  if (/^(long|longer)$|more time|extra work/i.test(normalized)) {
    return "long";
  }
  if (/^(strength|strength bias|strength-biased)$/i.test(normalized)) {
    return "strength";
  }
  if (
    /^(hyrox|cardio|circuit)$|hyrox.*(version|style|bias|add|added)|cardio.*(look|add|added|option|optional)|more cardio/i.test(
      normalized
    )
  ) {
    return "hyrox";
  }
  return null;
}

function isMissedDayRequest(body: string): boolean {
  return /\b(missed|skipped|forgot|didn't do|did not do)\b.*\b(day|workout|yesterday|session)\b/i.test(body);
}

export function isCurrentExerciseSkipRequest(body: string): boolean {
  return /^\s*(skip|skipping|skipped)(\s+(it|this|that|for now))?\s*[.!?]?\s*$/i.test(
    body
  );
}

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
      if (isWorkoutStartMessage(input.body)) {
        result = await this.handleWorkoutStarted(input.userId, context);
      } else if (isCurrentExerciseSkipRequest(input.body)) {
        result = await this.handleCurrentExerciseSkipped(input.userId, context);
      } else if (isWorkoutMediaRequest(input.body)) {
        result = this.handleWorkoutMediaRequest(context);
      } else if (isWorkoutVariationRequest(input.body)) {
        result = this.handleWorkoutVariationRequest(context);
      } else if (isExerciseDemoRequest(input.body)) {
        result = this.handleExerciseDemoRequest(input.body, context);
      } else if (getRequestedSessionShape(input.body)) {
        result = await this.handleSessionShapeRequest(input.body, context);
      } else if (isMissedDayRequest(input.body)) {
        result = await this.handleMissedDayRequest(input.userId);
      } else {
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
          if (status === "completed") {
            result = {
              ...result,
              reply: await this.workoutEngine.buildWorkoutCompletionSummary(
                context.currentWorkout.id
              )
            };
          }
        }
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

  private async handleWorkoutStarted(
    userId: string,
    context: Awaited<ReturnType<CoachContextBuilder["build"]>>
  ): Promise<CoachResult> {
    if (!context.currentWorkout) {
      return {
        intent: "general_chat",
        actions: [],
        reply:
          "I don't see a workout assigned for today yet. Ask me for today's workout first, then tell me when you're starting."
      };
    }

    await this.workoutEngine.updateWorkoutStatus(
      context.currentWorkout.id,
      "in_progress"
    );
    await this.db.insert(coachEvents).values({
      userId,
      workoutId: context.currentWorkout.id,
      eventType: "WorkoutStarted",
      payload: {
        source: "conversation",
        checkInIntervalMinutes: env.WORKOUT_CHECK_IN_INTERVAL_MINUTES
      }
    });

    const firstMainExercise = context.currentWorkout.exercises.find(
      (item) => item.notes !== "Warm-up"
    );

    return {
      intent: "general_chat",
      actions: [],
      reply: `Good. Start with ${firstMainExercise?.exercise.name ?? "the first main lift"}. I'll check in about every ${env.WORKOUT_CHECK_IN_INTERVAL_MINUTES} minutes and ask how the work is going.`
    };
  }

  private async handleCurrentExerciseSkipped(
    userId: string,
    context: Awaited<ReturnType<CoachContextBuilder["build"]>>
  ): Promise<CoachResult> {
    if (!context.currentWorkout) {
      return {
        intent: "log_workout",
        actions: [],
        reply:
          "What are we skipping? I do not see an active workout for today yet."
      };
    }

    const exerciseName = await this.workoutEngine.getLastCheckInExerciseName(
      context.currentWorkout.id
    );

    if (!exerciseName) {
      return {
        intent: "log_workout",
        actions: [],
        reply:
          "Which exercise are we skipping? Send it like `skip bench` or `skip step-ups`."
      };
    }

    await this.workoutEngine.logExercise(userId, context.currentWorkout.id, {
      exerciseName,
      status: "skipped",
      sets: null,
      reps: null,
      weight: null,
      rpe: null,
      difficulty: null,
      skippedReason: null,
      substituteExerciseName: null,
      notes: "Skipped after coach check-in"
    });

    await this.workoutEngine.updateWorkoutStatus(
      context.currentWorkout.id,
      "partially_completed"
    );

    return {
      intent: "log_workout",
      actions: [],
      reply: `Logged ${exerciseName} as skipped. Was that because of time, discomfort, or preference?`
    };
  }

  private async handleSessionShapeRequest(
    body: string,
    context: Awaited<ReturnType<CoachContextBuilder["build"]>>
  ): Promise<CoachResult> {
    const shape = getRequestedSessionShape(body) ?? "standard";
    if (!context.currentWorkout) {
      return {
        intent: "request_shortened_workout",
        actions: [],
        reply:
          "I do not see today's workout assigned yet. Ask for today's workout first, then send short, standard, long, strength, or HYROX."
      };
    }

    await this.db.insert(coachEvents).values({
      userId: context.user.id,
      workoutId: context.currentWorkout.id,
      eventType: "WorkoutPlanAdjusted",
      payload: {
        requestedShape: shape,
        source: "conversation"
      }
    });

    return {
      intent:
        shape === "short" ? "request_shortened_workout" : "schedule_change",
      actions: [],
      reply: this.workoutEngine.buildSessionAdjustmentMessage(
        context.currentWorkout,
        shape
      )
    };
  }

  private async handleMissedDayRequest(userId: string): Promise<CoachResult> {
    await this.db.insert(coachEvents).values({
      userId,
      workoutId: null,
      eventType: "WorkoutPlanAdjusted",
      payload: {
        reason: "missed_day_request",
        source: "conversation"
      }
    });

    return {
      intent: "schedule_change",
      actions: [],
      reply: await this.workoutEngine.buildMissedDayAdjustmentMessage(userId)
    };
  }

  private handleExerciseDemoRequest(
    body: string,
    context: Awaited<ReturnType<CoachContextBuilder["build"]>>
  ): CoachResult {
    const normalizedBody = body.toLowerCase();
    const exercise = context.currentWorkout?.exercises.find((item) => {
      const name = item.exercise.name.toLowerCase();
      const firstWord = name.split(" ")[0] ?? name;
      return normalizedBody.includes(name) || normalizedBody.includes(firstWord);
    });

    if (!exercise) {
      return {
        intent: "answer_exercise_question",
        actions: [],
        reply:
          "Which exercise do you want a demo for? Send something like \"show me RDL\" or \"bench gif\"."
      };
    }

    return {
      intent: "answer_exercise_question",
      actions: [],
      reply: [
        `🎞️ *${exercise.exercise.name}*`,
        exercise.exercise.purpose ? `_Why:_ ${exercise.exercise.purpose}` : null,
        exercise.exercise.setup ? `_Setup:_ ${exercise.exercise.setup}` : null,
        exercise.exercise.cues?.length
          ? ["_Cues:_", ...exercise.exercise.cues.map((cue) => `• ${cue}`)].join("\n")
          : null,
        exercise.exercise.commonMistakes?.length
          ? [
              "_Avoid:_",
              ...exercise.exercise.commonMistakes
                .slice(0, 2)
                .map((mistake) => `• ${mistake}`)
            ].join("\n")
          : null,
        `_Form:_ <${exercise.exercise.gifUrl}|GIF> | <${exercise.exercise.demoUrl}|video>`
      ]
        .filter(Boolean)
        .join("\n")
    };
  }

  private handleWorkoutMediaRequest(
    context: Awaited<ReturnType<CoachContextBuilder["build"]>>
  ): CoachResult {
    if (!context.currentWorkout) {
      return {
        intent: "answer_exercise_question",
        actions: [],
        reply: "I do not see today's workout yet. Ask for today's workout first, then ask for GIFs."
      };
    }

    return {
      intent: "answer_exercise_question",
      actions: [],
      reply: this.workoutEngine.buildWorkoutMediaMessage(context.currentWorkout)
    };
  }

  private handleWorkoutVariationRequest(
    context: Awaited<ReturnType<CoachContextBuilder["build"]>>
  ): CoachResult {
    if (!context.currentWorkout) {
      return {
        intent: "schedule_change",
        actions: [],
        reply: "I do not see today's workout yet. Ask for today's workout first, then ask for optional combinations."
      };
    }

    return {
      intent: "schedule_change",
      actions: [],
      reply: buildWorkoutVariationMessage(context.currentWorkout)
    };
  }

  private async applyActions(
    userId: string,
    workoutId: string | null,
    actions: CoachAction[]
  ): Promise<void> {
    for (const action of actions) {
      if (action.type === "log_exercise" && workoutId) {
        await this.workoutEngine.logExercise(userId, workoutId, action.payload);
      } else if (action.type === "log_conditioning") {
        await this.workoutEngine.logConditioning(
          userId,
          workoutId,
          action.payload
        );
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
