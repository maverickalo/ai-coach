import { and, asc, desc, eq, or } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import {
  conversations,
  messages,
  users
} from "../../db/schema.js";
import type { EmailClient } from "../../adapters/email/email.client.js";
import type { SlackClient } from "../../adapters/slack/slack.client.js";
import type { WorkoutEngine } from "../workout/workout-engine.js";

export interface OwnerLookup {
  phoneNumber?: string;
  email?: string;
}

export class DailyWorkoutJob {
  constructor(
    private readonly db: Database,
    private readonly workoutEngine: WorkoutEngine,
    private readonly delivery: {
      slack?: {
        client: SlackClient;
        channelId: string;
        mentionUserId?: string;
      };
      email?: {
        client: EmailClient;
        from: string;
        to: string;
      };
    }
  ) {}

  async run(owner: OwnerLookup) {
    const filters = [
      owner.phoneNumber ? eq(users.phoneNumber, owner.phoneNumber) : undefined,
      owner.email ? eq(users.email, owner.email) : undefined
    ].filter((filter) => filter !== undefined);

    if (filters.length === 0) {
      throw new Error("Coach owner is not configured");
    }

    const [user] = await this.db
      .select()
      .from(users)
      .where(filters.length === 1 ? filters[0] : or(...filters))
      .limit(1);

    if (!user) {
      throw new Error("Coach owner user was not found. Run pnpm db:seed.");
    }

    const workout = await this.workoutEngine.getOrCreateWorkoutForDate(
      user.id,
      user.timezone
    );
    const body = this.workoutEngine.buildDailyWorkoutMessage(
      user.displayName,
      workout
    );

    if (!this.delivery.slack && !this.delivery.email) {
      return {
        sent: false,
        reason: "No reminder delivery channel is configured",
        workoutId: workout.id,
        body
      };
    }

    const deliveries: Array<{
      channel: "slack" | "email";
      externalId: string;
      status: string;
    }> = [];

    if (this.delivery.slack) {
      if (await this.hasReminderBeenSent(user.id, "slack", workout.id)) {
        deliveries.push({
          channel: "slack",
          externalId: "already-sent",
          status: "skipped"
        });
      } else {
        const text = this.delivery.slack.mentionUserId
          ? `<@${this.delivery.slack.mentionUserId}> ${body}`
          : body;
        const sent = await this.delivery.slack.client.postMessage({
          channel: this.delivery.slack.channelId,
          text
        });
        deliveries.push({
          channel: "slack",
          externalId: sent.externalId,
          status: sent.status
        });
        await this.storeOutboundMessage(user.id, "slack", text, {
          providerMessageId: sent.externalId,
          providerStatus: sent.status,
          workoutId: workout.id
        });
      }
    }

    if (this.delivery.email) {
      if (await this.hasReminderBeenSent(user.id, "email", workout.id)) {
        deliveries.push({
          channel: "email",
          externalId: "already-sent",
          status: "skipped"
        });
      } else {
        const sent = await this.delivery.email.client.send({
          from: this.delivery.email.from,
          to: this.delivery.email.to,
          subject: `Coach AI: ${workout.name}`,
          text: body
        });
        deliveries.push({
          channel: "email",
          externalId: sent.externalId,
          status: sent.status
        });
        await this.storeOutboundMessage(user.id, "email", body, {
          providerMessageId: sent.externalId,
          providerStatus: sent.status,
          workoutId: workout.id
        });
      }
    }

    return {
      sent: true,
      workoutId: workout.id,
      deliveries
    };
  }

  private async storeOutboundMessage(
    userId: string,
    channel: "slack" | "email",
    body: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const conversationId = await this.getConversationId(userId, channel);
    await this.db.insert(messages).values({
      conversationId,
      direction: "outbound",
      body,
      intent: "daily_workout",
      metadata
    });
  }

  private async hasReminderBeenSent(
    userId: string,
    channel: "slack" | "email",
    workoutId: string
  ): Promise<boolean> {
    const conversationId = await this.findConversationId(userId, channel);
    if (!conversationId) {
      return false;
    }

    const recentMessages = await this.db
      .select({ metadata: messages.metadata })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.direction, "outbound"),
          eq(messages.intent, "daily_workout")
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(50);

    return recentMessages.some(
      (message) => message.metadata.workoutId === workoutId
    );
  }

  private async findConversationId(
    userId: string,
    channel: "slack" | "email"
  ): Promise<string | null> {
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

    return existing?.id ?? null;
  }

  private async getConversationId(
    userId: string,
    channel: "slack" | "email"
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
      throw new Error(`Failed to create ${channel} conversation`);
    }
    return created.id;
  }
}
