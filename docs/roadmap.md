# Development Roadmap

## Milestone 1: Foundation

Status: scaffolded

- pnpm monorepo
- Fastify API
- typed environment configuration
- static A2P site and stable root compatibility routes
- `/health`
- Railway configuration

## Milestone 2: Data model and seed

Status: scaffolded; requires a live Supabase execution

- 17-table Drizzle schema
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
- concise daily workout SMS
- opted-in user enforcement
- outbound message storage
- `/jobs/send-daily-workout`

Remaining:

- configure the actual Railway schedule
- add Twilio delivery-status callbacks and retries

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

Remaining:

- repeated-skip counts from historical events
- permanent substitution confirmation workflow
- periodization and deload rules
- human escalation policy

## Milestone 7: Twilio production path

Status: implemented; requires credentials and live verification

- Twilio form webhook
- production signature validation
- TwiML replies
- outbound Messaging Service support
- webhook idempotency

Remaining:

- end-to-end test with a Twilio number
- status callbacks
- error queue and alerting

## Milestone 8: Weekly review and operations

Status: implemented; requires schedule configuration

- previous local-week calculation
- workout and exercise-log aggregation
- structured AI weekly review
- deterministic fallback review
- stored review and outbound SMS
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
7. Add consent evidence reporting for A2P audits.
8. Add model evaluations for parsing accuracy, missing-exercise behavior, and
   pain safety.
9. Add monitoring for Twilio delivery failures and OpenAI errors.
10. Add Next.js only after the SMS workflow is stable.
