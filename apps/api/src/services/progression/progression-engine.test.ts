import { describe, expect, it } from "vitest";
import { recommendProgression } from "./progression-engine.js";

const baseInput = {
  exerciseName: "Back Squat",
  category: "lower strength",
  currentWeight: 225,
  completedAllSets: true,
  missedReps: false,
  rpe: 7,
  painReported: false,
  skippedReason: null,
  repeatedSkipCount: 0
};

describe("recommendProgression", () => {
  it("adds load after successful lower-body work at RPE 7", () => {
    expect(recommendProgression(baseInput)).toMatchObject({
      action: "increase",
      recommendedWeight: 230
    });
  });

  it("holds load after missed reps", () => {
    expect(
      recommendProgression({ ...baseInput, missedReps: true })
    ).toMatchObject({
      action: "repeat",
      recommendedWeight: 225
    });
  });

  it("does not increase load when pain is reported", () => {
    expect(
      recommendProgression({ ...baseInput, painReported: true })
    ).toMatchObject({
      action: "modify",
      recommendedWeight: 225
    });
  });

  it("recommends replacement after repeated preference skips", () => {
    expect(
      recommendProgression({
        ...baseInput,
        completedAllSets: false,
        skippedReason: "I dislike this movement",
        repeatedSkipCount: 2
      })
    ).toMatchObject({
      action: "replace"
    });
  });
});
