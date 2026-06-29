import { and, eq } from "drizzle-orm";
import { env } from "../env.js";
import { defineWorkoutPlanSeed } from "../services/workout/workout-plan.seed.js";
import { createDatabase } from "./index.js";
import {
  equipment,
  exercises,
  memories,
  userProfiles,
  users,
  workoutPlans,
  workoutTemplateExercises,
  workoutTemplates
} from "./schema.js";

interface ExerciseSeed {
  name: string;
  category: string;
  muscles: string[];
  equipment: string[];
  instructions: string;
  substitutions?: string[];
}

const equipmentSeed = [
  ["Rep Aries rack", "rack", "Rack with integrated cable system"],
  ["Dumbbells 1-50 lb and 70 lb", "free weights", null],
  ["Barbell and plates", "free weights", null],
  ["Landmine", "free weights", null],
  ["Slam balls", "conditioning", null],
  ["Wall balls", "conditioning", null],
  ["Ab roller", "core", null],
  ["Treadmill", "cardio", null],
  ["Assault Bike", "cardio", null],
  ["Rower", "cardio", null],
  ["Plyo box", "conditioning", null],
  ["Jump rope", "cardio", null],
  ["Cable system", "machine", "Integrated with Rep Aries rack"],
  ["Pull-up bar", "bodyweight", null],
  ["TRX", "bodyweight", "Suspension trainer"],
  ["Sled", "conditioning", "Sled push and pull work"],
  ["Battle ropes", "conditioning", "Battle rope intervals"],
  ["Outdoor running routes", "cardio", "Local outdoor running access"],
  ["Foam roller", "recovery", null],
  ["Ab mat", "core", null],
  ["Bench", "free weights", null]
] as const;

