import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1).optional(),
  STORAGE_BACKEND: z.enum(["memory", "postgres"]).default("memory"),
  QUEUE_BACKEND: z.enum(["memory", "redis"]).default("memory"),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  MAX_MATCHES_PER_USER: z.coerce.number().int().min(1).default(1),
  MAX_MATCHES_PER_HOUR: z.coerce.number().int().min(0).default(0),
  MAX_CONVERSATION_SECONDS: z.coerce.number().int().min(0).default(0),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export const config = schema.parse(process.env);

export type Config = z.infer<typeof schema>;
