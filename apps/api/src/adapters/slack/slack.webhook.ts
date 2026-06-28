import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySlackRequest(input: {
  signingSecret: string;
  rawBody: string;
  timestamp: string | undefined;
  signature: string | undefined;
  now?: Date;
}): boolean {
  if (!input.timestamp || !input.signature) {
    return false;
  }

  const requestTime = Number(input.timestamp);
  if (!Number.isFinite(requestTime)) {
    return false;
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - requestTime) > 60 * 5) {
    return false;
  }

  const base = `v0:${input.timestamp}:${input.rawBody}`;
  const digest = createHmac("sha256", input.signingSecret)
    .update(base)
    .digest("hex");
  const expected = `v0=${digest}`;

  const actualBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
