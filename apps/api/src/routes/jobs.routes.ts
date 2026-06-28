import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../env.js";
import type {
  DailyWorkoutJob,
  OwnerLookup
} from "../services/scheduler/daily-workout-job.js";
import type { WeeklyReviewJob } from "../services/scheduler/weekly-review-job.js";

function isAuthorized(request: FastifyRequest): boolean {
  if (env.NODE_ENV !== "production") {
    return true;
  }

  return Boolean(
    env.INTERNAL_JOB_SECRET &&
      request.headers["x-job-secret"] === env.INTERNAL_JOB_SECRET
  );
}

function coachOwner(): OwnerLookup {
  return {
    ...(env.COACH_OWNER_PHONE_NUMBER
      ? { phoneNumber: env.COACH_OWNER_PHONE_NUMBER }
      : {}),
    ...(env.COACH_OWNER_EMAIL ? { email: env.COACH_OWNER_EMAIL } : {})
  };
}

export async function jobsRoutes(
  app: FastifyInstance,
  jobs: {
    dailyWorkout: DailyWorkoutJob;
    weeklyReview: WeeklyReviewJob;
  }
) {
  app.post("/jobs/send-daily-workout", async (request, reply) => {
    if (!isAuthorized(request)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    if (!env.COACH_OWNER_PHONE_NUMBER && !env.COACH_OWNER_EMAIL) {
      return reply.code(503).send({ error: "Coach owner is not configured" });
    }

    return jobs.dailyWorkout.run(coachOwner());
  });

  app.post("/jobs/send-weekly-review", async (request, reply) => {
    if (!isAuthorized(request)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    if (!env.COACH_OWNER_PHONE_NUMBER && !env.COACH_OWNER_EMAIL) {
      return reply.code(503).send({ error: "Coach owner is not configured" });
    }

    return jobs.weeklyReview.run(coachOwner());
  });
}
