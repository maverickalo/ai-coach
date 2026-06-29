import type { ConditioningRecommendation } from "../../types/domain.js";

export interface RecentTrainingSignal {
  date: string;
  workoutName: string;
  focus: string | null;
  status: string;
  exerciseNames: string[];
  painReported: boolean;
}

function includesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function recommendConditioning(
  recentTraining: RecentTrainingSignal[]
): ConditioningRecommendation {
  const recentText = recentTraining
    .map((item) =>
      [item.workoutName, item.focus, ...item.exerciseNames].join(" ")
    )
    .join(" ")
    .toLowerCase();
  const yesterday = recentTraining[0];
  const yesterdayText = yesterday
    ? [yesterday.workoutName, yesterday.focus, ...yesterday.exerciseNames]
        .join(" ")
        .toLowerCase()
    : "";
  const lowerBodyYesterday = includesAny(yesterdayText, [
    /squat/,
    /lunge/,
    /deadlift/,
    /step-up/,
    /box jump/,
    /wall ball/
  ]);
  const recentPain = recentTraining.some((item) => item.painReported);
  const recentRunCount = (recentText.match(/\brun|treadmill|running\b/g) ?? [])
    .length;

  if (recentPain) {
    return {
      mode: "bike",
      sessionShape: "short",
      prescription:
        "Keep conditioning low impact today: Assault Bike or rower intervals at conversational to moderate effort. Avoid hard running until pain details are clear.",
      reason:
        "Recent pain was reported, so the safest conditioning choice is lower impact while still building HYROX engine.",
      caution: "If pain is sharp, worsening, or changes your stride, skip conditioning and get it checked."
    };
  }

  if (lowerBodyYesterday) {
    return {
      mode: "row",
      sessionShape: "standard",
      prescription:
        "Use rower or Assault Bike intervals between strength blocks instead of extra treadmill volume today.",
      reason:
        "Yesterday had lower-body stress, so this keeps conditioning high without stacking more impact on legs.",
      caution: "Keep running easy or skip it if knees, calves, hips, or feet feel beat up."
    };
  }

  if (recentRunCount < 2) {
    return {
      mode: "run",
      sessionShape: "hyrox_bias",
      prescription:
        "Sprinkle running into the workout: use controlled treadmill segments between strength stations, then finish with steady aerobic running if you still feel good.",
      reason:
        "HYROX is run-heavy, and this week does not show much running yet.",
      caution: "Keep the pace controlled; this is race-specific conditioning, not an all-out run test."
    };
  }

  return {
    mode: "hyrox_circuit",
    sessionShape: "hyrox_bias",
    prescription:
      "Make this more HYROX-specific by pairing strength movements with moderate run, row, or bike segments between stations.",
    reason:
      "You already have some run exposure this week, so mixed compromised conditioning is the best next layer.",
    caution: "If form drops or impact starts to bother joints, switch the run pieces to rower or bike."
  };
}
