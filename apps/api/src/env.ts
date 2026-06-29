import "dotenv/config";
import { z } from "zod";

const optionalSecret = z.string().trim().min(1).optional();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: optionalSecret,
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_PUBLISHABLE_KEY: optionalSecret,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-5.4-mini"),
  SLACK_SIGNING_SECRET: optionalSecret,
  SLACK_BOT_TOKEN: optionalSecret,
  SLACK_ALLOWED_USER_ID: optionalSecret,
  SLACK_CHANNEL_ID: optionalSecret,
  RESEND_API_KEY: optionalSecret,
  REMINDER_EMAIL_FROM: optionalSecret,
  REMINDER_EMAIL_TO: z.string().email().optional(),
  COACH_OWNER_PHONE_NUMBER: optionalSecret,
  COACH_OWNER_EMAIL: z.string().email().optional(),
  APP_BASE_URL: z.string().url().optional(),
  WEB_APP_URL: z.string().url().default("http://localhost:3000"),
  COACH_TIMEZONE: z.string().trim().min(1).default("America/Los_Angeles"),
  DAILY_WORKOUT_SEND_TIME: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("06:30"),
  WORKOUT_CHECK_IN_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10),
  INTERNAL_JOB_SECRET: optionalSecret
});

export const env = envSchema.parse(process.env);

export type Environment = z.infer<typeof envSchema>;
