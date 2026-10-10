// Live API walkthrough for evaluators: shows the server REJECTING unauthorized calls, the 409 on a
// stale update, and real-time delivery over SSE. Talks to the running API (npm run dev).
//
//   npm run demo:api
//
// Uses the seeded demo accounts. It changes one task's title and status and then restores them
// (the comment and notifications it creates stay; `npm run db:reset` clears everything).

const API = (process.env.API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
const PASSWORD = 'Password123!';
const WEBSITE = '00000000-0000-4000-9000-000000000001'; // Website Revamp
const MOBILE = '00000000-0000-4000-9000-000000000002'; // Mobile App (Carol is NOT a member)
const CRM = '00000000-0000-4000-9000-000000000003'; // Legacy CRM (archived)

const c = { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', off: '\x1b[0m' };
const tokens = {};

async function call(who, method, path, body, { quiet = false } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (who && tokens[who]) headers.authorization = `Bearer ${tokens[who]}`;
  if (who === 'forged') headers.authorization = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJoYWNrZXIifQ.forged';
  const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  if (!quiet) {
    const color = res.status >= 400 ? (res.status === 409 ? c.yellow : c.red) : c.green;
    console.log(`  ${c.dim}→ ${method} ${path}${body ? ' ' + JSON.stringify(body) : ''}  (as ${who ?? 'nobody'})${c.off}`);
    const error = json?.error;
    console.log(`  ${color}${c.bold}← ${res.status}${c.off}${color} ${error ? `${error.code}: ${error.message}` : 'OK'}${c.off}`);
    if (Array.isArray(error?.details)) {
      for (const d of error.details) console.log(`  ${color}    ${d.path}: ${d.message}${c.off}`);
    }
  }
  return { status: res.status, json };
}

const section = (title) => console.log(`\n${c.cyan}${c.bold}■ ${title}${c.off}`);
const note = (text) => console.log(`  ${c.dim}${text}${c.off}`);

async function login(who, email) {
  const { json, status } = await call(null, 'POST', '/auth/login', { email, password: PASSWORD }, { quiet: true });
  if (status !== 200) throw new Error(`Could not sign in as ${email} (${status}). Is the API running and the DB seeded?`);
  tokens[who] = json.data.accessToken;
}

// ── Setup ──
try {
  await fetch(API + '/health');
} catch {
  console.error(`Can't reach the API at ${API}. Start it with: npm run dev`);
  process.exit(1);
}
await Promise.all([
  login('admin', 'admin@demo.com'),
  login('pm', 'pm@demo.com'),
  login('alice', 'alice@demo.com'),
  login('carol', 'carol@demo.com'),
  login('viewer', 'viewer@demo.com'),
]);
const tasks = (await call('pm', 'GET', `/projects/${WEBSITE}/tasks?pageSize=100`, undefined, { quiet: true })).json.data;
const bobsTask = tasks.find((t) => t.assignee?.name === 'Bob Mathew' && t.status !== 'DONE');
const alicesTask = tasks.find((t) => t.assignee?.name === 'Alice Fernandes' && t.status !== 'DONE');

// ── 1. Authentication ──
section('1. Authentication: no token / forged token → 401');
await call(null, 'GET', '/projects');
await call('forged', 'GET', '/projects');

// ── 2. Authorization, enforced on the server ──
section('2. Authorization: a Team Member calling the API directly → 403');
note('Alice is a Team Member. The UI hides these buttons, but here we call the API ourselves:');
await call('alice', 'POST', `/projects/${WEBSITE}/tasks`, { title: 'Sneaky task' });
await call('alice', 'PATCH', `/tasks/${bobsTask.id}/status`, { version: bobsTask.version, status: 'DONE' });
await call('alice', 'PATCH', `/tasks/${alicesTask.id}`, { version: alicesTask.version, title: 'Renamed by a member' });
await call('alice', 'PATCH', `/tasks/${alicesTask.id}/assignee`, { version: alicesTask.version, assigneeId: null });
await call('alice', 'DELETE', `/tasks/${bobsTask.id}`);
await call('alice', 'POST', `/projects/${WEBSITE}/members`, { userId: '00000000-0000-4000-8000-000000000007', role: 'MANAGER' });

section('Viewer is read-only → 403');
await call('viewer', 'POST', `/tasks/${alicesTask.id}/comments`, { body: 'Can a viewer comment?' });
await call('viewer', 'PATCH', `/tasks/${alicesTask.id}/status`, { version: alicesTask.version, status: 'DONE' });

section('Admin-only actions as a Project Manager → 403');
await call('pm', 'POST', '/users', { name: 'X', email: 'x@demo.com', password: 'Password123!', role: 'ADMIN' });
await call('pm', 'POST', `/projects/${WEBSITE}/archive`);
await call('pm', 'GET', '/activity');

section('Outsiders get 404: the project\'s existence is not revealed');
note('Carol is not a member of Mobile App:');
await call('carol', 'GET', `/projects/${MOBILE}`);
await call('carol', 'GET', `/projects/${MOBILE}/tasks`);

section('Archived project is read-only for everyone (even the manager) → 403');
await call('pm', 'POST', `/projects/${CRM}/tasks`, { title: 'New task in an archived project' });

section('Self sign-up can never create an Admin → 400');
await call(null, 'POST', '/auth/register', { name: 'Mallory', email: 'mallory@demo.com', password: 'Password123!', role: 'ADMIN' });

section('Invalid input → 400 with field errors');
await call('pm', 'POST', `/projects/${WEBSITE}/tasks`, { title: '', dueDate: 'tomorrow' });

// ── 3. Concurrent updates ──
section('3. Concurrent updates: stale version → 409');
const original = (await call('pm', 'GET', `/tasks/${bobsTask.id}`, undefined, { quiet: true })).json.data;
note(`Both users opened "${original.title}" at version ${original.version}.`);
note('User A (Ravi, manager) saves first:');
const a = await call('pm', 'PATCH', `/tasks/${original.id}`, { version: original.version, title: `${original.title} (edited by A)` });
note(`Server moved the task to version ${a.json.data.version}.`);
note(`User B (Neha, admin) now saves based on version ${original.version}:`);
const b = await call('admin', 'PATCH', `/tasks/${original.id}`, { version: original.version, title: `${original.title} (edited by B)` });
if (b.status === 409) {
  const d = b.json.error.details;
  note(`409 details → yourVersion: ${d.yourVersion}, currentVersion: ${d.currentVersion}, current.title: "${d.current.title}"`);
  note('B\'s write was NOT applied; the UI shows this message and the latest state to review.');
}
// Restore the title
await call('pm', 'PATCH', `/tasks/${original.id}`, { version: a.json.data.version, title: original.title }, { quiet: true });

// ── 4. Real-time ──
section('4. Real-time (SSE): Alice is connected; the manager changes her task');
const { json: t } = await call('alice', 'POST', '/events/ticket', undefined, { quiet: true });
const events = [];
const controller = new AbortController();
fetch(`${API}/events?ticket=${t.data.ticket}`, { signal: controller.signal })
  .then(async (res) => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const m of decoder.decode(value).matchAll(/^data: (.+)$/gm)) events.push(JSON.parse(m[1]));
    }
  })
  .catch(() => {});
await new Promise((r) => setTimeout(r, 400));
const fresh = (await call('pm', 'GET', `/tasks/${alicesTask.id}`, undefined, { quiet: true })).json.data;
const moved = fresh.status === 'IN_REVIEW' ? 'IN_PROGRESS' : 'IN_REVIEW';
await call('pm', 'PATCH', `/tasks/${fresh.id}/status`, { version: fresh.version, status: moved });
await call('pm', 'POST', `/tasks/${fresh.id}/comments`, { body: `@[Alice Fernandes](00000000-0000-4000-8000-000000000003) moved this for review` });
await new Promise((r) => setTimeout(r, 700));
controller.abort();
for (const e of events) console.log(`  ${c.green}⚡ Alice received: ${e.type}${c.off}`);
if (events.length === 0) note('No events received (is anything else blocking the stream?)');
// Restore the status
const after = (await call('pm', 'GET', `/tasks/${fresh.id}`, undefined, { quiet: true })).json.data;
await call('pm', 'PATCH', `/tasks/${fresh.id}/status`, { version: after.version, status: fresh.status }, { quiet: true });

console.log(`\n${c.bold}Done.${c.off} Every rejection above came from the server; the UI was never involved.\n`);
process.exit(0);
