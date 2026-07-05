# Coach AI Training Hub Dashboard Design

Date: 2026-07-05

## Summary

Coach AI should use a web-first Training Hub as the primary structured interface and Slack as the longer-form coaching surface. The website should not feel like Slack in a browser. It should feel like a personal training dashboard that shows today's workout, the week plan, recent progress, and fast controls for logging or adjusting training.

The core product split is:

- Today is for action.
- Progress is for evidence and planning.
- Slack is for longer coaching conversations, reminders, and check-ins.
- The Coach API and Supabase remain the shared source of truth.

## Product Principles

The weekly strength plan is the source of truth. The dashboard can help adjust, shorten, extend, swap, or add conditioning, but it should not rewrite the planned strength workout unless the user explicitly confirms a change.

The website should favor structured controls over open-ended chat. Chat exists on the site only as Quick Coach: a small contextual assistant for fast edits. Larger coaching conversations happen in Slack.

Every meaningful training recommendation must be explainable. If Coach AI recommends a weight increase, hold, substitution, or deload, it should show the reason.

## Navigation

The mobile app should use four primary areas:

- Today
- Workout
- Progress
- Settings

Slack remains outside the site. The site may link to Slack or mirror important updates, but it should not embed Slack or become a second full chat client.

## Today: Training Hub

The first screen should be the Training Hub. It should include:

- Today's Workout
- Readiness / Time controls
- Week Strip
- Progress Snapshot

It should not lead with the full coach chat thread.

### Today's Workout Module

This module should show:

- Workout name
- Focus
- Estimated duration
- Main exercises
- Strength-source-of-truth reminder
- Primary action: Open Workout
- Secondary action: Adjust Session

The module should answer: what am I doing today?

### Readiness / Time Controls

This module should let the user quickly say:

- Short session
- Normal session
- Longer session
- More HYROX
- Low energy
- Sore or painful

These controls should adjust optional work or produce a preview. They should not silently rewrite the strength plan.

### Week Strip

The week strip should show the current training week with status indicators:

- Completed
- Today
- Upcoming
- Skipped
- Recovery
- Moved

This helps the user understand skipped-day reshuffling and where today's workout fits.

### Progress Snapshot

The first screen should include a compact snapshot, not a full analytics dashboard. It can show:

- Workouts completed this week
- Current streak or consistency
- Recent PR or best set
- Exercises skipped recently
- One next-weight highlight

Full details belong in Progress.

## Workout Screen

The Workout screen is the active training cockpit. It should show each prescribed exercise as a structured card.

Each exercise card should include:

- Exercise name
- Prescription
- Last performance
- Suggested target
- Cues or short purpose
- Demo links
- Weight / reps / RPE inputs
- Complete
- Skip
- Swap
- Pain
- Explain

Logging should be fast. The default path is structured input, with natural language available only when needed.

## Quick Coach

Quick Coach is the website's lightweight contextual chat. It should open from a specific action and carry context automatically.

Examples:

- Swap Bench Press
- Explain Romanian Deadlift
- Wrist pain on Bench Press
- Add HYROX to today's Push workout
- Shorten today's session

Quick Coach should not be a full global chat replacement for Slack.

### Scoped Flow

For one exercise:

1. User taps an action like Swap.
2. Quick Coach opens with that exercise and workout context attached.
3. Coach suggests 2-3 options.
4. User picks one or types freeform if the options are wrong.
5. Coach creates a structured change.
6. User confirms.
7. API writes the change to Supabase.
8. Dashboard refreshes.

### Freeform Escape

If the suggested options are wrong, the user can type naturally.

Examples:

- I want cables today.
- No pressing because my wrist hurts.
- I hate this movement. Give me something else.
- I only have dumbbells.

The system should then respond with better options and still require confirmation before changing the workout.

## Session Edits

Changing more than one exercise should use a session-level flow, not repeated single-exercise swaps.

Session edits include:

- Shorten the workout
- Make today more HYROX
- Avoid all pressing
- Remove lower-body work because knees hurt
- Replace multiple disliked exercises
- Adjust the session because of time, energy, soreness, or equipment

Session edits must produce a preview before apply.

The preview should show:

- Removed exercises
- Replacement exercises
- Unchanged exercises
- Optional work changes
- Reasons for each important change

The user must confirm before the workout changes.

