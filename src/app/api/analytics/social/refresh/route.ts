import { context } from '@/lib/security/context';
import { getWorkspaceSocialAnalytics } from '@/lib/social/analytics';

export async function POST(request: Request) {
  try {
    const ctx = await context('read');
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agent') || undefined;

    const data = await getWorkspaceSocialAnalytics(ctx.workspaceId, agentId, true);
    return Response.json({ ok: true, data });
  } catch (err) {
    console.error('[API Social Refresh] Error:', err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'failed_to_refresh_analytics' },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await context('read');
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agent') || undefined;
    const force = url.searchParams.get('force') === 'true';

    const data = await getWorkspaceSocialAnalytics(ctx.workspaceId, agentId, force);
    return Response.json({ ok: true, data });
  } catch (err) {
    console.error('[API Social Get] Error:', err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'failed_to_get_analytics' },
      { status: 500 },
    );
  }
}
