"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { WorkoutHistoryCard } from "@/components/WorkoutHistoryCard";
import { coachApi } from "@/lib/api";
import type { WorkoutHistory } from "@/lib/types";

export default function WorkoutsPage() {
  const [workouts, setWorkouts] = useState<WorkoutHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    coachApi
      .workouts()
      .then((result) => {
        if (active) {
          setWorkouts(result);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "Unable to load workouts"
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <AppShell title="Workouts" subtitle="Training history">
      <section className="history-list" aria-live="polite">
        {loading ? (
          <>
            <div className="history-skeleton" />
            <div className="history-skeleton" />
            <div className="history-skeleton" />
          </>
        ) : error ? (
          <p className="page-message error">{error}</p>
        ) : workouts.length === 0 ? (
          <p className="page-message">Your completed sessions will appear here.</p>
        ) : (
          workouts.map((workout) => (
            <WorkoutHistoryCard key={workout.id} workout={workout} />
          ))
        )}
      </section>
    </AppShell>
  );
}
