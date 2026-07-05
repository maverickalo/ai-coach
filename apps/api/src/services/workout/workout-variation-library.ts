import type { CurrentWorkout, PrescribedExercise } from "../../types/domain.js";
import { exerciseResource } from "./exercise-resources.js";

interface WorkoutVariation {
  name: string;
  category: "strength" | "hyrox" | "conditioning" | "mobility" | "core";
  bestFor: string[];
  equipment: string[];
  prescription: string;
}

const variations: WorkoutVariation[] = [
  {
    name: "Rack Strength Back-Off",
    category: "strength",
    bestFor: ["lower", "full body", "strength"],
    equipment: ["Rep Aries rack", "barbell"],
    prescription: "After the main lift: 2-3 back-off sets at 80-85% of today's top working weight."
  },
  {
    name: "Dumbbell Density",
    category: "strength",
    bestFor: ["push", "upper", "hypertrophy"],
    equipment: ["dumbbells", "bench"],
    prescription: "10 min density block: incline DB press, DB row, lateral raise. Rotate smooth sets, stop 2 reps shy of failure."
  },
  {
    name: "Cable Pump",
    category: "strength",
    bestFor: ["push", "pull", "upper"],
    equipment: ["cable system"],
    prescription: "3 rounds: cable row x15, cable fly x15, rope pushdown x20, face pull x20."
  },
  {
    name: "Landmine Legs",
    category: "strength",
    bestFor: ["lower", "full body"],
    equipment: ["landmine"],
    prescription: "3 rounds: landmine squat x15, landmine RDL x12, landmine reverse lunge x10/leg."
  },
  {
    name: "TRX Upper Volume",
    category: "strength",
    bestFor: ["pull", "upper", "recovery"],
    equipment: ["TRX"],
    prescription: "4 rounds: TRX row x15-20, TRX W x12, TRX fallout x10, controlled tempo."
  },
  {
    name: "Sled Strength Finisher",
    category: "hyrox",
    bestFor: ["lower", "full body", "hyrox"],
    equipment: ["sled"],
    prescription: "6-10 pushes of 20-30m. Heavy but smooth. Full walk-back recovery."
  },
  {
    name: "Rower Compromised Legs",
    category: "hyrox",
    bestFor: ["lower", "hyrox", "low impact"],
    equipment: ["rower", "dumbbells"],
    prescription: "4 rounds: row 500m moderate, goblet squat x15, farmer carry 40-60m."
  },
  {
    name: "Assault Bike Low Impact",
    category: "conditioning",
    bestFor: ["pain", "recovery", "low impact"],
    equipment: ["Assault Bike"],
    prescription: "12-20 min Zone 2, or 8 rounds of 30 sec moderate / 60 sec easy."
  },
  {
    name: "Treadmill HYROX Run",
    category: "hyrox",
    bestFor: ["hyrox", "run", "upper"],
    equipment: ["treadmill"],
    prescription: "After lifting: 4-6 x 400m controlled run with 90 sec walk. Keep it conversational-hard, not a race."
  },
  {
    name: "Outdoor Run Add-On",
    category: "conditioning",
    bestFor: ["hyrox", "run", "aerobic"],
    equipment: ["outdoor running routes"],
    prescription: "20-35 min easy Zone 2 run. Skip if lower body pain or stride changes."
  },
  {
    name: "Wall Ball Engine",
    category: "hyrox",
    bestFor: ["full body", "hyrox"],
    equipment: ["wall ball"],
    prescription: "5 rounds: wall ball x20, easy row or bike 2 min, rest 60 sec."
  },
  {
    name: "Slam Ball Power",
    category: "hyrox",
    bestFor: ["full body", "conditioning"],
    equipment: ["slam ball"],
    prescription: "6 rounds: slam ball x15, push-up x10, walk 60 sec."
  },
  {
    name: "Battle Rope Flush",
    category: "conditioning",
    bestFor: ["upper", "conditioning"],
    equipment: ["battle ropes"],
    prescription: "8-10 rounds: ropes 30 sec, easy walk 60 sec. Keep shoulders relaxed."
  },
  {
    name: "Box Power",
    category: "strength",
    bestFor: ["lower", "power"],
    equipment: ["box"],
    prescription: "5 rounds: box jump x5, step-up x10/leg, calf raise x20."
  },
  {
    name: "Carry Grip Builder",
    category: "hyrox",
    bestFor: ["pull", "full body", "hyrox"],
    equipment: ["dumbbells"],
    prescription: "5 rounds: farmer carry 60m, DB row x12/side, rest 60-90 sec."
  },
  {
    name: "Core Anti-Rotation",
    category: "core",
    bestFor: ["core", "recovery"],
    equipment: ["cable system"],
    prescription: "3 rounds: Pallof press x15/side, cable crunch x20, dead bug x10/side."
  },
  {
    name: "Ab Roller Core",
    category: "core",
    bestFor: ["core", "full body"],
    equipment: ["ab roller", "ab mat"],
    prescription: "4 rounds: ab roller x8-12, ab mat sit-up x20, side plank 30 sec/side."
  },
  {
    name: "Mobility Reset",
    category: "mobility",
    bestFor: ["recovery", "pain", "busy day"],
    equipment: ["foam roller"],
    prescription: "10-15 min: hips, hamstrings, calves, T-spine, easy walk. No intensity."
  }
];

