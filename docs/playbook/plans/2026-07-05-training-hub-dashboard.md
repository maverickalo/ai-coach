# Training Hub Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: First use playbook:plan-gap-auditor to audit this plan. Then use playbook:subagent-driven-development (recommended) or playbook:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working Training Hub slice: Today dashboard, dedicated Workout cockpit, Progress basics, and API read models.

**Architecture:** The API remains the source of truth and returns dashboard/progress read models derived from Supabase. The web app renders structured screens and calls Coach API actions; Slack remains separate and updates the same database. Quick Coach is deferred to the next slice except for preserving existing chat behavior behind scoped prompts.

**Tech Stack:** Node.js, TypeScript, Fastify, Drizzle ORM, Supabase Postgres, Next.js, React, CSS modules via existing global CSS.

---

## File Structure

- Modify `apps/api/src/services/web/web-portal-service.ts`: add dashboard/progress read models and keep workout-log attachment helpers.
- Modify `apps/api/src/routes/web.routes.ts`: expose `GET /dashboard`, `GET /progress`, and structured exercise logging.
- Modify `apps/web/src/lib/types.ts`: add Dashboard, Progress, and exercise log types.
- Modify `apps/web/src/lib/api.ts`: add `dashboard()`, `progress()`, and `logExercise()`.
- Replace `apps/web/src/app/coach/page.tsx`: make it the Today Training Hub.
- Create `apps/web/src/app/workout/page.tsx`: active workout cockpit using the existing `TodayWorkoutCard`.
- Create `apps/web/src/app/progress/page.tsx`: searchable logbook, simple chart, and recommendation board.
- Modify `apps/web/src/components/BottomNav.tsx`: use Today, Workout, Progress, Settings.
- Modify `apps/web/src/proxy.ts`: protect `/workout` and `/progress`.
- Modify `apps/web/src/styles/globals.css`: add dashboard/progress layout styles.

## Task 1: API Dashboard Read Model

**Files:**
- Modify: `apps/api/src/services/web/web-portal-service.ts`
- Modify: `apps/api/src/routes/web.routes.ts`

- [ ] Add `getDashboard(userId)` to return today's workout, week strip, progress snapshot, and recent recommendation summaries.
- [ ] Add `GET /dashboard` route.
- [ ] Run `pnpm --filter @coach-ai/api typecheck`.

Expected API shape:

```ts
{
  today: TodayWorkout | null;
  week: Array<{
    date: string;
    dayLabel: string;
    workoutName: string;
    status: string;
    isToday: boolean;
  }>;
  progress: {
    workoutsCompletedThisWeek: number;
    totalWorkoutsThisWeek: number;
    exercisesLoggedThisWeek: number;
    skippedExercisesThisWeek: number;
    recentBestSet: string | null;
    nextWeightHighlight: string | null;
  };
  recommendations: Array<{
    id: string;
    title: string;
    reason: string;
    status: "pending";
  }>;
}
```

## Task 2: API Progress Read Model

**Files:**
- Modify: `apps/api/src/services/web/web-portal-service.ts`
- Modify: `apps/api/src/routes/web.routes.ts`

- [ ] Add `getProgress(userId, query?)`.
- [ ] Add `GET /progress`.
- [ ] Return searchable workout/exercise log rows, exercise trend rows, and recommendation rows with reasons.
- [ ] Run `pnpm --filter @coach-ai/api typecheck`.

## Task 3: Web API Types and Client

**Files:**
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/lib/api.ts`

- [ ] Add `Dashboard`, `ProgressOverview`, `ProgressLogEntry`, `ExerciseTrendPoint`, and `Recommendation` types.
- [ ] Add `coachApi.dashboard()` and `coachApi.progress(query?)`.
- [ ] Run `pnpm --filter @coach-ai/web typecheck`.

## Task 4: Today Training Hub

**Files:**
- Replace: `apps/web/src/app/coach/page.tsx`
- Modify: `apps/web/src/styles/globals.css`

- [ ] Render Today dashboard from `GET /dashboard`.
- [ ] Show Today Workout, Readiness/Time controls, Week Strip, Progress Snapshot, and Recommendation preview.
- [ ] Keep Open Workout as the primary action.
- [ ] Keep Adjust Session as a scoped prompt placeholder that sends user to workout/chat behavior later.
- [ ] Run `pnpm --filter @coach-ai/web typecheck`.

## Task 5: Dedicated Workout Cockpit

**Files:**
- Create: `apps/web/src/app/workout/page.tsx`
- Modify: `apps/web/src/components/TodayWorkoutCard.tsx`
- Modify: `apps/web/src/styles/globals.css`

- [ ] Move active workout logging out of the Today dashboard and into `/workout`.
- [ ] Use existing structured logging endpoint.
- [ ] Keep Swap/Pain/Adjust prompts available as scoped actions.
- [ ] Run `pnpm --filter @coach-ai/web typecheck`.

## Task 6: Progress Page

**Files:**
- Create: `apps/web/src/app/progress/page.tsx`
- Modify: `apps/web/src/styles/globals.css`

- [ ] Render search input and logbook results.
- [ ] Render simple mobile-friendly SVG chart for exercise trend.
- [ ] Render recommendation board with reasons.
- [ ] Run `pnpm --filter @coach-ai/web typecheck`.

## Task 7: Navigation and Auth

**Files:**
- Modify: `apps/web/src/components/BottomNav.tsx`
- Modify: `apps/web/src/proxy.ts`

- [ ] Change bottom nav to Today, Workout, Progress, Settings.
- [ ] Protect `/workout` and `/progress`.
- [ ] Keep root redirect to `/coach` for now, because `/coach` is the Today route.
- [ ] Run `pnpm --filter @coach-ai/web typecheck`.

## Task 8: Verification

**Files:**
- Existing local app files

- [ ] Run `pnpm --filter @coach-ai/api typecheck`.
- [ ] Run `pnpm --filter @coach-ai/web typecheck`.
- [ ] Start API with Railway env: `railway run --service coach-api pnpm dev:api`.
- [ ] Use existing local Next server or start `pnpm dev:web`.
- [ ] Verify `/coach`, `/workout`, and `/progress` render locally.

## Deferred Follow-Up

- Quick Coach drawer with confirm/apply flows.
- Session preview endpoints.
- Recommendation lifecycle table.
- Supabase Realtime.
- More detailed charts and exercise detail pages.
