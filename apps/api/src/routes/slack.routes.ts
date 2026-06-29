import { and, desc, eq, or } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { SlackClient } from "../adapters/slack/slack.client.js";
import { verifySlackRequest } from "../adapters/slack/slack.webhook.js";
import type { Database } from "../db/index.js";
import { conversations, messages, processedWebhooks, users } from "../db/schema.js";
import { env } from "../env.js";
import {
  isWorkoutMediaRequest,
  type ConversationEngine
} from "../services/conversation/conversation-engine.js";

const slackUrlVerificationSchema = z.object({
  type: z.literal("url_verification"),
  challenge: z.string()
});

const slackEventSchema = z.object({
  type: z.literal("event_callback"),
  event_id: z.string().min(1),
  event: z.union([
    z.object({
      type: z.literal("message"),
      channel: z.string().min(1),
      user: z.string().min(1).optional(),
      bot_id: z.string().optional(),
      subtype: z.string().optional(),
      ts: z.string().optional(),
      thread_ts: z.string().optional(),
      text: z.string().trim().min(1).max(4000)
    }),
    z.object({
      type: z.literal("app_mention"),
      channel: z.string().min(1),
      user: z.string().min(1).optional(),
      ts: z.string().optional(),
      thread_ts: z.string().optional(),
      text: z.string().trim().min(1).max(4000)
    })
  ])
});

type RawBodyRequest = FastifyRequest & { rawBody?: string };

async function findOwnerUser(db: Database) {
  const filters = [
    env.COACH_OWNER_EMAIL ? eq(users.email, env.COACH_OWNER_EMAIL) : undefined,
    env.COACH_OWNER_PHONE_NUMBER
      ? eq(users.phoneNumber, env.COACH_OWNER_PHONE_NUMBER)
      : undefined
  ].filter((filter) => filter !== undefined);

  if (filters.length === 0) {
    throw new Error("Coach owner is not configured");
  }

  const [owner] = await db
    .select()
    .from(users)
    .where(filters.length === 1 ? filters[0] : or(...filters))
    .limit(1);

  if (!owner) {
    throw new Error("Coach owner user was not found. Run pnpm db:seed.");
  }

  return owner;
}

async function findLatestDailyWorkoutThreadTs(
  db: Database,
  userId: string
): Promise<string | null> {
  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.channel, "slack")
      )
    )
    .limit(1);

  if (!conversation) {
    return null;
  }

  const [message] = await db
    .select({ metadata: messages.metadata })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversation.id),
        eq(messages.direction, "outbound"),
        eq(messages.intent, "daily_workout")
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);

  const providerMessageId = message?.metadata.providerMessageId;
  return typeof providerMessageId === "string" ? providerMessageId : null;
}

export async function slackRoutes(
  app: FastifyInstance,
  dependencies: {
    db: Database;
    conversation: ConversationEngine;
  }
) {
  app.post("/slack/events", async (request, reply) => {
    if (!env.SLACK_SIGNING_SECRET || !env.SLACK_BOT_TOKEN) {
      return reply.code(503).send({ error: "Slack is not configured" });
    }

    const rawBody = (request as RawBodyRequest).rawBody;
    const valid = rawBody
      ? verifySlackRequest({
          signingSecret: env.SLACK_SIGNING_SECRET,
          rawBody,
          timestamp: request.headers["x-slack-request-timestamp"] as
            | string
            | undefined,
          signature: request.headers["x-slack-signature"] as string | undefined
        })
      : false;

    if (!valid) {
      return reply.code(403).send({ error: "Invalid Slack signature" });
    }

    const verification = slackUrlVerificationSchema.safeParse(request.body);
    if (verification.success) {
      return { challenge: verification.data.challenge };
    }

    const parsed = slackEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(200).send({ ok: true });
    }

    const event = parsed.data.event;
    if (
      event.type === "message" &&
      (event.bot_id || event.subtype)
    ) {
      return { ok: true };
    }

    if (env.SLACK_ALLOWED_USER_ID && event.user !== env.SLACK_ALLOWED_USER_ID) {
      return { ok: true };
    }

    const duplicate = await dependencies.db
      .select()
      .from(processedWebhooks)
      .where(
        and(
          eq(processedWebhooks.provider, "slack"),
          eq(processedWebhooks.externalId, parsed.data.event_id)
        )
      )
      .limit(1);

    if (duplicate.length > 0) {
      return { ok: true };
    }

    await dependencies.db.insert(processedWebhooks).values({
      provider: "slack",
      externalId: parsed.data.event_id
    });

    const owner = await findOwnerUser(dependencies.db);
    const messageText =
      event.type === "app_mention"
        ? event.text.replace(/<@[A-Z0-9]+>\s*/g, "").trim()
        : event.text;

    if (!messageText) {
      return { ok: true };
    }

    const result = await dependencies.conversation.handleSlackMessage(
      owner.id,
      messageText
    );

    const explicitThreadTs = "thread_ts" in event ? event.thread_ts : undefined;
    const latestWorkoutThreadTs = isWorkoutMediaRequest(messageText)
      ? await findLatestDailyWorkoutThreadTs(dependencies.db, owner.id)
      : null;

    await new SlackClient(env.SLACK_BOT_TOKEN).postMessage({
      channel: event.channel,
      text: result.reply,
      threadTs: explicitThreadTs ?? latestWorkoutThreadTs
    });

    return { ok: true };
  });
}
