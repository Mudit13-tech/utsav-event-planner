/**
 * Express application factory. Dependencies are injected so the app can be
 * exercised in tests without network access or real API keys.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { errorHandler, notFound } from './middleware/errors.js';
import { createApiRouter } from './routes/api.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/**
 * @param {{ config: object, ai: object, now?: () => Date, logger?: Console }} deps
 */
export function createApp({ config, ai, now, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  // Cloud Run sits behind one Google front-end proxy; needed for correct client IPs in rate limiting.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(compression());

  const apiLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests — please wait a minute and try again.' },
  });

  app.use('/api', apiLimiter, express.json({ limit: '16kb' }), createApiRouter({ ai, now }));
  app.use('/api', notFound);

  app.use(
    express.static(PUBLIC_DIR, {
      etag: true,
      maxAge: config.nodeEnv === 'production' ? '1h' : 0,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
