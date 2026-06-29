import { and, eq, isNotNull } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { SlackClient } from "../../adapters/slack/slack.client.js";
import type { Database } from "../../db/index.js";
import { coachEvents, workouts } from "../../db/schema.js";
import type { WorkoutEngine } from "../workout/workout-engine.js";

const CHECK_IN_EVENT = "WorkoutCheckInSent";

export class WorkoutCheckInScheduler {
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: Database,
    private readonly workoutEngine: WorkoutEngine,
    private readonly slack: {
      client: SlackClient;
      channelId: string;
      mentionUserId?: string;
    },
    private readonly options: {
      intervalMinutes: number;
      logger: FastifyBaseLogger;
    }
  ) {}

  start() {
    if (this.interval) {
      return;
    }

    this.interval = setInterval(() => {
      void this.tick();
    }, 60_000);

    void this.tick();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async tick(now = new Date()) {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const activeWorkouts = await this.db
        .select({
          id: workouts.id,
          userId: workouts.userId,
          startedAt: workouts.startedAt
        })
        .from(workouts)
        .where(
          and(
            eq(workouts.status, "in_progress"),
            isNotNull(workouts.startedAt)
          )
      );

      for (const workout of activeWorkouts) {
        if (
          !workout.startedAt ||
          !(await this.isDue(workout.id, workout.startedAt, now))
        ) {
          continue;
        }

        await this.sendCheckIn(workout.userId, workout.id);
      }
    } catch (error) {
      this.options.logger.error(error, "Workout check-in scheduler failed");
    } finally {
      this.running = false;
    }
  }

  private async isDue(
    workoutId: string,
    startedAt: Date,
    now: Date
  ): Promise<boolean> {
    const checkIns = await this.db
      .select({ createdAt: coachEvents.createdAt })
      .from(coachEvents)
      .where(
        and(
          eq(coachEvents.workoutId, workoutId),
          eq(coachEvents.eventType, CHECK_IN_EVENT)
        )
      );

    const lastCheckInAt = checkIns
      .map((event) => event.createdAt)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const anchor = lastCheckInAt ?? startedAt;
    const elapsedMs = now.getTime() - anchor.getTime();

    return elapsedMs >= this.options.intervalMinutes * 60_000;
  }

  private async sendCheckIn(userId: string, workoutId: string) {
    const workout = await this.workoutEngine.getWorkoutById(workoutId);
    if (!workout) {
      return;
    }

    const state = await this.workoutEngine.getWorkoutState(workoutId);
    const nextExercise =
      workout.exercises.find(
        (item) => item.exercise.name === state?.nextExercise
      ) ?? workout.exercises.find((item) => item.notes !== "Warm-up");

    const exerciseName = nextExercise?.exercise.name ?? "the next exercise";
    const lastPerformance = nextExercise
      ? await this.workoutEngine.getLastExercisePerformance(
          userId,
          nextExercise.exercise.name
        )
      : null;
    const previous = lastPerformance?.weight
      ? [
          ` Last time: ${lastPerformance.weight} lb`,
          lastPerformance.sets ? ` for ${lastPerformance.sets}` : "",
          lastPerformance.reps ? `x${lastPerformance.reps}` : "",
          lastPerformance.rpe ? ` at RPE ${lastPerformance.rpe}` : "",
          "."
        ].join("")
      : "";
    const mention = this.slack.mentionUserId
      ? `<@${this.slack.mentionUserId}> `
      : "";
    const demo = nextExercise?.exercise.demoUrl
      ? ` Demo: <${nextExercise.exercise.demoUrl}|video> | <${nextExercise.exercise.gifSearchUrl}|GIF search>`
      : "";
    const progress =
      state && (state.completedExercises.length > 0 || state.skippedExercises.length > 0)
        ? `\nProgress: ${state.completedExercises.length} completed, ${state.skippedExercises.length} skipped.`
        : "";
    const text = `${mention}🏋️ *Check-in:* how did *${exerciseName}* go?\nSend weight, sets, reps, and RPE, or reply \`skip\`.${previous}${demo}${progress}`;

    const sent = await this.slack.client.postMessage({
      channel: this.slack.channelId,
      text
    });

    await this.db.insert(coachEvents).values({
      userId,
      workoutId,
      eventType: CHECK_IN_EVENT,
      payload: {
        exerciseName,
        providerMessageId: sent.externalId,
        providerStatus: sent.status
      }
    });
  }
}
