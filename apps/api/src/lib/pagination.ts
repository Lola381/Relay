import type { PageMeta } from '@pm/shared';

export function toLimitOffset({ page, pageSize }: { page: number; pageSize: number }) {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

export function pageMeta({ page, pageSize }: { page: number; pageSize: number }, total: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Escapes LIKE wildcards so a search for "50%" matches the text "50%", not everything. */
export const likePattern = (search: string) => `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
