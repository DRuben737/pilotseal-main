alter table public.notifications
  add column if not exists kind text not null default 'system',
  add column if not exists recipient_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists action_url text,
  add column if not exists dedupe_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_kind_check'
  ) then
    alter table public.notifications
      add constraint notifications_kind_check
      check (kind in ('system', 'reminder', 'organization'));
  end if;
end
$$;

create unique index if not exists notifications_recipient_dedupe_key
  on public.notifications (recipient_user_id, dedupe_key);

create index if not exists notifications_recipient_created_at_idx
  on public.notifications (recipient_user_id, created_at desc);

create index if not exists notifications_organization_created_at_idx
  on public.notifications (organization_id, created_at desc)
  where organization_id is not null;

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

drop policy if exists "notifications_select_active" on public.notifications;
drop policy if exists "notifications_insert_admin" on public.notifications;
drop policy if exists "admin insert notifications" on public.notifications;
drop policy if exists "admin read notifications" on public.notifications;
drop policy if exists "admin update notifications" on public.notifications;
drop policy if exists "authenticated insert notifications" on public.notifications;
drop policy if exists "delete notifications" on public.notifications;
drop policy if exists "insert notifications" on public.notifications;
drop policy if exists "public read notifications" on public.notifications;
drop policy if exists "read notifications" on public.notifications;

create policy notifications_public_sent_read
on public.notifications for select to anon
using (
  recipient_user_id is null
  and organization_id is null
  and status = 'sent'
  and coalesce(is_active, true)
  and (scheduled_at is null or scheduled_at <= now())
);

create policy notifications_authenticated_inbox_read
on public.notifications for select to authenticated
using (
  (recipient_user_id = (select auth.uid()))
  or (
    recipient_user_id is null
    and organization_id is null
    and status = 'sent'
    and coalesce(is_active, true)
    and (scheduled_at is null or scheduled_at <= now())
  )
  or (select private.is_platform_admin())
);

create policy notifications_platform_admin_insert
on public.notifications for insert to authenticated
with check (
  (select private.is_platform_admin())
  and recipient_user_id is null
  and organization_id is null
  and kind = 'system'
);

create policy notifications_platform_admin_update
on public.notifications for update to authenticated
using ((select private.is_platform_admin()))
with check ((select private.is_platform_admin()));

create policy notifications_platform_admin_delete
on public.notifications for delete to authenticated
using ((select private.is_platform_admin()));

create policy notification_reads_own_select
on public.notification_reads for select to authenticated
using (user_id = (select auth.uid()));

create policy notification_reads_own_insert
on public.notification_reads for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.notifications notification
    where notification.id = notification_id
  )
);

create policy notification_reads_own_update
on public.notification_reads for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy notification_reads_own_delete
on public.notification_reads for delete to authenticated
using (user_id = (select auth.uid()));

create or replace function public.create_organization_notification(
  p_organization_id uuid,
  p_title text,
  p_message text,
  p_priority text default 'normal',
  p_action_url text default '/dashboard/organization'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = auth.uid()
      and member.role in ('owner', 'organization_admin')
  ) then
    raise exception 'Only organization owners and administrators can send organization messages';
  end if;

  if nullif(btrim(p_title), '') is null or nullif(btrim(p_message), '') is null then
    raise exception 'Title and message are required';
  end if;

  if p_priority not in ('low', 'normal', 'high', 'critical') then
    raise exception 'Invalid notification priority';
  end if;

  insert into public.notifications (
    title,
    message,
    content,
    priority,
    status,
    is_active,
    scheduled_at,
    created_by,
    kind,
    recipient_user_id,
    organization_id,
    action_url
  )
  select
    btrim(p_title),
    btrim(p_message),
    btrim(p_message),
    p_priority,
    'sent',
    true,
    now(),
    auth.uid(),
    'organization',
    member.user_id,
    p_organization_id,
    nullif(btrim(p_action_url), '')
  from public.organization_members member
  where member.organization_id = p_organization_id;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on table public.notifications from anon, authenticated;
revoke all on table public.notification_reads from anon, authenticated;
grant select on table public.notifications to anon;
grant select, insert, update, delete on table public.notifications to authenticated;
grant select, insert, update, delete on table public.notification_reads to authenticated;
grant select, insert, update, delete on table public.notifications to service_role;
grant select, insert, update, delete on table public.notification_reads to service_role;

revoke all on function public.create_organization_notification(uuid, text, text, text, text) from public;
grant execute on function public.create_organization_notification(uuid, text, text, text, text) to authenticated;
grant execute on function public.create_organization_notification(uuid, text, text, text, text) to service_role;
;
