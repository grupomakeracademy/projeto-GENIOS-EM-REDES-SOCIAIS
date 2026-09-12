-- All mutations are transactional RPCs. Clients receive read policies only.
create table public.support_tickets (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 created_by uuid not null references auth.users(id), title text not null check(length(trim(title)) between 3 and 180),
 category text not null check(category in ('dashboard','conteudos','calendario','agentes','canais','biblioteca','inteligencia_artificial','credenciais_ia','publicacao','conta_acesso','configuracoes','erro_tecnico','outros')),
 priority text not null default 'normal' check(priority in ('baixa','normal','alta')),
 status text not null default 'aberto' check(status in ('aberto','em_andamento','respondido','fechado')),
 ticket_type text not null default 'support' check(ticket_type in ('support','announcement')),
 target_type text check(target_type in ('geral','individual')), target_user_id uuid references auth.users(id),
 is_broadcast boolean generated always as (ticket_type='announcement' and target_type='geral') stored,
 assigned_admin_id uuid references auth.users(id), author_name text not null, author_email text not null,
 author_role public.member_role not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 closed_at timestamptz, last_admin_reply_at timestamptz,
 unique(id,workspace_id),
 check((ticket_type='support' and target_type is null and target_user_id is null) or
       (ticket_type='announcement' and ((target_type='geral' and target_user_id is null) or (target_type='individual' and target_user_id is not null))))
);
create table public.support_messages (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, ticket_id uuid not null,
 user_id uuid not null references auth.users(id), message text not null check(length(trim(message)) between 1 and 20000),
 is_admin_reply boolean not null, author_name text not null, author_role public.member_role not null,
 created_at timestamptz not null default now(), unique(id,ticket_id,workspace_id),
 foreign key(ticket_id,workspace_id) references public.support_tickets(id,workspace_id) on delete cascade
);
create table public.support_attachments (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, ticket_id uuid not null, message_id uuid not null,
 uploaded_by uuid not null references auth.users(id), original_name text not null, storage_path text not null unique,
 mime_type text not null, size bigint not null check(size>0 and size<=52428800), created_at timestamptz not null default now(),
 foreign key(message_id,ticket_id,workspace_id) references public.support_messages(id,ticket_id,workspace_id) on delete cascade
);
create table public.support_ticket_events (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, ticket_id uuid not null,
 event_type text not null, actor_user_id uuid references auth.users(id), metadata jsonb not null default '{}', created_at timestamptz not null default now(),
 foreign key(ticket_id,workspace_id) references public.support_tickets(id,workspace_id) on delete cascade
);
create table public.support_ticket_reads (
 workspace_id uuid not null, ticket_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
 read_at timestamptz not null default now(), primary key(ticket_id,user_id),
 foreign key(ticket_id,workspace_id) references public.support_tickets(id,workspace_id) on delete cascade
);
create index support_updated on public.support_tickets(workspace_id,updated_at desc);
create index support_creator on public.support_tickets(workspace_id,created_by);
create index support_status on public.support_tickets(workspace_id,status);
create index support_priority on public.support_tickets(workspace_id,priority);
create index support_category on public.support_tickets(workspace_id,category);
create index support_target on public.support_tickets(workspace_id,target_user_id);
create index support_type on public.support_tickets(workspace_id,ticket_type);
create index support_message_order on public.support_messages(ticket_id,created_at);
create index support_attachment_message on public.support_attachments(message_id);
create index support_event_order on public.support_ticket_events(ticket_id,created_at);

create function public.can_read_support(t uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.support_tickets s where s.id=t and public.has_role(s.workspace_id) and
 (public.has_role(s.workspace_id,array['ADMIN']::public.member_role[]) or s.created_by=auth.uid() or
 (s.ticket_type='announcement' and (s.target_type='geral' or s.target_user_id=auth.uid()))))
