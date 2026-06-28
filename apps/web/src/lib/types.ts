export interface TodayWorkout {
  id: string;
  name: string;
  focus: string | null;
  estimatedMinutes: number | null;
  scheduledDate: string;
  status: string;
  exercises: Array<{
    templateExerciseId: string;
    sortOrder: number;
    prescribedSets: number | null;
    prescribedReps: string | null;
    prescribedWeight: string | null;
    notes: string | null;
    exercise: {
      id: string;
      name: string;
      category: string | null;
    };
  }>;
}

export interface ChatMessage {
  id: string;
  role: "coach" | "user";
  body: string;
  createdAt: string;
  pending?: boolean;
}

export interface WorkoutHistory {
  id: string;
  scheduledDate: string;
  name: string;
  status: string;
  exercisesLogged: number;
  coachSummary: string | null;
}

export interface Profile {
  displayName: string | null;
  timezone: string;
  phoneNumber: string | null;
  email: string | null;
  primaryGoal: string | null;
  equipmentNotes: string | null;
  injuryNotes: string | null;
}

export interface ProfileUpdate {
  displayName: string;
  timezone: string;
  phoneNumber: string;
  primaryGoal: string;
  equipmentNotes: string;
  injuryNotes: string;
}
