import { z } from "zod";

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
});

const squareEnvSchema = z.object({
  // Square
  SQUARE_ACCESS_TOKEN: z.string().min(1),
  // "production" or "sandbox"
  SQUARE_ENVIRONMENT: z.enum(["production", "sandbox"]).default("production"),
});

// NOTE: Supabase/email env vars are intentionally NOT required here so we can bring
// subsystems online incrementally (e.g. validate Square connection first).
const optionalEnvSchema = z.object({
  // Supabase (required once DB features are enabled)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Email (required once email features are enabled)
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),

  // Cron protection (required once cron route is enabled)
  CRON_SECRET: z.string().min(16).optional(),

  // Auth + DB (DynamoDB)
  AUTH_JWT_SECRET: z.string().min(32).optional(),
  DDB_REGION: z.string().min(1).optional(),
  DDB_USERS_TABLE: z.string().min(1).optional(),
  // Comma-separated recipient list for weekly email
  REPORT_RECIPIENTS: z.string().min(3).optional(),
});

export const env = baseEnvSchema
  .and(squareEnvSchema)
  .and(optionalEnvSchema)
  .parse({
    NODE_ENV: process.env.NODE_ENV,

    SQUARE_ACCESS_TOKEN: process.env.SQUARE_ACCESS_TOKEN,
    SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,

    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    RESEND_API_KEY: process.env.RESEND_API_KEY,

    CRON_SECRET: process.env.CRON_SECRET,

    AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET,
    DDB_REGION: process.env.DDB_REGION,
    DDB_USERS_TABLE: process.env.DDB_USERS_TABLE,
    REPORT_RECIPIENTS: process.env.REPORT_RECIPIENTS,
  });

export function requireSupabaseEnv() {
  const supabaseSchema = z.object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  });
  return supabaseSchema.parse(env);
}

export function requireEmailEnv() {
  const emailSchema = z.object({
    SMTP_USER: z.string().min(1),
    SMTP_PASS: z.string().min(1),
    RESEND_API_KEY: z.string().min(1).optional(),
  });
  return emailSchema.parse(env);
}

export function requireCronEnv() {
  const cronSchema = z.object({
    CRON_SECRET: z.string().min(16),
  });
  return cronSchema.parse(env);
}

export function requireAuthEnv() {
  const schema = z.object({
    AUTH_JWT_SECRET: z.string().min(32),
  });
  return schema.parse(env);
}

export function requireDdbEnv() {
  const schema = z.object({
    DDB_REGION: z.string().min(1),
    DDB_USERS_TABLE: z.string().min(1),
  });
  return schema.parse(env);
}

