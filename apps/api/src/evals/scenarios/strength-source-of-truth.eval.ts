import { getRequestedSessionShape } from "../../services/conversation/conversation-engine.js";
import { WorkoutEngine } from "../../services/workout/workout-engine.js";
import { pushWorkout } from "../fixtures/coach-context.fixture.js";
import type { EvalScenario } from "../types.js";

const engine = new WorkoutEngine({} as never);

export const strengthSourceOfTruthScenarios: EvalScenario[] = [
  {
    name: "exploratory cardio prompt routes to optional add-on",
    run: () => {
      const shape = getRequestedSessionShape(
        "What would cardio look like if we added it?"
      );
      return {
        reply:
          shape === "hyrox"
            ? engine.buildSessionAdjustmentMessage(pushWorkout, shape)
            : `Unexpected route: ${shape ?? "none"}`,
        actions: []
      };
    },
    expect: {
      replyIncludes: ["keep the strength plan unchanged", "optional", "after the main strength work"],
      replyExcludes: ["rewritten", "replace today's workout", "instead of lifting"]
    }
  },
  {
    name: "make it more HYROX preserves planned strength",
    run: () => ({
      reply: engine.buildSessionAdjustmentMessage(pushWorkout, "hyrox"),
      actions: []
    }),
    expect: {
      replyIncludes: ["keep the strength plan unchanged", "optional"],
      replyExcludes: ["replace the strength plan", "instead of today"]
    }
  }
];
