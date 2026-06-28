import twilio from "twilio";
import { env } from "../../env.js";
import type {
  MessagingProvider,
  SendMessageInput,
  SentMessage
} from "../../services/messaging/messaging-service.js";

export class TwilioMessagingProvider implements MessagingProvider {
  private readonly client;

  constructor() {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      throw new Error("Twilio credentials are required to send SMS");
    }

    this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  async send(input: SendMessageInput): Promise<SentMessage> {
    const sender = env.TWILIO_MESSAGING_SERVICE_SID
      ? { messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID }
      : env.TWILIO_FROM_NUMBER
        ? { from: env.TWILIO_FROM_NUMBER }
        : null;

    if (!sender) {
      throw new Error(
        "TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER is required"
      );
    }

    const message = await this.client.messages.create({
      ...sender,
      to: input.to,
      body: input.body
    });

    return {
      externalId: message.sid,
      status: message.status
    };
  }
}
