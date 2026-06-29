import { describe, expect, it } from "vitest";
import { getRequestedSessionShape } from "./conversation-engine.js";

describe("conversation behavior evals", () => {
  it("routes exploratory cardio prompts to the optional HYROX/cardio add-on path", () => {
    expect(getRequestedSessionShape("what would cardio look like if we added it")).toBe(
      "hyrox"
    );
  });
});