function workoutTags(workout: CurrentWorkout): string[] {
  return [workout.name, workout.focus ?? ""].join(" ").toLowerCase().split(/\W+/);
}

export function getWorkoutVariations(workout: CurrentWorkout, limit = 10): WorkoutVariation[] {
  const tags = new Set(workoutTags(workout));
  const scored = variations.map((variation) => ({
    variation,
    score: variation.bestFor.filter((tag) => tags.has(tag)).length
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.variation);
}

export function buildWorkoutVariationMessage(workout: CurrentWorkout): string {
  const options = getWorkoutVariations(workout, 12);
  return [
    `🧩 *Optional workout combinations for ${workout.name}*`,
    "These do not replace today's strength plan. Pick one only if you want extra work.",
    ...options.map(
      (option, index) =>
        `${index + 1}. *${option.name}* (${option.category})\n   Equipment: ${option.equipment.join(", ")}\n   ${option.prescription}`
    )
  ].join("\n\n");
}

function hasAny(input: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(input));
}

function targetMuscles(workout: CurrentWorkout): string[] {
  const muscles = new Set<string>();
  for (const item of workout.exercises) {
    for (const muscle of item.exercise.primaryMuscles ?? []) {
      muscles.add(muscle);
    }
  }

  if (muscles.size > 0) {
    return Array.from(muscles);
  }

  const focus = workout.focus?.toLowerCase() ?? "";
  if (focus.includes("push")) {
    return ["chest", "shoulders", "triceps"];
  }
  return ["the target muscles for today"];
}

function excludedExercises(body: string): string[] {
  const exclusions = [
    ["Overhead Rope Extension", /\boverhead rope extension\b/i],
    ["Triceps Pushdown", /\b(triceps?|cable)\s+pushdowns?\b/i],
    ["Close-Grip Bench Press", /\bclose[- ]grip bench\b/i],
    ["Weighted Dips", /\bweighted dips?\b/i],
    ["Cable Skull Crushers", /\bcable skull crushers?\b/i],
    ["Dumbbell Floor Press", /\bdumbbell floor press\b/i]
  ];

  return exclusions
    .filter(([, pattern]) => pattern instanceof RegExp && pattern.test(body))
    .map(([name]) => name as string);
}

function wantsNoHyrox(body: string): boolean {
  return /\bno\s+hyrox\b|\bnot\s+hyrox\b|\bjust\s+strength\b|\bstrength\s+only\b/i.test(
    body
  );
}

function wantsLongSession(body: string): boolean {
  return /\b2\s*hour\b|\btwo\s*hour\b|\blong\b|\blonger\b/i.test(body);
}

export function isScopedWorkoutModificationRequest(body: string): boolean {
  const normalized = body.toLowerCase();
  const asksForModification = hasAny(normalized, [
    /\bswap\b/,
    /\breplace\b/,
    /\bdon'?t want\b/,
    /\bfind something else\b/,
    /\binstead of\b/,
    /\boptions instead of\b/,
    /\btighten this into\b/
  ]);
  const asksForTargetedStrength = hasAny(normalized, [
    /\bmore strength\b/,
    /\bjust strength\b/,
    /\bstrength only\b/,
    /\baround the muscles\b/,
    /\btargeting?\b/,
    /\b2\s*hour\b/,
    /\btwo\s*hour\b/
  ]);

  return asksForModification && asksForTargetedStrength;
}

export function buildScopedWorkoutModificationMessage(
  body: string,
  workout: CurrentWorkout
): string {
  const exclusions = excludedExercises(body);
  const noHyrox = wantsNoHyrox(body);
  const longSession = wantsLongSession(body);
  const muscles = targetMuscles(workout);
  const mainExercises = workout.exercises
    .filter((item) => item.notes !== "Warm-up")
    .map((item) => item.exercise.name);
  const availableOptions = [
    "Close-Grip Bench Press",
    "Paused Bench Press",
    "Incline Dumbbell Close-Grip Press",
    "Dumbbell Skull Crusher",
    "Tate Press",
    "Landmine Press",
    "Neutral-Grip Dumbbell Press",
    "Cable Cross-Body Triceps Extension",
    "Cable Overhead Triceps Extension with handle",
    "Push-Up close-grip finisher"
  ].filter((option) => !exclusions.includes(option));

  const recommendedPair = availableOptions.slice(0, 2);
  const volume = longSession
    ? [
        "*2-hour strength expansion*",
        "1. Add 1-2 heavier back-off sets after Bench Press.",
        "2. Add one chest/triceps strength slot and one shoulder/triceps strength slot.",
        "3. Keep rest longer on heavy sets, then use controlled accessory volume."
      ].join("\n")
    : [
        "*Standard strength expansion*",
        "Add one replacement lift and one accessory slot. Keep the original Push structure intact."
      ].join("\n");

  return [
    `Got it — scoped edit for *${workout.name}*.`,
    noHyrox ? "*No HYROX/cardio.* Strength only." : "*Strength stays primary.*",
    `*Targets today:* ${muscles.join(", ")}.`,
    `*Keep as the base:* ${mainExercises.join(", ")}.`,
    exclusions.length
      ? `*Remove / avoid:* ${exclusions.join(", ")}.`
      : null,
    volume,
    "*Replacement options from your equipment*",
    "Heavy chest/triceps:",
    `• ${availableOptions[0] ?? "Close-Grip Bench Press"} — 4x6-8`,
    `• ${availableOptions[1] ?? "Paused Bench Press"} — 4x6-8`,
    "Shoulder-friendly press:",
    `• ${availableOptions[5] ?? "Landmine Press"} — 4x8-10/side`,
    `• ${availableOptions[6] ?? "Neutral-Grip Dumbbell Press"} — 4x8-10`,
    "Triceps accessory:",
    `• ${availableOptions[3] ?? "Dumbbell Skull Crusher"} — 4x10-12`,
    `• ${availableOptions[4] ?? "Tate Press"} — 3-4x10-12`,
    `*My pick:* ${recommendedPair.join(" + ")}.`,
    "Reply with the pair you want and I’ll treat those as today’s replacements."
  ]
    .filter(Boolean)
    .join("\n");
}

function replacementExercise(
  name: string,
  sortOrder: number,
  sets: number,
  reps: string,
  equipment: string[],
  muscles: string[]
): PrescribedExercise {
  const resource = exerciseResource(name);
  return {
    templateExerciseId: `modified-${name.toLowerCase().replace(/\W+/g, "-")}`,
    sortOrder,
    prescribedSets: sets,
    prescribedReps: reps,
    prescribedWeight: null,
    notes: null,
    exercise: {
      id: `modified-${name.toLowerCase().replace(/\W+/g, "-")}`,
      name,
      category: "upper push",
      primaryMuscles: muscles,
      equipment,
      instructions: resource.setup,
      commonSubstitutions: [],
      demoUrl: resource.demoUrl,
      gifUrl: resource.gifUrl,
      gifSearchUrl: resource.gifSearchUrl,
      demoLabel: resource.demoLabel,
      gifLabel: resource.gifLabel,
      demoIsExact: resource.demoIsExact,
      gifIsExact: resource.gifIsExact,
      purpose: resource.purpose,
      setup: resource.setup,
      cues: resource.cues,
      commonMistakes: resource.commonMistakes
    }
  };
}

export function buildModifiedStrengthWorkout(workout: CurrentWorkout): CurrentWorkout {
  const baseExercises = workout.exercises
    .filter(
      (item) =>
        !/\b(triceps? pushdown|overhead rope extension)\b/i.test(
          item.exercise.name
        )
    )
    .map((item, index) => ({ ...item, sortOrder: index + 1 }));

  const replacements = [
    replacementExercise(
      "Close-Grip Bench Press",
      baseExercises.length + 1,
      4,
      "6-8",
      ["barbell", "bench", "rack"],
      ["chest", "triceps", "shoulders"]
    ),
    replacementExercise(
      "Landmine Press",
      baseExercises.length + 2,
      4,
      "8-10/side",
      ["landmine", "barbell"],
      ["shoulders", "triceps", "chest"]
    ),
    replacementExercise(
      "Dumbbell Skull Crusher",
      baseExercises.length + 3,
      4,
      "10-12",
      ["dumbbells", "bench"],
      ["triceps"]
    )
  ];

  return {
    ...workout,
    name: `${workout.name} — 2-Hour Strength`,
    focus: "Chest, shoulders, and triceps strength. No HYROX/cardio.",
    estimatedMinutes: 120,
    status: "scheduled",
    exercises: [...baseExercises, ...replacements],
    conditioning: null
  };
}
