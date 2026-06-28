import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySlackRequest } from "./slack.webhook.js";

describe("verifySlackRequest", () => {
  it("accepts a valid Slack signature", () => {
    const signingSecret = "secret";
    const rawBody = JSON.stringify({ type: "event_callback" });
    const timestamp = "1700000000";
    const signature = `v0=${createHmac("sha256", signingSecret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex")}`;

    expect(
      verifySlackRequest({
        signingSecret,
        rawBody,
        timestamp,
        signature,
        now: new Date(Number(timestamp) * 1000)
      })
    ).toBe(true);
  });

  it("rejects an invalid Slack signature", () => {
    expect(
      verifySlackRequest({
        signingSecret: "secret",
        rawBody: "{}",
        timestamp: "1700000000",
        signature: "v0=invalid",
        now: new Date(1700000000 * 1000)
      })
    ).toBe(false);
  });
});
