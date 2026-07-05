import type {
  CoachAction,
  CoachContext,
  CoachIntent,
  CoachResult,
  ParsedWorkoutLog
} from "../../types/domain.js";
import type { OpenAiClient } from "../openai/openai.client.js";
import { recommendProgression } from "../progression/progression-engine.js";
import { findMissingExercises } from "../workout/workout-log-parser.js";

export interface CoachEngineInput {
  message: string;
  intent: CoachIntent;
  context: CoachContext;
  parsedWorkout: ParsedWorkoutLog | null;
}

export class CoachEngine {
  constructor(private readonly openai: OpenAiClient) {}

  async respond(input: CoachEngineInput): Promise<CoachResult> {
    const actions = this.buildActions(input);
    const missingExercises = input.parsedWorkout
      ? findMissingExercises(input.context.currentWorkout, input.parsedWorkout)
      : [];
    const shouldAskAboutMissingExercises =
      input.parsedWorkout?.workoutCompletion === "complete" ||
      input.parsedWorkout?.workoutCompletion === "partial";

    const unexplainedSkip = input.parsedWorkout?.exercises.find(
      (exercise) =>
        exercise.status === "skipped" && exercise.skippedReason === null
    );

    if (unexplainedSkip && input.intent === "log_workout") {
      actions.push({
        type: "ask_follow_up",
        payload: {
          question: `You skipped ${unexplainedSkip.exerciseName}. Was that because of time, discomfort, or preference?`
        }
      });
    } else if (
      shouldAskAboutMissingExercises &&
      missingExercises.length > 0 &&
      input.intent === "log_workout"
    ) {
      actions.push({
        type: "ask_follow_up",
        payload: {
          question: `I didn't see ${missingExercises[0]}. Did you skip it, modify it, or forget to log it?`
        }
      });
    }

    if (this.openai.configured) {
      try {
        const generated = await this.openai.generateCoachReply({
          message: input.message,
          intent: input.intent,
          context: input.context,
          parsedWorkout: input.parsedWorkout,
          proposedActions: actions,
          missingExercises
        });

        for (const memory of generated.memories) {
          actions.push({
            type: "create_memory",
            payload: memory
          });
        }

        return {
          reply: generated.reply,
          actions,
          intent: input.intent
        };
      } catch {
        // Keep a useful response available during AI outages.
      }
    }

    return {
      reply: this.fallbackReply(input, actions),
      actions,
      intent: input.intent
    };
  }

  private buildActions(input: CoachEngineInput): CoachAction[] {
    const actions: CoachAction[] = [];

    for (const exercise of input.parsedWorkout?.exercises ?? []) {
      actions.push({ type: "log_exercise", payload: exercise });

      if (
        exercise.status === "substituted" &&
        exercise.substituteExerciseName
      ) {
        actions.push({
          type: "record_substitution",
          payload: {
            originalExercise: exercise.exerciseName,
            substituteExercise: exercise.substituteExerciseName,
            reason: exercise.notes ?? "User-reported substitution"
          }
        });
      }

      const prescribed = input.context.currentWorkout?.exercises.find(
        (item) =>
          item.exercise.name.toLowerCase() === exercise.exerciseName.toLowerCase()
      );
      const recommendation = recommendProgression({
        exerciseName: exercise.exerciseName,
        category: prescribed?.exercise.category ?? null,
        currentWeight: exercise.weight,
        completedAllSets:
          exercise.status === "completed" &&
          (prescribed?.prescribedSets === null ||
            prescribed?.prescribedSets === undefined ||
            (exercise.sets !== null &&
              exercise.sets >= prescribed.prescribedSets)),
        missedReps: exercise.status === "partial",
        rpe: exercise.rpe,
        painReported: (input.parsedWorkout?.pain.length ?? 0) > 0,
        skippedReason: exercise.skippedReason,
        repeatedSkipCount: 0
      });

      actions.push({
        type: "create_event",
        payload: {
          eventType:
            recommendation.action === "increase"
              ? "WeightProgressed"
              : "CoachRecommendationGenerated",
          data: {
            exerciseName: exercise.exerciseName,
            ...recommendation
          }
        }
      });
    }

    for (const conditioning of input.parsedWorkout?.conditioning ?? []) {
      actions.push({ type: "log_conditioning", payload: conditioning });
    }

    for (const pain of input.parsedWorkout?.pain ?? []) {
      actions.push({ type: "record_pain", payload: pain });
    }

    if (
      (input.parsedWorkout?.exercises.length ?? 0) > 0 ||
      (input.parsedWorkout?.conditioning.length ?? 0) > 0
    ) {
      actions.push({
        type: "create_event",
        payload: {
          eventType: "CoachRecommendationGenerated",
          data: {
            intent: input.intent,
            exerciseCount: input.parsedWorkout?.exercises.length ?? 0,
            conditioningCount: input.parsedWorkout?.conditioning.length ?? 0
          }
        }
      });
    }

    return actions;
  }

