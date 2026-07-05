import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  AuthenticationError,
  type AuthenticatedUser,
  type SupabaseAuthService
} from "../services/auth/supabase-auth.js";
import type { ConversationEngine } from "../services/conversation/conversation-engine.js";
import type { WebPortalService } from "../services/web/web-portal-service.js";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(4000)
});

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  timezone: z.string().trim().min(1).max(100),
  phoneNumber: z
    .string()
    .trim()
    .max(30)
    .transform((value) => value || null),
  primaryGoal: z.string().trim().max(1000),
  equipmentNotes: z.string().trim().max(4000),
  injuryNotes: z.string().trim().max(4000)
});

const exerciseLogSchema = z.object({
  exerciseId: z.uuid(),
  status: z.enum(["completed", "partial", "skipped"]),
  sets: z.number().int().min(0).max(20).nullable(),
  reps: z.string().trim().max(40).nullable(),
  weight: z.number().min(0).max(2000).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  skippedReason: z.string().trim().max(300).nullable(),
  notes: z.string().trim().max(1000).nullable()
});

const progressQuerySchema = z.object({
  q: z.string().trim().max(200).optional()
});

const quickCoachSchema = z.object({
  action: z.enum([
    "swap",
    "pain",
    "explain",
    "session",
    "hyrox",
    "shorten",
    "freeform"
  ]),
  workoutId: z.uuid().nullable(),
  exerciseId: z.uuid().nullable(),
  message: z.string().trim().max(1000).nullable()
});

async function authenticatedUser(
  request: FastifyRequest,
  auth: SupabaseAuthService
): Promise<AuthenticatedUser> {
  try {
    return await auth.authenticate(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw Object.assign(error, { statusCode: 401 });
    }
    throw error;
  }
}

export async function webRoutes(
  app: FastifyInstance,
  dependencies: {
    auth: SupabaseAuthService;
    portal: WebPortalService;
    conversation: ConversationEngine;
  }
) {
  app.get("/today", async (request) => {
    const user = await authenticatedUser(request, dependencies.auth);
    return dependencies.portal.getToday(user.id);
  });

  app.get("/dashboard", async (request) => {
    const user = await authenticatedUser(request, dependencies.auth);
    return dependencies.portal.getDashboard(user.id);
  });

  app.get("/messages", async (request) => {
    const user = await authenticatedUser(request, dependencies.auth);
    return dependencies.portal.getMessages(user.id);
  });

  app.post("/chat", async (request, reply) => {
    const user = await authenticatedUser(request, dependencies.auth);
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Message is required" });
    }

    const result = await dependencies.conversation.handleWebMessage(
      user.id,
      parsed.data.message
    );
    return { reply: result.reply };
  });

  app.post("/quick-coach", async (request, reply) => {
    const user = await authenticatedUser(request, dependencies.auth);
    const parsed = quickCoachSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid quick coach request",
        details: parsed.error.flatten()
      });
    }

    return dependencies.portal.quickCoach(user.id, parsed.data);
  });

  app.post("/workouts/:workoutId/exercise-logs", async (request, reply) => {
    const user = await authenticatedUser(request, dependencies.auth);
    const params = z.object({ workoutId: z.uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid workout" });
    }

    const parsed = exerciseLogSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid exercise log",
        details: parsed.error.flatten()
      });
    }

    return dependencies.portal.logExercise(
      user.id,
      params.data.workoutId,
      parsed.data
    );
  });

  app.get("/workouts", async (request) => {
    const user = await authenticatedUser(request, dependencies.auth);
    return dependencies.portal.getWorkouts(user.id);
  });

  app.get("/progress", async (request, reply) => {
    const user = await authenticatedUser(request, dependencies.auth);
    const parsed = progressQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid progress query" });
    }

    return dependencies.portal.getProgress(user.id, parsed.data.q ?? "");
  });

  app.get("/profile", async (request) => {
    const user = await authenticatedUser(request, dependencies.auth);
    return dependencies.portal.getProfile(user.id);
  });

  app.put("/profile", async (request, reply) => {
    const user = await authenticatedUser(request, dependencies.auth);
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid profile",
        details: parsed.error.flatten()
      });
    }

    return dependencies.portal.updateProfile(user.id, parsed.data);
  });
}
