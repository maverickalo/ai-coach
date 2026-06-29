import { and, asc, eq, or } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import {
  coachEvents,
  conversations,
  messages,
  users,
  weeklyReviews
} from "../../db/schema.js";
import { startOfPreviousWeek } from "../../utils/dates.js";
import type { EmailClient } from "../../adapters/email/email.client.js";
import type { SlackClient } from "../../adapters/slack/slack.client.js";
import type { OpenAiClient } from "../openai/openai.client.js";
import type { WorkoutEngine } from "../workout/workout-engine.js";
import type { OwnerLookup } from "./daily-workout-job.js";

export class WeeklyReviewJob {
  constructor(
    private readonly db: Database,
    private readonly workoutEngine: WorkoutEngine,
    private readonly openai: OpenAiClient,
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

    const { weekStart, weekEnd } = startOfPreviousWeek(
      new Date(),
      user.timezone
    );
    const data = await this.workoutEngine.getWeeklyData(
      user.id,
      weekStart,
      weekEnd
    );

    const completed = data.workouts.filter(
      (workout) =>
        workout.status === "completed" ||
        workout.status === "partially_completed"
    ).length;

    const generated = this.openai.configured
      ? await this.openai.generateWeeklyReview({
          user: {
            displayName: user.displayName,
            timezone: user.timezone
          },
          weekStart,
          weekEnd,
          ...data
        })
      : {
          summary: `Weekly review: ${completed} of ${data.workouts.length} scheduled workouts were completed or partially completed.`,
          recommendations: [
            "Keep the next week's main lifts consistent.",
            "Log RPE so load recommendations can be more precise."
          ]
        };

    await this.db
      .insert(weeklyReviews)
      .values({
        userId: user.id,
        weekStart,
        weekEnd,
        summary: generated.summary,
        recommendations: generated.recommendations.join("\n")
      })
      .onConflictDoUpdate({
        target: [weeklyReviews.userId, weeklyReviews.weekStart],
        set: {
          weekEnd,
          summary: generated.summary,
          recommendations: generated.recommendations.join("\n")
        }
      });

    await this.db.insert(coachEvents).values({
      userId: user.id,
      eventType: "CoachRecommendationGenerated",
      payload: {
        type: "weekly_review",
        weekStart,
        weekEnd,
        recommendations: generated.recommendations
      }
    });

    const skippedCount = data.exerciseLogs.filter(
      (log) => log.status === "skipped"
    ).length;
    const painCount = data.exerciseLogs.filter(
      (log) => log.painScore !== null
    ).length;
    const body = [
      "📊 *Weekly Recap*",
      `*${weekStart} → ${weekEnd}*`,
      `✅ Workouts completed: ${completed}/${data.workouts.length}`,
      `⏭️ Exercises skipped: ${skippedCount}`,
      painCount > 0 ? `⚠️ Pain notes: ${painCount}` : "⚠️ Pain notes: none logged",
      "",
      `*Summary*\n${generated.summary}`,
      `*Next week*\n${generated.recommendations.map((item) => `• ${item}`).join("\n")}`
    ].join("\n");

    if (!this.delivery.slack && !this.delivery.email) {
      return {
        sent: false,
        reason: "No reminder delivery channel is configured",
        review: generated
      };
    }

    const deliveries: Array<{
      channel: "slack" | "email";
      externalId: string;
      status: string;
    }> = [];

    if (this.delivery.slack) {
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
        weekStart,
        weekEnd
      });
    }

    if (this.delivery.email) {
      const sent = await this.delivery.email.client.send({
        from: this.delivery.email.from,
        to: this.delivery.email.to,
        subject: `Coach AI Weekly Review: ${weekStart}`,
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
        weekStart,
        weekEnd
      });
    }

    return {
      sent: true,
      deliveries,
      review: generated
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
      intent: "weekly_review",
      metadata
    });
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
