import { Clock3, Dumbbell, ExternalLink, Target } from "lucide-react";
import type { TodayWorkout } from "@/lib/types";

interface TodayWorkoutCardProps {
  workout: TodayWorkout | null;
  loading: boolean;
}

export function TodayWorkoutCard({
  workout,
  loading
}: TodayWorkoutCardProps) {
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

  const mainExercises = workout.exercises
    .filter((item) => item.notes !== "Warm-up")
    .slice(0, 4);

  return (
    <article className="workout-card">
      <header className="workout-card-header">
        <div>
          <p className="card-kicker">Today&apos;s session</p>
          <h2>{workout.name}</h2>
        </div>
        <span className="workout-badge" title={workout.status}>
          <Dumbbell size={18} />
        </span>
      </header>

      <div className="workout-meta">
        {workout.focus ? (
          <span>
            <Target size={15} />
            {workout.focus}
          </span>
        ) : null}
        {workout.estimatedMinutes ? (
          <span>
            <Clock3 size={15} />
            {workout.estimatedMinutes} min
          </span>
        ) : null}
      </div>

      <div className="exercise-list">
        {mainExercises.map((item) => (
          <p key={item.templateExerciseId}>
            <strong>{item.exercise.name}</strong>
            <span className="exercise-prescription">
              <span>
                {[item.prescribedSets, item.prescribedReps]
                  .filter(Boolean)
                  .join(" × ")}
              </span>
              <a
                href={item.exercise.demoUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open demo for ${item.exercise.name}`}
              >
                Demo
                <ExternalLink size={13} />
              </a>
            </span>
          </p>
        ))}
      </div>
    </article>
  );
}
