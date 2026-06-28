# Coach AI

Coach AI is an SMS-first HYROX and strength training coach. It sends daily
workouts, accepts natural-language training logs, follows up on missing work,
tracks preferences and pain reports, recommends progression, and produces a
weekly review.

The interaction is designed to feel like texting a coach rather than filling
out a workout tracker.

## Tech stack

- Node.js 22 and TypeScript
- Fastify
- Drizzle ORM
- Supabase Postgres
- Twilio SMS
- OpenAI Responses API with structured outputs
- Railway
- pnpm workspaces
- Static HTML for the A2P compliance site

## Repository

```text
apps/
  api/                  Fastify API, services, schema, migrations, and seed
  site/                 Canonical static Privacy and Terms site
docs/
  architecture.md       Service boundaries, schema, routes, and design decisions
  twilio-a2p.md         A2P registration and messaging compliance checklist
  roadmap.md            Delivery milestones and production hardening
index.html              Compatibility mirror for the existing GitHub Pages route
privacy.html            Compatibility mirror for the existing Privacy URL
terms.html              Compatibility mirror for the existing Terms URL
```

The root HTML files intentionally mirror `apps/site`. GitHub Pages is already
configured from `main` and `/ (root)`, so the public URLs previously submitted
for Twilio A2P remain stable.

## Architecture

```text
Twilio SMS
  -> Twilio adapter
  -> Conversation Engine
  -> Coach Engine
  -> Workout / Memory / Progression Engines
  -> Drizzle / Supabase
  -> OpenAI Responses API
  -> Twilio adapter
  -> SMS reply
```

Twilio is transport only. The webhook normalizes and validates the request,
then delegates to the Conversation Engine. The Coach Engine returns a reply and
structured actions; it never writes to the database directly.

See [docs/architecture.md](docs/architecture.md) for the complete design.

## Setup

Prerequisites:

- Node.js 22+
- pnpm through Corepack
- Supabase Postgres project
- OpenAI API key
- Twilio account and Messaging Service or phone number

Install dependencies:

```bash
corepack enable
pnpm install
```

Create local configuration:

```bash
cp apps/api/.env.example apps/api/.env
```

The API package reads `apps/api/.env`. Required for full operation:

```dotenv
DATABASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.3
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_FROM_NUMBER=
COACH_OWNER_PHONE_NUMBER=
APP_BASE_URL=
COACH_TIMEZONE=America/Los_Angeles
DAILY_WORKOUT_SEND_TIME=06:30
INTERNAL_JOB_SECRET=
```

Use either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`. A Messaging
Service is preferred for production.

## Database

Generate and apply migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

Seed Sean's profile, equipment, exercises, explicit memories, and the default
weekly HYROX strength plan:

```bash
pnpm db:seed
```

`COACH_OWNER_PHONE_NUMBER` must be set before seeding. The seed is idempotent
and may be rerun.

## Run locally

```bash
pnpm dev
```

Health check:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"ok":true}
```

Without `DATABASE_URL`, the server intentionally exposes only `/health`.

## Simulate inbound SMS

The development route does not call Twilio:

```bash
curl -X POST http://localhost:3000/dev/simulate-message \
  -H 'content-type: application/json' \
  -d '{
    "phoneNumber": "+12065551234",
    "message": "Squat 225 5x8 felt easy, RDL 185 hard, skipped step ups"
  }'
```

The route stores the conversation and applies the same Coach Engine actions as
the Twilio webhook. It is disabled when `NODE_ENV=production`.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Railway health check |
| `POST` | `/twilio/inbound` | Validated Twilio SMS webhook |
| `POST` | `/dev/simulate-message` | Local message simulation |
| `POST` | `/jobs/send-daily-workout` | Create and send today's workout |
| `POST` | `/jobs/send-weekly-review` | Generate and send last week's review |

In production, job routes require the `x-job-secret` header matching
`INTERNAL_JOB_SECRET`.

## Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Tests cover deterministic SMS commands, progression rules, timezone workout
selection, fallback workout parsing, pain detection, and missing exercises.

## Railway deployment

1. Create a Railway project from this GitHub repository.
2. Add the environment variables from `.env.example`.
3. Use the Supabase transaction-pooler connection string for `DATABASE_URL`
   when appropriate for the deployment.
4. Deploy. `railway.json` installs, builds, starts the API, and checks `/health`.
5. Run `pnpm db:migrate` and `pnpm db:seed` against the production environment.
6. Set `APP_BASE_URL` to the public Railway HTTPS URL.
7. Configure the Twilio inbound webhook as:
   `https://YOUR-RAILWAY-DOMAIN/twilio/inbound`
8. Invoke the job routes from a scheduler with `x-job-secret`, or create
   dedicated Railway cron services that call the same job classes.

## GitHub Pages

The currently submitted routes remain:

- `https://maverickalo.github.io/ai-coach/privacy.html`
- `https://maverickalo.github.io/ai-coach/terms.html`

GitHub configuration:

**Settings → Pages → Deploy from a branch → main → / (root)**

When editing legal content, update `apps/site` and its matching root file in the
same commit so the existing public route does not change.

## Twilio A2P

Use [docs/twilio-a2p.md](docs/twilio-a2p.md) to complete registration. It
contains the opt-in description, sample messages, keyword responses, public
legal URLs, and production checklist.

## Current limitations

- The first production user is Sean, but all core tables are multi-user.
- Progression uses deterministic V1 rules and does not yet account for estimated
  one-rep max, fatigue models, or periodization.
- Natural-language parsing falls back to regex during OpenAI outages.
- Railway job triggering still needs to be configured in the Railway project.
- A real Supabase database and live Twilio credentials are required for the
  end-to-end SMS acceptance test.
