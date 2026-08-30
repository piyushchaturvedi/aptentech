import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment is validated once at boot and the process refuses to start if anything
 * required is missing or weak. Failing loudly here is much safer than discovering at
 * runtime that, say, SESSION_SECRET was undefined and sessions were unsignable.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    MONGODB_DB_NAME: z.string().min(1).default('aptentech'),

    /** Origin allowed to call this API. The public site is server-rendered, so the
     *  browser never calls the API directly — this is the Next.js server's origin. */
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
    PUBLIC_SITE_URL: z.string().url().default('https://aptentech.com'),

    /** Shared secret the Next.js server presents on every API call. Never sent to a browser. */
    API_SERVICE_TOKEN: z.string().min(24, 'API_SERVICE_TOKEN must be at least 24 characters'),

    /** Signs admin session cookies. Rotating it invalidates every session. */
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(8),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
    COOKIE_DOMAIN: z.string().optional(),

    /** HMAC for the cache-revalidation webhook the API fires at Next.js after a write. */
    REVALIDATE_SECRET: z.string().min(16, 'REVALIDATE_SECRET must be at least 16 characters'),
    REVALIDATE_URL: z.string().url().default('http://localhost:3000/api/revalidate'),

    MEDIA_DRIVER: z.enum(['s3', 'local']).default('local'),
    AWS_REGION: z.string().default('ap-south-1'),
    S3_BUCKET: z.string().optional(),
    S3_PUBLIC_BASE_URL: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    LOCAL_UPLOAD_DIR: z.string().default('./uploads'),

    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    TRUST_PROXY: z.coerce.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.MEDIA_DRIVER === 's3' && !v.S3_BUCKET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['S3_BUCKET'],
        message: 'S3_BUCKET is required when MEDIA_DRIVER=s3',
      });
    }
    if (v.NODE_ENV === 'production') {
      // These defaults are convenient locally and dangerous in production.
      if (v.SESSION_SECRET.includes('change-me') || v.API_SERVICE_TOKEN.includes('change-me')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SESSION_SECRET'],
          message: 'Default development secrets must be replaced before running in production',
        });
      }
      if (v.MEDIA_DRIVER === 'local') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MEDIA_DRIVER'],
          message: 'MEDIA_DRIVER=local is a development fallback; use s3 in production',
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in the values.\n`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
