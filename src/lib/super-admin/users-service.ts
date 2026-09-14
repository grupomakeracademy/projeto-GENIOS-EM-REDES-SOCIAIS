import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { checked } from '@/lib/security/context';
import { SUPER_ADMIN_EMAIL } from '@/lib/security/super-admin';
import { QUALITY_MULTIPLIERS, type AdminUserDetail, type UserStatus, type QuotaAdjustmentLog } from '@/lib/domain';

export async function getAdminUsersList(): Promise<AdminUserDetail[]> {
  const db = adminClient();

  const [authRes, profilesRes, membersRes, assetsRes, jobsRes, contentsRes, auditsRes] = await Promise.all([
    db.auth.admin.listUsers({ perPage: 1000 }),
    db.from('profiles').select('id,name,storage_quota_mb,onboarding_draft,created_at'),
    db.from('workspace_members').select('user_id,role'),
    db.from('assets').select('created_by,size'),
    db.from('background_jobs').select('id,type,status,payload,scheduled_at'),
    db.from('content_items').select('id,created_by,created_at'),
    db.from('audit_logs').select('id,workspace_id,actor,event,metadata,created_at').order('created_at', { ascending: false }),
  ]);

  const authUsers = authRes.data?.users || [];
  const profiles = checked(profilesRes) ?? [];
  const members = checked(membersRes) ?? [];
  const assets = checked(assetsRes) ?? [];
  const jobs = checked(jobsRes) ?? [];
  const contents = checked(contentsRes) ?? [];
  const audits = checked(auditsRes) ?? [];

  const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
  const roleMap = new Map(members.map((m: any) => [m.user_id, m.role]));

  const storageByUser: Record<string, number> = {};
  for (const a of assets) {
    if (a.created_by) {
      storageByUser[a.created_by] = (storageByUser[a.created_by] || 0) + (a.size || 0);
    }
  }

  const userGenerations: Record<string, number> = {};
  const userConsumption: Record<string, number> = {};
  const userQualities: Record<string, { low: number; medium: number; high: number }> = {};

  const initMetrics = (uid: string) => {
    if (!userGenerations[uid]) userGenerations[uid] = 0;
    if (!userConsumption[uid]) userConsumption[uid] = 0;
    if (!userQualities[uid]) userQualities[uid] = { low: 0, medium: 0, high: 0 };
  };

  for (const job of jobs) {
    const creatorId = job.payload?.created_by;
    if (!creatorId) continue;
    initMetrics(creatorId);

    if (job.type === 'agent_run') {
      userGenerations[creatorId] = (userGenerations[creatorId] || 0) + 1;

      const channelsCount = Array.isArray(job.payload?.channels) ? job.payload.channels.length : 1;
      const imgCount = typeof job.payload?.image_count === 'number' && job.payload.image_count > 0 ? job.payload.image_count : 1;
      const qualityKey = (job.payload?.image_quality as 'low' | 'medium' | 'high') || 'low';
      const multiplier = QUALITY_MULTIPLIERS[qualityKey] || 1;

      const cost = imgCount * channelsCount * multiplier;
      userConsumption[creatorId] = (userConsumption[creatorId] || 0) + cost;

      if (qualityKey in userQualities[creatorId]) {
        userQualities[creatorId][qualityKey]++;
      } else {
        userQualities[creatorId].low++;
      }
    }
  }

  for (const item of contents) {
    if (!item.created_by) continue;
    initMetrics(item.created_by);
    if (userGenerations[item.created_by] === 0) {
      userGenerations[item.created_by] = (userGenerations[item.created_by] || 0) + 1;
    }
  }

  const quotaAuditsByUser: Record<string, QuotaAdjustmentLog[]> = {};
  for (const log of audits) {
    if (log.event === 'USER_QUOTA_ADJUSTED' && log.metadata?.target_user_id) {
      const tId = log.metadata.target_user_id;
      if (!quotaAuditsByUser[tId]) quotaAuditsByUser[tId] = [];
      quotaAuditsByUser[tId].push({
        id: log.id,
        created_at: log.created_at,
        actor: log.actor || '',
        admin_email: log.metadata?.admin_email,
        previous_quota_mb: log.metadata?.previous_quota_mb ?? 100,
        new_quota_mb: log.metadata?.new_quota_mb ?? 100,
        reason: log.metadata?.reason || undefined,
      });
    }
  }

  const userDetails: AdminUserDetail[] = [];
  const seenIds = new Set<string>();

  for (const u of authUsers) {
    seenIds.add(u.id);
    const p = profileMap.get(u.id);
    const q = p?.storage_quota_mb ?? 100;
    const isSuper = u.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

    let status: UserStatus = 'active';
    if (u.banned_until && new Date(u.banned_until) > new Date()) {
      status = 'blocked';
    } else if (u.user_metadata?.status === 'inactive') {
      status = 'inactive';
    } else if (u.user_metadata?.status === 'blocked') {
      status = 'blocked';
    }

    initMetrics(u.id);

    const displayName =
      p?.name ||
      (u.user_metadata as Record<string, string>)?.full_name ||
      (u.user_metadata as Record<string, string>)?.name ||
      u.email?.split('@')[0] ||
      'Usuário';

    const avatarUrl =
      (p?.onboarding_draft as Record<string, string>)?.avatar_url ||
      (u.user_metadata as Record<string, string>)?.avatar_url;

    userDetails.push({
      id: u.id,
      email: u.email || '',
      name: displayName,
      avatar_url: avatarUrl,
      role: roleMap.get(u.id) || (isSuper ? 'ADMIN' : 'MEMBER'),
      status,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at || null,
      total_generations: userGenerations[u.id] || 0,
      saldo_consumido: userConsumption[u.id] || 0,
      qualities_used: userQualities[u.id] || { low: 0, medium: 0, high: 0 },
      storage_used_bytes: storageByUser[u.id] || 0,
      storage_quota_mb: isSuper ? -1 : q,
      is_unlimited: isSuper || q === -1 || q === null,
      adjustment_history: quotaAuditsByUser[u.id] || [],
    });
  }

  for (const p of profiles) {
    if (!seenIds.has(p.id)) {
      seenIds.add(p.id);
      const q = p.storage_quota_mb ?? 100;
      initMetrics(p.id);

      userDetails.push({
        id: p.id,
        email: '',
        name: p.name || 'Usuário',
        avatar_url: (p.onboarding_draft as Record<string, string>)?.avatar_url,
        role: roleMap.get(p.id) || 'MEMBER',
        status: 'active',
        created_at: p.created_at,
        last_sign_in_at: null,
        total_generations: userGenerations[p.id] || 0,
        saldo_consumido: userConsumption[p.id] || 0,
        qualities_used: userQualities[p.id] || { low: 0, medium: 0, high: 0 },
        storage_used_bytes: storageByUser[p.id] || 0,
        storage_quota_mb: q,
        is_unlimited: q === -1 || q === null,
        adjustment_history: quotaAuditsByUser[p.id] || [],
      });
    }
  }

  userDetails.sort((a, b) => {
    if (a.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return -1;
    if (b.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return 1;
    return a.name.localeCompare(b.name);
  });

  return userDetails;
}
