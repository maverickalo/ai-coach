"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatMessage, LoadingMessage } from "@/components/ChatMessage";
import { QuickActions } from "@/components/QuickActions";
import { TodayWorkoutCard } from "@/components/TodayWorkoutCard";
import { coachApi } from "@/lib/api";
import type {
  ChatMessage as ChatMessageType,
  TodayWorkout
} from "@/lib/types";

const greeting: ChatMessageType = {
  id: "coach-greeting",
  role: "coach",
  body: "Morning. I have today's session ready. Tell me when you start, or send any adjustment you need.",
  createdAt: new Date().toISOString()
};

export default function CoachPage() {
  const [workout, setWorkout] = useState<TodayWorkout | null>(null);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [loadingWorkout, setLoadingWorkout] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const threadEnd = useRef<HTMLDivElement>(null);

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
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

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

  return (
    <AppShell
      title="Coach"
      subtitle="HYROX strength coach"
      className="coach-shell"
    >
      <TodayWorkoutCard
        workout={workout}
        loading={loadingWorkout}
        onStart={() => send("I'm starting today's workout.")}
      />

      <QuickActions onSelect={send} disabled={sending} />

      <section className="chat-thread" aria-label="Conversation with Coach">
        {loadingMessages ? (
          <LoadingMessage />
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))
        )}
        {sending ? <LoadingMessage /> : null}
        <div ref={threadEnd} />
      </section>

      <ChatComposer onSend={send} disabled={sending} />
    </AppShell>
  );
}
