"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatMessage, LoadingMessage } from "@/components/ChatMessage";
import { QuickActions } from "@/components/QuickActions";
import { TodayWorkoutCard } from "@/components/TodayWorkoutCard";
import { coachApi } from "@/lib/api";
import type {
  ChatMessage as ChatMessageType,
  ExerciseLogInput,
  QuickCoachAction,
  QuickCoachResponse,
  TodayWorkout
} from "@/lib/types";

const greeting: ChatMessageType = {
  id: "coach-greeting",
  role: "coach",
  body: "Use the workout cards to log fast. Open Quick Coach when you need a swap, pain adjustment, or explanation.",
  createdAt: new Date().toISOString()
};

export default function WorkoutPage() {
  const searchParams = useSearchParams();
  const [workout, setWorkout] = useState<TodayWorkout | null>(null);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [loadingWorkout, setLoadingWorkout] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [quickCoach, setQuickCoach] = useState<QuickCoachResponse | null>(null);
  const [quickCoachLoading, setQuickCoachLoading] = useState(false);
  const [quickCoachInput, setQuickCoachInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const initialQuickHandled = useRef(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const [todayResult, messagesResult] = await Promise.allSettled([
        coachApi.today(),
        coachApi.messages()
      ]);

      if (!active) {
        return;
      }

      if (todayResult.status === "fulfilled") {
        setWorkout(todayResult.value);
      }
      if (messagesResult.status === "fulfilled") {
        setMessages(
          messagesResult.value.length > 0 ? messagesResult.value : [greeting]
        );
      } else {
        setMessages([greeting]);
      }
      setLoadingWorkout(false);
      setLoadingMessages(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (showCoach) {
      threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, sending, showCoach]);

  const send = useCallback(
    async (body: string) => {
      if (sending) {
        return;
      }

      const optimistic: ChatMessageType = {
        id: crypto.randomUUID(),
        role: "user",
        body,
        createdAt: new Date().toISOString(),
        pending: true
      };
      setMessages((current) => [...current, optimistic]);
      setShowCoach(true);
      setSending(true);

      try {
        const result = await coachApi.chat(body);
        setMessages((current) => [
          ...current.map((message) =>
            message.id === optimistic.id
              ? { ...message, pending: false }
              : message
          ),
          {
            id: crypto.randomUUID(),
            role: "coach",
            body: result.reply,
            createdAt: new Date().toISOString()
          }
        ]);
        const updated = await coachApi.today();
        setWorkout(updated);
      } catch (error) {
        setMessages((current) => [
          ...current.map((message) =>
            message.id === optimistic.id
              ? { ...message, pending: false }
              : message
          ),
          {
            id: crypto.randomUUID(),
            role: "coach",
            body:
              error instanceof Error
                ? error.message
                : "I couldn't send that. Try again.",
            createdAt: new Date().toISOString()
          }
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending]
  );

  const logExercise = useCallback(
    async (input: ExerciseLogInput) => {
      if (!workout || sending) {
        return;
      }

      const exercise = workout.exercises.find(
        (item) => item.exercise.id === input.exerciseId
      );
      const name = exercise?.exercise.name ?? "Exercise";

      try {
        const updated = await coachApi.logExercise(workout.id, input);
        setWorkout(updated);
        setNotice(
          input.status === "skipped"
            ? `Logged ${name} as skipped. It will not progress next time unless completed later.`
            : `Logged ${name}. This will feed your next target weight.`
        );
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "I could not log that set. Try again."
        );
      }
    },
    [sending, workout]
  );

  const promptCoach = useCallback(
    (message: string) => {
      setShowCoach(true);
      void send(message);
    },
    [send]
  );

  const openQuickCoach = useCallback(
    async (input: {
      action: QuickCoachAction;
      workoutId: string;
      exerciseId: string | null;
      label: string;
    }) => {
      setShowCoach(true);
      setQuickCoachLoading(true);
      setQuickCoachInput("");
      try {
        const result = await coachApi.quickCoach({
          action: input.action,
          workoutId: input.workoutId,
          exerciseId: input.exerciseId,
          message: null
        });
        setQuickCoach(result);
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : `Unable to open Quick Coach for ${input.label}`
        );
      } finally {
        setQuickCoachLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!workout || initialQuickHandled.current) {
      return;
    }

    const quick = searchParams.get("quick");
    if (!quick) {
      return;
    }

    const action =
      quick === "hyrox"
        ? "hyrox"
        : quick === "shorten"
          ? "shorten"
          : "session";
    initialQuickHandled.current = true;
    void openQuickCoach({
      action,
      workoutId: workout.id,
      exerciseId: null,
      label: workout.name
    });
  }, [openQuickCoach, searchParams, workout]);

  const refineQuickCoach = useCallback(async () => {
    if (!quickCoach || !quickCoachInput.trim()) {
      return;
    }

    setQuickCoachLoading(true);
    try {
      const result = await coachApi.quickCoach({
        action: "freeform",
        workoutId: quickCoach.context.workoutId,
        exerciseId: quickCoach.context.exerciseId,
        message: quickCoachInput
      });
      setQuickCoach(result);
      setQuickCoachInput("");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to refine Quick Coach options"
      );
    } finally {
      setQuickCoachLoading(false);
    }
  }, [quickCoach, quickCoachInput]);

  return (
    <AppShell
      title="Workout"
      subtitle="Active training cockpit"
      className={showCoach ? "dashboard-shell coach-shell" : "dashboard-shell"}
    >
      <section className="dashboard-panel" aria-label="Workout actions">
        <div>
          <p className="card-kicker">Structured logging</p>
          <h2>Log fast. Ask when needed.</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowCoach((current) => !current)}
          aria-expanded={showCoach}
        >
          {showCoach ? <X size={18} /> : <MessageCircle size={18} />}
          {showCoach ? "Hide Coach" : "Quick Coach"}
        </button>
      </section>

      {notice ? (
        <div className="dashboard-notice" role="status">
          {notice}
        </div>
      ) : null}

      <TodayWorkoutCard
        workout={workout}
        loading={loadingWorkout}
        disabled={sending}
        onLogExercise={logExercise}
        onCoachPrompt={promptCoach}
        onQuickCoach={openQuickCoach}
      />

      {showCoach ? (
        <section className="coach-panel" aria-label="Quick Coach">
          {quickCoach || quickCoachLoading ? (
            <div className="quick-coach-card">
              {quickCoachLoading ? (
                <LoadingMessage />
              ) : quickCoach ? (
                <>
                  <p className="card-kicker">Quick Coach</p>
                  <h3>{quickCoach.title}</h3>
                  <p>{quickCoach.reply}</p>
                  <div className="quick-coach-options">
                    {quickCoach.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => void send(option.message)}
                        disabled={sending}
                      >
                        <strong>{option.title}</strong>
                        <span>{option.description}</span>
                      </button>
                    ))}
                  </div>
                  <div className="quick-coach-freeform">
                    <input
                      value={quickCoachInput}
                      onChange={(event) => setQuickCoachInput(event.target.value)}
                      placeholder="Don't like those? Tell Coach what you want..."
                    />
                    <button
                      type="button"
                      onClick={() => void refineQuickCoach()}
                      disabled={quickCoachLoading || !quickCoachInput.trim()}
                    >
                      Refine
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <QuickActions onSelect={send} disabled={sending} />

          <div className="chat-thread" aria-label="Conversation with Coach">
            {loadingMessages ? (
              <LoadingMessage />
            ) : (
              messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))
            )}
            {sending ? <LoadingMessage /> : null}
            <div ref={threadEnd} />
          </div>

          <ChatComposer onSend={send} disabled={sending} />
        </section>
      ) : null}
    </AppShell>
  );
}
