import { assertActionsExclude, assertActionsInclude } from "./assertions/action-assertions.js";
import { assertTextExcludes, assertTextIncludes } from "./assertions/text-assertions.js";
import { cardioAddonScenarios } from "./scenarios/cardio-addon.eval.js";
import { checkInFlowScenarios } from "./scenarios/check-in-flow.eval.js";
import { endWorkoutSummaryScenarios } from "./scenarios/end-workout-summary.eval.js";
import { painSafetyScenarios } from "./scenarios/pain-safety.eval.js";
import { progressionScenarios } from "./scenarios/progression.eval.js";
import { scopedWorkoutModificationScenarios } from "./scenarios/scoped-workout-modification.eval.js";
import { skipExerciseScenarios } from "./scenarios/skip-exercise.eval.js";
import { strengthSourceOfTruthScenarios } from "./scenarios/strength-source-of-truth.eval.js";
import { workoutLoggingScenarios } from "./scenarios/workout-logging.eval.js";
import { workoutMediaScenarios } from "./scenarios/workout-media.eval.js";
import { workoutStateScenarios } from "./scenarios/workout-state.eval.js";
import { workoutVariationScenarios } from "./scenarios/workout-variations.eval.js";
import type { EvalScenario } from "./types.js";

const scenarios: EvalScenario[] = [
  ...strengthSourceOfTruthScenarios,
  ...cardioAddonScenarios,
  ...scopedWorkoutModificationScenarios,
  ...skipExerciseScenarios,
  ...workoutLoggingScenarios,
  ...painSafetyScenarios,
  ...progressionScenarios,
  ...checkInFlowScenarios,
  ...workoutStateScenarios,
  ...endWorkoutSummaryScenarios,
  ...workoutMediaScenarios,
  ...workoutVariationScenarios
];

async function runScenario(scenario: EvalScenario): Promise<string[]> {
  const actual = await scenario.run();
  const actions = actual.actions ?? [];

  return [
    ...assertTextIncludes(actual.reply, scenario.expect.replyIncludes ?? []),
    ...assertTextExcludes(actual.reply, scenario.expect.replyExcludes ?? []),
    ...assertActionsInclude(actions, scenario.expect.actionsInclude ?? []),
    ...assertActionsExclude(actions, scenario.expect.actionsExclude ?? [])
  ];
}

async function main() {
  let failed = 0;

  for (const scenario of scenarios) {
    const errors = await runScenario(scenario);
    if (errors.length === 0) {
      console.log(`PASS ${scenario.name}`);
      continue;
    }

    failed += 1;
    console.log(`FAIL ${scenario.name}`);
    for (const error of errors) {
      console.log(`  ${error}`);
    }
  }

  console.log("");
  console.log(`${scenarios.length - failed}/${scenarios.length} evals passed`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main();
