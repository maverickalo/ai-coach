import { desc, eq } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import {
  conversations,
  messages,
  userProfiles,
  users
} from "../../db/schema.js";
import type { CoachContext } from "../../types/domain.js";
import { dateInTimeZone } from "../../utils/dates.js";
import type { MemoryEngine } from "../memory/memory-engine.js";
import type { WorkoutEngine } from "../workout/workout-engine.js";

export class CoachContextBuilder {
  constructor(
    private readonly db: Database,
    private readonly workoutEngine: WorkoutEngine,
    private readonly memoryEngine: MemoryEngine
  ) {}

  async build(userId: string): Promise<CoachContext> {
    const [userRow] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRow) {
      throw new Error(`User not found: ${userId}`);
    }

    const [profile] = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    const recentMessages = await this.db
      .select({
        direction: messages.direction,
        body: messages.body,
        intent: messages.intent,
        createdAt: messages.createdAt
      })
      .from(messages)
      .innerJoin(
        conversations,
        eq(messages.conversationId, conversations.id)
      )
      .where(eq(conversations.userId, userId))
      .orderBy(desc(messages.createdAt))
      .limit(12);

    return {
      user: {
        id: userRow.id,
        phoneNumber: userRow.phoneNumber,
        displayName: userRow.displayName,
        timezone: userRow.timezone
      },
      profile: profile
        ? {
            primaryGoal: profile.primaryGoal,
            trainingStyle: profile.trainingStyle,
            dietaryNotes: profile.dietaryNotes,
            equipmentNotes: profile.equipmentNotes,
            injuryNotes: profile.injuryNotes
          }
        : null,
      currentWorkout: await this.workoutEngine.getWorkoutByDate(
        userId,
        dateInTimeZone(new Date(), userRow.timezone)
      ),
      recentWorkouts: await this.workoutEngine.getRecentWorkouts(userId),
      memories: await this.memoryEngine.getRelevantMemories(userId),
      recentMessages: recentMessages.reverse().map((message) => ({
        direction:
          message.direction === "outbound" ? "outbound" : "inbound",
        body: message.body,
        intent: message.intent,
        createdAt: message.createdAt
      }))
    };
  }
}
