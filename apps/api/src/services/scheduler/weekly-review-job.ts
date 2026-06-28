import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import {
  coachEvents,
  conversations,
  messages,
  users,
  weeklyReviews
} from "../../db/schema.js";
import { startOfPreviousWeek } from "../../utils/dates.js";
import type { MessagingService } from "../messaging/messaging-service.js";
import type { OpenAiClient } from "../openai/openai.client.js";
import type { WorkoutEngine } from "../workout/workout-engine.js";

export class WeeklyReviewJob {
  constructor(
    private readonly db: Database,
    private readonly workoutEngine: WorkoutEngine,
    private readonly openai: OpenAiClient,
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

    if (!user.phoneNumber) {
      throw new Error("Coach owner phone number is not configured");
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

    const body = `${generated.summary} Next week: ${generated.recommendations.join(" ")}`;

    if (!user.smsOptedIn) {
      return {
        sent: false,
        reason: "User is not opted in",
        review: generated
      };
    }

    const sent = await this.messaging.send({
      to: user.phoneNumber,
      body: body.slice(0, 1600)
    });

    const conversationId = await this.getConversationId(user.id);
    await this.db.insert(messages).values({
      conversationId,
      direction: "outbound",
      body: body.slice(0, 1600),
      intent: "weekly_review",
      metadata: {
        providerMessageId: sent.externalId,
        providerStatus: sent.status,
        weekStart,
        weekEnd
      }
    });

    return {
      sent: true,
      providerMessageId: sent.externalId,
      review: generated
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