const exerciseSeed: ExerciseSeed[] = [
  {
    name: "Back Squat",
    category: "lower strength",
    muscles: ["quadriceps", "glutes", "hamstrings"],
    equipment: ["barbell", "rack"],
    instructions: "Brace, sit between the hips, keep the bar over mid-foot, and drive up.",
    substitutions: ["Front Squat", "Landmine Squat", "Goblet Squat"]
  },
  {
    name: "Romanian Deadlift",
    category: "hinge",
    muscles: ["hamstrings", "glutes", "back"],
    equipment: ["barbell"],
    instructions: "Push the hips back with soft knees and keep the bar close to the legs.",
    substitutions: ["Single-Leg RDL", "Dumbbell Romanian Deadlift"]
  },
  {
    name: "Reverse Lunge",
    category: "lower unilateral",
    muscles: ["quadriceps", "glutes"],
    equipment: ["barbell", "dumbbells"],
    instructions: "Step back under control, lower the rear knee, and drive through the front foot.",
    substitutions: ["Walking Lunge", "Box Step-Up"]
  },
  {
    name: "Box Step-Up",
    category: "lower unilateral",
    muscles: ["quadriceps", "glutes"],
    equipment: ["box", "dumbbells"],
    instructions: "Plant the full foot on the box and stand by driving through the working leg.",
    substitutions: ["Reverse Lunge", "Walking Lunge"]
  },
  {
    name: "Landmine Squat",
    category: "lower strength",
    muscles: ["quadriceps", "glutes"],
    equipment: ["landmine", "barbell"],
    instructions: "Hold the bar at the chest, sit down between the hips, and stand tall.",
    substitutions: ["Goblet Squat", "Front Squat"]
  },
  {
    name: "Standing Calf Raise",
    category: "lower accessory",
    muscles: ["calves"],
    equipment: ["dumbbells"],
    instructions: "Rise onto the toes, pause at the top, and lower through a full range.",
    substitutions: ["Single-Leg Calf Raise"]
  },
  {
    name: "Bench Press",
    category: "upper push",
    muscles: ["chest", "triceps", "shoulders"],
    equipment: ["barbell", "bench", "rack"],
    instructions: "Set the shoulder blades, lower to the lower chest, and press over the shoulders.",
    substitutions: ["Incline Dumbbell Press", "Neutral-Grip Dumbbell Press"]
  },
  {
    name: "Incline Dumbbell Press",
    category: "upper push",
    muscles: ["chest", "triceps", "shoulders"],
    equipment: ["dumbbells", "bench"],
    instructions: "Keep the shoulder blades stable and press the dumbbells up and slightly together.",
    substitutions: ["Bench Press", "Push-Up"]
  },
  {
    name: "Overhead Press",
    category: "upper push",
    muscles: ["shoulders", "triceps"],
    equipment: ["barbell"],
    instructions: "Brace the torso, move the head back, and press the bar directly overhead.",
    substitutions: ["Dumbbell Shoulder Press", "Landmine Press"]
  },
  {
    name: "Cable Fly",
    category: "upper accessory",
    muscles: ["chest"],
    equipment: ["cable system"],
    instructions: "Keep a soft elbow and bring the hands together without rolling the shoulders forward.",
    substitutions: ["Dumbbell Fly", "Push-Up"]
  },
  {
    name: "Lateral Raise",
    category: "upper accessory",
    muscles: ["shoulders"],
    equipment: ["dumbbells", "cable system"],
    instructions: "Raise the arms to shoulder height with control and avoid shrugging.",
    substitutions: ["Cable Lateral Raise"]
  },
  {
    name: "Triceps Pushdown",
    category: "upper accessory",
    muscles: ["triceps"],
    equipment: ["cable system"],
    instructions: "Keep the elbows pinned and extend fully without moving the upper arms.",
    substitutions: ["Overhead Rope Extension", "Close-Grip Push-Up"]
  },
  {
    name: "Pull-Up",
    category: "upper pull",
    muscles: ["lats", "biceps", "upper back"],
    equipment: ["pull-up bar"],
    instructions: "Start from a controlled hang and pull the chest toward the bar.",
    substitutions: ["Lat Pulldown"]
  },
  {
    name: "Deadlift",
    category: "hinge",
    muscles: ["glutes", "hamstrings", "back"],
    equipment: ["barbell"],
    instructions: "Brace, push the floor away, and keep the bar close throughout the pull.",
    substitutions: ["Romanian Deadlift", "Trap Bar Deadlift"]
  },
  {
    name: "Dumbbell Row",
    category: "upper pull",
    muscles: ["lats", "upper back", "biceps"],
    equipment: ["dumbbells", "bench"],
    instructions: "Keep the torso stable and row the elbow toward the hip.",
    substitutions: ["Cable Row", "Barbell Row"]
  },
  {
    name: "Lat Pulldown",
    category: "upper pull",
    muscles: ["lats", "biceps"],
    equipment: ["cable system"],
    instructions: "Pull the bar toward the upper chest while keeping the ribs controlled.",
    substitutions: ["Pull-Up"]
  },
  {
    name: "Cable Row",
    category: "upper pull",
    muscles: ["upper back", "lats", "biceps"],
    equipment: ["cable system"],
    instructions: "Stay tall and pull the handle toward the lower ribs.",
    substitutions: ["Dumbbell Row", "Barbell Row"]
  },
  {
    name: "Face Pull",
    category: "upper accessory",
    muscles: ["rear delts", "upper back"],
    equipment: ["cable system"],
    instructions: "Pull the rope toward eye level and rotate the hands apart.",
    substitutions: ["Rear Delt Fly"]
  },
  {
    name: "Hammer Curl",
    category: "upper accessory",
    muscles: ["biceps", "forearms"],
    equipment: ["dumbbells"],
    instructions: "Keep a neutral grip and curl without swinging.",
    substitutions: ["Cable Curl"]
  },
  {
    name: "Front Squat",
    category: "lower strength",
    muscles: ["quadriceps", "glutes", "core"],
    equipment: ["barbell", "rack"],
    instructions: "Keep the elbows high, brace, and sit straight down between the hips.",
    substitutions: ["Back Squat", "Landmine Squat"]
  },
  {
    name: "Walking Lunge",
    category: "lower unilateral",
    muscles: ["quadriceps", "glutes"],
    equipment: ["dumbbells", "barbell"],
    instructions: "Take controlled steps and keep the front knee tracking over the foot.",
    substitutions: ["Reverse Lunge", "Box Step-Up"]
  },
  {
    name: "Single-Leg RDL",
    category: "hinge",
    muscles: ["hamstrings", "glutes"],
    equipment: ["dumbbells"],
    instructions: "Reach the free leg back while keeping the hips square and spine long.",
    substitutions: ["Romanian Deadlift"]
  },
  {
    name: "Goblet Squat",
    category: "lower strength",
    muscles: ["quadriceps", "glutes"],
    equipment: ["dumbbell"],
    instructions: "Hold the weight at the chest and squat between the hips.",
    substitutions: ["Landmine Squat", "Front Squat"]
  },
  {
    name: "Box Jump",
    category: "power",
    muscles: ["quadriceps", "glutes", "calves"],
    equipment: ["box"],
    instructions: "Jump with intent, land softly with the full foot, and step down.",
    substitutions: ["Low Box Jump", "Fast Step-Up"]
  },
  {
    name: "Wall Ball",
    category: "hyrox",
    muscles: ["quadriceps", "glutes", "shoulders"],
    equipment: ["wall ball"],
    instructions: "Squat below parallel and use the leg drive to throw the ball to the target.",
    substitutions: ["Landmine Squat to Press"]
  },
  {
    name: "Slam Ball",
    category: "conditioning",
    muscles: ["core", "lats", "shoulders"],
    equipment: ["slam ball"],
    instructions: "Reach tall, brace, and drive the ball into the floor with the whole body.",
    substitutions: ["Cable Wood Chop"]
  },
  {
    name: "Farmer Carry",
    category: "hyrox",
    muscles: ["grip", "traps", "core"],
    equipment: ["dumbbells"],
    instructions: "Stand tall, brace, and walk with short controlled steps.",
    substitutions: ["Suitcase Carry"]
  },
  {
    name: "Ab Roller",
    category: "core",
    muscles: ["abdominals", "lats"],
    equipment: ["ab roller"],
    instructions: "Keep the ribs down and roll only as far as the trunk stays controlled.",
    substitutions: ["Body Saw", "Dead Bug"]
  },
  {
    name: "Cable Crunch",
    category: "core",
    muscles: ["abdominals"],
    equipment: ["cable system"],
    instructions: "Curl the ribs toward the pelvis without pulling with the arms.",
    substitutions: ["Ab Mat Sit-Up"]
  },
  {
    name: "Pallof Press",
    category: "core",
    muscles: ["obliques", "abdominals"],
    equipment: ["cable system"],
    instructions: "Press the handle away while resisting rotation.",
    substitutions: ["Suitcase Carry"]
  },
  {
    name: "Ab Mat Sit-Up",
    category: "core",
    muscles: ["abdominals"],
    equipment: ["ab mat"],
    instructions: "Use a controlled full range without pulling the neck.",
    substitutions: ["Cable Crunch"]
  },
  {
    name: "Hanging Leg Raise",
    category: "core",
    muscles: ["abdominals", "hip flexors"],
    equipment: ["pull-up bar"],
    instructions: "Control the swing and raise the legs by curling the pelvis.",
    substitutions: ["Captain's Chair Knee Raise", "Ab Mat Sit-Up"]
  }
];

