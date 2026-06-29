import type { CoachContext, CurrentWorkout } from "../../types/domain.js";

const demoUrl = "https://example.com/video";
const gifSearchUrl = "https://example.com/gif";

export const pushWorkout: CurrentWorkout = {
  id: "workout-push",
  name: "Push",
  focus: "Chest, shoulders, and triceps",
  estimatedMinutes: 60,
  scheduledDate: "2026-06-29",
  status: "in_progress",
  exercises: [
    {
      templateExerciseId: "bench-template",
      sortOrder: 1,
      prescribedSets: 5,
      prescribedReps: "8",
      prescribedWeight: null,
      notes: null,
      exercise: {
        id: "bench",
        name: "Bench Press",
        category: "upper push",
        primaryMuscles: ["chest", "triceps", "shoulders"],
        equipment: ["barbell", "bench"],
        instructions: "Set the shoulder blades and press with control.",
        commonSubstitutions: ["Neutral-Grip Dumbbell Press"],
        demoUrl,
        gifSearchUrl
      },
      lastPerformance: {
        scheduledDate: "2026-06-22",
        status: "completed",
        sets: 5,
        reps: "8",
        weight: "205",
        rpe: "7",
        notes: null
      }
    },
    {
      templateExerciseId: "incline-template",
      sortOrder: 2,
      prescribedSets: 4,
      prescribedReps: "10",
      prescribedWeight: null,
      notes: null,
      exercise: {
        id: "incline-db",
        name: "Incline Dumbbell Press",
        category: "upper push",
        primaryMuscles: ["chest", "triceps"],
        equipment: ["dumbbells", "bench"],
        instructions: "Press up and slightly together with stable shoulders.",
        commonSubstitutions: ["Push-Up"],
        demoUrl,
        gifSearchUrl
      }
    }
  ],
  conditioning: {
    mode: "row",
    sessionShape: "standard",
    prescription:
      "Optional add-on: use rower or Assault Bike after the main strength work instead of extra treadmill volume today.",
    reason:
      "Yesterday had lower-body stress, so this keeps conditioning high without stacking more impact on legs.",
    caution: "Keep running easy or skip it if knees, calves, hips, or feet feel beat up."
  }
};

export const lowerWorkout: CurrentWorkout = {
  ...pushWorkout,
  id: "workout-lower",
  name: "Lower Body Strength",
  focus: "Heavy lower-body strength and HYROX durability",
  exercises: [
    {
      templateExerciseId: "squat-template",
      sortOrder: 1,
      prescribedSets: 5,
      prescribedReps: "8",
      prescribedWeight: null,
      notes: null,
      exercise: {
        id: "squat",
        name: "Back Squat",
        category: "lower strength",
        primaryMuscles: ["quadriceps", "glutes"],
        equipment: ["barbell", "rack"],
        instructions: "Brace and keep the bar over mid-foot.",
        commonSubstitutions: ["Front Squat"],
        demoUrl,
        gifSearchUrl
      }
    },
    {
      templateExerciseId: "step-up-template",
      sortOrder: 2,
      prescribedSets: 3,
      prescribedReps: "15 each leg",
      prescribedWeight: null,
      notes: null,
      exercise: {
        id: "step-up",
        name: "Box Step-Up",
        category: "lower unilateral",
        primaryMuscles: ["quadriceps", "glutes"],
        equipment: ["box", "dumbbells"],
        instructions: "Drive through the foot on the box.",
        commonSubstitutions: ["Reverse Lunge"],
        demoUrl,
        gifSearchUrl
      }
    }
  ]
};

export const coachContext: CoachContext = {
  user: {
    id: "user-sean",
    phoneNumber: null,
    displayName: "Sean",
    timezone: "America/Los_Angeles"
  },
  profile: {
    primaryGoal: "HYROX training with high-rep strength work",
    trainingStyle: "Strength workouts should be about 60 minutes.",
    dietaryNotes: "Vegetarian",
    equipmentNotes: "Rack, dumbbells, barbell, rower, Assault Bike.",
    injuryNotes: null
  },
  currentWorkout: pushWorkout,
  recentWorkouts: [
    {
      name: "Lower Body Strength",
      scheduledDate: "2026-06-28",
      status: "completed",
      coachSummary: "Lower body was completed yesterday."
    }
  ],
  memories: [],
  recentMessages: []
};
