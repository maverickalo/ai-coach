# Coach AI Evals

Coach AI uses evals to protect product behavior that unit tests do not describe
well enough.

The core rule is:

> The weekly strength plan is the source of truth.

Cardio, HYROX conditioning, finishers, substitutions, and recovery work are
allowed, but they are optional layers around the planned strength workout. Coach
AI should not replace the planned strength session unless the user explicitly
asks to shorten, lengthen, or modify the session.

## Run

```bash
pnpm evals
```

The runner prints product-readable output:

```text
PASS cardio is an add-on, not a rewrite
PASS bare skip resolves the active check-in path
FAIL exploratory cardio prompt routes to optional add-on
  Expected reply to include "optional"
```

## Structure

```text
apps/api/src/evals/
  eval-runner.ts
  assertions/
    action-assertions.ts
    text-assertions.ts
  fixtures/
    coach-context.fixture.ts
  scenarios/
    cardio-addon.eval.ts
    check-in-flow.eval.ts
    pain-safety.eval.ts
    progression.eval.ts
    skip-exercise.eval.ts
    strength-source-of-truth.eval.ts
    workout-logging.eval.ts
```

## First-Pass Coverage

- Strength source of truth: cardio and HYROX prompts must preserve the planned
  strength workout.
- Skip handling: `skip` resolves the current check-in path, and `skip bench`
  logs Bench Press as skipped.
- Workout logging: completed and skipped exercises produce structured actions.
- Pain safety: pain replies ask severity and avoid unsafe coaching language.
- Progression: RPE 7 completion gets a small increase; pain blocks increases.
- Check-in flow: daily posts tell the user to reply `starting now`, and skip
  during a check-in is not treated as completed work.

These evals are deterministic and do not call OpenAI. Model-backed evals can be
added later once there is a stable recorded dataset of real Slack conversations.
