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

  app.get("/workouts", async (request) => {
    const user = await authenticatedUser(request, dependencies.auth);
    return dependencies.portal.getWorkouts(user.id);
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
