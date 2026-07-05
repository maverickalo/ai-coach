"use client";

import { getSupabaseBrowserClient } from "./supabase";
import type {
  ChatMessage,
  Dashboard,
  ExerciseLogInput,
  Profile,
  ProfileUpdate,
  ProgressOverview,
  QuickCoachRequest,
  QuickCoachResponse,
  TodayWorkout,
  WorkoutHistory
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function accessToken(): Promise<string> {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_COACH_DEMO === "true"
  ) {
    return "development-preview-token";
  }

  const supabase = getSupabaseBrowserClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Your session has expired. Sign in again.");
  }

  return session.access_token;
}

async function apiRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init?.headers
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(error?.error ?? `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export const coachApi = {
  dashboard: () => apiRequest<Dashboard>("/dashboard"),
  today: () => apiRequest<TodayWorkout | null>("/today"),
  messages: () => apiRequest<ChatMessage[]>("/messages"),
  chat: (message: string) =>
    apiRequest<{ reply: string }>("/chat", {
      method: "POST",
      body: JSON.stringify({ message })
    }),
  quickCoach: (request: QuickCoachRequest) =>
    apiRequest<QuickCoachResponse>("/quick-coach", {
      method: "POST",
      body: JSON.stringify(request)
    }),
  logExercise: (workoutId: string, input: ExerciseLogInput) =>
    apiRequest<TodayWorkout>(`/workouts/${workoutId}/exercise-logs`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  workouts: () => apiRequest<WorkoutHistory[]>("/workouts"),
  progress: (query = "") => {
    const params = query.trim()
      ? `?q=${encodeURIComponent(query.trim())}`
      : "";
    return apiRequest<ProgressOverview>(`/progress${params}`);
  },
  profile: () => apiRequest<Profile>("/profile"),
  updateProfile: (profile: ProfileUpdate) =>
    apiRequest<Profile>("/profile", {
      method: "PUT",
      body: JSON.stringify(profile)
    })
};
