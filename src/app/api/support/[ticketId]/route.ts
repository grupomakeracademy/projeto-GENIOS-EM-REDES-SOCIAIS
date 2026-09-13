import { guard, checked, fail } from '@/lib/security/context';
import { getTicket } from '@/lib/support/server';
import { adminClient } from '@/lib/supabase/server';
export async function GET(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const ctx = await guard(request),
      { ticketId } = await params;
    const ticket = await getTicket(ctx, ticketId);
    const assignee = ticket.assigned_admin_id
      ? checked(
          await adminClient()
            .from('profiles')
            .select('name')
            .eq('id', ticket.assigned_admin_id)
            .maybeSingle(),
        )
      : null;
    const [messages, attachments, events] = await Promise.all([
      ctx.db
        .from('support_messages')
        .select('id,message,user_id,author_name,author_role,is_admin_reply,created_at')
        .eq('ticket_id', ticketId)
        .eq('workspace_id', ctx.workspaceId)
        .order('created_at'),
      ctx.db
        .from('support_attachments')
        .select('id,original_name,size,message_id,mime_type')
        .eq('ticket_id', ticketId)
        .eq('workspace_id', ctx.workspaceId),
      ctx.db
        .from('support_ticket_events')
        .select('id,event_type,created_at,metadata')
        .eq('ticket_id', ticketId)
        .eq('workspace_id', ctx.workspaceId)
        .order('created_at'),
    ]);
    return Response.json(
      {
        ticket: { ...ticket, assigned_admin_name: assignee?.name || null },
        messages: checked(messages),
        attachments: checked(attachments),
        events: checked(events),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return fail(e);
  }
}
