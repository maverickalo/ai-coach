import { and, asc, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import {
  coachEvents,
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
  ParsedExerciseLog,
  RecentWorkoutSummary
} from "../../types/domain.js";
import { dateInTimeZone, dayOfWeekInTimeZone } from "../../utils/dates.js";
import { recommendConditioning } from "./conditioning-engine.js";
import { exerciseDemoUrl } from "./exercise-resources.js";

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
          demoUrl: exerciseDemoUrl(item.exerciseName)
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

        return {
          date: workout.date,
          workoutName: workout.workoutName ?? "Workout",
          focus: workout.focus,
          status: workout.status,
          exerciseNames: exerciseRows.map((row) => row.exerciseName),
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
          `   Demo: ${item.exercise.demoUrl}`
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
      "*Before we lock it in:* reply `short`, `standard`, `long`, `strength`, or `HYROX` and I'll adjust today's layout.",
      "*Main work*",
      mainWork,
      conditioning,
      "*Log format:* `Back Squat 225 5x8 RPE 7, RDL 185 4x10 hard, skipped step-ups`",
      "Reply `starting now` when you begin and I'll check in during the session."
    ]
      .filter(Boolean)
      .join("\n\n");
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

    return { workouts: workoutRows, exerciseLogs: logs };
  }
}
