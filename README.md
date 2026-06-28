# Coach AI

Coach AI is a mobile-first HYROX and strength training coach. The primary MVP
is a dark web app that shows today's workout and supports natural-language
coaching conversations. It accepts training logs, follows up on missing work,
tracks preferences and pain reports, recommends progression, and produces a
weekly review.

The interaction is designed to feel like texting a coach rather than filling
out a workout tracker. Twilio SMS remains an optional transport that can be
enabled after A2P approval.

## Tech stack

- Node.js 22 and TypeScript
- Next.js and React
- Fastify
- Drizzle ORM
- Supabase Postgres and Auth
- Twilio SMS as an optional channel
- OpenAI Responses API with structured outputs
- Railway
- pnpm workspaces
- Static HTML for the A2P compliance site

## Repository

```text
apps/
  api/                  Fastify API, services, schema, migrations, and seed
  web/                  Next.js mobile web portal and Supabase Auth client
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
Next.js web app or Twilio SMS
  -> authenticated web route or Twilio adapter
  -> Conversation Engine
  -> Coach Engine
  -> Workout / Memory / Progression Engines
  -> Drizzle / Supabase
  -> OpenAI Responses API
  -> web response or Twilio adapter
```

The web and Twilio layers are transports only. They authenticate or validate
requests and delegate to the same Conversation Engine. The Coach Engine returns
a reply and structured actions; it never writes to the database directly.

See [docs/architecture.md](docs/architecture.md) for the complete design.

## Setup

Prerequisites:

- Node.js 22+
- pnpm through Corepack
- Supabase project with Postgres and Auth
- OpenAI API key
- Twilio account and Messaging Service or phone number when enabling SMS

Install dependencies:

```bash
corepack enable
pnpm install
```

Create local configuration:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

The API package reads `apps/api/.env`:

```dotenv
PORT=3001
DATABASE_URL=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.3
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_FROM_NUMBER=
COACH_OWNER_PHONE_NUMBER=
COACH_OWNER_EMAIL=
APP_BASE_URL=http://localhost:3001
WEB_APP_URL=http://localhost:3000
COACH_TIMEZONE=America/Los_Angeles
DAILY_WORKOUT_SEND_TIME=06:30
INTERNAL_JOB_SECRET=
```

The web app reads `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Use either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`. A Messaging
Service is preferred for production. Twilio variables can be left blank when
using only the web MVP.

In Supabase Auth, enable email magic links and add this local redirect URL:

```text
http://localhost:3000/auth/confirm
```

Set `COACH_OWNER_EMAIL` to the email that should be linked to Sean's seeded
profile. Other authenticated emails create separate multi-user profiles.

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

Set at least one of `COACH_OWNER_PHONE_NUMBER` or `COACH_OWNER_EMAIL` before
seeding. The seed is idempotent and may be rerun.

## Run locally

```bash
pnpm dev
```

This starts:

- Web app: `http://localhost:3000`
- API: `http://localhost:3001`

Health check:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{"ok":true}
```

Without `DATABASE_URL`, the server intentionally exposes only `/health`.

## Simulate inbound SMS

The development route does not call Twilio:

```bash
curl -X POST http://localhost:3001/dev/simulate-message \
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
| `GET` | `/today` | Authenticated current workout |
| `GET` | `/messages` | Authenticated conversation history |
| `POST` | `/chat` | Authenticated web coaching message |
| `GET` | `/workouts` | Authenticated workout history |
| `GET` | `/profile` | Authenticated profile |
| `PUT` | `/profile` | Authenticated profile update |
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

Create two Railway services from this repository.

API service:

1. Use the root `railway.json`.
2. Add the API environment variables from `apps/api/.env.example`.
3. Use the Supabase transaction-pooler connection string for `DATABASE_URL`
   when appropriate.
4. Run `pnpm db:migrate` and `pnpm db:seed` against production.
5. Set `APP_BASE_URL` to the public API HTTPS URL.
6. Set `WEB_APP_URL` to the public web HTTPS URL.
7. Configure the optional Twilio inbound webhook as:
   `https://YOUR-RAILWAY-DOMAIN/twilio/inbound`
8. Invoke job routes from a scheduler with `x-job-secret`, or create
   dedicated Railway cron services that call the same job classes.

Web service:

1. Set the build command to `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @coach-ai/web build`.
2. Set the start command to `pnpm --filter @coach-ai/web start`.
3. Add the three public variables from `apps/web/.env.example`.
4. Add `https://YOUR-WEB-DOMAIN/auth/confirm` to Supabase Auth redirect URLs.

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
- A real Supabase project is required for the authenticated web acceptance
  test. Live Twilio credentials are only required for the optional SMS path.
