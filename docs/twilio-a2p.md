# Twilio A2P Registration

## Public pages

- Privacy Policy:
  `https://maverickalo.github.io/ai-coach/privacy.html`
- Terms & Conditions:
  `https://maverickalo.github.io/ai-coach/terms.html`

These routes are served from the repository root and must remain stable during
campaign review.

## Campaign description

Coach AI provides opted-in users with personal workout reminders, workout
logging prompts, and conversational fitness coaching by SMS. Users text their
results, questions, scheduling constraints, exercise substitutions, or
voluntarily shared pain and injury notes. Coach AI responds with concise
training guidance and follow-up questions.

## Opt-in flow

The user initiates consent by texting `START` to the Coach AI number after being
shown the number and the service's Privacy Policy and Terms & Conditions.

Opt-in confirmation:

> Coach AI: You are now opted in to receive workout reminders, workout logging
> prompts, and coaching messages. Message frequency varies. Msg & data rates
> may apply. Reply HELP for help. Reply STOP to opt out.

Consent timestamp and current opt-in state are stored on the user record.

## Keyword responses

### START

> Coach AI: You are now opted in to receive workout reminders, workout logging
> prompts, and coaching messages. Message frequency varies. Msg & data rates
> may apply. Reply HELP for help. Reply STOP to opt out.

### HELP

> Coach AI: Reply with your workout results, questions, or updates like "wrist
> hurts" or "I only have 30 minutes." Message frequency varies. Msg & data
> rates may apply. Reply STOP to opt out.

### STOP

> Coach AI: You have been opted out and will no longer receive messages. Reply
> START to opt back in.

START, STOP, HELP, and common opt-out synonyms are handled without an AI call.

## Sample campaign messages

Daily workout:

> Coach: Good morning Sean. Today is Lower Body Strength. Main work: Back Squat
> 5x8, Romanian Deadlift 4x10, Reverse Lunge 3x12 each leg, Box Step-Up 3x15
> each leg. Reply when done and I'll log it.

Follow-up:

> Logged your squats and RDL. I didn't see Box Step-Up. Did you skip it, modify
> it, or forget to log it?

Pain response:

> Don't push through wrist pain. Stop or modify the painful movement. How bad
> is it from 1-10? If it is severe, sudden, or worsening, consult a medical
> professional.

Weekly review:

> Weekly review: 5 of 6 strength workouts completed. Squat work was consistent,
> but Thursday fatigue was high. Next week, hold Thursday RDL load and keep
> logging RPE.

## Data statement

The service may collect:

- mobile phone number
- SMS messages
- workout logs
- preferences
- voluntarily shared pain and injury notes

The data is used only to provide and operate the coaching service. Mobile phone
numbers are not shared with third parties or affiliates for marketing or
promotional purposes.

## Registration checklist

1. Brand registration uses the same legal business/contact information shown
   in the Twilio account.
2. Campaign use case is conversational or low-volume mixed messaging.
3. Campaign description matches the service described above.
4. Opt-in workflow explicitly says the user texts `START`.
5. Sample messages identify Coach AI and include expected coaching content.
6. Privacy and Terms URLs are public without authentication.
7. Privacy language includes the mobile-number non-sharing statement.
8. Terms and opt-in confirmation include message frequency, message/data rates,
   STOP, and HELP disclosures.
9. Twilio Messaging Service is associated with the approved campaign.
10. Production webhook points to:
    `https://YOUR-RAILWAY-DOMAIN/twilio/inbound`
11. `APP_BASE_URL` exactly matches the public Railway origin so signature
    validation uses the same URL Twilio signed.
12. Test START, HELP, STOP, re-START, inbound workout logging, and opted-out job
    suppression before production messaging.
