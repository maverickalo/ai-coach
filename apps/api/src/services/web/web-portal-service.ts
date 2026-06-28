import { count, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import {
  conversations,
  exerciseLogs,
  messages,
  userProfiles,
  users,
  workouts,
  workoutTemplates
} from "../../db/schema.js";
import type { WorkoutEngine } from "../workout/workout-engine.js";

export interface ProfileUpdate {
  displayName: string;
  timezone: string;
  phoneNumber: string | null;
  primaryGoal: string;
  equipmentNotes: string;
  injuryNotes: string;
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
      return await this.workoutEngine.getOrCreateWorkoutForDate(
        userId,
        user.timezone
      );
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
}
