import type { CoachIntent, DeterministicIntent } from "../../types/domain.js";

export interface FuzzyIntentClassifier {
  classifyIntent(message: string): Promise<CoachIntent>;
}

const deterministicIntents = new Map<string, DeterministicIntent>([
  ["START", "opt_in"],
  ["STOP", "opt_out"],
  ["UNSUBSCRIBE", "opt_out"],
  ["CANCEL", "opt_out"],
  ["END", "opt_out"],
  ["QUIT", "opt_out"],
  ["HELP", "help"],
  ["INFO", "help"]
]);

export function classifyDeterministicIntent(
  message: string
): DeterministicIntent | null {
  return deterministicIntents.get(message.trim().toUpperCase()) ?? null;
}

export async function classifyIntent(
  message: string,
  fuzzyClassifier: FuzzyIntentClassifier
): Promise<CoachIntent> {
  const deterministic = classifyDeterministicIntent(message);
  if (deterministic) {
    return deterministic;
  }

  return fuzzyClassifier.classifyIntent(message);
}
