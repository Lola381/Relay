// Seeded demo users (apps/api/src/db/seed/fixtures.ts), shown on the login page for the demo.
export const DEMO_PASSWORD = 'Password123!';

export const DEMO_ACCOUNTS = [
  { role: 'Admin', name: 'Neha Kapoor', email: 'admin@demo.com' },
  { role: 'Manager', name: 'Ravi Kumar', email: 'pm@demo.com' },
  { role: 'Member', name: 'Alice Fernandes', email: 'alice@demo.com' },
  { role: 'Member', name: 'Bob Mathew', email: 'bob@demo.com' },
  { role: 'Viewer', name: 'Vikram Rao', email: 'viewer@demo.com' },
] as const;
