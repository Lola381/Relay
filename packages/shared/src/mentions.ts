// Mention tokens inside comment bodies: @[Display Name](user-uuid)
// The UI's @ picker inserts them; the API extracts the ids (see docs/DATA_MODEL.md §3.6).
// Matching on ids (not "@name") avoids ambiguity when two people share a name.

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/** Matches one token; group 1 = display name, group 2 = user id. Use with matchAll (global). */
export const MENTION_PATTERN = new RegExp(`@\\[([^\\]\\n]{1,100})\\]\\((${UUID})\\)`, 'g');

export function formatMention(name: string, userId: string): string {
  // Brackets would break the token, so strip them from display names
  return `@[${name.replace(/[[\]]/g, '')}](${userId})`;
}

/** Unique, lower-cased user ids mentioned in a comment body, in first-seen order. */
export function extractMentionIds(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    if (match[2]) ids.add(match[2].toLowerCase());
  }
  return [...ids];
}
