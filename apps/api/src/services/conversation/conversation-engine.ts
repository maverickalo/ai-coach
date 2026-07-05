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
  CoachResult,
  CurrentWorkout,
  ParsedExerciseLog,
  ParsedWorkoutLog
} from "../../types/domain.js";
import { dateInTimeZone } from "../../utils/dates.js";
import { COACH_PROMPT_VERSION } from "../coach/coach-prompts.js";
import type { CoachContextBuilder } from "../coach/coach-context-builder.js";
import type { CoachEngine } from "../coach/coach-engine.js";
import type { MemoryEngine } from "../memory/memory-engine.js";
import type { OpenAiClient } from "../openai/openai.client.js";
import type { WorkoutEngine } from "../workout/workout-engine.js";
import {
  buildModifiedStrengthWorkout,
  buildScopedWorkoutModificationMessage,
  buildWorkoutVariationMessage,
  isScopedWorkoutModificationRequest
} from "../workout/workout-variation-library.js";
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

export function isWorkoutStartMessage(body: string): boolean {
  const normalized = body.trim().toLowerCase();
  if (/\b(don'?t|do not|dont|not|no)\s+(start|begin|restart)\b/.test(normalized)) {
    return false;
  }
  if (/\b(send|format|show|give|need)\b.*\b(start|day|morning|complete|full)\b/.test(normalized)) {
    return false;
  }
  return /^(starting now|start workout|start the workout|start today'?s workout|begin workout|begin the workout|let'?s start|lets start|i'?m starting|im starting|i am starting|i'?m beginning|im beginning)\s*[.!?]*$/i.test(
    normalized
  );
}

export function isDailyWorkoutFormatRequest(body: string): boolean {
  const normalized = body.trim().toLowerCase();
  return (
    /\b(send|show|give|format|post)\b.*\b(complete|full|morning|start of (the )?day|daily|fresh for the day|workout)\b/.test(
      normalized
    ) ||
    /\bif you were sending it to me to start the day\b/.test(normalized) ||
    /\bneed you to send me it\b/.test(normalized)
  );
}

export function deriveWorkoutStatusFromParsedWorkout(
  parsedWorkout: ParsedWorkoutLog
): "in_progress" | "completed" | "partially_completed" {
  const hasLoggedWork =
    parsedWorkout.exercises.length > 0 || parsedWorkout.conditioning.length > 0;

  if (parsedWorkout.workoutCompletion === "complete" && hasLoggedWork) {
    return "completed";
  }

  if (
    parsedWorkout.workoutCompletion === "partial" ||
    parsedWorkout.exercises.some(
      (entry) => entry.status === "skipped" || entry.status === "partial"
    )
  ) {
    return "partially_completed";
  }

  return "in_progress";
}

function isStopWorkoutRequest(body: string): boolean {
  return /^\s*(stop|pause|end)\s+(the\s+)?workout\s*[.!?]?\s*$/i.test(body);
}

function isRestartWorkoutRequest(body: string): boolean {
  return /^\s*(restart|resume)\s+(the\s+)?workout\s*[.!?]?\s*$/i.test(body);
}

function isGoBackWorkoutRequest(body: string): boolean {
  return /^\s*(go back|back up|previous exercise|go back one)\s*[.!?]?\s*$/i.test(
    body
  );
}

function isNextExerciseRequest(body: string): boolean {
  return /^\s*(next exercise|move on|next lift|advance|go next)\s*[.!?]?\s*$/i.test(
    body
  );
}

function isWorkoutStatusRequest(body: string): boolean {
  const normalized = body.trim().toLowerCase();
  return (
    /^(status|workout status|where am i|where are we|where are we at|where are we at with things|where are we at\?)\s*[.!?]*$/.test(
      normalized
    ) ||
    /\b(status update|where we'?re at|where i'?m at|what set am i on|what set are we on|what's next|whats next)\b/.test(
      normalized
    )
  );
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

const ordinalSetNumbers: Record<string, number> = {
  first: 1,
  "1st": 1,
  second: 2,
  "2nd": 2,
  third: 3,
  "3rd": 3,
  fourth: 4,
  "4th": 4,
  fifth: 5,
  "5th": 5,
  sixth: 6,
  "6th": 6
};

export function parseSetOnlyLog(
  body: string,
  exerciseName: string | null,
  fallbackSetNumber: number | null = null
): ParsedWorkoutLog | null {
  if (!exerciseName) {
    return null;
  }

  const normalized = body.trim().toLowerCase();
  const setNumberMatch = normalized.match(
    /\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th)\s+set\b|\bset\s*(\d+)(?:\s*(?:of|\/)\s*\d+)?\b(?!\s*x)|\b(\d+)\s*(?:out of|\/)\s*\d+\b/
  );
  const setNumber =
    (setNumberMatch?.[1] ? ordinalSetNumbers[setNumberMatch[1]] : undefined) ??
    (setNumberMatch?.[2] ? Number(setNumberMatch[2]) : undefined) ??
    (setNumberMatch?.[3] ? Number(setNumberMatch[3]) : undefined) ??
    fallbackSetNumber;

  if (!setNumber) {
    return null;
  }

  const performanceMatch = body.match(
    /(\d+(?:\.\d+)?)\s*(?:lb|lbs)?\s*[xX]\s*(\d+)/
  );
  if (!performanceMatch?.[1] || !performanceMatch[2]) {
    return null;
  }

  const rpeMatch = body.match(/rpe\s*(10|[1-9](?:\.\d)?)/i);
  const weight = Number(performanceMatch[1]);
  const reps = Number(performanceMatch[2]);
  const rpe = rpeMatch?.[1] ? Number(rpeMatch[1]) : null;
  const exercise: ParsedExerciseLog = {
    exerciseName,
    status: "completed",
    sets: setNumber,
    reps: String(reps),
    weight,
    rpe,
    setDetails: [
      {
        setNumber,
        reps,
        weight,
        rpe,
        notes: body.trim()
      }
    ],
    difficulty: null,
    skippedReason: null,
    substituteExerciseName: null,
    notes: body.trim()
  };

  return {
    exercises: [exercise],
    conditioning: [],
    pain: [],
    notes: [],
    workoutCompletion: "unknown"
  };
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
      } else if (isStopWorkoutRequest(input.body)) {
        result = await this.handleWorkoutStopped(input.userId, context);
      } else if (isRestartWorkoutRequest(input.body)) {
        result = await this.handleWorkoutRestarted(input.userId, context);
      } else if (isGoBackWorkoutRequest(input.body)) {
        result = await this.handleWorkoutGoBack(input.userId, context);
      } else if (isNextExerciseRequest(input.body)) {
        result = await this.handleNextExercise(input.userId, context);
      } else if (isWorkoutStatusRequest(input.body)) {
        result = await this.handleWorkoutStatusRequest(context);
      } else if (isCurrentExerciseSkipRequest(input.body)) {
        result = await this.handleCurrentExerciseSkipped(input.userId, context);
      } else if (isDailyWorkoutFormatRequest(input.body)) {
        result = this.handleDailyWorkoutFormatRequest(context);
      } else if (isScopedWorkoutModificationRequest(input.body)) {
        result = this.handleScopedWorkoutModification(input.body, context);
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
        const setOnlyLog = await this.parseSetOnlyLogForCurrentWorkout(
          input.body,
          context.currentWorkout
        );
        if (setOnlyLog && context.currentWorkout) {
          const exercise = setOnlyLog.exercises[0];
          if (exercise) {
            await this.workoutEngine.logExercise(
              input.userId,
              context.currentWorkout.id,
              exercise
            );
          }
          await this.workoutEngine.updateWorkoutStatus(
            context.currentWorkout.id,
            "in_progress"
          );
          const loggedText = exercise
            ? `Logged ${exercise.exerciseName} set ${exercise.sets}: ${exercise.weight} x ${exercise.reps}${exercise.rpe ? ` @ RPE ${exercise.rpe}` : ""}.`
            : "Logged that set.";
          result = {
            intent: "log_workout",
            actions: [],
            reply: [
              loggedText,
              await this.workoutEngine.buildWorkoutStatusUpdate(
                context.currentWorkout.id
              )
            ].join("\n\n")
          };
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
          const status = deriveWorkoutStatusFromParsedWorkout(parsedWorkout);
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
        checkInsEnabled: env.WORKOUT_CHECK_INS_ENABLED,
        checkInIntervalMinutes: env.WORKOUT_CHECK_INS_ENABLED
          ? env.WORKOUT_CHECK_IN_INTERVAL_MINUTES
          : null
      }
    });

    const firstMainExercise = context.currentWorkout.exercises.find(
      (item) => item.notes !== "Warm-up"
    );

    return {
      intent: "general_chat",
      actions: [],
      reply: `Good. Start with ${firstMainExercise?.exercise.name ?? "the first main lift"}. Send each lift as you finish it, like \`Bench Press 135 5x8 RPE 8\`, and I’ll log it.`
    };
  }

  private async handleWorkoutStopped(
    userId: string,
    context: Awaited<ReturnType<CoachContextBuilder["build"]>>
  ): Promise<CoachResult> {
    if (!context.currentWorkout) {
      return {
        intent: "schedule_change",
        actions: [],
        reply: "I do not see an active workout to stop."
      };
    }

    await this.workoutEngine.updateWorkoutStatus(
      context.currentWorkout.id,
      "scheduled"
    );
    await this.db.insert(coachEvents).values({
      userId,
      workoutId: context.currentWorkout.id,
      eventType: "WorkoutPaused",
      payload: { source: "conversation" }
    });

    return {
      intent: "schedule_change",
      actions: [],
      reply:
        "Paused the workout and stopped check-ins. Reply `restart workout` when you want me to resume from the next unlogged exercise."
    };
  }

  private async handleWorkoutRestarted(
    userId: string,
    context: Awaited<ReturnType<CoachContextBuilder["build"]>>
  ): Promise<CoachResult> {
    if (!context.currentWorkout) {
      return {
        intent: "schedule_change",
        actions: [],
        reply: "I do not see today's workout yet. Ask me to send it first."
      };
    }

    await this.workoutEngine.updateWorkoutStatus(
      context.currentWorkout.id,
      "in_progress"
    );
    const state = await this.workoutEngine.getWorkoutState(
      context.currentWorkout.id
    );
    await this.db.insert(coachEvents).values({
      userId,
      workoutId: context.currentWorkout.id,
      eventType: "WorkoutRestarted",
      payload: { source: "conversation", nextExercise: state?.nextExercise }
    });

    return {
      intent: "schedule_change",
      actions: [],
      reply: `Restarted. Pick back up with ${state?.nextExercise ?? "the next unlogged exercise"}. Send the lift when you finish it and I’ll log it.`
    };
  }

  private async handleWorkoutGoBack(
    userId: string,
    context: Awaited<ReturnType<CoachContextBuilder["build"]>>
  ): Promise<CoachResult> {
    if (!context.currentWorkout) {
      return {
        intent: "schedule_change",
        actions: [],
        reply: "I do not see today's workout yet."
      };
    }

    const checkedExercise = await this.workoutEngine.getLastCheckInExerciseName(
      context.currentWorkout.id
    );
    await this.db.insert(coachEvents).values({
      userId,
      workoutId: context.currentWorkout.id,
      eventType: "WorkoutWentBack",
      payload: { source: "conversation", exerciseName: checkedExercise }
    });

    return {
      intent: "schedule_change",
      actions: [],
      reply: checkedExercise
        ? `Got it. Go back to ${checkedExercise}. Send the weight, sets, reps, and RPE when you finish it, or say \`skip ${checkedExercise}\`.`
        : "Got it. Which exercise do you want to go back to? Send it like `go back to bench` or log that exercise directly."
    };
  }

  private async parseSetOnlyLogForCurrentWorkout(
    body: string,
    currentWorkout: CurrentWorkout | null
  ): Promise<ParsedWorkoutLog | null> {
    if (!currentWorkout) {
      return null;
    }

    const lastLoggedExercise = await this.workoutEngine.getLastLoggedExerciseName(
      currentWorkout.id
    );
    const state = await this.workoutEngine.getWorkoutState(currentWorkout.id);
    return parseSetOnlyLog(
      body,
      state?.currentExercise ?? lastLoggedExercise ?? null,
      state?.currentSet ?? null
    );
  }

  private async handleNextExercise(
    userId: string,
    context: Awaited<ReturnType<CoachContextBuilder["build"]>>
  ): Promise<CoachResult> {
    if (!context.currentWorkout) {
      return {
        intent: "schedule_change",
        actions: [],
        reply: "I do not see today's workout yet."
      };
    }

    const state = await this.workoutEngine.getWorkoutState(
      context.currentWorkout.id
    );
    if (!state?.currentExercise) {
      return {
        intent: "schedule_change",
        actions: [],
        reply: "I do not see a current exercise to advance from."
      };
    }

    await this.workoutEngine.markExerciseAdvanced(
      userId,
      context.currentWorkout.id,
      state.currentExercise
    );
    const nextState = await this.workoutEngine.getWorkoutState(
      context.currentWorkout.id
    );

    return {
      intent: "schedule_change",
      actions: [],
      reply: nextState?.currentExercise
        ? `Moving on. Next up: ${nextState.currentExercise}. Send the set or lift when you finish it.`
        : "Moving on. I do not see another planned lift after that."
    };
  }

  private async handleWorkoutStatusRequest(
    context: Awaited<ReturnType<CoachContextBuilder["build"]>>
  ): Promise<CoachResult> {
    if (!context.currentWorkout) {
      return {
        intent: "general_chat",
        actions: [],
        reply: "I do not see today's workout yet. Ask me for today's workout first."
      };
    }

    return {
      intent: "general_chat",
      actions: [],
      reply: await this.workoutEngine.buildWorkoutStatusUpdate(
        context.currentWorkout.id
      )
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

    const gifLabel = exercise.exercise.gifLabel ?? "image search";
    const demoLabel = exercise.exercise.demoLabel ?? "video search";

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
        `_Form:_ <${exercise.exercise.gifUrl}|${gifLabel}> | <${exercise.exercise.demoUrl}|${demoLabel}>`,
        exercise.exercise.gifIsExact || exercise.exercise.demoIsExact
          ? null
          : "_Note:_ These are search links, not vetted one-to-one media yet."
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

  private handleDailyWorkoutFormatRequest(
    context: Awaited<ReturnType<CoachContextBuilder["build"]>>
  ): CoachResult {
    if (!context.currentWorkout) {
      return {
        intent: "schedule_change",
        actions: [],
        reply: "I do not see today's workout yet."
      };
    }

    const recentText = context.recentMessages
      .map((message) => message.body)
      .join("\n")
      .toLowerCase();
    const shouldUseModifiedPush =
      /\b(close-grip bench|landmine press|skull crusher|no hyrox|2-hour strength|scoped edit)\b/.test(
        recentText
      );
    const workout = shouldUseModifiedPush
      ? buildModifiedStrengthWorkout(context.currentWorkout)
      : context.currentWorkout;

    return {
      intent: "schedule_change",
      actions: [],
      reply: this.workoutEngine.buildDailyWorkoutMessage(
        context.user.displayName,
        workout
      )
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

  private handleScopedWorkoutModification(
    body: string,
    context: Awaited<ReturnType<CoachContextBuilder["build"]>>
  ): CoachResult {
    if (!context.currentWorkout) {
      return {
        intent: "schedule_change",
        actions: [],
        reply:
          "I do not see today's workout yet. Ask for today's workout first, then tell me which exercise you want to swap."
      };
    }

    return {
      intent: "schedule_change",
      actions: [],
      reply: buildScopedWorkoutModificationMessage(
        body,
        context.currentWorkout
      )
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
