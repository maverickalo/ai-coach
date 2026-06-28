import "dotenv/config";
import { z } from "zod";

const optionalSecret = z.string().trim().min(1).optional();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: optionalSecret,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-5.3"),
  TWILIO_ACCOUNT_SID: optionalSecret,
  TWILIO_AUTH_TOKEN: optionalSecret,
  TWILIO_MESSAGING_SERVICE_SID: optionalSecret,
  TWILIO_FROM_NUMBER: optionalSecret,
  COACH_OWNER_PHONE_NUMBER: optionalSecret,
  APP_BASE_URL: z.string().url().optional(),
  COACH_TIMEZONE: z.string().trim().min(1).default("America/Los_Angeles"),
  DAILY_WORKOUT_SEND_TIME: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("06:30"),
  INTERNAL_JOB_SECRET: optionalSecret
});

export const env = envSchema.parse(process.env);

export type Environment = z.infer<typeof envSchema>;
