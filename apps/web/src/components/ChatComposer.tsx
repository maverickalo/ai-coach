"use client";

import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";

export function ChatComposer({
  onSend,
  disabled
}: {
  onSend: (message: string) => void;
  disabled: boolean;
}) {
  const [message, setMessage] = useState("");

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const value = message.trim();
    if (!value || disabled) {
      return;
    }
    setMessage("");
    onSend(value);
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      window.matchMedia("(pointer: fine)").matches
    ) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form className="chat-composer" onSubmit={submit}>
      <label className="sr-only" htmlFor="coach-message">
        Message Coach
      </label>
      <textarea
        id="coach-message"
        rows={1}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={keyDown}
        placeholder="Message Coach"
        disabled={disabled}
      />
      <button
        type="submit"
        aria-label="Send message"
        title="Send message"
        disabled={disabled || !message.trim()}
      >
        <ArrowUp size={21} strokeWidth={2.6} />
      </button>
    </form>
  );
}
