# Development Roadmap

## Milestone 1: Foundation

Status: scaffolded

- pnpm monorepo
- Fastify API
- typed environment configuration
- static A2P site and stable root compatibility routes
- `/health`
- Railway configuration

## Mobile Web Portal MVP

Status: implemented; requires Supabase environment configuration

- Next.js and React mobile-first web app
- dark-only interface with iPhone safe-area support
- Supabase email magic-link authentication
- protected coach, workout history, and settings routes
- today's workout card and natural-language chat
- optimistic messages, loading state, and quick actions
- authenticated API routes that reuse the Conversation Engine
- Slack is available as the primary conversational channel outside the web app

Exit test:

```bash
pnpm dev
```

Open `http://localhost:3000`, sign in, and send a message from `/coach`.

## Milestone 2: Data model and seed

Status: scaffolded; requires a live Supabase execution

- 18-table Drizzle schema
- generated SQL migration
- Sean profile
- complete equipment list
- exercise catalog and substitutions
- confidence-scored explicit memories
- seven-day HYROX strength and recovery plan

Exit test:

```bash
pnpm db:migrate
pnpm db:seed
```

## Milestone 3: Workout delivery

Status: implemented

- local-timezone workout selection
- idempotent workout creation by user/date
- concise daily workout reminder
- Slack and optional email delivery
- outbound message storage
- `/jobs/send-daily-workout`
- in-process production daily reminder scheduler
- exercise video and GIF-search links in daily posts and check-ins
- `starting now` in-session check-ins for the next unlogged main exercise

Remaining:

- add delivery retries and alerting

## Milestone 4: Conversation and OpenAI

Status: implemented

- deterministic START, STOP, HELP
- fuzzy intent classification
- Responses API structured outputs
- structured Coach Context
- concise Coach Engine replies
- deterministic fallback behavior during AI outages

Remaining:

- evaluation dataset for real message examples
- prompt and model telemetry
- unresolved follow-up conversation state

## Milestone 5: Workout logging

Status: implemented

- natural-language structured parsing
- regex fallback for common weight formats
- exercise summary persistence
- per-set persistence when sets/reps are numeric
- skipped and substituted exercises
- pain memories and events
- missing-exercise follow-ups
- structured conditioning logs for run, treadmill, rower, Assault Bike, sled,
  battle ropes, circuits, walks, calories, distance, duration, intensity, and RPE

Remaining:

- broader exercise alias coverage
- unit preference and kg/lb normalization
- database transaction around each inbound message

## Milestone 6: Progression and safety

Status: implemented for V1 rules

- deterministic progression with reasons
- missed-rep and RPE hold rules
- lower/upper/dumbbell increments
- pain blocks progression
- time and dislike skip handling
- safe pain follow-up language
- deterministic short, standard, long, strength-biased, and HYROX-biased
  workout reshaping
- missed-day replanning guidance that avoids doubling hard lower-body work

Remaining:

- repeated-skip counts from historical events
- permanent substitution confirmation workflow
- periodization and deload rules
- human escalation policy

## Milestone 7: Slack production path

Status: implemented; requires production channel configuration

- Slack Events API webhook
- production signature validation
- app DM and private-channel replies
- scheduled channel reminders
- webhook idempotency

Remaining:

- configure `SLACK_CHANNEL_ID`
- error queue and alerting

## Milestone 8: Weekly review and operations

Status: implemented; requires schedule configuration

- previous local-week calculation
- workout and exercise-log aggregation
- structured AI weekly review
- deterministic fallback review
- stored review and outbound Slack/email delivery
- protected job route

Remaining:

- running-summary integration
- PR detection
- recovery trend metrics
- production dashboards and alerts

## Production hardening

Before onboarding additional users:

1. Add transaction boundaries and an outbox for reliable messaging.
2. Add integration tests with disposable Postgres.
3. Add rate limits and abuse controls.
4. Add encrypted secret management and log redaction.
5. Add backups, retention policy, and user deletion/export workflows.
6. Add per-user scheduling and quiet hours.
7. Keep A2P legal pages stable while SMS remains inactive.
8. Add model evaluations for parsing accuracy, missing-exercise behavior, and
   pain safety.
9. Add monitoring for Slack/email delivery failures and OpenAI errors.
10. Add browser-level authenticated tests against a dedicated Supabase test
    project.
