import 'server-only';
import type { User } from '@supabase/supabase-js';
import { AppError } from './context';

export const SUPER_ADMIN_EMAIL = 'r.barros84@gmail.com';

// app_metadata is written only by the Auth administration API, never by the user.
// Also r.barros84@gmail.com is permanently recognized as Super Admin.
export function isSuperAdmin(user: Pick<User, 'app_metadata'> & { email?: string | null }) {
  if (user.app_metadata?.super_admin === true) return true;
  if (user.email && user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return true;
  return false;
}
export function requireSuperAdmin(user: Pick<User, 'app_metadata'> & { email?: string | null }) {
  if (!isSuperAdmin(user)) throw new AppError('forbidden', 403);
}
