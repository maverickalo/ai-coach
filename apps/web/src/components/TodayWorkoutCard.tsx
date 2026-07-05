import {
  Activity,
  Check,
  Clock3,
  Dumbbell,
  ExternalLink,
  HeartPulse,
  RotateCcw,
  SkipForward,
  Target
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  ExerciseLogInput,
  QuickCoachAction,
  TodayWorkout
} from "@/lib/types";

interface TodayWorkoutCardProps {
  workout: TodayWorkout | null;
  loading: boolean;
  disabled?: boolean;
  onLogExercise?: (input: ExerciseLogInput) => Promise<void>;
  onCoachPrompt?: (message: string) => void;
  onQuickCoach?: (input: {
    action: QuickCoachAction;
    workoutId: string;
    exerciseId: string | null;
    label: string;
  }) => void;
}

type ExerciseItem = TodayWorkout["exercises"][number];

interface DraftLog {
  weight: string;
  reps: string;
  rpe: string;
  notes: string;
}

function prescription(item: ExerciseItem) {
  return [item.prescribedSets, item.prescribedReps].filter(Boolean).join(" x ");
}

function defaultDraft(item: ExerciseItem): DraftLog {
  return {
    weight: item.log?.weight ?? item.lastPerformance?.weight ?? "",
    reps: item.log?.repsCompleted ?? item.prescribedReps ?? "",
    rpe: item.log?.rpe ?? "",
    notes: item.log?.notes ?? ""
  };
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() !== "" ? parsed : null;
}

function statusLabel(item: ExerciseItem) {
  if (!item.log) {
    return "Planned";
  }
  if (item.log.status === "skipped") {
    return "Skipped";
  }
  if (item.log.status === "partial") {
    return "Partial";
  }
  return "Logged";
}

