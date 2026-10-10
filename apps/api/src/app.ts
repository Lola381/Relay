import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { healthRouter } from './modules/health/health.routes';
import { projectsRouter } from './modules/projects/projects.routes';
import { usersRouter } from './modules/users/users.routes';
import { tasksRouter } from './modules/tasks/tasks.routes';
import { commentsRouter } from './modules/comments/comments.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { activityRouter } from './modules/activity/activity.routes';
import { eventsRouter } from './modules/events/events.routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true, // the refresh-token cookie must be sent cross-origin (web :3000 → api :4000)
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      // Health checks would drown the log
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
    }),
  );

  const api = express.Router();
  api.use('/health', healthRouter);
  api.use('/auth', authRouter);
  api.use('/projects', projectsRouter);
  api.use('/users', usersRouter);
  api.use('/events', eventsRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/', tasksRouter);
  api.use('/', commentsRouter);
  api.use('/', activityRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
