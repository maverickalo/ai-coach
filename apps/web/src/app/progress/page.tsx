"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Search, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { coachApi } from "@/lib/api";
import type { ExerciseTrendPoint, ProgressOverview } from "@/lib/types";

function TrendChart({ points }: { points: ExerciseTrendPoint[] }) {
  const chartPoints = points
    .map((point, index) => ({
      index,
      value: point.weight ?? point.volume ?? 0,
      label: point.date.slice(5)
    }))
    .filter((point) => point.value > 0);

  const path = useMemo(() => {
    if (chartPoints.length === 0) {
      return "";
    }
    const max = Math.max(...chartPoints.map((point) => point.value));
    const min = Math.min(...chartPoints.map((point) => point.value));
    const span = Math.max(max - min, 1);
    return chartPoints
      .map((point, index) => {
        const x =
          chartPoints.length === 1
            ? 160
            : 20 + (index / (chartPoints.length - 1)) * 280;
        const y = 110 - ((point.value - min) / span) * 80;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [chartPoints]);

  const areaPath = path
    ? `${path} L ${chartPoints.length === 1 ? 160 : 300} 110 L 20 110 Z`
    : "";

  if (chartPoints.length === 0) {
    return (
      <div className="empty-chart">
        <TrendingUp size={24} />
        <p>Log weighted sets to build a chart.</p>
      </div>
    );
  }

  return (
    <svg className="progress-chart" viewBox="0 0 320 130" role="img">
      <defs>
        <linearGradient id="progress-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(57 255 136)" stopOpacity="0.24" />
          <stop offset="100%" stopColor="rgb(57 255 136)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d="M20 110 H300" />
      <path d="M20 30 V110" />
      {areaPath ? <path className="chart-area" d={areaPath} /> : null}
      <path className="chart-line" d={path} />
      {chartPoints.map((point, index) => {
        const max = Math.max(...chartPoints.map((item) => item.value));
        const min = Math.min(...chartPoints.map((item) => item.value));
        const span = Math.max(max - min, 1);
        const x =
          chartPoints.length === 1
            ? 160
            : 20 + (index / (chartPoints.length - 1)) * 280;
        const y = 110 - ((point.value - min) / span) * 80;
        return (
          <circle
            key={`${point.label}-${index}`}
            cx={x}
            cy={y}
            r="4"
          />
        );
      })}
    </svg>
  );
}

export default function ProgressPage() {
  const [progress, setProgress] = useState<ProgressOverview | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(nextQuery = query) {
    setLoading(true);
    try {
      const result = await coachApi.progress(nextQuery);
      setProgress(result);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load progress");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("");
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(query);
  }

  const trendName = progress?.trend[0]?.exerciseName ?? "Exercise trend";
  const latestTrend = progress?.trend.at(-1);

  return (
    <AppShell
      title="Progress"
      subtitle="Evidence and planning"
      className="progress-shell"
    >
      <form className="progress-search" onSubmit={submit}>
        <Search size={19} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search bench, wrist, skipped, RPE 9..."
        />
        <button type="submit">Search</button>
      </form>

      {loading ? (
        <div className="settings-skeleton" />
      ) : error ? (
        <p className="page-message error">{error}</p>
      ) : progress ? (
        <>
          <section className="hub-card progress-chart-card">
            <header className="section-heading-row">
              <div>
                <p className="card-kicker">Chart</p>
                <h3>{trendName}</h3>
              </div>
              {latestTrend ? (
                <div className="chart-summary">
                  <strong>{latestTrend.weight ?? latestTrend.volume ?? "-"} </strong>
                  <span>{latestTrend.weight ? "lb latest" : "latest"}</span>
                </div>
              ) : null}
            </header>
            <TrendChart points={progress.trend} />
          </section>

          <section className="hub-card progress-recommendations-card">
            <header className="section-heading-row">
              <div>
                <p className="card-kicker">Recommendations</p>
                <h3>Next targets</h3>
              </div>
            </header>
            <div className="recommendation-list">
              {progress.recommendations.length ? (
                progress.recommendations.map((item) => (
                  <article key={item.id}>
                    <strong>{item.title}</strong>
                    <p>{item.reason}</p>
                  </article>
                ))
              ) : (
                <p className="muted-copy">No recommendations yet.</p>
              )}
            </div>
          </section>

          <section className="hub-card progress-logbook-card">
            <header className="section-heading-row">
              <div>
                <p className="card-kicker">Logbook</p>
                <h3>Recent evidence</h3>
              </div>
            </header>
            <div className="logbook-list">
              {progress.logs.length ? (
                progress.logs.map((entry, index) => (
                  <article key={`${entry.workoutId}-${entry.exerciseName}-${index}`}>
                    <div>
                      <strong>{entry.exerciseName}</strong>
                      <span>{entry.scheduledDate} · {entry.workoutName}</span>
                    </div>
                    <p>
                      {entry.status === "skipped"
                        ? `Skipped${entry.skippedReason ? `: ${entry.skippedReason}` : ""}`
                        : `${entry.weight ?? "?"} lb · ${entry.sets ?? "?"} x ${
                            entry.reps ?? "?"
                          }${entry.rpe ? ` · RPE ${entry.rpe}` : ""}`}
                    </p>
                    {entry.notes ? <em>{entry.notes}</em> : null}
                  </article>
                ))
              ) : (
                <p className="muted-copy">No matching logs yet.</p>
              )}
            </div>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
