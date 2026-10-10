// Seeded demo users (apps/api/src/db/seed/fixtures.ts), shown on the login page for the demo.
export const DEMO_PASSWORD = 'Password123!';

export const DEMO_ACCOUNTS = [
  { role: 'Admin', name: 'Neha Kapoor', email: 'admin@demo.com', projects: 'Everything (system admin)' },
  { role: 'Manager', name: 'Ravi Kumar', email: 'pm@demo.com', projects: 'Manages Website Revamp, Mobile App, Legacy CRM' },
  { role: 'Member', name: 'Alice Fernandes', email: 'alice@demo.com', projects: 'Website Revamp, Legacy CRM' },
  { role: 'Member', name: 'Bob Mathew', email: 'bob@demo.com', projects: 'Website Revamp, Mobile App' },
  { role: 'Member', name: 'Carol Dsouza', email: 'carol@demo.com', projects: 'Website Revamp' },
  { role: 'Viewer', name: 'Vikram Rao', email: 'viewer@demo.com', projects: 'Website Revamp (read-only)' },
  { role: 'Viewer', name: 'Meera Iyer', email: 'meera@demo.com', projects: 'Website Revamp (read-only)' },
] as const;
