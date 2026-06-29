import type { CoachAction } from "../../types/domain.js";
import type { ExpectedAction } from "../types.js";

function actionMatches(action: CoachAction, expected: ExpectedAction): boolean {
  if (action.type !== expected.type) {
    return false;
  }

  if (!expected.payloadIncludes) {
    return true;
  }

  const payload =
    "payload" in action
      ? (action.payload as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  return Object.entries(expected.payloadIncludes).every(
    ([key, value]) => payload[key] === value
  );
}

function describeExpectedAction(expected: ExpectedAction): string {
  const payload = expected.payloadIncludes
    ? ` with payload ${JSON.stringify(expected.payloadIncludes)}`
    : "";
  return `${expected.type}${payload}`;
}

export function assertActionsInclude(
  actions: CoachAction[],
  expectedActions: ExpectedAction[]
): string[] {
  return expectedActions
    .filter((expected) => !actions.some((action) => actionMatches(action, expected)))
    .map((expected) => `Expected actions to include ${describeExpectedAction(expected)}`);
}

export function assertActionsExclude(
  actions: CoachAction[],
  excludedActions: ExpectedAction[]
): string[] {
  return excludedActions
    .filter((expected) => actions.some((action) => actionMatches(action, expected)))
    .map((expected) => `Expected actions not to include ${describeExpectedAction(expected)}`);
}