const additionalExercises: ExerciseSeed[] = [
  ["Assault Bike", "conditioning", ["legs", "cardiovascular"], ["assault bike"]],
  ["Bodyweight Squat", "warm-up", ["quadriceps", "glutes"], ["bodyweight"]],
  ["Hip Opener", "mobility", ["hips"], ["bodyweight"]],
  ["Overhead Rope Extension", "upper accessory", ["triceps"], ["cable system"]],
  ["Push-Up", "upper push", ["chest", "triceps"], ["bodyweight"]],
  ["Chest-Supported Dumbbell Row", "upper pull", ["upper back", "lats"], ["dumbbells", "bench"]],
  ["EZ Bar Curl", "upper accessory", ["biceps"], ["barbell"]],
  ["Landmine Reverse Lunge", "lower unilateral", ["quadriceps", "glutes"], ["landmine"]],
  ["Incline Dumbbell Bench", "upper push", ["chest", "triceps"], ["dumbbells", "bench"]],
  ["Single-Arm Cable Row", "upper pull", ["lats", "upper back"], ["cable system"]],
  ["Rear Delt Fly", "upper accessory", ["rear delts"], ["dumbbells"]],
  ["Curl", "upper accessory", ["biceps"], ["dumbbells"]],
  ["Rope Pushdown", "upper accessory", ["triceps"], ["cable system"]],
  ["Barbell Row", "upper pull", ["upper back", "lats"], ["barbell"]],
  ["Walk", "recovery", ["cardiovascular"], ["treadmill"]],
  ["Foam Rolling", "recovery", ["full body"], ["foam roller"]],
  ["Hip Mobility", "mobility", ["hips"], ["bodyweight"]],
  ["Hamstring Mobility", "mobility", ["hamstrings"], ["bodyweight"]],
  ["Calf Mobility", "mobility", ["calves"], ["bodyweight"]],
  ["Thoracic Mobility", "mobility", ["upper back"], ["foam roller"]],
  ["Light Core", "recovery", ["abdominals"], ["ab mat"]],
  ["Neutral-Grip Dumbbell Press", "upper push", ["chest", "triceps"], ["dumbbells", "bench"]],
  ["Dumbbell Shoulder Press", "upper push", ["shoulders", "triceps"], ["dumbbells"]],
  ["Landmine Press", "upper push", ["shoulders", "triceps"], ["landmine"]],
  ["Dumbbell Romanian Deadlift", "hinge", ["hamstrings", "glutes"], ["dumbbells"]]
].map(([name, category, muscles, equipment]) => ({
  name: name as string,
  category: category as string,
  muscles: muscles as string[],
  equipment: equipment as string[],
  instructions: "Use a controlled range of motion and stop if pain changes your movement."
}));

