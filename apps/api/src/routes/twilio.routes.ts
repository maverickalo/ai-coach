import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createTwiMLResponse,
  validateTwilioWebhook
} from "../adapters/twilio/twilio.webhook.js";
import type { TwilioInboundBody } from "../adapters/twilio/twilio.types.js";
import { env } from "../env.js";
import type { ConversationEngine } from "../services/conversation/conversation-engine.js";

const inboundSchema = z
  .object({
    MessageSid: z.string().min(1),
    From: z.string().min(1),
    To: z.string().min(1),
    Body: z.string().trim().min(1).max(1600)
  })
  .passthrough();

export async function twilioRoutes(
  app: FastifyInstance,
  conversationEngine: ConversationEngine
) {
  app.post("/twilio/inbound", async (request, reply) => {
    const parsed = inboundSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid Twilio webhook body" });
    }

    const baseUrl = env.APP_BASE_URL ?? `${request.protocol}://${request.host}`;
    const webhookUrl = new URL(request.url, baseUrl).toString();
    const valid = validateTwilioWebhook({
      signature: request.headers["x-twilio-signature"] as string | undefined,
      url: webhookUrl,
      body: parsed.data as TwilioInboundBody
    });

    if (!valid) {
      return reply.code(403).send({ error: "Invalid Twilio signature" });
    }

    const result = await conversationEngine.handleInbound({
      messageSid: parsed.data.MessageSid,
      from: parsed.data.From,
      to: parsed.data.To,
      body: parsed.data.Body
    });

    return reply
      .type("application/xml")
      .send(createTwiMLResponse(result.reply));
  });
}
