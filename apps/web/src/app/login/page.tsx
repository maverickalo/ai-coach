"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/coach`
        }
      });

      if (authError) {
        throw authError;
      }
      setStatus("sent");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send link");
      setStatus("idle");
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <span className="coach-mark" aria-hidden="true">
          C
        </span>
        <header>
          <p className="eyebrow">Coach AI</p>
          <h1 id="login-title">Sign in</h1>
          <p className="login-copy">Your HYROX strength coach is ready.</p>
        </header>

        {status === "sent" ? (
          <div className="login-success" role="status">
            <Mail size={22} />
            <strong>Check your inbox</strong>
            <span>We sent a secure sign-in link to {email}.</span>
          </div>
        ) : (
          <form className="login-form" onSubmit={submit}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
            <button
              className="primary-button"
              type="submit"
              disabled={status === "sending"}
            >
              <span>{status === "sending" ? "Sending..." : "Send magic link"}</span>
              <ArrowRight size={19} />
            </button>
            {error ? <p className="form-error">{error}</p> : null}
          </form>
        )}
      </section>
    </main>
  );
}
