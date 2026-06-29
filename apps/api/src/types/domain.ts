export type DeterministicIntent = "opt_in" | "opt_out" | "help";

export type CoachIntent =
  | DeterministicIntent
  | "log_workout"
  | "answer_exercise_question"
  | "report_pain"
  | "request_substitution"
  | "request_shortened_workout"
  | "schedule_change"
  | "general_chat"
  | "unknown";

export interface User {
  id: string;
  phoneNumber: string | null;
  displayName: string | null;
  timezone: string;
}

export interface UserProfile {
  primaryGoal: string | null;
  trainingStyle: string | null;
  dietaryNotes: string | null;
  equipmentNotes: string | null;
  injuryNotes: string | null;
}

export interface Exercise {
  id: string;
  name: string;
  category: string | null;
  primaryMuscles: string[];
  equipment: string[];
  instructions: string | null;
  commonSubstitutions: string[];
  demoUrl: string;
  gifUrl: string;
  gifSearchUrl: string;
}

export interface PrescribedExercise {
  templateExerciseId: string;
  exercise: Exercise;
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
}

export interface CurrentWorkout {
  id: string;
  name: string;
  focus: string | null;
  estimatedMinutes: number | null;
  scheduledDate: string;
  status: string;
  exercises: PrescribedExercise[];
  conditioning?: ConditioningRecommendation | null;
}

export interface ConditioningRecommendation {
  mode: "run" | "row" | "bike" | "hyrox_circuit" | "mobility";
  sessionShape: "short" | "standard" | "long" | "strength_bias" | "hyrox_bias";
  prescription: string;
  reason: string;
  caution: string | null;
}

export interface ParsedConditioningLog {
  modality:
    | "run"
    | "treadmill"
    | "rower"
    | "assault_bike"
    | "bike"
    | "sled"
    | "battle_ropes"
    | "circuit"
    | "walk"
    | "other";
  distanceMeters: number | null;
  durationSeconds: number | null;
  calories: number | null;
  intensity: "easy" | "moderate" | "hard" | "fast" | null;
  rpe: number | null;
  notes: string | null;
}

export interface RecentWorkoutSummary {
  name: string;
  scheduledDate: string;
  status: string;
  coachSummary: string | null;
}

export interface Memory {
  id: string;
  key: string;
  value: string;
  category: string;
  confidence: number;
  source: string;
}

export interface ConversationMessage {
  direction: "inbound" | "outbound";
  body: string;
  intent: string | null;
  createdAt: Date;
}

export interface CoachContext {
  user: User;
  profile: UserProfile | null;
  currentWorkout: CurrentWorkout | null;
  recentWorkouts: RecentWorkoutSummary[];
  memories: Memory[];
  recentMessages: ConversationMessage[];
}

export interface ParsedExerciseLog {
  exerciseName: string;
  status: "completed" | "partial" | "skipped" | "substituted";
  sets: number | null;
  reps: string | null;
  weight: number | null;
  rpe: number | null;
  setDetails?: ParsedExerciseSetLog[] | undefined;
  difficulty: "easy" | "moderate" | "hard" | null;
  skippedReason: string | null;
  substituteExerciseName: string | null;
  notes: string | null;
}

export interface ParsedExerciseSetLog {
  setNumber: number;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  notes: string | null;
}

export interface ParsedPain {
  bodyArea: string;
  description: string;
  severity: number | null;
}

export interface ParsedWorkoutLog {
  exercises: ParsedExerciseLog[];
  conditioning: ParsedConditioningLog[];
  pain: ParsedPain[];
  notes: string[];
  workoutCompletion: "complete" | "partial" | "unknown";
}

export type CoachAction =
  | { type: "log_exercise"; payload: ParsedExerciseLog }
  | { type: "log_conditioning"; payload: ParsedConditioningLog }
  | {
      type: "record_pain";
      payload: ParsedPain;
    }
  | {
      type: "record_substitution";
      payload: {
        originalExercise: string;
        substituteExercise: string;
        reason: string;
      };
    }
  | {
      type: "create_memory";
      payload: {
        category: string;
        key: string;
        value: string;
        confidence: number;
        source: string;
      };
    }
  | {
      type: "ask_follow_up";
      payload: {
        question: string;
      };
    }
  | {
      type: "create_event";
      payload: {
        eventType: string;
        data: Record<string, unknown>;
      };
    };

export interface CoachResult {
  reply: string;
  actions: CoachAction[];
  intent: CoachIntent;
}

export interface WorkoutState {
  workoutId: string;
  workoutName: string;
  currentExercise: string | null;
  currentSet: number | null;
  completedExercises: string[];
  skippedExercises: string[];
  optionalWork: string[];
  nextExercise: string | null;
}
