export interface TodayWorkout {
  id: string;
  name: string;
  focus: string | null;
  estimatedMinutes: number | null;
  scheduledDate: string;
  status: string;
  conditioning?: {
    mode: string;
    sessionShape: string;
    prescription: string;
    reason: string;
    caution: string | null;
  } | null;
  exercises: Array<{
    templateExerciseId: string;
    sortOrder: number;
    prescribedSets: number | null;
    prescribedReps: string | null;
    prescribedWeight: string | null;
    notes: string | null;
    lastPerformance?: {
      scheduledDate: string;
      status: string;
      sets: number | null;
      reps: string | null;
      weight: string | null;
      rpe: string | null;
      notes: string | null;
    } | null;
    log?: {
      id: string;
      status: string;
      setsCompleted: number | null;
      repsCompleted: string | null;
      weight: string | null;
      rpe: string | null;
      painScore: number | null;
      skippedReason: string | null;
      notes: string | null;
      updatedAt: string;
      sets: Array<{
        setNumber: number;
        reps: number | null;
        weight: string | null;
        rpe: string | null;
        notes: string | null;
      }>;
    } | null;
    exercise: {
      id: string;
      name: string;
      category: string | null;
      instructions: string | null;
      demoUrl: string;
      gifUrl?: string;
      gifSearchUrl?: string;
      demoLabel?: string;
      gifLabel?: string;
      purpose?: string;
      setup?: string;
      cues?: string[];
      commonMistakes?: string[];
    };
  }>;
}

export interface ExerciseLogInput {
  exerciseId: string;
  status: "completed" | "partial" | "skipped";
  sets: number | null;
  reps: string | null;
  weight: number | null;
  rpe: number | null;
  skippedReason: string | null;
  notes: string | null;
}

export interface DashboardWeekDay {
  date: string;
  dayLabel: string;
  workoutName: string;
  status: string;
  isToday: boolean;
}

export interface Recommendation {
  id: string;
  title: string;
  reason: string;
  status: "pending" | "accepted" | "rejected" | "applied" | "superseded";
}

export interface Dashboard {
  today: TodayWorkout | null;
  week: DashboardWeekDay[];
  progress: {
    workoutsCompletedThisWeek: number;
    totalWorkoutsThisWeek: number;
    exercisesLoggedThisWeek: number;
    skippedExercisesThisWeek: number;
    recentBestSet: string | null;
    nextWeightHighlight: string | null;
  };
  recommendations: Recommendation[];
}

export interface ProgressLogEntry {
  workoutId: string;
  scheduledDate: string;
  workoutName: string;
  exerciseName: string;
  status: string;
  sets: number | null;
  reps: string | null;
  weight: string | null;
  rpe: string | null;
  painScore: number | null;
  skippedReason: string | null;
  notes: string | null;
}

export interface ExerciseTrendPoint {
  date: string;
  exerciseName: string;
  weight: number | null;
  reps: number | null;
  sets: number | null;
  volume: number | null;
  rpe: number | null;
}

export interface ProgressOverview {
  query: string;
  logs: ProgressLogEntry[];
  trend: ExerciseTrendPoint[];
  recommendations: Recommendation[];
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
