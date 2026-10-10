import type { AuthUser } from '@pm/shared';
import type { UserRow } from '../../db/schema';

/** Public shape of a user. Never includes password_hash. */
export function toAuthUser(row: Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'avatarUrl'>): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatarUrl: row.avatarUrl,
  };
}
