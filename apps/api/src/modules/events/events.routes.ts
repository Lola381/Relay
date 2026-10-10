import { randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import { eq } from 'drizzle-orm';
import type { LiveEvent, SystemRole } from '@pm/shared';
import { db } from '../../db/client';
import { projectMembers, users } from '../../db/schema';
import { onCommittedEvent, type AppEvent } from '../../lib/events';
import { unauthenticated } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { authenticate, currentUser } from '../../middleware/authenticate';

// Real-time push over Server-Sent Events (API_DESIGN §6).
// EventSource can't send an Authorization header, so the client first trades its access token
// for a single-use ticket valid for 30 seconds, then opens GET /events?ticket=...

const TICKET_TTL_MS = 30_000;
const HEARTBEAT_MS = 25_000;

const tickets = new Map<string, { userId: string; expiresAt: number }>();

interface Client {
  userId: string;
  role: SystemRole;
  res: Response;
}
const clients = new Set<Client>();
let nextEventId = 1;

function send(client: Client, event: AppEvent, id: number) {
  const payload: LiveEvent = {
    type: event.type,
    projectId: event.projectId,
    actorId: event.actorId,
    data: event.data,
  };
  client.res.write(`id: ${id}\nevent: message\ndata: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Recipients are computed at send time from CURRENT memberships (+ every admin), so a member who
 * was just removed stops receiving the project's events immediately.
 */
async function deliver(event: AppEvent) {
  if (clients.size === 0) return;
  const recipients = new Set(event.userIds ?? []);
  if (event.projectId) {
    const members = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, event.projectId));
    for (const m of members) recipients.add(m.userId);
  }
  const id = nextEventId++;
  for (const client of clients) {
    const isAdminProjectEvent = client.role === 'ADMIN' && (event.projectId || event.type.startsWith('project.'));
    // Account changes refresh the people pickers (Admin + Project managers); the payload is only an id
    const isDirectoryEvent =
      event.type.startsWith('user.') && (client.role === 'ADMIN' || client.role === 'PROJECT_MANAGER');
    if (recipients.has(client.userId) || isAdminProjectEvent || isDirectoryEvent) send(client, event, id);
  }
}

onCommittedEvent((event) => {
  deliver(event).catch((err) => logger.warn({ err }, 'Could not deliver a live event'));
});

export const eventsRouter = Router();

eventsRouter.post('/ticket', authenticate, (req, res) => {
  const now = Date.now();
  for (const [key, t] of tickets) if (t.expiresAt < now) tickets.delete(key);
  const ticket = randomBytes(24).toString('base64url');
  tickets.set(ticket, { userId: currentUser(req).id, expiresAt: now + TICKET_TTL_MS });
  res.status(201).json({ data: { ticket } });
});

eventsRouter.get('/', async (req, res) => {
  const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
  const entry = tickets.get(ticket);
  tickets.delete(ticket); // single use
  if (!entry || entry.expiresAt < Date.now()) throw unauthenticated('Invalid or expired stream ticket.');

  const user = await db.query.users.findFirst({ where: eq(users.id, entry.userId) });
  if (!user?.isActive) throw unauthenticated();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  const client: Client = { userId: user.id, role: user.role, res };
  clients.add(client);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
});
