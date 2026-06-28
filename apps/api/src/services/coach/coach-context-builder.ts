import { and, asc, desc, eq } from "drizzle-orm";
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

    const [conversation] = await this.db
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

    const recentMessages = conversation
      ? await this.db
          .select({
            direction: messages.direction,
            body: messages.body,
            intent: messages.intent,
            createdAt: messages.createdAt
          })
          .from(messages)
          .where(eq(messages.conversationId, conversation.id))
          .orderBy(desc(messages.createdAt))
          .limit(12)
      : [];

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
