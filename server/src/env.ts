import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from the project root first, then server/.env (either works).
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (mysql://user:pass@host:3306/db)'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // Lets the first owner account be created from the browser at /admin/claim.
  // Leave empty once the account exists.
  SETUP_TOKEN: z.string().optional().default(''),
  // Stage 3 (email + reminders)
  CRON_SECRET: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().optional().default(465),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  MAIL_FROM: z.string().optional().default(''),
  // Stage 5 (AI drafts, Gemini free tier)
  GEMINI_API_KEY: z.string().optional().default(''),
  // Any model on the free tier in Google AI Studio; change here if Google renames it.
  GEMINI_MODEL: z.string().optional().default('gemini-3.8-flash'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('\n✖ Environment variables are missing or invalid:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  console.error('Copy .env.example to .env and fill it in.\n');
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
