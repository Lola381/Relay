// Declarative demo data (docs/DATA_MODEL.md §6). seed.ts turns it into rows, activity and
// notifications. Times are relative to "now" so overdue / due-this-week always look right.
import type { ProjectRole, SystemRole, TaskPriority, TaskStatus } from '@pm/shared';

export const DEMO_PASSWORD = 'Password123!';

export type UserKey = 'admin' | 'pm' | 'alice' | 'bob' | 'viewer' | 'ishaan';
export type ProjectKey = 'website' | 'mobile' | 'crm';

export interface UserFixture {
  key: UserKey;
  /** Fixed ids: stable demo links, and test access tokens stay valid across re-seeds. */
  id: string;
  name: string;
  email: string;
  role: SystemRole;
  deactivatedDaysAgo?: number;
}

export const USERS: UserFixture[] = [
  { key: 'admin', id: '00000000-0000-4000-8000-000000000001', name: 'Neha Kapoor', email: 'admin@demo.com', role: 'ADMIN' },
  { key: 'pm', id: '00000000-0000-4000-8000-000000000002', name: 'Ravi Kumar', email: 'pm@demo.com', role: 'PROJECT_MANAGER' },
  { key: 'alice', id: '00000000-0000-4000-8000-000000000003', name: 'Alice Fernandes', email: 'alice@demo.com', role: 'TEAM_MEMBER' },
  { key: 'bob', id: '00000000-0000-4000-8000-000000000004', name: 'Bob Mathew', email: 'bob@demo.com', role: 'TEAM_MEMBER' },
  { key: 'viewer', id: '00000000-0000-4000-8000-000000000005', name: 'Vikram Rao', email: 'viewer@demo.com', role: 'VIEWER' },
  // Deactivated: shows the "deactivated user" badges and can't log in
  {
    key: 'ishaan',
    id: '00000000-0000-4000-8000-000000000006',
    name: 'Ishaan Verma',
    email: 'inactive@demo.com',
    role: 'TEAM_MEMBER',
    deactivatedDaysAgo: 5,
  },
];

export interface ProjectFixture {
  key: ProjectKey;
  name: string;
  description: string;
  createdDaysAgo: number;
  archivedDaysAgo?: number;
  members: { user: UserKey; role: ProjectRole }[];
}

export const PROJECTS: ProjectFixture[] = [
  {
    key: 'website',
    name: 'Website Revamp',
    description:
      'Redesign and rebuild the marketing website: new homepage, responsive navigation, ' +
      'analytics and an accessibility pass before the Q4 launch.',
    createdDaysAgo: 28,
    members: [
      { user: 'pm', role: 'MANAGER' },
      { user: 'alice', role: 'MEMBER' },
      { user: 'bob', role: 'MEMBER' },
      { user: 'viewer', role: 'VIEWER' },
      { user: 'ishaan', role: 'MEMBER' },
    ],
  },
  {
    key: 'mobile',
    name: 'Mobile App',
    description: 'First release of the customer mobile app (iOS + Android) with login and push notifications.',
    createdDaysAgo: 20,
    members: [
      { user: 'pm', role: 'MANAGER' },
      { user: 'bob', role: 'MEMBER' },
    ],
  },
  {
    key: 'crm',
    name: 'Legacy CRM',
    description: 'Retire the old CRM: export customer data and decommission the server.',
    createdDaysAgo: 80,
    archivedDaysAgo: 10, // read-only demo
    members: [
      { user: 'pm', role: 'MANAGER' },
      { user: 'alice', role: 'MEMBER' },
    ],
  },
];

export interface TaskFixture {
  ref: string;
  project: ProjectKey;
  title: string;
  description?: string;
  priority: TaskPriority;
  assignee?: UserKey;
  /** Days from today; negative = in the past (overdue unless DONE). */
  dueInDays?: number;
  createdDaysAgo: number;
  /** Status changes after creation (starts at TODO), each made by the assignee or the PM. */
  transitions?: { to: TaskStatus; daysAgo: number }[];
}

