import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import Fastify from "fastify";
import { EmailClient } from "./adapters/email/email.client.js";
import { SlackClient } from "./adapters/slack/slack.client.js";
import { getDatabase } from "./db/index.js";
import { env } from "./env.js";
import { devRoutes } from "./routes/dev.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { jobsRoutes } from "./routes/jobs.routes.js";
import { slackRoutes } from "./routes/slack.routes.js";
import { webRoutes } from "./routes/web.routes.js";
import { SupabaseAuthService } from "./services/auth/supabase-auth.js";
import { CoachContextBuilder } from "./services/coach/coach-context-builder.js";
import { CoachEngine } from "./services/coach/coach-engine.js";
import { ConversationEngine } from "./services/conversation/conversation-engine.js";
import { MemoryEngine } from "./services/memory/memory-engine.js";
import { OpenAiClient } from "./services/openai/openai.client.js";
import { DailyReminderScheduler } from "./services/scheduler/daily-reminder-scheduler.js";
import { DailyWorkoutJob } from "./services/scheduler/daily-workout-job.js";
import { WeeklyReviewJob } from "./services/scheduler/weekly-review-job.js";
import { WorkoutCheckInScheduler } from "./services/scheduler/workout-check-in-scheduler.js";
import { WorkoutEngine } from "./services/workout/workout-engine.js";
import { WebPortalService } from "./services/web/web-portal-service.js";
import { loggerOptions } from "./utils/logger.js";

export async function buildApp() {
  const app = Fastify({ logger: loggerOptions });
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      const rawBody = body.toString("utf8");
      (request as typeof request & { rawBody: string }).rawBody = rawBody;
      try {
        done(null, rawBody ? JSON.parse(rawBody) : {});
      } catch (error) {
        done(error instanceof Error ? error : new Error("Invalid JSON"));
      }
    }
  );

  await app.register(cors, {
    origin: env.WEB_APP_URL,
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type"]
  });
  await app.register(formbody);
  await app.register(healthRoutes);

  if (!env.DATABASE_URL) {
    app.log.warn(
      "DATABASE_URL is not configured; only the health endpoint is available"
    );
    return app;
  }

  const database = getDatabase();
  const workoutEngine = new WorkoutEngine(database.db);
  const memoryEngine = new MemoryEngine(database.db);
  const openai = new OpenAiClient();
  const contextBuilder = new CoachContextBuilder(
    database.db,
    workoutEngine,
    memoryEngine
  );
  const coachEngine = new CoachEngine(openai);
  const conversationEngine = new ConversationEngine(
    database.db,
    contextBuilder,
    coachEngine,
    workoutEngine,
    memoryEngine,
    openai
  );

  await app.register(async (scope) =>
    slackRoutes(scope, {
      db: database.db,
      conversation: conversationEngine
    })
  );
  await app.register(async (scope) => devRoutes(scope, conversationEngine));

  if (env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) {
    const auth = new SupabaseAuthService(database.db);
    const portal = new WebPortalService(database.db, workoutEngine);
    await app.register(async (scope) =>
      webRoutes(scope, {
        auth,
        portal,
        conversation: conversationEngine
      })
    );
  } else {
    app.log.warn(
      "Supabase Auth is not configured; authenticated web routes are unavailable"
    );
  }

  const slackDelivery =
    env.SLACK_BOT_TOKEN && env.SLACK_CHANNEL_ID
      ? {
          client: new SlackClient(env.SLACK_BOT_TOKEN),
          channelId: env.SLACK_CHANNEL_ID,
          ...(env.SLACK_ALLOWED_USER_ID
            ? { mentionUserId: env.SLACK_ALLOWED_USER_ID }
            : {})
        }
      : undefined;

  const delivery = {
    ...(slackDelivery ? { slack: slackDelivery } : {}),
    ...(env.RESEND_API_KEY && env.REMINDER_EMAIL_FROM && env.REMINDER_EMAIL_TO
      ? {
          email: {
            client: new EmailClient(env.RESEND_API_KEY),
            from: env.REMINDER_EMAIL_FROM,
            to: env.REMINDER_EMAIL_TO
          }
        }
      : {})
  };

  const dailyWorkout = new DailyWorkoutJob(
    database.db,
    workoutEngine,
    delivery
  );
  const weeklyReview = new WeeklyReviewJob(
    database.db,
    workoutEngine,
    openai,
    delivery
  );
  await app.register(async (scope) =>
    jobsRoutes(scope, { dailyWorkout, weeklyReview })
  );

  const owner = {
    ...(env.COACH_OWNER_PHONE_NUMBER
      ? { phoneNumber: env.COACH_OWNER_PHONE_NUMBER }
      : {}),
    ...(env.COACH_OWNER_EMAIL ? { email: env.COACH_OWNER_EMAIL } : {})
  };
  const hasOwner = Boolean(owner.phoneNumber || owner.email);
  const hasDelivery = Boolean(delivery.slack || delivery.email);
  const dailyReminderScheduler =
    env.NODE_ENV === "production" && hasOwner && hasDelivery
      ? new DailyReminderScheduler(dailyWorkout, {
          owner,
          timezone: env.COACH_TIMEZONE,
          sendTime: env.DAILY_WORKOUT_SEND_TIME,
          logger: app.log
        })
      : null;
  const workoutCheckInScheduler =
    env.NODE_ENV === "production" && slackDelivery
      ? new WorkoutCheckInScheduler(database.db, workoutEngine, slackDelivery, {
          intervalMinutes: env.WORKOUT_CHECK_IN_INTERVAL_MINUTES,
          logger: app.log
        })
      : null;

  dailyReminderScheduler?.start();
  workoutCheckInScheduler?.start();

  app.addHook("onClose", async () => {
    dailyReminderScheduler?.stop();
    workoutCheckInScheduler?.stop();
    await database.close();
  });

  return app;
}
