import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import {
  conversations,
  messages,
  users
} from "../../db/schema.js";
import type { MessagingService } from "../messaging/messaging-service.js";
import type { WorkoutEngine } from "../workout/workout-engine.js";

export class DailyWorkoutJob {
  constructor(
    private readonly db: Database,
    private readonly workoutEngine: WorkoutEngine,
    private readonly messaging: MessagingService
  ) {}

  async run(ownerPhoneNumber: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, ownerPhoneNumber))
      .limit(1);

    if (!user) {
      throw new Error("Coach owner user was not found. Run pnpm db:seed.");
    }

    if (!user.smsOptedIn) {
      return {
        sent: false,
        reason: "User is not opted in"
      };
    }

    const workout = await this.workoutEngine.getOrCreateWorkoutForDate(
      user.id,
      user.timezone
    );
    const body = this.workoutEngine.buildDailyWorkoutMessage(
      user.displayName,
      workout
    );
    const sent = await this.messaging.send({
      to: user.phoneNumber,
      body
    });

    const conversationId = await this.getConversationId(user.id);
    await this.db.insert(messages).values({
      conversationId,
      direction: "outbound",
      body,
      intent: "daily_workout",
      metadata: {
        providerMessageId: sent.externalId,
        providerStatus: sent.status,
        workoutId: workout.id
      }
    });

    return {
      sent: true,
      workoutId: workout.id,
      providerMessageId: sent.externalId
    };
  }

  private async getConversationId(userId: string): Promise<string> {
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
      throw new Error("Failed to create SMS conversation");
    }
    return created.id;
  }
}
