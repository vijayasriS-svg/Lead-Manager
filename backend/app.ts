import express, { type Express } from 'express';
import cors from 'cors';
import type { LeadRepository } from './database/db.ts';
import { createApiRouter } from './routes/leadsRoutes.ts';
import { apiNotFoundHandler, errorHandler } from './middleware/errorHandler.ts';

export interface BackendAppOptions {
  corsOrigin?: string;
}

export function createBackendApp(
  repo: LeadRepository,
  options: BackendAppOptions = {}
): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  const rawOrigins =
    options.corsOrigin ??
    process.env.CORS_ORIGIN ??
    'http://localhost:3000,http://localhost:5173';

  const allowedOrigins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.APP_URL) {
    allowedOrigins.push(process.env.APP_URL.trim());
  }

  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin requests, server-to-server calls, and curl/Postman without Origin header
        if (!origin) {
          callback(null, true);
          return;
        }
        if (
          allowedOrigins.includes('*') ||
          allowedOrigins.includes(origin) ||
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept'],
    })
  );

  app.use(express.json({ limit: '50kb' }));

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ success: true, status: 'ok' });
  });

  app.use('/api', createApiRouter(repo));
  app.use('/api', apiNotFoundHandler);
  app.use(errorHandler);

  return app;
}