export function TodayWorkoutCard({
  workout,
  loading,
  disabled = false,
  onLogExercise,
  onCoachPrompt,
  onQuickCoach
}: TodayWorkoutCardProps) {
  const [drafts, setDrafts] = useState<Record<string, DraftLog>>({});
  const [savingExerciseId, setSavingExerciseId] = useState<string | null>(null);

  const mainExercises = useMemo(
    () => workout?.exercises.filter((item) => item.notes !== "Warm-up") ?? [],
    [workout]
  );

  if (loading) {
    return <div className="workout-card workout-card-loading" aria-label="Loading workout" />;
  }

  if (!workout) {
    return (
      <article className="workout-card empty-workout">
        <p className="card-kicker">Today</p>
        <h2>Recovery day</h2>
        <p>No strength session is scheduled.</p>
      </article>
    );
  }

  const updateDraft = (
    exerciseId: string,
    item: ExerciseItem,
    key: keyof DraftLog,
    value: string
  ) => {
    setDrafts((current) => ({
      ...current,
      [exerciseId]: {
        ...(current[exerciseId] ?? defaultDraft(item)),
        [key]: value
      }
    }));
  };

  const draftFor = (item: ExerciseItem) =>
    drafts[item.exercise.id] ?? defaultDraft(item);

  const logExercise = async (
    item: ExerciseItem,
    status: ExerciseLogInput["status"],
    skippedReason: string | null
  ) => {
    if (!onLogExercise || savingExerciseId) {
      return;
    }

    const draft = draftFor(item);
    setSavingExerciseId(item.exercise.id);
    try {
      await onLogExercise({
        exerciseId: item.exercise.id,
        status,
        sets: status === "skipped" ? null : item.prescribedSets,
        reps: status === "skipped" ? null : draft.reps || item.prescribedReps,
        weight: status === "skipped" ? null : toNumber(draft.weight),
        rpe: status === "skipped" ? null : toNumber(draft.rpe),
        skippedReason,
        notes: draft.notes || null
      });
    } finally {
      setSavingExerciseId(null);
    }
  };

  return (
    <section className="workout-cockpit" aria-label="Today's workout">
      <article className="workout-card workout-hero">
        <header className="workout-card-header">
          <div>
            <p className="card-kicker">Today&apos;s strength plan</p>
            <h2>{workout.name}</h2>
          </div>
          <span className="workout-badge" title={workout.status}>
            <Dumbbell size={20} />
          </span>
        </header>

        <div className="workout-meta">
          {workout.focus ? (
            <span>
              <Target size={16} />
              {workout.focus}
            </span>
          ) : null}
          {workout.estimatedMinutes ? (
            <span>
              <Clock3 size={16} />
              {workout.estimatedMinutes} min
            </span>
          ) : null}
        </div>

        <p className="source-of-truth">
          Strength stays as written. HYROX, cardio, and mobility are optional
          add-ons unless you choose to change the session.
        </p>

        {workout.conditioning ? (
          <div className="conditioning-card">
            <div>
              <p>Optional add-on</p>
              <strong>{workout.conditioning.prescription}</strong>
            </div>
            <button
              type="button"
              onClick={() =>
                onCoachPrompt?.(
                  "Can you add optional HYROX or cardio to today's workout without replacing the strength work?"
                )
              }
              disabled={disabled}
            >
              <Activity size={17} />
              Adjust
            </button>
          </div>
        ) : null}
      </article>

      <div className="exercise-cockpit-list">
        {mainExercises.map((item, index) => {
          const draft = draftFor(item);
          const saving = savingExerciseId === item.exercise.id;
          const logged = Boolean(item.log);
          const demoUrl = item.exercise.demoUrl;
          const gifUrl = item.exercise.gifUrl ?? item.exercise.gifSearchUrl;

          return (
            <article
              key={item.templateExerciseId}
              className={`exercise-cockpit-card ${item.log?.status ?? ""}`}
            >
              <header className="exercise-card-header">
                <div>
                  <p className="exercise-step">Exercise {index + 1}</p>
                  <h3>{item.exercise.name}</h3>
                </div>
                <span className={`log-pill ${logged ? "logged" : ""}`}>
                  {statusLabel(item)}
                </span>
              </header>

              <div className="prescription-row">
                <strong>{prescription(item) || "As prescribed"}</strong>
                {item.prescribedWeight ? <span>{item.prescribedWeight}</span> : null}
              </div>

              {item.exercise.purpose ? (
                <p className="exercise-purpose">{item.exercise.purpose}</p>
              ) : item.exercise.instructions ? (
                <p className="exercise-purpose">{item.exercise.instructions}</p>
              ) : null}

              {item.exercise.cues?.length ? (
                <div className="cue-list">
                  {item.exercise.cues.slice(0, 3).map((cue) => (
                    <span key={cue}>{cue}</span>
                  ))}
                </div>
              ) : null}

              <div className="last-performance">
                <span>Last time</span>
                <strong>
                  {item.lastPerformance
                    ? `${item.lastPerformance.weight ?? "load ?"} lb, ${
                        item.lastPerformance.sets ?? "?"
                      } x ${item.lastPerformance.reps ?? "?"}${
                        item.lastPerformance.rpe
                          ? `, RPE ${item.lastPerformance.rpe}`
                          : ""
                      }`
                    : "No logged history yet"}
                </strong>
              </div>

              <div className="log-grid" aria-label={`Log ${item.exercise.name}`}>
                <label>
                  <span>Weight</span>
                  <input
                    inputMode="decimal"
                    value={draft.weight}
                    onChange={(event) =>
                      updateDraft(
                        item.exercise.id,
                        item,
                        "weight",
                        event.target.value
                      )
                    }
                    placeholder="lb"
                  />
                </label>
                <label>
                  <span>Reps</span>
                  <input
                    inputMode="text"
                    value={draft.reps}
                    onChange={(event) =>
                      updateDraft(
                        item.exercise.id,
                        item,
                        "reps",
                        event.target.value
                      )
                    }
                    placeholder="8"
                  />
                </label>
                <label>
                  <span>RPE</span>
                  <input
                    inputMode="decimal"
                    value={draft.rpe}
                    onChange={(event) =>
                      updateDraft(
                        item.exercise.id,
                        item,
                        "rpe",
                        event.target.value
                      )
                    }
                    placeholder="7"
                  />
                </label>
              </div>

              <textarea
                className="exercise-note"
                value={draft.notes}
                onChange={(event) =>
                  updateDraft(item.exercise.id, item, "notes", event.target.value)
                }
                placeholder="Optional note: easy, hard, wrist tight..."
                rows={2}
              />

              <div className="exercise-actions">
                <button
                  type="button"
                  className="complete-action"
                  onClick={() => logExercise(item, "completed", null)}
                  disabled={disabled || saving}
                >
                  <Check size={18} />
                  {saving ? "Saving" : "Complete"}
                </button>
                <button
                  type="button"
                  onClick={() => logExercise(item, "skipped", "not specified")}
                  disabled={disabled || saving}
                >
                  <SkipForward size={17} />
                  Skip
                </button>
              <button
                type="button"
                onClick={() =>
                    onQuickCoach?.({
                      action: "swap",
                      workoutId: workout.id,
                      exerciseId: item.exercise.id,
                      label: item.exercise.name
                    }) ??
                    onCoachPrompt?.(
                      `I need a substitute for ${item.exercise.name}. Keep today's strength workout as the source of truth.`
                    )
                  }
                  disabled={disabled}
                >
                  <RotateCcw size={17} />
                  Swap
                </button>
              <button
                type="button"
                onClick={() =>
                    onQuickCoach?.({
                      action: "pain",
                      workoutId: workout.id,
                      exerciseId: item.exercise.id,
                      label: item.exercise.name
                    }) ??
                    onCoachPrompt?.(
                      `${item.exercise.name} hurts today. Ask me severity and suggest a safer option.`
                    )
                  }
                  disabled={disabled}
                >
                  <HeartPulse size={17} />
                  Pain
                </button>
              </div>

              <div className="resource-row">
                <button
                  type="button"
                  onClick={() =>
                    onQuickCoach?.({
                      action: "explain",
                      workoutId: workout.id,
                      exerciseId: item.exercise.id,
                      label: item.exercise.name
                    }) ??
                    onCoachPrompt?.(`Explain ${item.exercise.name}.`)
                  }
                  disabled={disabled}
                >
                  Explain
                </button>
                <a href={demoUrl} target="_blank" rel="noreferrer">
                  Video
                  <ExternalLink size={14} />
                </a>
                {gifUrl ? (
                  <a href={gifUrl} target="_blank" rel="noreferrer">
                    GIF
                    <ExternalLink size={14} />
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
