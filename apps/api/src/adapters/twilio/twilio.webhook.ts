import twilio from "twilio";
import { env } from "../../env.js";
import type { TwilioInboundBody } from "./twilio.types.js";

export function validateTwilioWebhook(input: {
  signature: string | undefined;
  url: string;
  body: TwilioInboundBody;
}): boolean {
  if (env.NODE_ENV !== "production") {
    return true;
  }

  if (!env.TWILIO_AUTH_TOKEN || !input.signature) {
    return false;
  }

  return twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    input.signature,
    input.url,
    input.body
  );
}

export function createTwiMLResponse(message: string): string {
  const response = new twilio.twiml.MessagingResponse();
  response.message(message);
  return response.toString();
}
