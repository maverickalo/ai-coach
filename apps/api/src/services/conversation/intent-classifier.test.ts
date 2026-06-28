import { describe, expect, it } from "vitest";
import { classifyDeterministicIntent } from "./intent-classifier.js";

describe("classifyDeterministicIntent", () => {
  it.each([
    ["START", "opt_in"],
    [" start ", "opt_in"],
    ["STOP", "opt_out"],
    ["unsubscribe", "opt_out"],
    ["HELP", "help"],
    ["info", "help"]
  ])("classifies %s as %s", (message, expected) => {
    expect(classifyDeterministicIntent(message)).toBe(expected);
  });

  it("returns null for conversational messages", () => {
    expect(classifyDeterministicIntent("Squat 225 5x8")).toBeNull();
  });
});
