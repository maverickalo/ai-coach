export interface SendMessageInput {
  to: string;
  body: string;
}

export interface SentMessage {
  externalId: string;
  status: string;
}

export interface MessagingProvider {
  send(input: SendMessageInput): Promise<SentMessage>;
}

export class MessagingService {
  constructor(private readonly provider: MessagingProvider) {}

  async send(input: SendMessageInput): Promise<SentMessage> {
    if (input.body.length > 1600) {
      throw new Error("SMS body exceeds 1600 characters");
    }

    return this.provider.send(input);
  }
}