export const TASKS: TaskFixture[] = [
  // ── Website Revamp ──
  {
    ref: 'homepage',
    project: 'website',
    title: 'Design new homepage layout',
    description: 'Hero, feature grid and testimonials. Desktop + mobile mockups.',
    priority: 'HIGH',
    assignee: 'alice',
    dueInDays: -10,
    createdDaysAgo: 26,
    transitions: [
      { to: 'IN_PROGRESS', daysAgo: 22 },
      { to: 'IN_REVIEW', daysAgo: 12 },
      { to: 'DONE', daysAgo: 9 },
    ],
  },
  {
    ref: 'nav',
    project: 'website',
    title: 'Implement responsive navigation',
    description: 'Top nav collapses into a drawer below 768px. Must be keyboard accessible.',
    priority: 'HIGH',
    assignee: 'alice',
    dueInDays: 3,
    createdDaysAgo: 18,
    transitions: [{ to: 'IN_PROGRESS', daysAgo: 6 }],
  },
  {
    ref: 'analytics',
    project: 'website',
    title: 'Set up analytics tracking',
    description: 'Page views, CTA clicks and signup funnel events.',
    priority: 'MEDIUM',
    assignee: 'bob',
    dueInDays: 10,
    createdDaysAgo: 6,
  },
  {
    ref: 'about',
    project: 'website',
    title: 'Write copy for About page',
    priority: 'LOW',
    assignee: 'bob',
    dueInDays: -2, // overdue while in review
    createdDaysAgo: 15,
    transitions: [
      { to: 'IN_PROGRESS', daysAgo: 8 },
      { to: 'IN_REVIEW', daysAgo: 1 },
    ],
  },
  {
    ref: 'contact',
    project: 'website',
    title: 'Fix contact form validation',
    description: 'Email field accepts invalid addresses; error messages are not announced.',
    priority: 'URGENT',
    assignee: 'alice',
    dueInDays: -3, // overdue
    createdDaysAgo: 3,
  },
  {
    ref: 'images',
    project: 'website',
    title: 'Optimize hero images',
    priority: 'MEDIUM', // unassigned, no due date
    createdDaysAgo: 4,
  },
  {
    ref: 'a11y',
    project: 'website',
    title: 'Accessibility audit',
    description: 'WCAG 2.1 AA pass on all new pages.',
    priority: 'HIGH',
    assignee: 'pm',
    dueInDays: 5,
    createdDaysAgo: 10,
    transitions: [{ to: 'IN_PROGRESS', daysAgo: 2 }],
  },
  {
    ref: 'blog',
    project: 'website',
    title: 'Migrate blog posts',
    priority: 'LOW',
    assignee: 'ishaan', // deactivated assignee: shows the badge
    dueInDays: 14,
    createdDaysAgo: 12,
  },
  // ── Mobile App ──
  {
    ref: 'rn-setup',
    project: 'mobile',
    title: 'Set up React Native project',
    priority: 'HIGH',
    assignee: 'bob',
    dueInDays: -14,
    createdDaysAgo: 19,
    transitions: [
      { to: 'IN_PROGRESS', daysAgo: 18 },
      { to: 'DONE', daysAgo: 15 },
    ],
  },
  {
    ref: 'login-ui',
    project: 'mobile',
    title: 'Login screen UI',
    description: 'Email + password, show/hide toggle, error states.',
    priority: 'HIGH',
    assignee: 'bob',
    dueInDays: 2,
    createdDaysAgo: 14,
    transitions: [{ to: 'IN_PROGRESS', daysAgo: 4 }],
  },
  {
    ref: 'push',
    project: 'mobile',
    title: 'Push notification service',
    priority: 'MEDIUM', // unassigned
    dueInDays: 20,
    createdDaysAgo: 9,
  },
  {
    ref: 'store',
    project: 'mobile',
    title: 'App store listing copy',
    priority: 'LOW',
    assignee: 'pm',
    dueInDays: 25,
    createdDaysAgo: 7,
  },
  // ── Legacy CRM (archived) ──
  {
    ref: 'export',
    project: 'crm',
    title: 'Export customer data',
    priority: 'URGENT',
    assignee: 'alice',
    createdDaysAgo: 70,
    transitions: [
      { to: 'IN_PROGRESS', daysAgo: 40 },
      { to: 'DONE', daysAgo: 12 },
    ],
  },
  {
    ref: 'decommission',
    project: 'crm',
    title: 'Decommission old server',
    priority: 'HIGH',
    assignee: 'pm',
    createdDaysAgo: 60,
    transitions: [{ to: 'DONE', daysAgo: 11 }],
  },
  {
    ref: 'mappings',
    project: 'crm',
    title: 'Document data mappings',
    priority: 'LOW',
    assignee: 'alice',
    createdDaysAgo: 50, // left open when the project was archived
  },
];

export interface CommentFixture {
  task: string;
  author: UserKey;
  /** Body text; {alice}, {bob}… are replaced with mention tokens for that user. */
  body: string;
  hoursAgo: number;
}

export const COMMENTS: CommentFixture[] = [
  {
    task: 'nav',
    author: 'pm',
    body: 'Please make sure the mobile drawer is fully keyboard accessible, {alice}.',
    hoursAgo: 40,
  },
  {
    task: 'nav',
    author: 'alice',
    body: 'On it: adding a focus trap and Esc-to-close for the drawer.',
    hoursAgo: 30,
  },
  {
    task: 'about',
    author: 'bob',
    body: 'Draft is ready for review. I kept it under 300 words.',
    hoursAgo: 20,
  },
  {
    task: 'login-ui',
    author: 'pm',
    body: '{bob} can we demo this on Friday?',
    hoursAgo: 5,
  },
];
