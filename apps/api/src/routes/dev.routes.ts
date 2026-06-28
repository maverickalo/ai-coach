import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import type { ConversationEngine } from "../services/conversation/conversation-engine.js";

const simulateSchema = z.object({
  phoneNumber: z.string().min(8),
  message: z.string().trim().min(1).max(1600)
});

export async function devRoutes(
  app: FastifyInstance,
  conversationEngine: ConversationEngine
) {
  if (env.NODE_ENV === "production") {
    return;
  }

  app.post("/dev/simulate-message", async (request, reply) => {
    const parsed = simulateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid request",
        details: parsed.error.flatten()
      });
    }

    return conversationEngine.simulate(
      parsed.data.phoneNumber,
      parsed.data.message
    );
  });
}
