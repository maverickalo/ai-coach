import { recommendProgression } from "../../services/progression/progression-engine.js";
import type { EvalScenario } from "../types.js";

export const progressionScenarios: EvalScenario[] = [
  {
    name: "completed RPE 7 work recommends a small increase",
    run: () => {
      const recommendation = recommendProgression({
        exerciseName: "Bench Press",
        category: "upper push",
        currentWeight: 205,
        completedAllSets: true,
        missedReps: false,
        rpe: 7,
        painReported: false,
        skippedReason: null,
        repeatedSkipCount: 0
      });

      return {
        reply: `${recommendation.action} ${recommendation.recommendedWeight}: ${recommendation.reason}`,
        actions: []
      };
    },
    expect: {
      replyIncludes: ["increase", "207.5", "RPE 7"],
      replyExcludes: ["max", "all-out"]
    }
  },
  {
    name: "pain blocks load increase",
    run: () => {
      const recommendation = recommendProgression({
        exerciseName: "Bench Press",
        category: "upper push",
        currentWeight: 205,
        completedAllSets: true,
        missedReps: false,
        rpe: 7,
        painReported: true,
        skippedReason: null,
        repeatedSkipCount: 0
      });

      return {
        reply: `${recommendation.action} ${recommendation.recommendedWeight}: ${recommendation.reason}`,
        actions: []
      };
    },
    expect: {
      replyIncludes: ["modify", "Do not increase"],
      replyExcludes: ["Add 2.5", "Add 5"]
    }
  }
];
