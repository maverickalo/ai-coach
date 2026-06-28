import type { ChatMessage as ChatMessageType } from "@/lib/types";

export function ChatMessage({ message }: { message: ChatMessageType }) {
  return (
    <article
      className={`chat-message ${message.role} ${message.pending ? "pending" : ""}`}
      aria-label={`${message.role === "coach" ? "Coach" : "You"} message`}
    >
      <p>{message.body}</p>
    </article>
  );
}

export function LoadingMessage() {
  return (
    <div className="chat-message coach loading-message" aria-label="Coach is responding">
      <span />
      <span />
      <span />
    </div>
  );
}
