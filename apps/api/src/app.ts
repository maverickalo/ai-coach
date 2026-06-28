import formbody from "@fastify/formbody";
import Fastify from "fastify";
import { TwilioMessagingProvider } from "./adapters/twilio/twilio.client.js";
import { getDatabase } from "./db/index.js";
import { env } from "./env.js";
import { devRoutes } from "./routes/dev.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { jobsRoutes } from "./routes/jobs.routes.js";
import { twilioRoutes } from "./routes/twilio.routes.js";
import { CoachContextBuilder } from "./services/coach/coach-context-builder.js";
import { CoachEngine } from "./services/coach/coach-engine.js";
import { ConversationEngine } from "./services/conversation/conversation-engine.js";
import { MemoryEngine } from "./services/memory/memory-engine.js";
import { MessagingService } from "./services/messaging/messaging-service.js";
import { OpenAiClient } from "./services/openai/openai.client.js";
import { DailyWorkoutJob } from "./services/scheduler/daily-workout-job.js";
import { WeeklyReviewJob } from "./services/scheduler/weekly-review-job.js";
import { WorkoutEngine } from "./services/workout/workout-engine.js";
import { loggerOptions } from "./utils/logger.js";

export async function buildApp() {
  const app = Fastify({ logger: loggerOptions });
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
  await app.register(async (scope) => devRoutes(scope, conversationEngine));

  if (
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    (env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_FROM_NUMBER)
  ) {
    const messaging = new MessagingService(new TwilioMessagingProvider());
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
  } else {
    app.log.warn("Twilio is not configured; scheduled SMS jobs are unavailable");
  }

  app.addHook("onClose", async () => {
    await database.close();
  });

  return app;
}