  private fallbackReply(
    input: CoachEngineInput,
    actions: CoachAction[]
  ): string {
    const pain = input.parsedWorkout?.pain[0];
    if (pain || input.intent === "report_pain") {
      const bodyArea = pain?.bodyArea ?? "that area";
      const mentioned = input.context.currentWorkout?.exercises.find((item) =>
        input.message
          .toLowerCase()
          .includes(item.exercise.name.toLowerCase().split(" ")[0] ?? "")
      );
      const substitute = mentioned?.exercise.commonSubstitutions[0];
      const substitutionText = substitute
        ? ` For now, swap ${mentioned.exercise.name} for ${substitute} if it is pain-free.`
        : " For now, choose a pain-free substitution or skip the painful movement.";
      return `Don't push through ${bodyArea} pain. How bad is it from 1-10?${substitutionText} Stop if pain is sharp, worsening, or changes your movement.`;
    }

    if (input.intent === "log_workout") {
      const logged = input.parsedWorkout?.exercises
        .filter((entry) => entry.status !== "skipped")
        .map((entry) => entry.exerciseName);
      const conditioningLogged = input.parsedWorkout?.conditioning.map(
        (entry) => entry.modality.replaceAll("_", " ")
      );

      const acknowledgement =
        logged && logged.length > 0
          ? `Logged ${logged.join(" and ")}.`
          : conditioningLogged && conditioningLogged.length > 0
            ? `Logged ${conditioningLogged.join(" and ")}.`
          : "Got it.";
      const progressionEvent = actions.find(
        (action) =>
          action.type === "create_event" &&
          (action.payload.eventType === "WeightProgressed" ||
            action.payload.eventType === "CoachRecommendationGenerated") &&
          typeof action.payload.data.reason === "string"
      );
      const recommendation =
        progressionEvent?.type === "create_event" &&
        typeof progressionEvent.payload.data.reason === "string"
          ? ` ${progressionEvent.payload.data.reason}`
          : "";
      const followUp = actions.find(
        (action) => action.type === "ask_follow_up"
      );
      const followUpQuestion =
        followUp?.type === "ask_follow_up"
          ? ` ${followUp.payload.question}`
          : "";

      return followUpQuestion
        ? `${acknowledgement}${followUpQuestion}`
        : `${acknowledgement}${recommendation || " How did the overall session feel?"}`;
    }

    if (input.intent === "request_shortened_workout") {
      const priorities = input.context.currentWorkout?.exercises
        .slice(0, 3)
        .map((item) => item.exercise.name)
        .join(", ");
      return priorities
        ? `For a shorter session, prioritize ${priorities}. Keep the main lifts and trim accessory sets first.`
        : "Keep the main compound work and trim accessory sets first. Tell me how much time you have.";
    }

    if (
      input.intent === "answer_exercise_question" ||
      input.intent === "request_substitution"
    ) {
      const mentioned = input.context.currentWorkout?.exercises.find((item) =>
        input.message
          .toLowerCase()
          .includes(item.exercise.name.toLowerCase().split(" ")[0] ?? "")
      );

      if (input.intent === "request_substitution" && mentioned) {
        const substitute = mentioned.exercise.commonSubstitutions[0];
        return substitute
          ? `Swap ${mentioned.exercise.name} for ${substitute}. Use a pain-free range and similar effort. What is driving the change: pain, equipment, or preference?`
          : "Tell me which exercise you need to replace and whether the reason is pain, equipment, or preference.";
      }

      if (mentioned?.exercise.instructions) {
        return `${mentioned.exercise.name}: ${mentioned.exercise.instructions}`;
      }

      return "Which exercise do you want help with? Send the name and what feels unclear.";
    }

    return "Tell me what you completed, what felt difficult, or what you want adjusted for today's workout.";
  }
}