const planSeed = defineWorkoutPlanSeed([
  {
    dayOfWeek: 6,
    name: "Lower Body Strength",
    focus: "Heavy lower-body strength and HYROX durability",
    estimatedMinutes: 60,
    exercises: [
      ["Assault Bike", 1, "5 minutes", "Warm-up"],
      ["Bodyweight Squat", 1, "20", "Warm-up"],
      ["Walking Lunge", 1, "20", "Warm-up"],
      ["Hip Opener", 1, "5 minutes", "Warm-up"],
      ["Back Squat", 5, "8", null],
      ["Romanian Deadlift", 4, "10", null],
      ["Reverse Lunge", 3, "12 each leg", "Use a barbell"],
      ["Box Step-Up", 3, "15 each leg", "Heavy"],
      ["Landmine Squat", 3, "15", null],
      ["Standing Calf Raise", 4, "20", null],
      ["Ab Roller", 4, "10", null],
      ["Cable Crunch", 3, "20", null],
      ["Pallof Press", 3, "15 each side", null]
    ]
  },
  {
    dayOfWeek: 0,
    name: "Push",
    focus: "Chest, shoulders, and triceps",
    estimatedMinutes: 60,
    exercises: [
      ["Bench Press", 5, "8", null],
      ["Incline Dumbbell Press", 4, "10", null],
      ["Overhead Press", 4, "10", "Standing"],
      ["Cable Fly", 3, "15", null],
      ["Lateral Raise", 4, "20", "Dumbbells"],
      ["Triceps Pushdown", 4, "15", "Cable"],
      ["Overhead Rope Extension", 3, "15", null],
      ["Push-Up", 2, "near failure", null]
    ]
  },
  {
    dayOfWeek: 1,
    name: "Pull",
    focus: "Posterior chain, back, biceps, and carries",
    estimatedMinutes: 60,
    exercises: [
      ["Deadlift", 4, "6", null],
      ["Pull-Up", 4, "quality sets", null],
      ["Chest-Supported Dumbbell Row", 4, "12", null],
      ["Lat Pulldown", 4, "12", null],
      ["Cable Row", 3, "15", null],
      ["Face Pull", 4, "20", null],
      ["Hammer Curl", 4, "15", null],
      ["EZ Bar Curl", 3, "12", null],
      ["Farmer Carry", 4, "rounds", null]
    ]
  },
  {
    dayOfWeek: 2,
    name: "Lower Volume",
    focus: "Lower-body volume, unilateral strength, and power",
    estimatedMinutes: 60,
    exercises: [
      ["Front Squat", 4, "10", null],
      ["Walking Lunge", 4, "20 steps", null],
      ["Single-Leg RDL", 3, "12 each leg", null],
      ["Goblet Squat", 3, "20", null],
      ["Landmine Reverse Lunge", 3, "12 each leg", null],
      ["Box Jump", 5, "5", null],
      ["Standing Calf Raise", 4, "20", null],
      ["Ab Mat Sit-Up", 3, "30", null]
    ]
  },
  {
    dayOfWeek: 3,
    name: "Upper Volume",
    focus: "Upper-body hypertrophy and muscular endurance",
    estimatedMinutes: 60,
    exercises: [
      ["Overhead Press", 4, "10", "Standing"],
      ["Incline Dumbbell Bench", 4, "12", null],
      ["Cable Fly", 3, "20", null],
      ["Single-Arm Cable Row", 3, "15", null],
      ["Rear Delt Fly", 4, "20", null],
      ["Lateral Raise", 4, "20", null],
      ["Curl", 3, "15", null],
      ["Rope Pushdown", 3, "20", null],
      ["Hanging Leg Raise", 3, "15", null]
    ]
  },
  {
    dayOfWeek: 4,
    name: "Full Body Strength",
    focus: "Full-body strength with HYROX finishers",
    estimatedMinutes: 60,
    exercises: [
      ["Front Squat", 4, "8", null],
      ["Bench Press", 4, "8", null],
      ["Barbell Row", 4, "10", null],
      ["Romanian Deadlift", 3, "12", null],
      ["Wall Ball", 3, "25", null],
      ["Slam Ball", 3, "20", null],
      ["Farmer Carry", 4, "rounds", null],
      ["Ab Roller", 3, "12", null]
    ]
  },
  {
    dayOfWeek: 5,
    name: "Recovery",
    focus: "Low-intensity recovery and mobility",
    estimatedMinutes: 45,
    exercises: [
      ["Walk", 1, "30-45 minutes", null],
      ["Foam Rolling", 1, "10 minutes", null],
      ["Hip Mobility", 1, "5 minutes", null],
      ["Hamstring Mobility", 1, "5 minutes", null],
      ["Calf Mobility", 1, "5 minutes", null],
      ["Thoracic Mobility", 1, "5 minutes", null],
      ["Light Core", 1, "optional", null]
    ]
  }
] as const);

