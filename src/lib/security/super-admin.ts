import 'server-only';
import type { User } from '@supabase/supabase-js';
import { AppError } from './context';

// app_metadata is written only by the Auth administration API, never by the user.
export function isSuperAdmin(user: Pick<User, 'app_metadata'>) {
  return user.app_metadata?.super_admin === true;
}
export function requireSuperAdmin(user: Pick<User, 'app_metadata'>) {
  if (!isSuperAdmin(user)) throw new AppError('forbidden', 403);
}
