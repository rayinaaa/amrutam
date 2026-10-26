import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api/v1'),
  APP_NAME: z.string().default('AmrutamTelemedicineBackend'),

  // Security & Secrets
  JWT_SECRET: z.string().min(16).default('super-secret-jwt-key-replace-in-production-min-32-chars!'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_SECRET: z.string().min(16).default('super-secret-refresh-key-replace-in-production!'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  ENCRYPTION_KEY: z.string().length(64).default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'), // 32-byte hex for AES-256-GCM

  // Database Configuration
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default('amrutam_user'),
  DB_PASSWORD: z.string().default('amrutam_secret_pw'),
  DB_NAME: z.string().default('amrutam_telemedicine'),
  DB_POOL_MIN: z.coerce.number().default(5),
  DB_POOL_MAX: z.coerce.number().default(25),
  DB_SSL: z.coerce.boolean().default(false),
  DB_DRIVER: z.enum(['postgres', 'memory']).default('memory'), // defaults to memory if no postgres running

  // Redis / Cache
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  CACHE_TTL_SECONDS: z.coerce.number().default(300),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000), // 1 minute
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // Observability
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  ENABLE_PROMETHEUS: z.coerce.boolean().default(true),
  OTEL_SERVICE_NAME: z.string().default('amrutam-telemedicine-api'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let parsedConfig: AppConfig;
try {
  parsedConfig = ConfigSchema.parse(process.env);
} catch (error: any) {
  console.warn('Config validation warning, using sensible defaults:', error.message);
  parsedConfig = ConfigSchema.parse({});
}

export const config = parsedConfig;
