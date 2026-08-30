import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { env } from './config/env';
import { api } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { globalLimiter } from './middleware/rateLimit';

export function createApp(): express.Express {
  const app = express();

  // Only trust proxy headers when actually behind one. Trusting them unconditionally lets
  // a client spoof X-Forwarded-For and walk straight past every per-IP rate limit.
  app.set('trust proxy', env.TRUST_PROXY ? 1 : false);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API returns JSON, never HTML, so a maximally restrictive CSP is free here.
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: env.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    }),
  );

  /**
   * CORS is an allowlist of one: the Next.js origin. Requests with no Origin header —
   * server-to-server calls from Next.js itself — are allowed through, since CORS is a
   * browser mechanism and blocking them would break the entire public site.
   */
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || origin === env.WEB_ORIGIN) return callback(null, true);
        return callback(new Error('Origin not allowed'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'content-type',
        'x-api-key',
        'x-csrf-token',
        'x-lead-referrer',
        'x-lead-utm-source',
        'x-lead-utm-medium',
        'x-lead-utm-campaign',
        'x-lead-utm-term',
        'x-lead-utm-content',
        'x-forwarded-user-agent',
      ],
      maxAge: 600,
    }),
  );

  // Request size caps. A 100 KB JSON ceiling is generous for the largest CMS document and
  // small enough that a body-flood costs the process almost nothing.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(cookieParser());
  app.use(globalLimiter);

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
  });

  /**
   * Development-only static serving for the local media driver. In production media is
   * served from S3/CDN and this route does not exist.
   */
  if (env.MEDIA_DRIVER === 'local') {
    app.use(
      '/uploads',
      express.static(path.resolve(env.LOCAL_UPLOAD_DIR), {
        // Force downloads to be treated as inert content rather than executed inline.
        setHeaders: (res) => {
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
        },
        maxAge: '1h',
        index: false,
        dotfiles: 'deny',
      }),
    );
  }

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
