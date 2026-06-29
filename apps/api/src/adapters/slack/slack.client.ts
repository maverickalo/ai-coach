export interface SlackMessageResult {
  externalId: string;
  status: string;
}

export class SlackClient {
  constructor(private readonly botToken: string) {}

  async postMessage(input: {
    channel: string;
    text: string;
    threadTs?: string | null;
  }): Promise<SlackMessageResult> {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.botToken}`,
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        channel: input.channel,
        text: input.text,
        thread_ts: input.threadTs ?? undefined
      })
    });

    const result = (await response.json()) as {
      ok?: boolean;
      error?: string;
      ts?: string;
    };
    if (!response.ok || !result.ok) {
      throw new Error(result.error ?? "Failed to post Slack message");
    }

    return {
      externalId: result.ts ?? crypto.randomUUID(),
      status: "sent"
    };
  }
}
