import { adminClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/security/crypto';
import { type Channel } from '@/lib/domain';

export interface SocialPostMetric {
  id: string;
  caption: string;
  type: string;
  likes: number;
  comments: number;
  url?: string;
  date: string;
}

export interface ChannelAnalytics {
  id: string;
  channel: Channel;
  accountName: string;
  displayName: string;
  profilePicUrl?: string;
  profileUrl?: string;
  followers: number;
  follows?: number;
  totalMedia: number;
  recentLikes: number;
  recentComments: number;
  totalInteractions: number;
  avgInteractionsPerPost: number;
  engagementRate: string;
  recentPosts: SocialPostMetric[];
  status: 'connected' | 'error' | 'simulated';
  lastUpdated: string;
}

export interface SocialAnalyticsSummary {
  connections: ChannelAnalytics[];
  totals: {
    followers: number;
    media: number;
    interactions: number;
    connectedCount: number;
    avgEngagementRate: string;
  };
  lastUpdated: string;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos de cache

export async function getWorkspaceSocialAnalytics(
  workspaceId: string,
  agentId?: string,
  forceRefresh = false,
): Promise<SocialAnalyticsSummary> {
  const db = adminClient();

  let query = db
    .from('social_connections')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (agentId) {
    query = query.eq('agent_id', agentId);
  }

  const { data: connections, error } = await query;

  if (error || !connections || connections.length === 0) {
    return {
      connections: [],
      totals: {
        followers: 0,
        media: 0,
        interactions: 0,
        connectedCount: 0,
        avgEngagementRate: '0%',
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  const results: ChannelAnalytics[] = [];

  for (const conn of connections) {
    const metadata = (conn.metadata || {}) as Record<string, unknown>;
    const cached = metadata.cached_analytics as ChannelAnalytics | undefined;
    const cachedAt = metadata.cached_analytics_at as string | undefined;

    const isCacheValid =
      !forceRefresh &&
      cached &&
      cachedAt &&
      Date.now() - new Date(cachedAt).getTime() < CACHE_TTL_MS;

    if (isCacheValid && cached) {
      results.push(cached);
      continue;
    }

    // Buscar dados frescos da API
    let token = conn.token_ciphertext;
    if (token && token.includes('.')) {
      try {
        token = decrypt(token, workspaceId);
      } catch (err) {
        console.warn(`[SocialAnalytics] Failed to decrypt token for ${conn.account_name}:`, err);
      }
    }

    try {
      let analytics: ChannelAnalytics;

      if (conn.channel === 'instagram') {
        analytics = await fetchInstagramAnalytics(conn, token);
      } else if (conn.channel === 'facebook') {
        analytics = await fetchFacebookAnalytics(conn, token);
      } else {
        analytics = fallbackGenericAnalytics(conn);
      }

      results.push(analytics);

      // Salvar em cache no metadata da conexão
      await db
        .from('social_connections')
        .update({
          metadata: {
            ...metadata,
            cached_analytics: analytics,
            cached_analytics_at: new Date().toISOString(),
          },
        })
        .eq('id', conn.id);
    } catch (err) {
      console.error(`[SocialAnalytics] Error fetching metrics for ${conn.channel}:`, err);
      if (cached) {
        results.push(cached);
      } else {
        results.push(fallbackGenericAnalytics(conn, 'error'));
      }
    }
  }

  // Calcular totais consolidados
  let totalFollowers = 0;
  let totalMedia = 0;
  let totalInteractions = 0;
  let sumEngagementRate = 0;
  let rateCount = 0;

  for (const r of results) {
    totalFollowers += r.followers || 0;
    totalMedia += r.totalMedia || 0;
    totalInteractions += r.totalInteractions || 0;

    const rateNum = parseFloat(r.engagementRate);
    if (!isNaN(rateNum) && rateNum > 0) {
      sumEngagementRate += rateNum;
      rateCount++;
    }
  }

  const avgEngagementRate =
    rateCount > 0 ? (sumEngagementRate / rateCount).toFixed(2) + '%' : '0%';

  return {
    connections: results,
    totals: {
      followers: totalFollowers,
      media: totalMedia,
      interactions: totalInteractions,
      connectedCount: results.filter((r) => r.status === 'connected').length,
      avgEngagementRate,
    },
    lastUpdated: new Date().toISOString(),
  };
}

async function fetchInstagramAnalytics(
  conn: Record<string, unknown>,
  token: string,
): Promise<ChannelAnalytics> {
  const metadata = (conn.metadata || {}) as Record<string, unknown>;
  const isDirectLogin = token.startsWith('IG') || metadata.connected_via === 'instagram_direct_login';
  const apiBase = isDirectLogin ? 'https://graph.instagram.com/v21.0' : 'https://graph.facebook.com/v21.0';
  const targetId = isDirectLogin ? 'me' : String(conn.external_id || 'me');

  // 1. Dados do perfil
  const profileFields =
    'id,user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count,biography,website';
  const profileRes = await fetch(
    `${apiBase}/${targetId}?fields=${profileFields}&access_token=${encodeURIComponent(token)}`,
  );

  let profileData: Record<string, unknown> = {};
  if (profileRes.ok) {
    profileData = (await profileRes.json()) as Record<string, unknown>;
  }

  // 2. Mídias recentes
  const mediaFields =
    'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count';
  const mediaRes = await fetch(
    `${apiBase}/${targetId}/media?fields=${mediaFields}&limit=15&access_token=${encodeURIComponent(token)}`,
  );

  let postsData: Array<Record<string, unknown>> = [];
  if (mediaRes.ok) {
    const json = (await mediaRes.json()) as { data?: Array<Record<string, unknown>> };
    postsData = json.data || [];
  }

  let totalLikes = 0;
  let totalComments = 0;
  const recentPosts: SocialPostMetric[] = [];

  for (const p of postsData) {
    const likes = typeof p.like_count === 'number' ? p.like_count : 0;
    const comments = typeof p.comments_count === 'number' ? p.comments_count : 0;
    totalLikes += likes;
    totalComments += comments;

    recentPosts.push({
      id: String(p.id),
      caption: typeof p.caption === 'string' ? p.caption.slice(0, 100) : '',
      type: String(p.media_type || 'IMAGE'),
      likes,
      comments,
      url: typeof p.permalink === 'string' ? p.permalink : undefined,
      date: String(p.timestamp || new Date().toISOString()),
    });
  }

  const followers = typeof profileData.followers_count === 'number' ? profileData.followers_count : 0;
  const follows = typeof profileData.follows_count === 'number' ? profileData.follows_count : 0;
  const totalMedia =
    typeof profileData.media_count === 'number' ? profileData.media_count : recentPosts.length;
  const totalInteractions = totalLikes + totalComments;

  const avgInteractions =
    recentPosts.length > 0 ? Number((totalInteractions / recentPosts.length).toFixed(1)) : 0;

  const engagementRate =
    followers > 0 && recentPosts.length > 0
      ? ((totalInteractions / (recentPosts.length * followers)) * 100).toFixed(2) + '%'
      : '0%';

  const username = String(profileData.username || metadata.username || conn.account_name);
  const accountName = username.startsWith('@') ? username : `@${username}`;

  return {
    id: String(conn.id),
    channel: 'instagram',
    accountName,
    displayName: String(profileData.name || accountName),
    profilePicUrl:
      (typeof profileData.profile_picture_url === 'string'
        ? profileData.profile_picture_url
        : (metadata.profile_picture_url as string | undefined)) || undefined,
    profileUrl: `https://instagram.com/${username.replace(/^@/, '')}`,
    followers,
    follows,
    totalMedia,
    recentLikes: totalLikes,
    recentComments: totalComments,
    totalInteractions,
    avgInteractionsPerPost: avgInteractions,
    engagementRate,
    recentPosts,
    status: 'connected',
    lastUpdated: new Date().toISOString(),
  };
}

async function fetchFacebookAnalytics(
  conn: Record<string, unknown>,
  token: string,
): Promise<ChannelAnalytics> {
  const pageId = String(conn.external_id);
  const fields = 'id,name,about,fan_count,followers_count,talking_about_count,picture{url},link';

  const pageRes = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
  );

  let pageData: Record<string, unknown> = {};
  if (pageRes.ok) {
    pageData = (await pageRes.json()) as Record<string, unknown>;
  }

  const postsRes = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/posts?fields=id,message,created_time,permalink_url,shares&limit=15&access_token=${encodeURIComponent(token)}`,
  );

  let postsData: Array<Record<string, unknown>> = [];
  if (postsRes.ok) {
    const json = (await postsRes.json()) as { data?: Array<Record<string, unknown>> };
    postsData = json.data || [];
  }

  const recentPosts: SocialPostMetric[] = [];
  for (const p of postsData) {
    recentPosts.push({
      id: String(p.id),
      caption: typeof p.message === 'string' ? p.message.slice(0, 100) : '',
      type: 'POST',
      likes: 0,
      comments: 0,
      url: typeof p.permalink_url === 'string' ? p.permalink_url : undefined,
      date: String(p.created_time || new Date().toISOString()),
    });
  }

  const followers =
    typeof pageData.followers_count === 'number'
      ? pageData.followers_count
      : typeof pageData.fan_count === 'number'
      ? pageData.fan_count
      : 0;

  const picObj = pageData.picture as { data?: { url?: string } } | undefined;
  const profilePicUrl = picObj?.data?.url;

  return {
    id: String(conn.id),
    channel: 'facebook',
    accountName: String(pageData.name || conn.account_name),
    displayName: String(pageData.name || conn.account_name),
    profilePicUrl,
    profileUrl: typeof pageData.link === 'string' ? pageData.link : `https://facebook.com/${pageId}`,
    followers,
    totalMedia: recentPosts.length,
    recentLikes: 0,
    recentComments: 0,
    totalInteractions: typeof pageData.talking_about_count === 'number' ? pageData.talking_about_count : 0,
    avgInteractionsPerPost: 0,
    engagementRate: '0%',
    recentPosts,
    status: 'connected',
    lastUpdated: new Date().toISOString(),
  };
}

function fallbackGenericAnalytics(
  conn: Record<string, unknown>,
  status: 'connected' | 'error' | 'simulated' = 'simulated',
): ChannelAnalytics {
  const metadata = (conn.metadata || {}) as Record<string, unknown>;
  return {
    id: String(conn.id),
    channel: (conn.channel as Channel) || 'instagram',
    accountName: String(conn.account_name || 'Conta'),
    displayName: String(conn.account_name || 'Conta'),
    profilePicUrl: metadata.profile_picture_url as string | undefined,
    followers: 0,
    totalMedia: 0,
    recentLikes: 0,
    recentComments: 0,
    totalInteractions: 0,
    avgInteractionsPerPost: 0,
    engagementRate: '0%',
    recentPosts: [],
    status,
    lastUpdated: new Date().toISOString(),
  };
}
