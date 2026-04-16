import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AZUREGPT54_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  XAI_API_KEY: z.string().optional(),
  AZUREGPT54_ENDPOINT: z.string().url().optional(),
  AZUREGPT54_DEPLOYMENT: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.1-pro-preview"),
  XAI_MODEL: z.string().default("grok-4.20-0309-reasoning"),
  ANTHROPIC_MODEL: z.string().default("claude-opus-4-6"),
});

export const ENV = envSchema.parse({
  DATABASE_URL: process.env.METIS_DATABASE_URL ?? process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  AZUREGPT54_API_KEY: process.env.AZUREGPT54_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  XAI_API_KEY: process.env.XAI_API_KEY,
  AZUREGPT54_ENDPOINT: process.env.AZUREGPT54_ENDPOINT,
  AZUREGPT54_DEPLOYMENT: process.env.AZUREGPT54_DEPLOYMENT,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  XAI_MODEL: process.env.XAI_MODEL,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
});
