# Architecture

## System flow

```text
Inbound SMS
  -> Twilio signature validation and normalization
  -> Conversation Engine
  -> deterministic START / STOP / HELP handling
  -> user and conversation lookup
  -> structured Coach Context
  -> intent classification
  -> structured workout parsing when applicable
  -> Coach Engine
  -> validated actions
  -> Workout / Memory / Progression services
  -> Drizzle / Supabase
  -> persisted outbound message
  -> TwiML response
```

Scheduled messages use the same domain services:

```text
Railway scheduler
  -> Daily Workout or Weekly Review Job
  -> Workout Engine / OpenAI
  -> Messaging Service
  -> Twilio provider
```

## Module responsibilities

### Twilio adapter

Files: `src/adapters/twilio`

- Validates production webhook signatures.
- Converts Twilio form fields into an internal message.
- Creates TwiML responses.
- Sends outbound SMS through a Messaging Service SID or phone number.
- Contains no coaching, workout, progression, or memory decisions.

### Conversation Engine

File: `src/services/conversation/conversation-engine.ts`

- Owns the inbound application workflow.
- Finds or creates users and conversations.
- Stores inbound and outbound messages.
- Handles webhook idempotency.
- Handles START, STOP, and HELP before any model call.
- Builds context, classifies intent, invokes the Coach Engine, and applies
  returned actions.
- Is the transaction/orchestration boundary for future reliability work.

### Coach Engine

File: `src/services/coach/coach-engine.ts`

- Receives structured context rather than database rows.
- Produces concise coaching text and structured actions.
- Adds missing-exercise follow-ups.
- Adds pain-safe guidance.
- Produces progression recommendation events.
- Never writes to the database.

### Workout Engine

File: `src/services/workout/workout-engine.ts`

- Selects a workout using the user's local day.
- Creates a scheduled workout exactly once per user/date.
- Loads prescribed exercises in order.
- Persists exercise summaries and set detail.
- Builds concise daily workout SMS text.
- Loads weekly workout and exercise-log data.

### Workout Log Parser

File: `src/services/workout/workout-log-parser.ts`

- Uses OpenAI structured output when configured.
- Falls back to deterministic parsing for common `225 5x8`, RPE, skipped
  exercise, and pain patterns.
- Normalizes common aliases such as squat, RDL, bench, and step-ups.
- Detects prescribed exercises that were not mentioned.

### Progression Engine

File: `src/services/progression/progression-engine.ts`

- Is deterministic and pure.
- Increases lower-body barbell lifts by 5 lb after completed work at RPE 7 or
  below.
- Increases upper-body barbell or dumbbell work by 2.5 lb.
- Holds load at RPE 8 or after missed work.
- Blocks load increases when pain is reported.
- Reorders time-skipped work and offers modification/replacement for repeated
  preference skips.
- Returns a reason with every recommendation.

### Memory Engine

File: `src/services/memory/memory-engine.ts`

- Retrieves high-confidence, recent memories.
- Stores explicit statements at the supplied confidence.
- Increases repeated inferred memories gradually.
- Prevents weak inferred memories from overwriting high-confidence explicit
  memories.
- Stores dated pain reports as injury memories.

### OpenAI client

File: `src/services/openai/openai.client.ts`

- Uses the OpenAI Responses API.
- Uses Zod-backed structured outputs for intent, workout logs, coaching text,
  memory candidates, and weekly reviews.
- Keeps prompts versioned in `coach-prompts.ts`.
- Has deterministic fallbacks for intent and workout parsing.

### Scheduler jobs

Files: `src/services/scheduler`

- Daily job creates today's workout if missing, sends a concise reminder, and
  stores the outbound message.
- Weekly job gathers the previous local week, generates a review, stores it,
  and sends it.
- Neither job sends messages to an opted-out user.

## Database schema

| Table | Responsibility |
| --- | --- |
| `users` | Phone identity, timezone, and SMS consent state |
| `user_profiles` | Goal, style, diet, and injury notes |
| `equipment` | Per-user available equipment |
| `exercises` | Exercise catalog, instructions, equipment, substitutions |
| `workout_plans` | User-owned active plans |
| `workout_templates` | Day-of-week workout definitions |
| `workout_template_exercises` | Ordered prescriptions |
| `workouts` | Scheduled and completed workout instances |
| `exercise_logs` | Per-exercise summary, status, load, RPE, pain, notes |
| `exercise_sets` | Individual set details |
| `substitutions` | Original and substitute exercise pairs |
| `memories` | Confidence-scored long-term memory |
| `conversations` | Channel-level threads |
| `messages` | Inbound/outbound message history |
| `coach_events` | Important immutable domain events |
| `weekly_reviews` | Generated weekly summaries and recommendations |
| `processed_webhooks` | Provider webhook idempotency |

`coach_events` is an audit and product-learning stream, not the source of truth
for all state. Current state remains in normalized tables.

## API behavior

### `GET /health`

Returns:

```json
{"ok":true}
```

### `POST /twilio/inbound`

- Accepts Twilio form-encoded webhook fields.
- Verifies `X-Twilio-Signature` in production.
- Requires the exact public `APP_BASE_URL` for correct signature construction.
- Returns a TwiML `<Message>` response.

### `POST /dev/simulate-message`

- Development only.
- Uses the complete conversation workflow without Twilio.
- Persists messages and actions.

### Job routes

- `POST /jobs/send-daily-workout`
- `POST /jobs/send-weekly-review`

Production requests require `x-job-secret`.

## AI versus deterministic logic

Use OpenAI for:

- fuzzy intent classification
- natural-language workout parsing
- concise coaching wording
- exercise explanations
- memory candidates
- weekly review summarization

Use deterministic code for:

- START, STOP, and HELP
- SMS consent enforcement
- dates and workout selection
- database queries and writes
- schema validation
- idempotency
- missing-exercise comparison
- progression rules
- job authorization
- Twilio signature validation
- maximum message length

The model proposes or formats. Application services validate and persist.

## Important production improvements

1. Wrap inbound message storage, action application, outbound storage, and
   webhook completion in one database transaction.
2. Move scheduled jobs to a durable queue before supporting many users.
3. Add retries and delivery-status webhooks for outbound Twilio messages.
4. Add prompt/model/evaluation telemetry and redact phone numbers from logs.
5. Store unit preference explicitly; V1 preserves numeric weights without
   conversion.
6. Add a conversation-state table for unresolved follow-up questions.
7. Add row-level security policies if the future Next.js frontend accesses
   Supabase directly. The API currently uses a server connection string.
8. Add integration tests against a disposable Postgres instance.
9. Add an exercise alias table rather than relying on the V1 parser map.
10. Add human escalation and emergency-language policies before broader public
    use.
