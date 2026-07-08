import { and, asc, desc, eq, gte, ilike, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import {
  coachEvents,
  conditioningLogs,
  exerciseLogs,
  exercises,
  exerciseSets,
  users,
  workoutPlans,
  workouts,
  workoutTemplateExercises,
  workoutTemplates
} from "../../db/schema.js";
import type {
  CurrentWorkout,
  ParsedConditioningLog,
  ParsedExerciseLog,
  RecentWorkoutSummary,
  WorkoutState
} from "../../types/domain.js";
import { dateInTimeZone, dayOfWeekInTimeZone } from "../../utils/dates.js";
import { recommendConditioning } from "./conditioning-engine.js";
import { exerciseResource } from "./exercise-resources.js";

export interface LoggedSetSummary {
  setNumber: number;
  reps: number | null;
  weight: string | null;
  rpe: string | null;
  notes?: string | null;
}

export function formatLoggedWeight(
  weight: string | null | undefined,
  notes?: string | null
): string | null {
  if (!weight) {
    return null;
  }

  const noteText = notes ?? "";
  if (/\b(each|per)\s+side\b|\bon\s+each\s+side\b/i.test(noteText)) {
    return `${weight} lb/side`;
  }

  if (/\b(each|per)\s+arm\b|\bon\s+each\s+arm\b/i.test(noteText)) {
    return `${weight} lb/arm`;
  }

  if (/\b(each|per)\s+hand\b|\bin\s+each\s+hand\b|\bdbs?\b|\bdumbbells?\b/i.test(noteText)) {
    return `${weight} lb/hand`;
  }

  return `${weight} lb`;
}

export function buildNextSetRecommendation(input: {
  exerciseName: string;
  prescribedSets: number | null;
  currentSet: number | null;
  loggedSets: LoggedSetSummary[];
}): string {
  const lastSet = input.loggedSets.at(-1);
  if (!lastSet) {
    return `Start ${input.exerciseName} controlled. Use the first work set to find a clean RPE 6-7 before deciding whether to add weight.`;
  }

  const rpe = lastSet.rpe ? Number(lastSet.rpe) : null;
  const weight = lastSet.weight ? Number(lastSet.weight) : null;
  const nextSetText = input.currentSet
    ? `set ${input.currentSet}${input.prescribedSets ? ` of ${input.prescribedSets}` : ""}`
    : "the next set";

  if (rpe !== null && rpe <= 6 && weight !== null) {
    return `For ${nextSetText}, add a small jump if bar speed/form stayed clean. Try ${formatLoggedWeight(String(weight + 5), lastSet.notes) ?? `${weight + 5} lb`}, then reassess RPE.`;
  }

  if (rpe !== null && rpe <= 7 && weight !== null) {
    return `For ${nextSetText}, you can either stay at ${formatLoggedWeight(lastSet.weight, lastSet.notes) ?? `${weight} lb`} or make a small +5 lb jump if the last set moved cleanly. Keep the next set around RPE 7-8.`;
  }

  if (rpe !== null && rpe <= 8 && weight !== null) {
    return `For ${nextSetText}, stay at ${formatLoggedWeight(lastSet.weight, lastSet.notes) ?? `${weight} lb`}. RPE 8 is productive, so the goal is matching reps without form slipping.`;
  }

  if (rpe !== null && rpe >= 9 && weight !== null) {
    const reduced = Math.max(0, Math.min(weight - 5, Math.floor((weight * 0.9) / 5) * 5));
    return `For ${nextSetText}, take weight off. Try around ${formatLoggedWeight(String(reduced), lastSet.notes) ?? `${reduced} lb`} and rest longer; RPE 9+ is too hot to keep forcing across the remaining sets.`;
  }

  return `For ${nextSetText}, repeat the last weight if form felt clean. If the set felt grindy, reduce slightly and protect reps.`;
}

export function buildFirstSetTarget(
  item: CurrentWorkout["exercises"][number] | undefined
): string {
  if (!item) {
    return "Target: start with a conservative weight you can move cleanly at RPE 6-7, then adjust from there.";
  }

  const reps = item.prescribedReps ? `${item.prescribedReps} reps` : "the prescribed reps";
  if (item.prescribedWeight) {
    return `Target: start at ${item.prescribedWeight} for ${reps}. Keep set 1 around RPE 6-7 so there is room to build.`;
  }

  const last = item.lastPerformance;
  if (last?.weight) {
    return `Target: last time was ${last.weight} lb for ${last.sets ?? "?"}x${last.reps ?? "?"}${last.rpe ? ` at RPE ${last.rpe}` : ""}. Start near that if warm-ups feel good, or 5-10 lb lighter if it feels sticky.`;
  }

  return `Target: no prior weight is logged yet. Choose a weight you can hit for ${reps} at RPE 6-7, then send the set and I’ll adjust the rest.`;
}

export function buildStatusPlanLine(
  item: CurrentWorkout["exercises"][number] | undefined
): string {
  if (!item) {
    return "Plan: follow the prescribed sets and reps.";
  }

  const volume =
    item.prescribedSets || item.prescribedReps
      ? `${item.prescribedSets ?? "?"}x${item.prescribedReps ?? "?"}`
      : "as prescribed";
  const rest = /bench|press|squat|deadlift|row/i.test(item.exercise.name)
    ? "Rest 2-3 min on hard sets."
    : "Rest 60-90 sec.";
  const cues = item.exercise.cues?.slice(0, 2).join(" • ");

  return [
    `Plan: ${volume}`,
    item.prescribedWeight ? `Load: ${item.prescribedWeight}` : null,
    `RPE: start 6-7, finish around 8 if form holds.`,
    rest,
    cues ? `Cue: ${cues}` : null
  ]
    .filter(Boolean)
    .join(" | ");
}

const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function detectTrainingFocus(body: string): string | null {
  const normalized = body.toLowerCase();
  if (/\b(legs?|lower|squat|hinge|deadlift)\b/.test(normalized)) {
    return "lower";
  }
  if (/\b(push|chest|shoulders?|triceps?)\b/.test(normalized)) {
    return "push";
  }
  if (/\b(pull|back|biceps?|rows?)\b/.test(normalized)) {
    return "pull";
  }
  if (/\b(upper)\b/.test(normalized)) {
    return "upper";
  }
  if (/\b(full body|full-body)\b/.test(normalized)) {
    return "full";
  }
  if (/\b(recovery|mobility|walk|easy)\b/.test(normalized)) {
    return "recovery";
  }
  if (/\b(cardio|hyrox|run|row|bike|conditioning)\b/.test(normalized)) {
    return "conditioning";
  }
  return null;
}

function detectMissedTrainingFocus(body: string): string | null {
  const missedMatch = body.match(
    /\b(?:missed|skipped|forgot|didn't do|did not do)\b([^.!?]*)/i
  );
  return detectTrainingFocus(missedMatch?.[1] ?? body);
}

function detectAvailableTrainingFocus(body: string): string | null {
  const insteadMatch = body.match(
    /\b(?:can|could|should)?\s*i?\s*(?:do|train|work on)\s+([^.!?]*?)(?:\s+instead|\s+today|\s+this week|$)/i
  );
  const optionMatch = body.match(/\bC\s+([^.!?]*)/i);
  return detectTrainingFocus(optionMatch?.[1] ?? insteadMatch?.[1] ?? "");
}

function detectReworkOption(body: string): "A" | "B" | "C" | "D" | null {
  const match = body.trim().match(/^(?:option\s*)?([ABCD])\b/i);
  return match?.[1] ? (match[1].toUpperCase() as "A" | "B" | "C" | "D") : null;
}

function templateMatchesFocus(
  template: { name: string; focus: string | null },
  focus: string | null
): boolean {
  if (!focus) {
    return false;
  }
  const text = `${template.name} ${template.focus ?? ""}`.toLowerCase();
  if (focus === "lower") {
    return /\b(lower|legs?|squat|deadlift)\b/.test(text);
  }
  if (focus === "push") {
    return /\b(push|chest|shoulder|triceps?)\b/.test(text);
  }
  if (focus === "pull") {
    return /\b(pull|back|biceps?|posterior)\b/.test(text);
  }
  if (focus === "upper") {
    return /\bupper\b/.test(text);
  }
  if (focus === "full") {
    return /\b(full)\b/.test(text);
  }
  if (focus === "recovery") {
    return /\b(recovery)\b/.test(text);
  }
  return false;
}

export class WorkoutEngine {
  constructor(private readonly db: Database) {}

  static formatWorkoutCompletionSummary(input: {
    workoutName: string;
    completed: Array<{
      exerciseName: string;
      sets: number | null;
      reps: string | null;
      weight: string | null;
      rpe: string | null;
    }>;
    skipped: Array<{
      exerciseName: string;
      skippedReason: string | null;
    }>;
    painNotes: Array<{
      exerciseName: string;
      note: string;
    }>;
    nextTime: string[];
  }): string {
    const formatCompleted = (log: (typeof input.completed)[number]) => {
      const volume = log.sets || log.reps ? `${log.sets ?? "?"}x${log.reps ?? "?"}` : "logged";
      const load = log.weight ? ` @ ${log.weight} lb` : "";
      const rpe = log.rpe ? `, RPE ${log.rpe}` : "";
      return `• ${log.exerciseName}: ${volume}${load}${rpe}`;
    };

    return [
      "✅ *Workout Complete*",
      `*${input.workoutName}*`,
      input.completed.length > 0
        ? ["*Completed*", ...input.completed.map(formatCompleted)].join("\n")
        : "*Completed*\n• Nothing logged yet",
      input.skipped.length > 0
        ? [
            "*Skipped*",
            ...input.skipped.map(
              (log) =>
                `• ${log.exerciseName}${log.skippedReason ? ` — ${log.skippedReason}` : " — reason not logged"}`
            )
          ].join("\n")
        : null,
      input.painNotes.length > 0
        ? ["*Pain / notes*", ...input.painNotes.map((log) => `• ${log.exerciseName}: ${log.note}`)].join("\n")
        : null,
      input.nextTime.length > 0 ? ["*Next time*", ...input.nextTime].join("\n") : null
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async getOrCreateWorkoutForDate(
    userId: string,
    timezone: string,
    now = new Date()
  ): Promise<CurrentWorkout> {
    const scheduledDate = dateInTimeZone(now, timezone);
    const existing = await this.getWorkoutByDate(userId, scheduledDate);
    if (existing) {
      return existing;
    }

    const dayOfWeek = dayOfWeekInTimeZone(now, timezone);
    const [template] = await this.db
      .select({
        id: workoutTemplates.id
      })
      .from(workoutTemplates)
      .innerJoin(workoutPlans, eq(workoutTemplates.planId, workoutPlans.id))
      .where(
        and(
          eq(workoutPlans.userId, userId),
          eq(workoutPlans.active, true),
          eq(workoutTemplates.dayOfWeek, dayOfWeek)
        )
      )
      .limit(1);

    if (!template) {
      throw new Error(`No active workout template for day ${dayOfWeek}`);
    }

    const [created] = await this.db
      .insert(workouts)
      .values({
        userId,
        templateId: template.id,
        scheduledDate,
        status: "scheduled"
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create scheduled workout");
    }

    await this.db.insert(coachEvents).values({
      userId,
      workoutId: created.id,
      eventType: "WorkoutAssigned",
      payload: { scheduledDate, templateId: template.id }
    });

    const workout = await this.getWorkoutByDate(userId, scheduledDate);
    if (!workout) {
      throw new Error("Created workout could not be loaded");
    }
    return workout;
  }

  async getWorkoutByDate(
    userId: string,
    scheduledDate: string
  ): Promise<CurrentWorkout | null> {
    const [row] = await this.db
      .select({
        id: workouts.id,
        name: workoutTemplates.name,
        focus: workoutTemplates.focus,
        estimatedMinutes: workoutTemplates.estimatedMinutes,
        scheduledDate: workouts.scheduledDate,
        status: workouts.status,
        templateId: workouts.templateId
      })
      .from(workouts)
      .leftJoin(workoutTemplates, eq(workouts.templateId, workoutTemplates.id))
      .where(
        and(
          eq(workouts.userId, userId),
          eq(workouts.scheduledDate, scheduledDate)
        )
      )
      .limit(1);

    if (!row || !row.templateId) {
      return null;
    }

    const prescribed = await this.db
      .select({
        templateExerciseId: workoutTemplateExercises.id,
        sortOrder: workoutTemplateExercises.sortOrder,
        prescribedSets: workoutTemplateExercises.prescribedSets,
        prescribedReps: workoutTemplateExercises.prescribedReps,
        prescribedWeight: workoutTemplateExercises.prescribedWeight,
        notes: workoutTemplateExercises.notes,
        exerciseId: exercises.id,
        exerciseName: exercises.name,
        category: exercises.category,
        primaryMuscles: exercises.primaryMuscles,
        equipment: exercises.equipment,
        instructions: exercises.instructions,
        commonSubstitutions: exercises.commonSubstitutions
      })
      .from(workoutTemplateExercises)
      .innerJoin(
        exercises,
        eq(workoutTemplateExercises.exerciseId, exercises.id)
      )
      .where(eq(workoutTemplateExercises.templateId, row.templateId))
      .orderBy(asc(workoutTemplateExercises.sortOrder));

    const items = await Promise.all(
      prescribed.map(async (item) => ({
        templateExerciseId: item.templateExerciseId,
        sortOrder: item.sortOrder,
        prescribedSets: item.prescribedSets,
        prescribedReps: item.prescribedReps,
        prescribedWeight: item.prescribedWeight,
        notes: item.notes,
        lastPerformance: await this.getLastExercisePerformance(
          userId,
          item.exerciseName,
          row.id
        ),
        exercise: {
          id: item.exerciseId,
          name: item.exerciseName,
          category: item.category,
          primaryMuscles: item.primaryMuscles,
          equipment: item.equipment,
          instructions: item.instructions,
          commonSubstitutions: item.commonSubstitutions,
          ...exerciseResource(item.exerciseName)
        }
      }))
    );
    const recentTraining = await this.getRecentTrainingSignals(userId, 7);

    return {
      id: row.id,
      name: row.name ?? "Workout",
      focus: row.focus,
      estimatedMinutes: row.estimatedMinutes,
      scheduledDate: row.scheduledDate,
      status: row.status,
      exercises: items,
      conditioning: recommendConditioning(recentTraining)
    };
  }

  async getRecentWorkouts(
    userId: string,
    limit = 6
  ): Promise<RecentWorkoutSummary[]> {
    const rows = await this.db
      .select({
        name: workoutTemplates.name,
        scheduledDate: workouts.scheduledDate,
        status: workouts.status,
        coachSummary: workouts.coachSummary
      })
      .from(workouts)
      .leftJoin(workoutTemplates, eq(workouts.templateId, workoutTemplates.id))
      .where(eq(workouts.userId, userId))
      .orderBy(desc(workouts.scheduledDate))
      .limit(limit);

    return rows.map((row) => ({
      name: row.name ?? "Workout",
      scheduledDate: row.scheduledDate,
      status: row.status,
      coachSummary: row.coachSummary
    }));
  }

  async logExercise(
    userId: string,
    workoutId: string,
    input: ParsedExerciseLog
  ): Promise<void> {
    const [exercise] = await this.db
      .select()
      .from(exercises)
      .where(ilike(exercises.name, input.exerciseName))
      .limit(1);

    if (!exercise) {
      throw new Error(`Unknown exercise: ${input.exerciseName}`);
    }

    const [log] = await this.db
      .insert(exerciseLogs)
      .values({
        workoutId,
        exerciseId: exercise.id,
        status: input.status,
        setsCompleted: input.sets,
        repsCompleted: input.reps,
        weight: input.weight?.toString() ?? null,
        rpe: input.rpe?.toString() ?? null,
        skippedReason: input.skippedReason,
        notes: input.notes
      })
      .onConflictDoUpdate({
        target: [exerciseLogs.workoutId, exerciseLogs.exerciseId],
        set: {
          status: input.status,
          setsCompleted: input.sets,
          repsCompleted: input.reps,
          weight: input.weight?.toString() ?? null,
          rpe: input.rpe?.toString() ?? null,
          skippedReason: input.skippedReason,
          notes: input.notes,
          updatedAt: new Date()
        }
      })
      .returning();

    if (!log) {
      throw new Error(`Failed to log ${input.exerciseName}`);
    }

    if (input.setDetails && input.setDetails.length > 0) {
      for (const set of input.setDetails) {
        await this.db
          .insert(exerciseSets)
          .values({
            exerciseLogId: log.id,
            setNumber: set.setNumber,
            reps: set.reps,
            weight: set.weight?.toString() ?? null,
            rpe: set.rpe?.toString() ?? input.rpe?.toString() ?? null,
            notes: set.notes
          })
          .onConflictDoUpdate({
            target: [exerciseSets.exerciseLogId, exerciseSets.setNumber],
            set: {
              reps: set.reps,
              weight: set.weight?.toString() ?? null,
              rpe: set.rpe?.toString() ?? input.rpe?.toString() ?? null,
              notes: set.notes
            }
          });
      }
    } else {
      const numericReps =
        input.reps && /^\d+$/.test(input.reps) ? Number(input.reps) : null;
      if (input.sets && numericReps !== null) {
      for (let setNumber = 1; setNumber <= input.sets; setNumber += 1) {
        await this.db
          .insert(exerciseSets)
          .values({
            exerciseLogId: log.id,
            setNumber,
            reps: numericReps,
            weight: input.weight?.toString() ?? null,
            rpe: input.rpe?.toString() ?? null
          })
          .onConflictDoUpdate({
            target: [exerciseSets.exerciseLogId, exerciseSets.setNumber],
            set: {
              reps: numericReps,
              weight: input.weight?.toString() ?? null,
              rpe: input.rpe?.toString() ?? null
            }
          });
      }
      }
    }

    await this.db.insert(coachEvents).values({
      userId,
      workoutId,
      eventType:
        input.status === "skipped" ? "ExerciseSkipped" : "ExerciseLogged",
      payload: { ...input }
    });
  }

  async logSameAsLastSet(
    userId: string,
    workoutId: string,
    notes: string
  ): Promise<LoggedSetSummary & { exerciseName: string } | null> {
    const state = await this.getWorkoutState(workoutId);
    if (!state?.currentExercise) {
      return null;
    }

    const [log] = await this.db
      .select({
        id: exerciseLogs.id,
        exerciseId: exerciseLogs.exerciseId,
        exerciseName: exercises.name
      })
      .from(exerciseLogs)
      .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
      .where(
        and(
          eq(exerciseLogs.workoutId, workoutId),
          ilike(exercises.name, state.currentExercise)
        )
      )
      .limit(1);

    if (!log) {
      return null;
    }

    const [lastSet] = await this.db
      .select({
        setNumber: exerciseSets.setNumber,
        reps: exerciseSets.reps,
        weight: exerciseSets.weight,
        rpe: exerciseSets.rpe,
        notes: exerciseSets.notes
      })
      .from(exerciseSets)
      .where(eq(exerciseSets.exerciseLogId, log.id))
      .orderBy(desc(exerciseSets.setNumber))
      .limit(1);

    if (!lastSet) {
      return null;
    }

    const setNumber = state.currentSet ?? lastSet.setNumber + 1;
    const clonedNotes = lastSet.notes
      ? `${notes}; same as set ${lastSet.setNumber}: ${lastSet.notes}`
      : notes;
    await this.db
      .insert(exerciseSets)
      .values({
        exerciseLogId: log.id,
        setNumber,
        reps: lastSet.reps,
        weight: lastSet.weight,
        rpe: lastSet.rpe,
        notes: clonedNotes
      })
      .onConflictDoUpdate({
        target: [exerciseSets.exerciseLogId, exerciseSets.setNumber],
        set: {
          reps: lastSet.reps,
          weight: lastSet.weight,
          rpe: lastSet.rpe,
          notes: clonedNotes
        }
      });

    await this.db
      .update(exerciseLogs)
      .set({
        status: "completed",
        setsCompleted: setNumber,
        repsCompleted: lastSet.reps?.toString() ?? null,
        weight: lastSet.weight,
        rpe: lastSet.rpe,
        notes: clonedNotes,
        updatedAt: new Date()
      })
      .where(eq(exerciseLogs.id, log.id));

    await this.db.insert(coachEvents).values({
      userId,
      workoutId,
      eventType: "ExerciseLogged",
      payload: {
        exerciseName: log.exerciseName,
        setNumber,
        reps: lastSet.reps,
        weight: lastSet.weight,
        rpe: lastSet.rpe,
        notes: clonedNotes,
        source: "same_as_last"
      }
    });

    return {
      exerciseName: log.exerciseName,
      setNumber,
      reps: lastSet.reps,
      weight: lastSet.weight,
      rpe: lastSet.rpe,
      notes: clonedNotes
    };
  }

  async logConditioning(
    userId: string,
    workoutId: string | null,
    input: ParsedConditioningLog
  ): Promise<void> {
    await this.db.insert(conditioningLogs).values({
      userId,
      workoutId,
      modality: input.modality,
      distanceMeters: input.distanceMeters?.toString() ?? null,
      durationSeconds: input.durationSeconds,
      calories: input.calories,
      intensity: input.intensity,
      rpe: input.rpe?.toString() ?? null,
      notes: input.notes
    });

    await this.db.insert(coachEvents).values({
      userId,
      workoutId,
      eventType: "ConditioningLogged",
      payload: { ...input }
    });
  }

  async closeWorkoutForToday(
    userId: string,
    workoutId: string,
    skippedReason: string
  ): Promise<void> {
    const workout = await this.getWorkoutById(workoutId);
    if (!workout) {
      throw new Error(`Workout not found: ${workoutId}`);
    }

    const existingLogs = await this.db
      .select({ exerciseId: exerciseLogs.exerciseId })
      .from(exerciseLogs)
      .where(eq(exerciseLogs.workoutId, workoutId));
    const loggedExerciseIds = new Set(existingLogs.map((log) => log.exerciseId));
    const unloggedMainExercises = workout.exercises.filter(
      (item) => item.notes !== "Warm-up" && !loggedExerciseIds.has(item.exercise.id)
    );

    for (const item of unloggedMainExercises) {
      await this.db
        .insert(exerciseLogs)
        .values({
          workoutId,
          exerciseId: item.exercise.id,
          status: "skipped",
          skippedReason,
          notes: skippedReason
        })
        .onConflictDoNothing();

      await this.db.insert(coachEvents).values({
        userId,
        workoutId,
        eventType: "ExerciseSkipped",
        payload: {
          exerciseName: item.exercise.name,
          skippedReason,
          source: "done_for_today"
        }
      });
    }

    await this.updateWorkoutStatus(
      workoutId,
      unloggedMainExercises.length > 0 ? "partially_completed" : "completed"
    );
  }

  async updateWorkoutStatus(
    workoutId: string,
    status:
      | "scheduled"
      | "in_progress"
      | "completed"
      | "partially_completed"
      | "skipped"
  ): Promise<void> {
    await this.db
      .update(workouts)
      .set({
        status,
        startedAt: status === "in_progress" ? new Date() : undefined,
        completedAt:
          status === "completed" || status === "partially_completed"
            ? new Date()
            : undefined,
        updatedAt: new Date()
      })
      .where(eq(workouts.id, workoutId));
  }

  async getWorkoutById(workoutId: string): Promise<CurrentWorkout | null> {
    const [workout] = await this.db
      .select({ userId: workouts.userId, scheduledDate: workouts.scheduledDate })
      .from(workouts)
      .where(eq(workouts.id, workoutId))
      .limit(1);

    if (!workout) {
      return null;
    }

    return this.getWorkoutByDate(workout.userId, workout.scheduledDate);
  }

  async getLoggedExerciseNames(workoutId: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: exercises.name })
      .from(exerciseLogs)
      .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
      .where(eq(exerciseLogs.workoutId, workoutId));

    return rows.map((row) => row.name);
  }

  async getLastLoggedExerciseName(workoutId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ name: exercises.name })
      .from(exerciseLogs)
      .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
      .where(eq(exerciseLogs.workoutId, workoutId))
      .orderBy(desc(exerciseLogs.updatedAt))
      .limit(1);

    return row?.name ?? null;
  }

  async markExerciseAdvanced(
    userId: string,
    workoutId: string,
    exerciseName: string
  ): Promise<void> {
    await this.db.insert(coachEvents).values({
      userId,
      workoutId,
      eventType: "ExerciseAdvanced",
      payload: { exerciseName }
    });
  }

  private async getAdvancedExerciseNames(workoutId: string): Promise<string[]> {
    const rows = await this.db
      .select({ payload: coachEvents.payload })
      .from(coachEvents)
      .where(
        and(
          eq(coachEvents.workoutId, workoutId),
          eq(coachEvents.eventType, "ExerciseAdvanced")
        )
      );

    return rows
      .map((row) => row.payload.exerciseName)
      .filter((name): name is string => typeof name === "string");
  }

  async getLastCheckInExerciseName(workoutId: string): Promise<string | null> {
    const [event] = await this.db
      .select({ payload: coachEvents.payload })
      .from(coachEvents)
      .where(
        and(
          eq(coachEvents.workoutId, workoutId),
          eq(coachEvents.eventType, "WorkoutCheckInSent")
        )
      )
      .orderBy(desc(coachEvents.createdAt))
      .limit(1);

    const exerciseName = event?.payload.exerciseName;
    return typeof exerciseName === "string" ? exerciseName : null;
  }

  async getWorkoutState(workoutId: string): Promise<WorkoutState | null> {
    const workout = await this.getWorkoutById(workoutId);
    if (!workout) {
      return null;
    }

    const logRows = await this.db
      .select({
        exerciseName: exercises.name,
        status: exerciseLogs.status,
        setsCompleted: exerciseLogs.setsCompleted
      })
      .from(exerciseLogs)
      .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
      .where(eq(exerciseLogs.workoutId, workoutId));

    const mainExercises = workout.exercises.filter((item) => item.notes !== "Warm-up");
    const prescribedByName = new Map(
      mainExercises.map((item) => [
        item.exercise.name.toLowerCase(),
        item.prescribedSets
      ])
    );
    const advancedNames = new Set(
      (await this.getAdvancedExerciseNames(workoutId)).map((name) =>
        name.toLowerCase()
      )
    );
    const isFulfilled = (log: (typeof logRows)[number]) => {
      if (log.status === "skipped") {
        return true;
      }
      if (advancedNames.has(log.exerciseName.toLowerCase())) {
        return true;
      }
      const prescribedSets = prescribedByName.get(log.exerciseName.toLowerCase());
      if (!prescribedSets) {
        return log.status === "completed" || log.status === "partial";
      }
      return (log.setsCompleted ?? 0) >= prescribedSets;
    };
    const completedExercises = logRows
      .filter((log) => log.status !== "skipped" && isFulfilled(log))
      .map((log) => log.exerciseName);
    const skippedExercises = logRows
      .filter((log) => log.status === "skipped")
      .map((log) => log.exerciseName);
    const fulfilledNames = new Set(
      logRows
        .filter(isFulfilled)
        .map((log) => log.exerciseName.toLowerCase())
    );
    const next = mainExercises.find(
      (item) => !fulfilledNames.has(item.exercise.name.toLowerCase())
    );
    const currentExercise = next?.exercise.name ?? null;
    const currentLog = logRows.find(
      (log) => log.exerciseName.toLowerCase() === currentExercise?.toLowerCase()
    );

    const optionalWorkRows = await this.db
      .select({
        modality: conditioningLogs.modality,
        distanceMeters: conditioningLogs.distanceMeters,
        durationSeconds: conditioningLogs.durationSeconds,
        calories: conditioningLogs.calories
      })
      .from(conditioningLogs)
      .where(eq(conditioningLogs.workoutId, workoutId));

    return {
      workoutId,
      workoutName: workout.name,
      currentExercise,
      currentSet: currentLog?.setsCompleted ? currentLog.setsCompleted + 1 : 1,
      completedExercises,
      skippedExercises,
      optionalWork: optionalWorkRows.map((row) =>
        [
          row.modality.replaceAll("_", " "),
          row.distanceMeters ? `${row.distanceMeters}m` : null,
          row.durationSeconds ? `${Math.round(row.durationSeconds / 60)} min` : null,
          row.calories ? `${row.calories} cal` : null
        ]
          .filter(Boolean)
          .join(" ")
      ),
      nextExercise: next?.exercise.name ?? null
    };
  }

  async buildWorkoutStatusUpdate(workoutId: string): Promise<string> {
    const workout = await this.getWorkoutById(workoutId);
    const state = await this.getWorkoutState(workoutId);
    if (!workout || !state) {
      return "I couldn't reload the current workout state. Send the last exercise you logged and I’ll pick it back up.";
    }

    if (!state.currentExercise) {
      return `✅ *Status — ${state.workoutName}*\nAll planned lifts look complete or advanced. Say \`done\` when you want the workout summary.`;
    }

    const prescribed = workout.exercises.find(
      (item) => item.exercise.name === state.currentExercise
    );
    const [log] = await this.db
      .select({
        id: exerciseLogs.id,
        setsCompleted: exerciseLogs.setsCompleted,
        repsCompleted: exerciseLogs.repsCompleted,
        weight: exerciseLogs.weight,
        rpe: exerciseLogs.rpe,
        notes: exerciseLogs.notes
      })
      .from(exerciseLogs)
      .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
      .where(
        and(
          eq(exerciseLogs.workoutId, workoutId),
          ilike(exercises.name, state.currentExercise)
        )
      )
      .limit(1);

    const setRows = log
        ? await this.db
          .select({
            setNumber: exerciseSets.setNumber,
            reps: exerciseSets.reps,
            weight: exerciseSets.weight,
            rpe: exerciseSets.rpe,
            notes: exerciseSets.notes
          })
          .from(exerciseSets)
          .where(eq(exerciseSets.exerciseLogId, log.id))
          .orderBy(asc(exerciseSets.setNumber))
      : [];
    const loggedSets: LoggedSetSummary[] =
      setRows.length > 0
        ? setRows.map((set) => ({
            setNumber: set.setNumber,
            reps: set.reps,
            weight: set.weight,
            rpe: set.rpe,
            notes: set.notes
          }))
        : log?.weight || log?.repsCompleted || log?.rpe
          ? [
              {
                setNumber: log.setsCompleted ?? 1,
                reps:
                  log.repsCompleted && /^\d+$/.test(log.repsCompleted)
                    ? Number(log.repsCompleted)
                    : null,
                weight: log.weight,
                rpe: log.rpe,
                notes: log.notes
              }
            ]
          : [];
    const currentSet =
      state.currentSet ??
      (loggedSets.at(-1)?.setNumber ? loggedSets.at(-1)!.setNumber + 1 : 1);
    const prescribedSets = prescribed?.prescribedSets ?? null;
    const setLine =
      prescribedSets && loggedSets.length > 0
        ? `Set ${currentSet} of ${prescribedSets} is next.`
        : prescribedSets
          ? `Set ${currentSet} of ${prescribedSets} is next.`
          : `You are on set ${currentSet}.`;
    const loggedLine =
      loggedSets.length > 0
        ? loggedSets
            .map((set) =>
              [
                `S${set.setNumber}`,
                formatLoggedWeight(set.weight, set.notes),
                set.reps ? `x${set.reps}` : null,
                set.rpe ? `RPE ${set.rpe}` : null
              ]
                .filter(Boolean)
                .join(" ")
            )
            .join(" • ")
        : "No working sets logged yet.";
    const recommendation = buildNextSetRecommendation({
      exerciseName: state.currentExercise,
      prescribedSets,
      currentSet,
      loggedSets
    });
    const planLine = buildStatusPlanLine(prescribed);
    const targetLine =
      loggedSets.length === 0 ? buildFirstSetTarget(prescribed) : null;
    const progressLine = `Progress: ${state.completedExercises.length} complete, ${state.skippedExercises.length} skipped.`;

    return [
      `📍 *Status — ${state.workoutName}*`,
      `Current: *${state.currentExercise}*`,
      setLine,
      planLine,
      targetLine,
      `Logged: ${loggedLine}`,
      `Next: ${recommendation}`,
      progressLine
    ].join("\n");
  }

  async buildFullWorkoutStatusUpdate(workoutId: string): Promise<string> {
    const workout = await this.getWorkoutById(workoutId);
    const state = await this.getWorkoutState(workoutId);
    if (!workout || !state) {
      return "I couldn't reload the current workout state. Send `status` and I’ll try to pick it back up.";
    }

    const logRows = await this.db
      .select({
        exerciseName: exercises.name,
        status: exerciseLogs.status,
        setsCompleted: exerciseLogs.setsCompleted,
        repsCompleted: exerciseLogs.repsCompleted,
        weight: exerciseLogs.weight,
        rpe: exerciseLogs.rpe,
        notes: exerciseLogs.notes
      })
      .from(exerciseLogs)
      .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
      .where(eq(exerciseLogs.workoutId, workoutId));
    const logsByName = new Map(
      logRows.map((log) => [log.exerciseName.toLowerCase(), log])
    );

    const mainExercises = workout.exercises.filter((item) => item.notes !== "Warm-up");
    const checklist = mainExercises.map((item) => {
      const log = logsByName.get(item.exercise.name.toLowerCase());
      const isSkipped = log?.status === "skipped";
      const isComplete = state.completedExercises.some(
        (name) => name.toLowerCase() === item.exercise.name.toLowerCase()
      );
      const isCurrent = state.currentExercise === item.exercise.name;
      const mark = isSkipped ? "[skip]" : isComplete ? "[x]" : isCurrent ? "[>]" : "[ ]";
      const prescription =
        item.prescribedSets || item.prescribedReps
          ? `${item.prescribedSets ?? "?"}x${item.prescribedReps ?? "?"}`
          : "as prescribed";
      const logged =
        log && log.status !== "skipped"
          ? [
              log.setsCompleted ? `${log.setsCompleted}/${item.prescribedSets ?? "?"} sets` : null,
              formatLoggedWeight(log.weight, log.notes),
              log.repsCompleted ? `x${log.repsCompleted}` : null,
              log.rpe ? `RPE ${log.rpe}` : null
            ]
              .filter(Boolean)
              .join(", ")
          : null;
      const suffix = isCurrent
        ? ` — current, set ${state.currentSet ?? 1}${item.prescribedSets ? ` of ${item.prescribedSets}` : ""}`
        : logged
          ? ` — ${logged}`
          : isSkipped
            ? " — skipped"
            : "";

      return `${mark} *${item.exercise.name}* — ${prescription}${suffix}`;
    });

    const current = state.currentExercise
      ? `Current: *${state.currentExercise}*, set ${state.currentSet ?? 1}`
      : "Current: all planned lifts complete or advanced.";

    return [
      `📋 *Workout Status — ${state.workoutName}*`,
      current,
      "",
      ...checklist,
      "",
      "Legend: [x] complete • [>] current • [ ] upcoming • [skip] skipped",
      "Use `status` for just the current set guidance."
    ].join("\n");
  }

  async buildWorkoutCompletionSummary(workoutId: string): Promise<string> {
    const workout = await this.getWorkoutById(workoutId);
    if (!workout) {
      return "✅ *Workout Complete*\nI couldn't reload the workout details, but I marked the session complete.";
    }

    const logs = await this.db
      .select({
        exerciseLogId: exerciseLogs.id,
        exerciseId: exerciseLogs.exerciseId,
        exerciseName: exercises.name,
        status: exerciseLogs.status,
        sets: exerciseLogs.setsCompleted,
        reps: exerciseLogs.repsCompleted,
        weight: exerciseLogs.weight,
        rpe: exerciseLogs.rpe,
        painScore: exerciseLogs.painScore,
        skippedReason: exerciseLogs.skippedReason,
        notes: exerciseLogs.notes
      })
      .from(exerciseLogs)
      .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
      .where(eq(exerciseLogs.workoutId, workoutId))
      .orderBy(asc(exerciseLogs.createdAt));

    const setRows =
      logs.length > 0
        ? await this.db
            .select({
              exerciseLogId: exerciseSets.exerciseLogId,
              setNumber: exerciseSets.setNumber,
              reps: exerciseSets.reps,
              weight: exerciseSets.weight,
              rpe: exerciseSets.rpe,
              notes: exerciseSets.notes
            })
            .from(exerciseSets)
            .where(inArray(exerciseSets.exerciseLogId, logs.map((log) => log.exerciseLogId)))
            .orderBy(asc(exerciseSets.setNumber))
        : [];
    const setsByLogId = new Map<string, typeof setRows>();
    for (const set of setRows) {
      const existing = setsByLogId.get(set.exerciseLogId) ?? [];
      existing.push(set);
      setsByLogId.set(set.exerciseLogId, existing);
    }
    const exerciseOrder = new Map(
      workout.exercises.map((item, index) => [item.exercise.id, index])
    );
    const orderedLogs = logs.toSorted(
      (a, b) =>
        (exerciseOrder.get(a.exerciseId) ?? 999) -
        (exerciseOrder.get(b.exerciseId) ?? 999)
    );
    const skipped = orderedLogs.filter((log) => log.status === "skipped");
    const painNotes = logs.filter(
      (log) =>
        log.painScore !== null ||
        /(hurt|pain|sore|ache|tweak|injur)/i.test(log.notes ?? "")
    );

    const formatSetLine = (log: (typeof logs)[number]) => {
      const sets = setsByLogId.get(log.exerciseLogId) ?? [];
      if (sets.length === 0) {
        return `• *${log.exerciseName}*: ${log.sets ?? "?"} sets, ${formatLoggedWeight(log.weight, log.notes) ?? "load not logged"} x${log.reps ?? "?"}${log.rpe ? `, RPE ${log.rpe}` : ""}`;
      }

      const setText = sets
        .map((set) =>
          [
            `S${set.setNumber}`,
            formatLoggedWeight(set.weight, set.notes),
            set.reps ? `x${set.reps}` : null,
            set.rpe ? `RPE ${set.rpe}` : null
          ]
            .filter(Boolean)
            .join(" ")
        )
        .join(" • ");
      return `• *${log.exerciseName}*: ${setText}`;
    };

    const nextTime = orderedLogs.map((log) => {
      if (log.status === "skipped") {
        return `• *${log.exerciseName}*: no progression next week. ${log.skippedReason ? `Skipped because ${log.skippedReason}.` : "Ask why it was skipped."}`;
      }
      if (log.painScore !== null || /(hurt|pain|sore|ache|tweak|injur)/i.test(log.notes ?? "")) {
        return `• *${log.exerciseName}*: hold or reduce until pain-free.`;
      }
      if (log.status === "partial") {
        return `• *${log.exerciseName}*: hold the same weight next time.`;
      }
      const prescribed = workout.exercises.find(
        (item) => item.exercise.id === log.exerciseId
      );
      const sets = setsByLogId.get(log.exerciseLogId) ?? [];
      const rpes = sets
        .map((set) => (set.rpe ? Number(set.rpe) : null))
        .filter((rpe): rpe is number => rpe !== null);
      const maxRpe = rpes.length > 0 ? Math.max(...rpes) : null;
      const completedPrescribed =
        prescribed?.prescribedSets !== null &&
        prescribed?.prescribedSets !== undefined &&
        sets.length >= prescribed.prescribedSets;
      const lastSet = sets.at(-1);
      const lastLoad = formatLoggedWeight(lastSet?.weight, lastSet?.notes);

      if (maxRpe !== null && maxRpe >= 9) {
        return `• *${log.exerciseName}*: hold or reduce next week${lastLoad ? ` from ${lastLoad}` : ""}; today hit RPE ${maxRpe}.`;
      }
      if (completedPrescribed && maxRpe !== null && maxRpe <= 8) {
        return `• *${log.exerciseName}*: small progression next week${lastLoad ? ` from ${lastLoad}` : ""} if warm-ups feel good.`;
      }
      return `• *${log.exerciseName}*: repeat and build cleaner data next week.`;
    });

    const completedLines = orderedLogs
      .filter((log) => log.status !== "skipped")
      .map(formatSetLine);
    const skippedLines = skipped.map(
      (log) =>
        `• *${log.exerciseName}*${log.skippedReason ? ` — ${log.skippedReason}` : ""}`
    );
    const painLines = painNotes.map(
      (log) => `• *${log.exerciseName}*: ${log.notes ?? `pain score ${log.painScore}`}`
    );

    const body = [
      "✅ *Workout Complete*",
      `*${workout.name}*`,
      completedLines.length > 0
        ? ["*Logged today*", ...completedLines].join("\n")
        : "*Logged today*\n• Nothing logged yet",
      skippedLines.length > 0
        ? ["*Skipped / left for next time*", ...skippedLines].join("\n")
        : null,
      painLines.length > 0 ? ["*Pain / notes*", ...painLines].join("\n") : null,
      nextTime.length > 0 ? ["*Next week progression*", ...nextTime].join("\n") : null,
      "I saved this workout. Next Push session will use these logs as the baseline, but exercises that hit RPE 9-10 should be held or reduced rather than automatically increased."
    ]
      .filter(Boolean)
      .join("\n\n");

    await this.db
      .update(workouts)
      .set({
        coachSummary: body,
        updatedAt: new Date()
      })
      .where(eq(workouts.id, workoutId));

    return body;
  }

  async getLastExercisePerformance(
    userId: string,
    exerciseName: string,
    excludeWorkoutId?: string
  ) {
    const [last] = await this.db
      .select({
        scheduledDate: workouts.scheduledDate,
        status: exerciseLogs.status,
        sets: exerciseLogs.setsCompleted,
        reps: exerciseLogs.repsCompleted,
        weight: exerciseLogs.weight,
        rpe: exerciseLogs.rpe,
        notes: exerciseLogs.notes
      })
      .from(exerciseLogs)
      .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
      .innerJoin(workouts, eq(exerciseLogs.workoutId, workouts.id))
      .where(
        and(
          eq(workouts.userId, userId),
          ilike(exercises.name, exerciseName),
          excludeWorkoutId
            ? sql`${workouts.id} <> ${excludeWorkoutId}`
            : undefined
        )
      )
      .orderBy(desc(workouts.scheduledDate), desc(exerciseLogs.updatedAt))
      .limit(1);

    return last ?? null;
  }

  async getRecentTrainingSignals(userId: string, limit = 7) {
    const recentWorkouts = await this.db
      .select({
        id: workouts.id,
        date: workouts.scheduledDate,
        workoutName: workoutTemplates.name,
        focus: workoutTemplates.focus,
        status: workouts.status
      })
      .from(workouts)
      .leftJoin(workoutTemplates, eq(workouts.templateId, workoutTemplates.id))
      .where(eq(workouts.userId, userId))
      .orderBy(desc(workouts.scheduledDate))
      .limit(limit);

    return Promise.all(
      recentWorkouts.map(async (workout) => {
        const exerciseRows = await this.db
          .select({
            exerciseName: exercises.name,
            painScore: exerciseLogs.painScore
          })
          .from(exerciseLogs)
          .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
          .where(eq(exerciseLogs.workoutId, workout.id));
        const conditioningRows = await this.db
          .select({
            modality: conditioningLogs.modality,
            intensity: conditioningLogs.intensity
          })
          .from(conditioningLogs)
          .where(eq(conditioningLogs.workoutId, workout.id));

        return {
          date: workout.date,
          workoutName: workout.workoutName ?? "Workout",
          focus: workout.focus,
          status: workout.status,
          exerciseNames: exerciseRows.map((row) => row.exerciseName),
          conditioningModalities: conditioningRows.map((row) => row.modality),
          painReported: exerciseRows.some((row) => row.painScore !== null)
        };
      })
    );
  }

  buildDailyWorkoutMessage(
    displayName: string | null,
    workout: CurrentWorkout
  ): string {
    const formatFormLinks = (
      exercise: CurrentWorkout["exercises"][number]["exercise"]
    ) => {
      const gifLabel = exercise.gifLabel ?? "image search";
      const demoLabel = exercise.demoLabel ?? "video search";
      return `<${exercise.gifUrl}|${gifLabel}> | <${exercise.demoUrl}|${demoLabel}>`;
    };
    const formatPrescription = (item: CurrentWorkout["exercises"][number]) => {
      const prescription = [
        item.prescribedSets,
        item.prescribedReps
      ].filter(Boolean);
      return prescription.length > 0 ? prescription.join("x") : "as prescribed";
    };
    const formatLastPerformance = (
      item: CurrentWorkout["exercises"][number]
    ) => {
      const last = item.lastPerformance;
      if (!last) {
        return "Last: no logged history yet";
      }

      const load = last.weight ? `${last.weight} lb` : "load not logged";
      const volume =
        last.sets || last.reps
          ? `${last.sets ?? "?"}x${last.reps ?? "?"}`
          : "sets/reps not logged";
      const rpe = last.rpe ? `, RPE ${last.rpe}` : "";
      return `Last ${last.scheduledDate}: ${load} ${volume}${rpe}`;
    };
    const mainExercises = workout.exercises.filter(
      (item) => item.notes !== "Warm-up"
    );
    const quickBreakdown = mainExercises
      .map((item) => `• *${item.exercise.name}* — ${formatPrescription(item)}`)
      .join("\n");
    const details = mainExercises
      .map((item) => {
        const prescription = formatPrescription(item);
        const cues = (
          item.exercise.cues?.length
            ? item.exercise.cues
            : ["Control the lowering phase", "Stop before form breaks"]
        )
          .slice(0, 2)
          .join(" • ");
        return [
          `*${item.sortOrder}. ${item.exercise.name}* — ${prescription}`,
          item.exercise.purpose ? `   _Why:_ ${item.exercise.purpose}` : null,
          cues ? `   _Cues:_ ${cues}` : null,
          `   ${formatLastPerformance(item)}`,
          `   _Form:_ ${formatFormLinks(item.exercise)}`
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");
    const conditioning = workout.conditioning
      ? [
          "➕ *Optional add-on*",
          workout.conditioning.prescription,
          `_Why:_ ${workout.conditioning.reason}`,
          workout.conditioning.caution
            ? `_Watch-out:_ ${workout.conditioning.caution}`
            : null
        ]
          .filter(Boolean)
          .join("\n")
      : null;

    return [
      `🏋️ *Coach AI — ${workout.name}*`,
      displayName ? `Good morning, ${displayName}.` : "Good morning.",
      workout.focus ? `🎯 *Focus:* ${workout.focus}` : null,
      workout.estimatedMinutes
        ? `⏱️ *Target:* ${workout.estimatedMinutes} minutes`
        : null,
      "📌 *Strength is the source of truth.* Cardio/HYROX stays optional unless you ask to change the lift.",
      "💪 *Quick breakdown*",
      quickBreakdown,
      "📋 *Details*",
      details,
      conditioning,
      "📝 *Log format:* `Back Squat 225 5x8 RPE 7, RDL 185 4x10 hard, skipped step-ups`",
      "🎞️ Reply `form guide` or `GIFs for today` and I’ll post the full guide in this workout thread.",
      "▶️ Reply `starting now` when you begin. Send each lift as you finish it and I’ll track the session."
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  buildSessionAdjustmentMessage(
    workout: CurrentWorkout,
    shape: "short" | "standard" | "long" | "strength" | "hyrox"
  ): string {
    const mainExercises = workout.exercises.filter((item) => item.notes !== "Warm-up");
    const names = mainExercises.map((item) => item.exercise.name);
    const topPriority = names.slice(0, 3).join(", ");
    const nextTier = names.slice(3, 6).join(", ");
    const conditioning = workout.conditioning;

    if (shape === "short") {
      return [
        `Short version for *${workout.name}*:`,
        `1. Prioritize ${topPriority}.`,
        nextTier ? `2. If time remains, do 1-2 quick sets of ${nextTier}.` : null,
        "3. Skip extra accessories before cutting the main lifts.",
        conditioning
          ? `Conditioning: keep it low-stress today. ${conditioning.mode === "run" ? "Use 5-10 controlled treadmill minutes only if legs feel good." : conditioning.prescription}`
          : null,
        "Reply `starting now` when you begin."
      ]
        .filter(Boolean)
        .join("\n");
    }

    if (shape === "long") {
      return [
        `Long version for *${workout.name}*:`,
        `Keep the full strength session: ${names.join(", ")}.`,
        "Add one back-off set on the first two main lifts if RPE is 7 or lower.",
        conditioning
          ? `Optional conditioning add-on: ${conditioning.prescription}`
          : "Finish with 15-25 minutes easy aerobic work.",
        "Keep the extra work smooth. No max-effort sets today."
      ].join("\n");
    }

    if (shape === "strength") {
      return [
        `Strength-biased version for *${workout.name}*:`,
        `Main lifts first: ${topPriority}.`,
        nextTier ? `Accessories second: ${nextTier}.` : null,
        "Keep conditioning easy and short so it does not steal from the lifting quality.",
        "Log weights, sets, reps, and RPE as you go."
      ]
        .filter(Boolean)
        .join("\n");
    }

    if (shape === "hyrox") {
      return [
        `Optional HYROX/cardio add-on for *${workout.name}*:`,
        `Keep the strength plan unchanged: ${names.join(", ")}.`,
        "After the main strength work, choose one add-on:",
        "1. Run add-on: 3-5 rounds of 400m controlled run, 60-90 sec easy walk.",
        "2. Low-impact add-on: 4 rounds of 500m row or 2 min Assault Bike, easy between rounds.",
        "3. HYROX finisher: 3 rounds of 400m run, 20 wall balls, 20 slam balls, farmer carry.",
        conditioning ? `Best fit today: ${conditioning.prescription}` : null,
        conditioning ? `Why: ${conditioning.reason}` : null,
        conditioning?.caution ? `Watch-out: ${conditioning.caution}` : null,
        "This is optional. Do not cut the main strength work unless you also ask for a short version."
      ]
        .filter(Boolean)
        .join("\n");
    }

    return [
      `Standard version for *${workout.name}*:`,
      `Do the session as posted: ${names.join(", ")}.`,
      conditioning ? `Conditioning direction: ${conditioning.prescription}` : null,
      "Reply `starting now` when you begin."
    ]
      .filter(Boolean)
      .join("\n");
  }

  buildWorkoutMediaMessage(workout: CurrentWorkout): string {
    const mainExercises = workout.exercises.filter((item) => item.notes !== "Warm-up");
    const formatFormLinks = (
      exercise: CurrentWorkout["exercises"][number]["exercise"]
    ) => {
      const gifLabel = exercise.gifLabel ?? "image search";
      const demoLabel = exercise.demoLabel ?? "video search";
      return `<${exercise.gifUrl}|${gifLabel}> | <${exercise.demoUrl}|${demoLabel}>`;
    };
    const lines = mainExercises.map((item) => {
      const cues = (
        item.exercise.cues?.length
          ? item.exercise.cues
          : ["Control the lowering phase", "Keep the target muscles doing the work", "Stop before form breaks"]
      )
        .map((cue) => `  • ${cue}`)
        .join("\n");
      const mistakes = item.exercise.commonMistakes
        ?.slice(0, 2)
        .map((mistake) => `  • ${mistake}`)
        .join("\n");
      const setup =
        item.exercise.setup ??
        item.exercise.instructions ??
        "Set up with a stable base and controlled starting position before the first rep.";
      const purpose =
        item.exercise.purpose ??
        "Use this movement to complete the planned strength work with clean, repeatable reps.";

      return [
        `*${item.sortOrder}. ${item.exercise.name}* - ${item.prescribedSets ?? "?"}x${item.prescribedReps ?? "?"}`,
        `_Why:_ ${purpose}`,
        `_Setup:_ ${setup}`,
        cues ? `_Cues:_\n${cues}` : null,
        mistakes ? `_Avoid:_\n${mistakes}` : null,
        `_Form:_ ${formatFormLinks(item.exercise)}`
      ]
        .filter(Boolean)
        .join("\n");
    });

    return [
      `🎞️ *Form guide for ${workout.name}*`,
      "Use this as a quick reference while lifting. Exact reviewed media is labeled as GIF/video; unreviewed media is labeled as search.",
      "Keep the written strength plan as the source of truth.",
      ...lines
    ].join("\n\n");
  }

  async buildMissedDayAdjustmentMessage(
    userId: string,
    body = ""
  ): Promise<string> {
    const [user] = await this.db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const timezone = user?.timezone ?? "America/Los_Angeles";
    const today = dateInTimeZone(new Date(), timezone);
    const todayDayOfWeek = dayOfWeekInTimeZone(new Date(), timezone);
    const missedFocus = detectMissedTrainingFocus(body);
    const availableFocus = detectAvailableTrainingFocus(body);
    const recent = await this.getRecentWorkouts(userId, 7);
    const missed = recent.find((workout) =>
      ["scheduled", "in_progress", "skipped"].includes(workout.status)
    );
    const templates = await this.db
      .select({
        id: workoutTemplates.id,
        dayOfWeek: workoutTemplates.dayOfWeek,
        name: workoutTemplates.name,
        focus: workoutTemplates.focus,
        estimatedMinutes: workoutTemplates.estimatedMinutes
      })
      .from(workoutTemplates)
      .innerJoin(workoutPlans, eq(workoutTemplates.planId, workoutPlans.id))
      .where(and(eq(workoutPlans.userId, userId), eq(workoutPlans.active, true)))
      .orderBy(asc(workoutTemplates.dayOfWeek));
    const missedTemplate =
      templates.find((template) => templateMatchesFocus(template, missedFocus)) ??
      (missed
        ? templates.find((template) => template.name === missed.name)
        : undefined);
    const todayTemplate =
      templates.find((template) => template.dayOfWeek === todayDayOfWeek) ??
      templates[0];
    const upcomingTemplates = templates
      .map((template) => ({
        ...template,
        daysOut: (template.dayOfWeek - todayDayOfWeek + 7) % 7
      }))
      .filter((template) => template.daysOut > 0)
      .sort((a, b) => a.daysOut - b.daysOut)
      .slice(0, 4);
    const topExercises = async (templateId: string | undefined) => {
      if (!templateId) {
        return "main lift, secondary lift, accessories";
      }
      const rows = await this.db
        .select({ name: exercises.name })
        .from(workoutTemplateExercises)
        .innerJoin(exercises, eq(workoutTemplateExercises.exerciseId, exercises.id))
        .where(eq(workoutTemplateExercises.templateId, templateId))
        .orderBy(asc(workoutTemplateExercises.sortOrder))
        .limit(4);
      return rows.map((row) => row.name).join(", ");
    };
    const missedExercises = await topExercises(missedTemplate?.id);
    const todayExercises = await topExercises(todayTemplate?.id);
    const requestedFocusLine = availableFocus
      ? `You said you may be able to train *${availableFocus}* today, so option C uses that as the editable focus.`
      : missedFocus
        ? `You missed *${missedFocus}*. If you want to train something else today, tell me what is available.`
      : "Tell me what you can train today and I’ll bias the rework around that.";
    const upcomingLine =
      upcomingTemplates.length > 0
        ? upcomingTemplates
            .map(
              (template) =>
                `• ${weekdayNames[template.dayOfWeek]}: ${template.name}${template.focus ? ` (${template.focus})` : ""}`
            )
            .join("\n")
        : "• I do not see the rest of this week's templates.";

    const missedLine = missedTemplate
      ? `Missed priority: *${missedTemplate.name}*${missed ? ` from ${missed.scheduledDate}` : ""}. Main work: ${missedExercises}.`
      : missed
        ? `Missed priority: *${missed.name}* from ${missed.scheduledDate}.`
        : "I do not see a clearly missed workout in the DB, so I’ll give you a safe rework menu.";

    return [
      "🗓️ *Rework this week*",
      missedLine,
      todayTemplate
        ? `Today’s source-of-truth workout: *${todayTemplate.name}*. Main work: ${todayExercises}.`
        : `Today: ${today}.`,
      requestedFocusLine,
      "",
      "*Pick an option*",
      "A. *Keep today as written.* Do the posted strength session and push the missed day to the next matching slot.",
      missedTemplate
        ? `B. *Carry the missed priority into today.* Add only the first 1-2 key lifts from ${missedTemplate.name}; do not double up the whole workout.`
        : "B. *Carry the missed priority into today.* Tell me which day you missed and I’ll pick the key lifts.",
      availableFocus
        ? `C. *Choose your available focus today:* ${availableFocus}. I’ll build a focused version around what you can train and protect sore areas.`
        : "C. *Choose what you can train today.* Reply with `upper only`, `lower only`, `no legs`, `push`, `pull`, `cardio only`, or your time limit.",
      "D. *Recovery/short day.* Keep the week moving with mobility/easy conditioning and resume the strength split tomorrow.",
      "",
      "*Rest of week currently looks like*",
      upcomingLine,
      "",
      "Reply `A`, `B`, `C upper only`, `C no legs`, or describe what you want to work on. I’ll format the exact session. I will not rewrite the saved schedule until you confirm."
    ].join("\n");
  }

  async buildScheduleReworkSelectionMessage(
    userId: string,
    body: string,
    currentWorkout: CurrentWorkout | null | undefined
  ): Promise<string> {
    const option = detectReworkOption(body);
    const focus = detectAvailableTrainingFocus(body) ?? detectTrainingFocus(body);
    const [user] = await this.db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const timezone = user?.timezone ?? "America/Los_Angeles";
    const todayDayOfWeek = dayOfWeekInTimeZone(new Date(), timezone);
    const templates = await this.db
      .select({
        id: workoutTemplates.id,
        dayOfWeek: workoutTemplates.dayOfWeek,
        name: workoutTemplates.name,
        focus: workoutTemplates.focus,
        estimatedMinutes: workoutTemplates.estimatedMinutes
      })
      .from(workoutTemplates)
      .innerJoin(workoutPlans, eq(workoutTemplates.planId, workoutPlans.id))
      .where(and(eq(workoutPlans.userId, userId), eq(workoutPlans.active, true)))
      .orderBy(asc(workoutTemplates.dayOfWeek));
    const todayTemplate =
      templates.find((template) => template.dayOfWeek === todayDayOfWeek) ??
      templates[0];
    const selectedTemplate =
      (focus ? templates.find((template) => templateMatchesFocus(template, focus)) : null) ??
      todayTemplate;
    const missedLowerTemplate =
      templates.find((template) => templateMatchesFocus(template, "lower")) ??
      templates.find((template) => /lower|leg/i.test(template.name));
    const templateExercises = async (templateId: string | undefined, limit = 6) => {
      if (!templateId) {
        return [];
      }
      return this.db
        .select({
          name: exercises.name,
          sets: workoutTemplateExercises.prescribedSets,
          reps: workoutTemplateExercises.prescribedReps
        })
        .from(workoutTemplateExercises)
        .innerJoin(exercises, eq(workoutTemplateExercises.exerciseId, exercises.id))
        .where(eq(workoutTemplateExercises.templateId, templateId))
        .orderBy(asc(workoutTemplateExercises.sortOrder))
        .limit(limit);
    };
    const formatExercises = (
      rows: Awaited<ReturnType<typeof templateExercises>>
    ) =>
      rows
        .map((row, index) => `${index + 1}. *${row.name}* - ${row.sets ?? "?"}x${row.reps ?? "?"}`)
        .join("\n");

    if (option === "D" || focus === "recovery") {
      return [
        "🧭 *Reworked plan: Recovery / short day*",
        "Use this when you missed a day but recovery or schedule is the limiter.",
        "1. 20-40 min easy walk, bike, or row",
        "2. 10 min hips, hamstrings, calves, T-spine",
        "3. Optional core: Pallof press 3x15/side + dead bug 3x10/side",
        "No strength progression today. Resume the strength split tomorrow."
      ].join("\n");
    }

    if (option === "B") {
      const todayRows = currentWorkout
        ? currentWorkout.exercises
            .filter((item) => item.notes !== "Warm-up")
            .slice(0, 4)
            .map((item) => ({
              name: item.exercise.name,
              sets: item.prescribedSets,
              reps: item.prescribedReps
            }))
        : await templateExercises(todayTemplate?.id, 4);
      const carryRows = await templateExercises(missedLowerTemplate?.id, 2);
      return [
        "🧭 *Reworked plan: Carry missed priority*",
        "Strength stays the source of truth. Do not double up the whole missed day.",
        "*Today’s base*",
        formatExercises(todayRows),
        carryRows.length > 0
          ? ["*Carry-over add-on*", formatExercises(carryRows)].join("\n")
          : "*Carry-over add-on*\nTell me which missed lift matters most and I’ll place it.",
        "Keep carry-over sets at RPE 6-7. If joints feel beat up, skip the add-on and push it to the next matching day."
      ].join("\n\n");
    }

    if (option === "A") {
      const rows = currentWorkout
        ? currentWorkout.exercises
            .filter((item) => item.notes !== "Warm-up")
            .slice(0, 8)
            .map((item) => ({
              name: item.exercise.name,
              sets: item.prescribedSets,
              reps: item.prescribedReps
            }))
        : await templateExercises(todayTemplate?.id, 8);
      return [
        "🧭 *Reworked plan: Keep today as written*",
        "Do today’s source-of-truth strength session. Move the missed day to the next matching slot instead of cramming it in.",
        formatExercises(rows),
        "Reply `starting now` when you begin, or say `C upper only` / `C no legs` if you want a different focus."
      ].join("\n\n");
    }

    const rows = await templateExercises(selectedTemplate?.id, 7);
    const focusLabel = focus ?? selectedTemplate?.name ?? "available focus";
    return [
      `🧭 *Reworked plan: ${focusLabel}*`,
      selectedTemplate
        ? `Using *${selectedTemplate.name}* as the closest match.`
        : "Using your available focus and keeping the work strength-first.",
      formatExercises(rows),
      focus === "conditioning"
        ? "Conditioning stays optional. If this is cardio-only, keep it easy/moderate and do not try to replace the missed strength work with a max-effort circuit."
        : "Keep this as a strength session. Missed lower work can move to the next lower/full-body slot.",
      "Send logs set-by-set or say `workout status` any time."
    ].join("\n\n");
  }

  async getWeeklyData(userId: string, weekStart: string, weekEnd: string) {
    const workoutRows = await this.db
      .select({
        id: workouts.id,
        scheduledDate: workouts.scheduledDate,
        status: workouts.status,
        name: workoutTemplates.name,
        userSummary: workouts.userSummary,
        coachSummary: workouts.coachSummary
      })
      .from(workouts)
      .leftJoin(workoutTemplates, eq(workouts.templateId, workoutTemplates.id))
      .where(
        and(
          eq(workouts.userId, userId),
          gte(workouts.scheduledDate, weekStart),
          lte(workouts.scheduledDate, weekEnd)
        )
      )
      .orderBy(asc(workouts.scheduledDate));

    const logs = await this.db
      .select({
        workoutId: exerciseLogs.workoutId,
        exerciseName: exercises.name,
        status: exerciseLogs.status,
        sets: exerciseLogs.setsCompleted,
        reps: exerciseLogs.repsCompleted,
        weight: exerciseLogs.weight,
        rpe: exerciseLogs.rpe,
        painScore: exerciseLogs.painScore
      })
      .from(exerciseLogs)
      .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
      .innerJoin(workouts, eq(exerciseLogs.workoutId, workouts.id))
      .where(
        and(
          eq(workouts.userId, userId),
          gte(workouts.scheduledDate, weekStart),
          lte(workouts.scheduledDate, weekEnd)
        )
      );

    const conditioning = await this.db
      .select({
        workoutId: conditioningLogs.workoutId,
        modality: conditioningLogs.modality,
        distanceMeters: conditioningLogs.distanceMeters,
        durationSeconds: conditioningLogs.durationSeconds,
        calories: conditioningLogs.calories,
        intensity: conditioningLogs.intensity,
        rpe: conditioningLogs.rpe,
        notes: conditioningLogs.notes,
        createdAt: conditioningLogs.createdAt
      })
      .from(conditioningLogs)
      .where(
        and(
          eq(conditioningLogs.userId, userId),
          gte(conditioningLogs.createdAt, new Date(`${weekStart}T00:00:00Z`)),
          lte(conditioningLogs.createdAt, new Date(`${weekEnd}T23:59:59Z`))
        )
      );

    return { workouts: workoutRows, exerciseLogs: logs, conditioningLogs: conditioning };
  }
}
