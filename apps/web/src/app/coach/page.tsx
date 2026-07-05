"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Dumbbell,
  Flame,
  Timer,
  TrendingUp
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { coachApi } from "@/lib/api";
import type { Dashboard } from "@/lib/types";

const readinessActions = [
  "Short",
  "Normal",
  "Longer",
  "More HYROX",
  "Low energy",
  "Sore"
];

export default function CoachPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await coachApi.dashboard();
        if (active) {
          setDashboard(result);
          setError(null);
        }
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "Unable to load dashboard"
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    const interval = window.setInterval(() => void load(), 10000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const today = dashboard?.today;
  const mainExercises =
    today?.exercises.filter((item) => item.notes !== "Warm-up").slice(0, 5) ??
    [];

  return (
    <AppShell title="Today" subtitle="Training Hub" className="dashboard-shell">
      {loading ? (
        <div className="settings-skeleton" />
      ) : error ? (
        <p className="page-message error">{error}</p>
      ) : (
        <>
          <section className="hub-hero">
            <div>
              <p className="card-kicker">Today&apos;s workout</p>
              <h2>{today?.name ?? "No workout scheduled"}</h2>
              <p>
                {today?.focus ??
                  "Recovery day. Keep movement easy unless Coach updates the plan."}
              </p>
            </div>
            <span className="hub-hero-icon" aria-hidden="true">
              <Dumbbell size={24} />
            </span>
          </section>

          {today ? (
            <section className="hub-card today-summary">
              <div className="hub-meta-row">
                <span>
                  <Timer size={17} />
                  {today.estimatedMinutes ?? 60} min
                </span>
                <span>
                  <Activity size={17} />
                  Strength source of truth
                </span>
              </div>

              <div className="hub-exercise-list">
                {mainExercises.map((item) => (
                  <p key={item.templateExerciseId}>
                    <strong>{item.exercise.name}</strong>
                    <span>
                      {[item.prescribedSets, item.prescribedReps]
                        .filter(Boolean)
                        .join(" x ") || "as prescribed"}
                    </span>
                  </p>
                ))}
              </div>

              <div className="hub-actions">
                <Link href="/workout" className="hub-primary-action">
                  Open workout
                  <ArrowRight size={18} />
                </Link>
                <button type="button">Adjust Session</button>
              </div>
            </section>
          ) : null}

          <section className="hub-card">
            <header className="section-heading-row">
              <div>
                <p className="card-kicker">Readiness</p>
                <h3>How should today feel?</h3>
              </div>
            </header>
            <div className="readiness-grid">
              {readinessActions.map((action) => (
                <button key={action} type="button">
                  {action}
                </button>
              ))}
            </div>
          </section>

          <section className="hub-card">
            <header className="section-heading-row">
              <div>
                <p className="card-kicker">This week</p>
                <h3>Plan strip</h3>
              </div>
              <CalendarDays size={20} />
            </header>
            <div className="week-strip">
              {dashboard?.week.map((day) => (
                <div
                  key={day.date}
                  className={`week-day ${day.isToday ? "today" : ""} ${day.status}`}
                >
                  <span>{day.dayLabel}</span>
                  <strong>{day.workoutName}</strong>
                  <em>{day.status.replaceAll("_", " ")}</em>
                </div>
              ))}
            </div>
          </section>

          <section className="hub-grid">
            <article className="hub-card metric-card">
              <Flame size={20} />
              <p>Completed</p>
              <strong>
                {dashboard?.progress.workoutsCompletedThisWeek ?? 0}/
                {dashboard?.progress.totalWorkoutsThisWeek ?? 0}
              </strong>
            </article>
            <article className="hub-card metric-card">
              <TrendingUp size={20} />
              <p>Best set</p>
              <strong>
                {dashboard?.progress.recentBestSet ?? "Build baseline"}
              </strong>
            </article>
          </section>

          <section className="hub-card">
            <header className="section-heading-row">
              <div>
                <p className="card-kicker">Progress snapshot</p>
                <h3>Next up</h3>
              </div>
              <Link href="/progress">Details</Link>
            </header>
            {dashboard?.recommendations.length ? (
              <div className="recommendation-list compact">
                {dashboard.recommendations.slice(0, 3).map((item) => (
                  <article key={item.id}>
                    <strong>{item.title}</strong>
                    <p>{item.reason}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted-copy">
                Log a few workouts and Coach AI will show next-weight guidance here.
              </p>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
