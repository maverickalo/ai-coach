import { WorkoutEngine } from "../../services/workout/workout-engine.js";
import { pushWorkout } from "../fixtures/coach-context.fixture.js";
import type { EvalScenario } from "../types.js";

const engine = new WorkoutEngine({} as never);

export const cardioAddonScenarios: EvalScenario[] = [
  {
    name: "cardio is an add-on, not a rewrite",
    run: () => ({
      reply: engine.buildSessionAdjustmentMessage(pushWorkout, "hyrox"),
      actions: []
    }),
    expect: {
      replyIncludes: ["strength plan unchanged", "optional", "add-on"],
      replyExcludes: ["rewritten", "replace", "instead of today's workout"],
      actionsInclude: [],
      actionsExclude: []
    }
  }
];