async function seed() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed the database");
  }
  const ownerEmail = env.COACH_OWNER_EMAIL?.toLowerCase();
  const ownerPhoneNumber = env.COACH_OWNER_PHONE_NUMBER ?? null;
  if (!ownerEmail && !ownerPhoneNumber) {
    throw new Error(
      "COACH_OWNER_EMAIL or COACH_OWNER_PHONE_NUMBER is required to seed Sean"
    );
  }

  const database = createDatabase(env.DATABASE_URL);

  try {
    const [user] = await database.db
      .insert(users)
      .values({
        phoneNumber: ownerPhoneNumber,
        email: ownerEmail,
        displayName: "Sean",
        timezone: env.COACH_TIMEZONE
      })
      .onConflictDoUpdate({
        target: ownerEmail ? users.email : users.phoneNumber,
        set: {
          displayName: "Sean",
          email: ownerEmail,
          phoneNumber: ownerPhoneNumber,
          timezone: env.COACH_TIMEZONE,
          updatedAt: new Date()
        }
      })
      .returning();

    if (!user) {
      throw new Error("Failed to seed owner user");
    }

    await database.db
      .insert(userProfiles)
      .values({
        userId: user.id,
        primaryGoal: "HYROX training with high-rep strength work",
        trainingStyle:
          "Running is managed separately. Strength workouts should be about 60 minutes.",
        dietaryNotes: "Vegetarian",
        equipmentNotes:
          "Rep Aries rack, dumbbells, barbells, landmine, conditioning equipment, cables, pull-up bar, bench, and recovery tools.",
        injuryNotes: null
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: {
          primaryGoal: "HYROX training with high-rep strength work",
          trainingStyle:
            "Running is managed separately. Strength workouts should be about 60 minutes.",
          dietaryNotes: "Vegetarian",
          equipmentNotes:
            "Rep Aries rack, dumbbells, barbells, landmine, conditioning equipment, cables, pull-up bar, bench, and recovery tools.",
          updatedAt: new Date()
        }
      });

    await database.db
      .insert(equipment)
      .values(
        equipmentSeed.map(([name, category, notes]) => ({
          userId: user.id,
          name,
          category,
          notes
        }))
      )
      .onConflictDoNothing();

    await database.db
      .insert(exercises)
      .values(
        [...exerciseSeed, ...additionalExercises].map((exercise) => ({
          name: exercise.name,
          category: exercise.category,
          primaryMuscles: exercise.muscles,
          equipment: exercise.equipment,
          instructions: exercise.instructions,
          commonSubstitutions: exercise.substitutions ?? []
        }))
      )
      .onConflictDoNothing();

    const explicitMemories = [
      ["training_goal", "Trains for HYROX", "training"],
      ["session_length", "Prefers workouts around 60 minutes", "schedule"],
      ["running_plan", "Running plan is managed separately", "training"],
      ["diet", "Vegetarian", "nutrition"],
      ["disliked_exercise", "Dislikes Bulgarian split squats", "preference"],
      ["preferred_lunge", "Prefers reverse lunges", "preference"],
      ["body_weight", "Body weight is 285 lb", "training"],
      ["height", "Height is 6 feet", "training"],
      [
        "hyrox_conditioning_style",
        "HYROX-biased workouts can use treadmill or outdoor runs, rower, Assault Bike, sled push, wall balls, slam balls, TRX rows, battle ropes, burpees, box jumps, mountain climbers, and carries, but the default plan should remain more strength-based.",
        "coaching_style"
      ],
      [
        "outdoor_running_access",
        "Has plenty of outdoor places to run around town",
        "equipment"
      ],
      [
        "hyrox_running_priority",
        "HYROX requires frequent running exposure, so Coach AI should include controlled run segments in HYROX-biased sessions while managing lower-body fatigue and pain risk.",
        "training"
      ]
    ] as const;

    for (const [key, value, category] of explicitMemories) {
      await database.db
        .insert(memories)
        .values({
          userId: user.id,
          key,
          value,
          category,
          confidence: "1.000",
          source: "explicit_seed"
        })
        .onConflictDoUpdate({
          target: [memories.userId, memories.key],
          set: {
            value,
            category,
            confidence: "1.000",
            source: "explicit_seed",
            updatedAt: new Date()
          }
        });
    }

    const [existingPlan] = await database.db
      .select()
      .from(workoutPlans)
      .where(
        and(
          eq(workoutPlans.userId, user.id),
          eq(workoutPlans.name, "Default HYROX Strength Plan")
        )
      )
      .limit(1);

    const plan =
      existingPlan ??
      (
        await database.db
          .insert(workoutPlans)
          .values({
            userId: user.id,
            name: "Default HYROX Strength Plan",
            description:
              "Six strength and volume sessions plus one recovery day for HYROX preparation.",
            active: true
          })
          .returning()
      )[0];

    if (!plan) {
      throw new Error("Failed to seed workout plan");
    }

    const exerciseRows = await database.db.select().from(exercises);
    const exerciseByName = new Map(exerciseRows.map((row) => [row.name, row]));

    for (const templateSeed of planSeed) {
      const [existingTemplate] = await database.db
        .select()
        .from(workoutTemplates)
        .where(
          and(
            eq(workoutTemplates.planId, plan.id),
            eq(workoutTemplates.dayOfWeek, templateSeed.dayOfWeek)
          )
        )
        .limit(1);

      const template =
        existingTemplate ??
        (
          await database.db
            .insert(workoutTemplates)
            .values({
              planId: plan.id,
              dayOfWeek: templateSeed.dayOfWeek,
              name: templateSeed.name,
              focus: templateSeed.focus,
              estimatedMinutes: templateSeed.estimatedMinutes
            })
            .returning()
        )[0];

      if (!template) {
        throw new Error(`Failed to seed template ${templateSeed.name}`);
      }

      await database.db
        .delete(workoutTemplateExercises)
        .where(eq(workoutTemplateExercises.templateId, template.id));

      await database.db
        .insert(workoutTemplateExercises)
        .values(
          templateSeed.exercises.map(
            ([exerciseName, sets, reps, notes], index) => {
              const exercise = exerciseByName.get(exerciseName);
              if (!exercise) {
                throw new Error(`Missing seeded exercise: ${exerciseName}`);
              }

              return {
                templateId: template.id,
                exerciseId: exercise.id,
                sortOrder: index + 1,
                prescribedSets: sets,
                prescribedReps: reps,
                notes
              };
            }
          )
        );
    }

    console.log(
      `Seeded Coach AI data for ${user.displayName} (${user.email ?? user.phoneNumber})`
    );
  } finally {
    await database.close();
  }
}

await seed();
