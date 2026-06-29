import type { CurrentWorkout } from "../../types/domain.js";

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
