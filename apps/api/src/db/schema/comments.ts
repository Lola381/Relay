import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './helpers';
import { projects } from './projects';
import { tasks } from './tasks';
import { users } from './users';

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    // Denormalized for authorization and project feeds; always set by the server from the task
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(), // may contain mention tokens: @[Name](userId)
    createdAt: createdAt(),
  },
  (t) => [
    index('comments_task_created_idx').on(t.taskId, t.createdAt),
    check('comments_body_length', sql`length(trim(${t.body})) BETWEEN 1 AND 5000`),
  ],
);

export const commentMentions = pgTable(
  'comment_mentions',
  {
    commentId: uuid('comment_id')
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
  },
  // The same person mentioned twice in one comment = one row
  (t) => [primaryKey({ name: 'comment_mentions_pkey', columns: [t.commentId, t.userId] })],
);

export type CommentRow = typeof comments.$inferSelect;
