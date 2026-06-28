import { describe, expect, it } from "vitest";
import { dateInTimeZone, dayOfWeekInTimeZone } from "./dates.js";

describe("timezone workout day selection", () => {
  it("uses the user's local date near a UTC boundary", () => {
    const instant = new Date("2026-06-28T02:00:00.000Z");
    expect(dateInTimeZone(instant, "America/Los_Angeles")).toBe("2026-06-27");
    expect(dayOfWeekInTimeZone(instant, "America/Los_Angeles")).toBe(6);
  });
});
