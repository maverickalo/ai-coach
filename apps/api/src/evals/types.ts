import type { CoachAction } from "../types/domain.js";

export interface EvalActual {
  reply: string;
  actions?: CoachAction[];
}

export interface ExpectedAction {
  type: CoachAction["type"];
  payloadIncludes?: Record<string, unknown>;
}

export interface EvalExpectation {
  replyIncludes?: string[];
  replyExcludes?: string[];
  actionsInclude?: ExpectedAction[];
  actionsExclude?: ExpectedAction[];
}

export interface EvalScenario {
  name: string;
  run(): Promise<EvalActual> | EvalActual;
  expect: EvalExpectation;
}
