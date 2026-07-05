import { and, asc, count, desc, eq, gte, lte } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import {
  conversations,
  exercises,
  exerciseLogs,
  exerciseSets,
  messages,
  userProfiles,
  users,
  workouts,
  workoutTemplates
} from "../../db/schema.js";
import type { ParsedExerciseLog } from "../../types/domain.js";
import type { WorkoutEngine } from "../workout/workout-engine.js";

export interface ProfileUpdate {
  displayName: string;
  timezone: string;
  phoneNumber: string | null;
  primaryGoal: string;
  equipmentNotes: string;
  injuryNotes: string;
}

export interface WebExerciseLogInput {
  exerciseId: string;
  status: "completed" | "partial" | "skipped";
  sets: number | null;
  reps: string | null;
  weight: number | null;
  rpe: number | null;
  skippedReason: string | null;
  notes: string | null;
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayLabel(dateString: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC"
  }).format(new Date(`${dateString}T00:00:00.000Z`));
}

function numeric(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export class WebPortalService {
  constructor(
    private readonly db: Database,
    private readonly workoutEngine: WorkoutEngine
  ) {}

  async getToday(userId: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    try {
      const workout = await this.workoutEngine.getOrCreateWorkoutForDate(
        userId,
        user.timezone
      );
      return this.withWorkoutLogs(workout);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("No active workout template")
      ) {
        return null;
      }
      throw error;
    }
  }

  async getDashboard(userId: string) {
    const today = await this.getToday(userId);
    const todayDate = today?.scheduledDate ?? new Date().toISOString().slice(0, 10);
    const todayIndex = new Date(`${todayDate}T00:00:00.000Z`).getUTCDay();
    const weekStart = addDays(todayDate, -todayIndex);
    const weekEnd = addDays(weekStart, 6);

    const weekRows = await this.db
      .select({
        scheduledDate: workouts.scheduledDate,
        status: workouts.status,
        workoutName: workoutTemplates.name
      })
      .from(workouts)
      .leftJoin(workoutTemplates, eq(workouts.templateId, workoutTemplates.id))
      .where(
        and(
          eq(workouts.userId, userId),
          gte(workouts.scheduledDate, weekStart),
          lte(workouts.scheduledDate, weekEnd)
        )
      );

    const weekByDate = new Map(weekRows.map((row) => [row.scheduledDate, row]));
    const week = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      const row = weekByDate.get(date);
      return {
        date,
        dayLabel: dayLabel(date),
        workoutName: row?.workoutName ?? "Unscheduled",
        status: row?.status ?? "upcoming",
        isToday: date === todayDate
      };
    });

    const logsThisWeek = await this.weeklyExerciseLogs(userId, weekStart, weekEnd);
    const workoutsCompletedThisWeek = weekRows.filter((row) =>
      ["completed", "partially_completed"].includes(row.status)
    ).length;
    const skippedExercisesThisWeek = logsThisWeek.filter(
      (log) => log.status === "skipped"
    ).length;
    const recentBestSet = this.bestSetLabel(logsThisWeek);
    const recommendations = this.recommendationsFromLogs(logsThisWeek).slice(0, 4);

    return {
      today,
      week,
      progress: {
        workoutsCompletedThisWeek,
        totalWorkoutsThisWeek: weekRows.length,
        exercisesLoggedThisWeek: logsThisWeek.length,
        skippedExercisesThisWeek,
        recentBestSet,
        nextWeightHighlight: recommendations[0]?.title ?? null
      },
      recommendations
    };
  }

  async logExercise(
    userId: string,
    workoutId: string,
    input: WebExerciseLogInput
  ) {
    const [workout] = await this.db
      .select({
        id: workouts.id,
        userId: workouts.userId,
        status: workouts.status
      })
      .from(workouts)
      .where(eq(workouts.id, workoutId))
      .limit(1);

    if (!workout || workout.userId !== userId) {
      throw new Error("Workout not found");
    }

    const [exercise] = await this.db
      .select({
        id: exercises.id,
        name: exercises.name
      })
      .from(exercises)
      .where(eq(exercises.id, input.exerciseId))
      .limit(1);

    if (!exercise) {
      throw new Error("Exercise not found");
    }

    const parsed: ParsedExerciseLog = {
      exerciseName: exercise.name,
      status: input.status,
      sets: input.status === "skipped" ? null : input.sets,
      reps: input.status === "skipped" ? null : input.reps,
      weight: input.status === "skipped" ? null : input.weight,
      rpe: input.status === "skipped" ? null : input.rpe,
      difficulty: null,
      skippedReason: input.status === "skipped" ? input.skippedReason : null,
      substituteExerciseName: null,
      notes: input.notes
    };

    await this.workoutEngine.logExercise(userId, workoutId, parsed);

    if (workout.status === "scheduled") {
      await this.workoutEngine.updateWorkoutStatus(workoutId, "in_progress");
    }

    const updated = await this.workoutEngine.getWorkoutById(workoutId);
    if (!updated) {
      throw new Error("Workout not found");
    }
    return this.withWorkoutLogs(updated);
  }

  async getMessages(userId: string, limit = 50) {
    const rows = await this.db
      .select({
        id: messages.id,
        direction: messages.direction,
        body: messages.body,
        createdAt: messages.createdAt
      })
      .from(messages)
      .innerJoin(
        conversations,
        eq(messages.conversationId, conversations.id)
      )
      .where(eq(conversations.userId, userId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return rows.reverse().map((message) => ({
      id: message.id,
      role: message.direction === "outbound" ? "coach" : "user",
      body: message.body,
      createdAt: message.createdAt.toISOString()
    }));
  }

  async getWorkouts(userId: string, limit = 30) {
    const rows = await this.db
      .select({
        id: workouts.id,
        scheduledDate: workouts.scheduledDate,
        name: workoutTemplates.name,
        status: workouts.status,
        coachSummary: workouts.coachSummary,
        exercisesLogged: count(exerciseLogs.id)
      })
      .from(workouts)
      .leftJoin(workoutTemplates, eq(workouts.templateId, workoutTemplates.id))
      .leftJoin(exerciseLogs, eq(exerciseLogs.workoutId, workouts.id))
      .where(eq(workouts.userId, userId))
      .groupBy(
        workouts.id,
        workouts.scheduledDate,
        workoutTemplates.name,
        workouts.status,
        workouts.coachSummary
      )
      .orderBy(desc(workouts.scheduledDate))
      .limit(limit);

    return rows.map((workout) => ({
      ...workout,
      name: workout.name ?? "Workout",
      exercisesLogged: Number(workout.exercisesLogged)
    }));
  }

  async getProgress(userId: string, query = "") {
    const rows = await this.db
      .select({
        workoutId: workouts.id,
        scheduledDate: workouts.scheduledDate,
        workoutName: workoutTemplates.name,
        coachSummary: workouts.coachSummary,
        exerciseName: exercises.name,
        status: exerciseLogs.status,
        sets: exerciseLogs.setsCompleted,
        reps: exerciseLogs.repsCompleted,
        weight: exerciseLogs.weight,
        rpe: exerciseLogs.rpe,
        painScore: exerciseLogs.painScore,
        skippedReason: exerciseLogs.skippedReason,
        notes: exerciseLogs.notes,
        updatedAt: exerciseLogs.updatedAt
      })
      .from(exerciseLogs)
      .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
      .innerJoin(workouts, eq(exerciseLogs.workoutId, workouts.id))
      .leftJoin(workoutTemplates, eq(workouts.templateId, workoutTemplates.id))
      .where(eq(workouts.userId, userId))
      .orderBy(desc(workouts.scheduledDate), desc(exerciseLogs.updatedAt))
      .limit(120);

    const normalizedQuery = query.trim().toLowerCase();
    const filteredRows = normalizedQuery
      ? rows.filter((row) =>
          [
            row.workoutName,
            row.exerciseName,
            row.status,
            row.weight,
            row.reps,
            row.rpe,
            row.skippedReason,
            row.notes,
            row.coachSummary
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        )
      : rows;

    const primaryExerciseName =
      filteredRows.find((row) => row.status !== "skipped")?.exerciseName ??
      rows.find((row) => row.status !== "skipped")?.exerciseName ??
      null;
    const trend = primaryExerciseName
      ? rows
          .filter((row) => row.exerciseName === primaryExerciseName)
          .slice(0, 10)
          .reverse()
          .map((row) => {
            const weight = numeric(row.weight);
            const reps = row.reps && /^\d+$/.test(row.reps) ? Number(row.reps) : null;
            const sets = row.sets;
            return {
              date: row.scheduledDate,
              exerciseName: row.exerciseName,
              weight,
              reps,
              sets,
              volume:
                weight !== null && reps !== null && sets !== null
                  ? weight * reps * sets
                  : null,
              rpe: numeric(row.rpe)
            };
          })
      : [];

    return {
      query,
      logs: filteredRows.slice(0, 60).map((row) => ({
        workoutId: row.workoutId,
        scheduledDate: row.scheduledDate,
        workoutName: row.workoutName ?? "Workout",
        exerciseName: row.exerciseName,
        status: row.status,
        sets: row.sets,
        reps: row.reps,
        weight: row.weight,
        rpe: row.rpe,
        painScore: row.painScore,
        skippedReason: row.skippedReason,
        notes: row.notes
      })),
      trend,
      recommendations: this.recommendationsFromLogs(rows).slice(0, 12)
    };
  }

  async getProfile(userId: string) {
    const [row] = await this.db
      .select({
        displayName: users.displayName,
        timezone: users.timezone,
        phoneNumber: users.phoneNumber,
        email: users.email,
        primaryGoal: userProfiles.primaryGoal,
        equipmentNotes: userProfiles.equipmentNotes,
        injuryNotes: userProfiles.injuryNotes
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (!row) {
      throw new Error("User not found");
    }

    return row;
  }

  async updateProfile(userId: string, input: ProfileUpdate) {
    await this.db
      .update(users)
      .set({
        displayName: input.displayName,
        timezone: input.timezone,
        phoneNumber: input.phoneNumber,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    await this.db
      .insert(userProfiles)
      .values({
        userId,
        primaryGoal: input.primaryGoal,
        equipmentNotes: input.equipmentNotes,
        injuryNotes: input.injuryNotes
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: {
          primaryGoal: input.primaryGoal,
          equipmentNotes: input.equipmentNotes,
          injuryNotes: input.injuryNotes,
          updatedAt: new Date()
        }
      });

    return this.getProfile(userId);
  }

  private async weeklyExerciseLogs(
    userId: string,
    weekStart: string,
    weekEnd: string
  ) {
    return this.db
      .select({
        id: exerciseLogs.id,
        scheduledDate: workouts.scheduledDate,
        workoutName: workoutTemplates.name,
        exerciseName: exercises.name,
        status: exerciseLogs.status,
        sets: exerciseLogs.setsCompleted,
        reps: exerciseLogs.repsCompleted,
        weight: exerciseLogs.weight,
        rpe: exerciseLogs.rpe,
        painScore: exerciseLogs.painScore,
        skippedReason: exerciseLogs.skippedReason,
        notes: exerciseLogs.notes,
        updatedAt: exerciseLogs.updatedAt
      })
      .from(exerciseLogs)
      .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
      .innerJoin(workouts, eq(exerciseLogs.workoutId, workouts.id))
      .leftJoin(workoutTemplates, eq(workouts.templateId, workoutTemplates.id))
      .where(
        and(
          eq(workouts.userId, userId),
          gte(workouts.scheduledDate, weekStart),
          lte(workouts.scheduledDate, weekEnd)
        )
      )
      .orderBy(desc(workouts.scheduledDate), desc(exerciseLogs.updatedAt));
  }

  private bestSetLabel(
    logs: Array<{
      exerciseName: string;
      weight: string | null;
      reps: string | null;
      sets: number | null;
      status: string;
    }>
  ) {
    const best = logs
      .filter((log) => log.status !== "skipped")
      .map((log) => ({
        ...log,
        weightValue: numeric(log.weight)
      }))
      .filter((log) => log.weightValue !== null)
      .sort((a, b) => (b.weightValue ?? 0) - (a.weightValue ?? 0))[0];

    if (!best) {
      return null;
    }

    return `${best.exerciseName}: ${best.weight} lb ${best.sets ?? "?"}x${best.reps ?? "?"}`;
  }

  private recommendationsFromLogs(
    logs: Array<{
      id?: string;
      exerciseName: string;
      status: string;
      sets: number | null;
      reps: string | null;
      weight: string | null;
      rpe: string | null;
      painScore: number | null;
      skippedReason: string | null;
      notes: string | null;
      updatedAt?: Date;
    }>
  ) {
    const seen = new Set<string>();
    return logs
      .filter((log) => {
        const key = log.exerciseName.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .map((log, index) => {
        const rpe = numeric(log.rpe);
        const weight = numeric(log.weight);
        const painReported =
          log.painScore !== null ||
          /(hurt|pain|sore|ache|tweak|injur)/i.test(log.notes ?? "");

        if (log.status === "skipped") {
          return {
            id: log.id ?? `recommendation-${index}`,
            title: `${log.exerciseName}: no progression`,
            reason: log.skippedReason
              ? `Skipped because ${log.skippedReason}. Log it before progressing.`
              : "Skipped exercises do not progress until completed.",
            status: "pending" as const
          };
        }

        if (painReported) {
          return {
            id: log.id ?? `recommendation-${index}`,
            title: `${log.exerciseName}: hold or reduce`,
            reason: "Pain was reported, so load should not increase until pain-free.",
            status: "pending" as const
          };
        }

        if (log.status === "partial") {
          return {
            id: log.id ?? `recommendation-${index}`,
            title: `${log.exerciseName}: repeat same load`,
            reason: "Reps or sets were missed, so repeat the same target next time.",
            status: "pending" as const
          };
        }

        if (weight !== null && rpe !== null && rpe <= 7) {
          return {
            id: log.id ?? `recommendation-${index}`,
            title: `${log.exerciseName}: consider a small increase`,
            reason: `${log.weight} lb was completed at RPE ${log.rpe}, so a conservative increase is reasonable.`,
            status: "pending" as const
          };
        }

        return {
          id: log.id ?? `recommendation-${index}`,
          title: `${log.exerciseName}: repeat target`,
          reason: rpe
            ? `Last logged RPE was ${log.rpe}, so repeat before increasing.`
            : "Not enough effort data yet. Repeat and log RPE next time.",
          status: "pending" as const
        };
      });
  }

  private async withWorkoutLogs<TWorkout extends { id: string; exercises: Array<{
    exercise: { id: string };
  }> }>(workout: TWorkout) {
    const logs = await this.db
      .select({
        id: exerciseLogs.id,
        exerciseId: exerciseLogs.exerciseId,
        status: exerciseLogs.status,
        setsCompleted: exerciseLogs.setsCompleted,
        repsCompleted: exerciseLogs.repsCompleted,
        weight: exerciseLogs.weight,
        rpe: exerciseLogs.rpe,
        painScore: exerciseLogs.painScore,
        skippedReason: exerciseLogs.skippedReason,
        notes: exerciseLogs.notes,
        updatedAt: exerciseLogs.updatedAt
      })
      .from(exerciseLogs)
      .where(eq(exerciseLogs.workoutId, workout.id));

    const setRows = await this.db
      .select({
        exerciseLogId: exerciseSets.exerciseLogId,
        setNumber: exerciseSets.setNumber,
        reps: exerciseSets.reps,
        weight: exerciseSets.weight,
        rpe: exerciseSets.rpe,
        notes: exerciseSets.notes
      })
      .from(exerciseSets)
      .innerJoin(exerciseLogs, eq(exerciseSets.exerciseLogId, exerciseLogs.id))
      .where(eq(exerciseLogs.workoutId, workout.id))
      .orderBy(asc(exerciseSets.setNumber));

    const logsByExerciseId = new Map(
      logs.map((log) => [
        log.exerciseId,
        {
          id: log.id,
          status: log.status,
          setsCompleted: log.setsCompleted,
          repsCompleted: log.repsCompleted,
          weight: log.weight,
          rpe: log.rpe,
          painScore: log.painScore,
          skippedReason: log.skippedReason,
          notes: log.notes,
          updatedAt: log.updatedAt.toISOString(),
          sets: setRows
            .filter((set) => set.exerciseLogId === log.id)
            .map((set) => ({
              setNumber: set.setNumber,
              reps: set.reps,
              weight: set.weight,
              rpe: set.rpe,
              notes: set.notes
            }))
        }
      ])
    );

    return {
      ...workout,
      exercises: workout.exercises.map((item) => ({
        ...item,
        log: logsByExerciseId.get(item.exercise.id) ?? null
      }))
    };
  }
}
