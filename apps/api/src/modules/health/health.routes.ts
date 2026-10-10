import { Router } from 'express';
import type { ApiResponse, HealthStatus } from '@pm/shared';
import { pingDatabase } from '../../db/client';

export const healthRouter = Router();

/** Public liveness + DB check. 503 when the database is unreachable. */
healthRouter.get('/', async (_req, res) => {
  const dbOk = await pingDatabase();
  const body: ApiResponse<HealthStatus> = {
    data: {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'ok' : 'down',
      uptimeSeconds: Math.round(process.uptime()),
    },
  };
  res.status(dbOk ? 200 : 503).json(body);
});
