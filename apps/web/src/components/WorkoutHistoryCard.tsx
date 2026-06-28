import { ChevronRight, Dumbbell } from "lucide-react";
import type { WorkoutHistory } from "@/lib/types";

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  partially_completed: "Partial",
  skipped: "Skipped"
};

export function WorkoutHistoryCard({ workout }: { workout: WorkoutHistory }) {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${workout.scheduledDate}T12:00:00Z`));

  return (
    <article className="history-card">
      <div className="history-icon" aria-hidden="true">
        <Dumbbell size={20} />
      </div>
      <div className="history-content">
        <div className="history-title-row">
          <div>
            <p>{date}</p>
            <h2>{workout.name}</h2>
          </div>
          <span className={`workout-status ${workout.status}`}>
            {statusLabels[workout.status] ?? workout.status}
          </span>
        </div>
        <p className="history-meta">
          {workout.exercisesLogged} exercise
          {workout.exercisesLogged === 1 ? "" : "s"} logged
        </p>
        {workout.coachSummary ? (
          <p className="history-summary">{workout.coachSummary}</p>
        ) : null}
      </div>
      <ChevronRight className="history-chevron" size={19} aria-hidden="true" />
    </article>
  );
}
