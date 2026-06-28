import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import Fastify from "fastify";
import { TwilioMessagingProvider } from "./adapters/twilio/twilio.client.js";
import { getDatabase } from "./db/index.js";
import { env } from "./env.js";
import { devRoutes } from "./routes/dev.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { jobsRoutes } from "./routes/jobs.routes.js";
import { slackRoutes } from "./routes/slack.routes.js";
import { twilioRoutes } from "./routes/twilio.routes.js";
import { webRoutes } from "./routes/web.routes.js";
import { SupabaseAuthService } from "./services/auth/supabase-auth.js";
import { CoachContextBuilder } from "./services/coach/coach-context-builder.js";
import { CoachEngine } from "./services/coach/coach-engine.js";
import { ConversationEngine } from "./services/conversation/conversation-engine.js";
import { MemoryEngine } from "./services/memory/memory-engine.js";
import {
  MessagingService,
  type MessagingProvider
} from "./services/messaging/messaging-service.js";
import { OpenAiClient } from "./services/openai/openai.client.js";
import { DailyWorkoutJob } from "./services/scheduler/daily-workout-job.js";
import { WeeklyReviewJob } from "./services/scheduler/weekly-review-job.js";
import { WorkoutEngine } from "./services/workout/workout-engine.js";
import { WebPortalService } from "./services/web/web-portal-service.js";
import { loggerOptions } from "./utils/logger.js";

class UnconfiguredMessagingProvider implements MessagingProvider {
  async send(): Promise<never> {
    throw new Error("Messaging provider is not configured");
  }
}

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

  await app.register(async (scope) => twilioRoutes(scope, conversationEngine));
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

  const messagingProvider =
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    (env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_FROM_NUMBER)
      ? new TwilioMessagingProvider()
      : new UnconfiguredMessagingProvider();

  if (messagingProvider instanceof UnconfiguredMessagingProvider) {
    app.log.warn(
      "Twilio is not configured; scheduled SMS delivery is unavailable"
    );
  }

  const messaging = new MessagingService(messagingProvider);
  const dailyWorkout = new DailyWorkoutJob(
    database.db,
    workoutEngine,
    messaging
  );
  const weeklyReview = new WeeklyReviewJob(
    database.db,
    workoutEngine,
    openai,
    messaging
  );
  await app.register(async (scope) =>
    jobsRoutes(scope, { dailyWorkout, weeklyReview })
  );

  app.addHook("onClose", async () => {
    await database.close();
  });

  return app;
}
