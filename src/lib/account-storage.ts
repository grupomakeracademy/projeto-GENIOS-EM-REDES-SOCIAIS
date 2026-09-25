import 'server-only';
import { adminClient } from './supabase/server';
import { AppError, checked, required } from './security/context';
import { isSuperAdmin } from './security/super-admin';

export async function accountStorage(user: Parameters<typeof isSuperAdmin>[0] & { id: string }) {
  const db = adminClient();
  const [profile, usage] = await Promise.all([
    db.from('profiles').select('storage_quota_mb').eq('id',user.id).single(),
    db.from('account_storage_usage').select('size,reserved').eq('created_by',user.id).maybeSingle(),
  ]);
  const quota = required(profile).storage_quota_mb;
  const quotaMB = isSuperAdmin(user) || quota === null ? -1 : quota;
  const row = checked(usage), usedBytes = Number(row?.size || 0), reservedBytes = Number(row?.reserved || 0);
  return { quotaMB, usedBytes, reservedBytes, isUnlimited: quotaMB === -1,
    availableBytes: quotaMB === -1 ? null : Math.max(0, quotaMB * 1048576 - usedBytes - reservedBytes) };
}

/** Reserve under a database account lock BEFORE accepting bytes into object storage. */
export async function uploadAccountFile(params: {
  workspaceId: string; userId?: string; path: string; bytes: Uint8Array; contentType: string; upsert?: boolean;
}) {
  const db = adminClient();
  const reservation = await db.rpc('reserve_account_storage', { w:params.workspaceId, u:params.userId || null, p:params.path, n:params.bytes.byteLength });
  if (reservation.error) {
    if (reservation.error.message.includes('storage_quota_exceeded')) throw new AppError('storage_quota_exceeded', 413);
    throw new AppError('storage_reservation_failed', 409);
  }
  try {
    checked(await db.storage.from('brand-assets').upload(params.path,params.bytes,{ contentType:params.contentType, upsert:params.upsert || false }));
  } finally {
    // Never subtract stored bytes: deletion is accounted for by the Storage trigger.
    checked(await db.rpc('release_account_storage',{p:params.path,ticket:reservation.data}));
  }
}