$$;
revoke all on function public.can_read_support(uuid) from public;
grant execute on function public.can_read_support(uuid) to authenticated;
alter table public.support_tickets enable row level security;
create policy support_read on public.support_tickets for select to authenticated using(public.can_read_support(id));
do $$ declare t text; begin
 foreach t in array array['support_messages','support_attachments','support_ticket_events','support_ticket_reads'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy support_read on public.%I for select to authenticated using(public.can_read_support(ticket_id))',t);
 end loop;
end $$;
drop policy support_read on public.support_ticket_reads;
create policy support_read on public.support_ticket_reads for select to authenticated using(user_id=auth.uid() and public.can_read_support(ticket_id));
grant select on public.support_tickets,public.support_messages,public.support_attachments,public.support_ticket_events,public.support_ticket_reads to authenticated;
revoke insert,update,delete on public.support_tickets,public.support_messages,public.support_attachments,public.support_ticket_events,public.support_ticket_reads from authenticated,anon;
grant all on public.support_tickets,public.support_messages,public.support_attachments,public.support_ticket_events,public.support_ticket_reads to service_role;

-- Private support notifications must not leak through the existing workspace feed.
alter table public.notifications add column support_ticket_id uuid references public.support_tickets(id) on delete cascade;
alter table public.notifications add column recipient_user_id uuid references auth.users(id) on delete cascade;
drop policy tenant_read on public.notifications;
create policy tenant_read on public.notifications for select to authenticated using(public.has_role(workspace_id) and
 (support_ticket_id is null or (public.can_read_support(support_ticket_id) and (recipient_user_id is null or recipient_user_id=auth.uid()))));

create function public.support_event(t uuid,e text,meta jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
declare s public.support_tickets; begin
 select * into strict s from public.support_tickets where id=t;
 insert into public.support_ticket_events(workspace_id,ticket_id,event_type,actor_user_id,metadata) values(s.workspace_id,t,e,auth.uid(),meta);
 insert into public.audit_logs(workspace_id,actor,event,metadata) values(s.workspace_id,auth.uid(),'SUPPORT_'||e,jsonb_build_object('ticket_id',t)||meta);
 insert into public.notifications(workspace_id,message,href,support_ticket_id,recipient_user_id)
 select s.workspace_id,case when s.ticket_type='announcement' then 'Novo comunicado ou atualização no Suporte' else 'Atualização no seu chamado de suporte' end,
 '/support?ticket='||t,t,m.user_id from public.workspace_members m where m.workspace_id=s.workspace_id and m.user_id<>auth.uid() and
 (m.role='ADMIN' or m.user_id=s.created_by or (s.ticket_type='announcement' and (s.target_type='geral' or m.user_id=s.target_user_id)));
end $$;
revoke all on function public.support_event(uuid,text,jsonb) from public,authenticated;

create function public.support_create(w uuid,title text,category text,priority text,body text,kind text default 'support',target text default null,recipient uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tid uuid; mid uuid; r public.member_role; n text; mail text; begin
 select role into r from public.workspace_members where workspace_id=w and user_id=auth.uid();
 if r is null then raise exception 'forbidden'; end if;
 if kind='announcement' and r<>'ADMIN' then raise exception 'forbidden'; end if;
 if kind='announcement' and target='individual' and not exists(select 1 from public.workspace_members where workspace_id=w and user_id=recipient) then raise exception 'forbidden'; end if;
 select coalesce(nullif(p.name,''),'Usuário'),coalesce(u.email,'') into n,mail from auth.users u left join public.profiles p on p.id=u.id where u.id=auth.uid();
 insert into public.support_tickets(workspace_id,created_by,title,category,priority,ticket_type,target_type,target_user_id,author_name,author_email,author_role)
 values(w,auth.uid(),trim(title),category,priority,kind,target,recipient,n,mail,r) returning id into tid;
 insert into public.support_messages(workspace_id,ticket_id,user_id,message,is_admin_reply,author_name,author_role)
 values(w,tid,auth.uid(),trim(body),kind='announcement',n,r) returning id into mid;
 perform public.support_event(tid,case when kind='announcement' then 'ANNOUNCEMENT_CREATED' else 'TICKET_CREATED' end);
 return jsonb_build_object('id',tid,'messageId',mid);
end $$;

create function public.support_reply(t uuid,body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.support_tickets; r public.member_role; n text; mid uuid; next_status text; team boolean; begin
 if not public.can_read_support(t) then raise exception 'forbidden'; end if;
 select * into strict s from public.support_tickets where id=t for update;
 if s.ticket_type='announcement' and s.target_type='geral' then raise exception 'read_only'; end if;
 select role into r from public.workspace_members where workspace_id=s.workspace_id and user_id=auth.uid();
 select coalesce(nullif(name,''),'Usuário') into n from public.profiles where id=auth.uid();
 team := r='ADMIN';
 next_status := case when team then 'respondido' else 'em_andamento' end;
 insert into public.support_messages(workspace_id,ticket_id,user_id,message,is_admin_reply,author_name,author_role)
 values(s.workspace_id,t,auth.uid(),trim(body),team,coalesce(n,'Usuário'),r) returning id into mid;
 update public.support_tickets set status=next_status,updated_at=now(),closed_at=null,last_admin_reply_at=case when team then now() else last_admin_reply_at end where id=t;
 perform public.support_event(t,case when not team and s.status in ('fechado','respondido') then 'TICKET_REOPENED' else 'MESSAGE_SENT' end,jsonb_build_object('from',s.status,'to',next_status));
 return jsonb_build_object('id',mid);
end $$;

create function public.support_change(t uuid,field text,value text) returns void language plpgsql security definer set search_path='' as $$
declare s public.support_tickets; ev text; begin
 select * into strict s from public.support_tickets where id=t for update;
 if not public.has_role(s.workspace_id,array['ADMIN']::public.member_role[]) then raise exception 'forbidden'; end if;
 if field='status' then
 update public.support_tickets set status=value,closed_at=case when value='fechado' then now() else null end,updated_at=now() where id=t;
 ev:=case when value='fechado' then 'TICKET_CLOSED' else 'STATUS_CHANGED' end;
 elsif field='priority' then
 update public.support_tickets set priority=value,updated_at=now() where id=t; ev:='PRIORITY_CHANGED';
 elsif field='assignee' then
 if not exists(select 1 from public.workspace_members where workspace_id=s.workspace_id and user_id=value::uuid and role='ADMIN') then raise exception 'forbidden'; end if;
 update public.support_tickets set assigned_admin_id=value::uuid,updated_at=now() where id=t; ev:='ADMIN_ASSIGNED';
 else raise exception 'invalid_input'; end if;
 perform public.support_event(t,ev,jsonb_build_object('value',value));
end $$;

create function public.support_mark_read(t uuid,seen timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare w uuid; begin
 if not public.can_read_support(t) then raise exception 'forbidden'; end if;
 select workspace_id into w from public.support_tickets where id=t;
 insert into public.support_ticket_reads(workspace_id,ticket_id,user_id,read_at) values(w,t,auth.uid(),least(seen,now()))
 on conflict(ticket_id,user_id) do update set read_at=greatest(public.support_ticket_reads.read_at,excluded.read_at);
end $$;

revoke all on function public.support_create(uuid,text,text,text,text,text,text,uuid),public.support_reply(uuid,text),public.support_change(uuid,text,text),public.support_mark_read(uuid,timestamptz) from public;
grant execute on function public.support_create(uuid,text,text,text,text,text,text,uuid),public.support_reply(uuid,text),public.support_change(uuid,text,text),public.support_mark_read(uuid,timestamptz) to authenticated;

-- RLS remains active for the search, including message content search.
create function public.support_list(w uuid,filters jsonb default '{}') returns jsonb language sql stable security invoker set search_path='' as $$
 with visible as (select t.*,coalesce(t.last_admin_reply_at>r.read_at,t.last_admin_reply_at is not null) as unread
 from public.support_tickets t left join public.support_ticket_reads r on r.ticket_id=t.id and r.user_id=auth.uid() where t.workspace_id=w),
 filtered as (select * from visible t where ticket_type=coalesce(filters->>'type','support')
 and (coalesce(filters->>'status','')='' or status=filters->>'status')
 and (coalesce(filters->>'priority','')='' or priority=filters->>'priority')
 and (coalesce(filters->>'category','')='' or category=filters->>'category')
 and (coalesce(filters->>'user','')='' or created_by::text=filters->>'user')
 and (coalesce(filters->>'from','')='' or created_at>=(filters->>'from')::timestamptz)
 and (coalesce(filters->>'to','')='' or created_at<((filters->>'to')::timestamptz+interval '1 day'))
 and (coalesce(filters->>'q','')='' or strpos(lower(title||' '||id||' '||author_name||' '||author_email),lower(filters->>'q'))>0
 or exists(select 1 from public.support_messages m where m.ticket_id=t.id and strpos(lower(m.message),lower(filters->>'q'))>0))),
 page as (select * from filtered order by updated_at desc,id limit 20 offset greatest(0,coalesce((filters->>'page')::int,0))*20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'::jsonb),'total',(select count(*) from filtered),
 'stats',jsonb_build_object('aberto',(select count(*) from visible where ticket_type='support' and status='aberto'),
 'em_andamento',(select count(*) from visible where ticket_type='support' and status='em_andamento'),
 'respondido',(select count(*) from visible where ticket_type='support' and status='respondido'),
 'fechado',(select count(*) from visible where ticket_type='support' and status='fechado'),
 'alta',(select count(*) from visible where ticket_type='support' and priority='alta' and status<>'fechado'),
 'closedToday',(select count(*) from visible where ticket_type='support' and closed_at>=date_trunc('day',now() at time zone (select timezone from public.workspaces where id=w)) at time zone (select timezone from public.workspaces where id=w))))
$$;
revoke all on function public.support_list(uuid,jsonb) from public;
grant execute on function public.support_list(uuid,jsonb) to authenticated;
