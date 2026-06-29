export class EmailClient {
  constructor(private readonly apiKey: string) {}

  async send(input: { from: string; to: string; subject: string; text: string }) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        subject: input.subject,
        text: input.text
      })
    });

    const result = (await response.json()) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!response.ok) {
      throw new Error(result.message ?? result.name ?? "Failed to send email");
    }

    return {
      externalId: result.id ?? crypto.randomUUID(),
      status: "sent"
    };
  }
}
