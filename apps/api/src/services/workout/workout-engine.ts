import { and, asc, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import {
  coachEvents,
  conditioningLogs,
  exerciseLogs,
  exercises,
  exerciseSets,
  workoutPlans,
  workouts,
  workoutTemplateExercises,
  workoutTemplates
} from "../../db/schema.js";
import type {
  CurrentWorkout,
  ParsedConditioningLog,
  ParsedExerciseLog,
  RecentWorkoutSummary
} from "../../types/domain.js";
import { dateInTimeZone, dayOfWeekInTimeZone } from "../../utils/dates.js";
import { recommendConditioning } from "./conditioning-engine.js";
import { exerciseResource } from "./exercise-resources.js";

export class WorkoutEngine {
  constructor(private readonly db: Database) {}

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

    await this.db.insert(coachEvents).values({
      userId,
      workoutId,
      eventType:
        input.status === "skipped" ? "ExerciseSkipped" : "ExerciseLogged",
      payload: { ...input }
    });
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

  async updateWorkoutStatus(
    workoutId: string,
    status: "in_progress" | "completed" | "partially_completed" | "skipped"
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
    const mainWork = workout.exercises
      .filter((item) => item.notes !== "Warm-up")
      .map((item) => {
        const prescription = formatPrescription(item);
        return [
          `*${item.sortOrder}. ${item.exercise.name}* - ${prescription}`,
          `   ${formatLastPerformance(item)}`,
          `   Demo: <${item.exercise.demoUrl}|video> | <${item.exercise.gifSearchUrl}|GIF search>`
        ].join("\n");
      })
      .join("\n");
    const conditioning = workout.conditioning
      ? [
          "*Conditioning direction*",
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
      `*Coach AI - ${workout.name}*`,
      displayName ? `Good morning, ${displayName}.` : "Good morning.",
      workout.focus ? `*Focus:* ${workout.focus}` : null,
      workout.estimatedMinutes
        ? `*Estimated:* ${workout.estimatedMinutes} minutes`
        : null,
      "*Strength is the source of truth.* Reply `short`, `standard`, or `long` to scale the lifting plan. Reply `cardio` or `HYROX` and I'll add an optional conditioning block without replacing the strength work.",
      "*Main work*",
      mainWork,
      conditioning,
      "*Log format:* `Back Squat 225 5x8 RPE 7, RDL 185 4x10 hard, skipped step-ups`",
      "Reply `starting now` when you begin and I'll check in during the session."
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

  async buildMissedDayAdjustmentMessage(userId: string): Promise<string> {
    const recent = await this.getRecentWorkouts(userId, 5);
    const missed = recent.find((workout) =>
      ["scheduled", "in_progress", "skipped"].includes(workout.status)
    );

    if (!missed) {
      return "I do not see a clearly missed recent workout. For today, follow the posted plan and tell me if you need it short, standard, long, strength, or HYROX.";
    }

    return [
      `Got it. I see the missed/unfinished session: *${missed.name}* from ${missed.scheduledDate}.`,
      "Do not double up the whole missed day.",
      "Today: keep the current workout, then carry forward only the most important missed strength movement if it does not hit the same tired joints.",
      "If legs are beat up, move missed lower-body work to the next lower day and use rower or Assault Bike instead of extra running today.",
      "Send `short`, `strength`, or `HYROX` and I will format today's exact version."
    ].join("\n");
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