## Slack Boundary

Slack should handle:

- Daily reminders
- Check-ins
- Longer coach conversations
- Bigger strategy changes
- Weekly review discussion
- Confirmations after important changes

The website should handle:

- Today's dashboard
- Workout logging
- Quick edits
- Progress search
- Recommendations
- Structured review of training data

Both surfaces should call the same Coach API and update the same Supabase-backed state.

## Live Updates

The website should update from the database, not directly from Slack.

MVP behavior:

- Website actions call the API and refetch current data after success.
- While the dashboard is open, the site polls current workout data every 5-10 seconds.
- Slack-originated changes write to Supabase through the API.
- The website picks up those changes through polling.

Later behavior:

- Replace polling with Supabase Realtime or a server-sent events stream.

## Progress Area

The Progress area should be separate from Today. Today is for action. Progress is for evidence and planning.

Progress should include three sections:

- Searchable Logbook
- Exercise Progress Charts
- Recommendation Board

## Searchable Logbook

The logbook should support search and filters across:

- Workout name
- Exercise
- Date
- Weight
- Reps
- RPE
- Skipped exercises
- Pain notes
- Substitutions
- PRs
- Coach notes

Useful example searches:

- bench
- wrist
- skipped step-ups
- RPE 9
- squat last month

Search results should show both workout-level and exercise-level matches.

## Exercise Progress Charts

Exercise detail pages should show:

- Weight over time
- Reps over time
- Volume over time
- RPE trend
- Estimated 1RM
- Best set
- Last performed
- Missed reps
- Skipped trend
- Pain notes associated with that exercise

The first version should keep charts simple and readable on mobile.

## Recommendation Board

The Recommendation Board should show how Coach AI plans to progress training.

Each recommendation should include:

- Exercise
- Next target
- Reason
- Status
- Related last performance
- Safety notes if relevant

Recommendation statuses:

- Pending
- Accepted
- Rejected
- Applied
- Superseded

Examples:

- Bench Press: try 230 x 5 x 8 because 225 x 5 x 8 was completed at RPE 7.
- Back Squat: hold at 225 because reps were missed on the final set.
- Bench Press: do not progress because wrist pain was reported.
- Step-Ups: no progression because the exercise was skipped.

Progression logic should remain deterministic. AI can explain and summarize, but it should not invent progression decisions outside the rules.

## API and Data Implications

The existing schema already covers much of the need:

- workouts
- workout_templates
- workout_template_exercises
- exercise_logs
- exercise_sets
- substitutions
- conditioning_logs
- coach_events
- memories

Likely new or expanded API read models:

- GET /dashboard
- GET /today
- GET /workouts/:id
- GET /progress/search
- GET /progress/exercises/:exerciseId
- GET /recommendations
- POST /quick-coach
- POST /workouts/:id/session-preview
- POST /workouts/:id/apply-session-preview

If recommendations need stronger lifecycle tracking than coach_events can provide, add a dedicated recommendations table later. For the MVP, coach_events can store generated recommendations if that keeps scope lower.

## Testing and Evals

Add tests and evals for:

- The dashboard never silently rewrites the strength plan.
- Single-exercise swaps only modify the selected exercise.
- Session edits require preview before apply.
- Cardio/HYROX additions stay optional unless the user confirms a session change.
- Slack-originated changes appear on the web after polling/refetch.
- Skipped exercises do not receive progression recommendations.
- Pain reports block progression and trigger safer options.
- Every progression recommendation includes a reason.

## MVP Scope

Build first:

- Training Hub first screen
- Workout cockpit with structured logging
- Scoped Quick Coach drawer
- Session edit preview
- Searchable workout logbook
- Simple exercise progress chart
- Recommendation board with reasons
- Polling/refetch for Slack-originated updates

Defer:

- Complex analytics dashboards
- Many chart types
- Full Slack/web conversation sync
- Supabase Realtime
- CMS-like plan editing
- Native mobile app

## Open Decisions

No blocking decisions remain for implementation planning. The preferred design is:

- Training Hub first screen
- Today + Week + Progress Snapshot
- Quick Coach scoped to dashboard actions
- Freeform fallback inside Quick Coach
- Preview-before-apply for multi-exercise/session changes
- Slack for longer coach conversations
- Progress tab for search, charts, and recommendations
