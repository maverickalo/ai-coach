export interface ProgressionInput {
  exerciseName: string;
  category: string | null;
  currentWeight: number | null;
  completedAllSets: boolean;
  missedReps: boolean;
  rpe: number | null;
  painReported: boolean;
  skippedReason: string | null;
  repeatedSkipCount: number;
}

export interface ProgressionRecommendation {
  action: "increase" | "repeat" | "modify" | "replace" | "reorder";
  recommendedWeight: number | null;
  reason: string;
}

function isLowerBodyBarbellLift(name: string): boolean {
  return /squat|deadlift|barbell reverse lunge/i.test(name);
}

function isUpperBodyBarbellLift(name: string): boolean {
  return /bench press|overhead press|barbell row/i.test(name);
}

function isDumbbellLift(name: string): boolean {
  return /dumbbell/i.test(name);
}

export function recommendProgression(
  input: ProgressionInput
): ProgressionRecommendation {
  if (input.painReported) {
    return {
      action: "modify",
      recommendedWeight: input.currentWeight,
      reason:
        "Do not increase load because pain was reported. Reduce range or use a pain-free substitution and confirm pain severity from 1-10."
    };
  }

  const skipReason = input.skippedReason?.toLowerCase() ?? "";
  if (skipReason.includes("time")) {
    return {
      action: "reorder",
      recommendedWeight: input.currentWeight,
      reason:
        "Move this exercise earlier next time because it was skipped due to time."
    };
  }

  if (
    skipReason.includes("dislike") ||
    skipReason.includes("hate") ||
    skipReason.includes("motivation")
  ) {
    return {
      action: input.repeatedSkipCount >= 2 ? "replace" : "modify",
      recommendedWeight: input.currentWeight,
      reason:
        input.repeatedSkipCount >= 2
          ? "Offer a permanent replacement because the exercise was skipped for the same preference twice."
          : "Offer fewer sets, an alternative, or an earlier slot because the exercise was skipped due to preference."
    };
  }

  if (input.missedReps || !input.completedAllSets) {
    return {
      action: "repeat",
      recommendedWeight: input.currentWeight,
      reason: "Repeat the same weight because the prescribed work was not fully completed."
    };
  }

  if (input.rpe === 8) {
    return {
      action: "repeat",
      recommendedWeight: input.currentWeight,
      reason: "Repeat the same weight because the completed work was already RPE 8."
    };
  }

  if (input.rpe !== null && input.rpe <= 7 && input.currentWeight !== null) {
    if (isLowerBodyBarbellLift(input.exerciseName)) {
      return {
        action: "increase",
        recommendedWeight: input.currentWeight + 5,
        reason:
          "Add 5 lb because all prescribed work was completed at RPE 7 or below."
      };
    }

    if (
      isUpperBodyBarbellLift(input.exerciseName) ||
      isDumbbellLift(input.exerciseName)
    ) {
      return {
        action: "increase",
        recommendedWeight: input.currentWeight + 2.5,
        reason:
          "Add 2.5 lb because all prescribed work was completed at RPE 7 or below."
      };
    }

    return {
      action: "increase",
      recommendedWeight: input.currentWeight,
      reason:
        "Increase reps before load because this is an accessory movement completed at RPE 7 or below."
    };
  }

  return {
    action: "repeat",
    recommendedWeight: input.currentWeight,
    reason: "Repeat the current prescription until completion and effort are clear."
  };
}
