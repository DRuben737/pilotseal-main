alter table public.notifications
  add column if not exists kind text not null default 'system',
  add column if not exists recipient_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists source_label text,
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

create index if not exists notification_reads_user_id_idx
  on public.notification_reads (user_id, read_at desc);

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
drop policy if exists notifications_public_sent_read on public.notifications;
drop policy if exists notifications_authenticated_inbox_read on public.notifications;
drop policy if exists notifications_platform_admin_insert on public.notifications;
drop policy if exists notifications_platform_admin_update on public.notifications;
drop policy if exists notifications_platform_admin_delete on public.notifications;
drop policy if exists notification_reads_own_select on public.notification_reads;
drop policy if exists notification_reads_own_insert on public.notification_reads;
drop policy if exists notification_reads_own_update on public.notification_reads;
drop policy if exists notification_reads_own_delete on public.notification_reads;

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
  or (
    (select private.is_platform_admin())
    and recipient_user_id is null
    and organization_id is null
  )
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
using (
  (select private.is_platform_admin())
  and recipient_user_id is null
  and organization_id is null
)
with check (
  (select private.is_platform_admin())
  and recipient_user_id is null
  and organization_id is null
  and kind = 'system'
);

create policy notifications_platform_admin_delete
on public.notifications for delete to authenticated
using (
  (select private.is_platform_admin())
  and recipient_user_id is null
  and organization_id is null
);

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
    source_label,
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
    organization.name,
    nullif(btrim(p_action_url), '')
  from public.organization_members member
  join public.organizations organization on organization.id = member.organization_id
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
revoke all on function public.create_organization_notification(uuid, text, text, text, text) from anon;
grant execute on function public.create_organization_notification(uuid, text, text, text, text) to authenticated;
grant execute on function public.create_organization_notification(uuid, text, text, text, text) to service_role;

create or replace function private.create_user_notification(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_kind text default 'organization',
  p_priority text default 'normal',
  p_organization_id uuid default null,
  p_source_label text default null,
  p_action_url text default '/dashboard/notifications',
  p_dedupe_key text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_id uuid;
begin
  if p_user_id is null then return null; end if;

  insert into public.notifications (
    title, message, content, priority, status, is_active, scheduled_at,
    created_by, kind, recipient_user_id, organization_id, source_label,
    action_url, dedupe_key
  ) values (
    btrim(p_title), btrim(p_message), btrim(p_message), p_priority, 'sent', true, now(),
    p_created_by, p_kind, p_user_id, p_organization_id, nullif(btrim(p_source_label), ''),
    p_action_url, p_dedupe_key
  )
  on conflict (recipient_user_id, dedupe_key) do update
    set message = excluded.message,
        content = excluded.content,
        priority = excluded.priority,
        source_label = excluded.source_label,
        action_url = excluded.action_url
  returning id into notification_id;

  return notification_id;
end;
$$;

revoke all on function private.create_user_notification(uuid, text, text, text, text, uuid, text, text, text, uuid) from public, anon, authenticated;

create or replace function private.notify_organization_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_name text;
  detail text;
begin
  select name into organization_name
  from public.organizations
  where id = coalesce(new.organization_id, old.organization_id);

  if tg_op = 'INSERT' then
    perform private.create_user_notification(
      new.user_id,
      'Added to organization',
      'You were added to ' || organization_name || ' as ' || replace(new.role, '_', ' ') || '.',
      'organization', 'normal', new.organization_id, organization_name,
      '/dashboard/organization',
      'organization-member:' || new.organization_id::text || ':added:' || new.user_id::text,
      coalesce(new.added_by, auth.uid())
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.create_user_notification(
      old.user_id,
      'Removed from organization',
      'Your membership in ' || organization_name || ' was removed. Your PilotSeal account and personal records were not changed.',
      'organization', 'high', old.organization_id, organization_name,
      '/dashboard',
      'organization-member:' || old.organization_id::text || ':removed:' || old.user_id::text || ':' || extract(epoch from now())::bigint::text,
      auth.uid()
    );
    return old;
  end if;

  detail := '';
  if new.role is distinct from old.role then
    detail := 'Organization role changed to ' || replace(new.role, '_', ' ') || '.';
  end if;
  if new.teaching_role is distinct from old.teaching_role then
    detail := concat_ws(' ', detail, case
      when new.teaching_role is null then 'Instructor/student role was removed.'
      else 'Instructor/student role changed to ' || new.teaching_role || '.'
    end);
  end if;

  if detail <> '' then
    perform private.create_user_notification(
      new.user_id,
      'Organization role updated',
      detail,
      'organization', 'normal', new.organization_id, organization_name,
      '/dashboard/organization',
      'organization-member:' || new.organization_id::text || ':updated:' || new.user_id::text || ':' || extract(epoch from new.updated_at)::bigint::text,
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_organization_membership_change on public.organization_members;
create trigger notify_organization_membership_change
after insert or update of role, teaching_role or delete on public.organization_members
for each row execute function private.notify_organization_membership_change();

create or replace function private.notify_endorsement_template_request_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_name text;
  template_name text;
  admin_record record;
begin
  select name into organization_name from public.organizations where id = new.organization_id;
  template_name := coalesce(new.proposed_data->>'title', 'Endorsement template');

  if tg_op = 'INSERT' then
    perform private.create_user_notification(
      new.submitted_by,
      'Endorsement template change submitted',
      template_name || ' was submitted for platform review.',
      'organization', 'normal', new.organization_id, organization_name,
      '/dashboard/organization', 'endorsement-template-request:' || new.id::text || ':submitted', new.submitted_by
    );

    for admin_record in select id from public.profiles where role = 'admin' loop
      perform private.create_user_notification(
        admin_record.id,
        'Endorsement template review requested',
        organization_name || ' submitted a change for ' || template_name || '.',
        'system', 'high', null, organization_name,
        '/dashboard/admin/endorsements', 'endorsement-template-request:' || new.id::text || ':admin', new.submitted_by
      );
    end loop;
    return new;
  end if;

  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform private.create_user_notification(
      new.submitted_by,
      case when new.status = 'approved'
        then 'Endorsement template change approved'
        else 'Endorsement template change rejected'
      end,
      template_name || case when new.status = 'approved'
        then ' was approved and is now effective.'
        else ' was rejected.'
      end || case when nullif(btrim(new.review_note), '') is null then '' else ' Review note: ' || btrim(new.review_note) end,
      'organization', case when new.status = 'approved' then 'normal' else 'high' end,
      new.organization_id, organization_name, '/dashboard/organization',
      'endorsement-template-request:' || new.id::text || ':' || new.status, new.reviewed_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_endorsement_template_request_change on public.endorsement_template_change_requests;
create trigger notify_endorsement_template_request_change
after insert or update of status on public.endorsement_template_change_requests
for each row execute function private.notify_endorsement_template_request_change();

create or replace function private.notify_organization_endorsement_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_user_id uuid;
  organization_name text;
begin
  if new.organization_id is null or new.student_id is null then return new; end if;
  select profile.id into student_user_id
  from public.profiles profile
  where profile.self_person_id = new.student_id
  limit 1;
  if student_user_id is null or student_user_id = new.user_id then return new; end if;
  select name into organization_name from public.organizations where id = new.organization_id;

  perform private.create_user_notification(
    student_user_id,
    'New endorsement record',
    new.instructor_name || ' created an endorsement record for you in ' || organization_name || '.',
    'organization', 'high', new.organization_id, organization_name,
    '/dashboard/records', 'endorsement-record:' || new.id::text || ':created', new.user_id
  );
  return new;
end;
$$;

drop trigger if exists notify_organization_endorsement_created on public.endorsement_records;
create trigger notify_organization_endorsement_created
after insert on public.endorsement_records
for each row execute function private.notify_organization_endorsement_created();

create or replace function private.notify_organization_aircraft_maintenance_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  aircraft_record record;
  member_record record;
  maintenance_detail text;
begin
  if tg_op = 'UPDATE' and
    new.hundred_hour_due_hours is not distinct from old.hundred_hour_due_hours and
    new.annual_due_date is not distinct from old.annual_due_date and
    new.static_due_date is not distinct from old.static_due_date and
    new.transponder_due_date is not distinct from old.transponder_due_date and
    new.elt_due_date is not distinct from old.elt_due_date then
    return new;
  end if;

  select aircraft.tail_number, aircraft.organization_id, organization.name as organization_name
  into aircraft_record
  from public.aircraft aircraft
  join public.organizations organization on organization.id = aircraft.organization_id
  where aircraft.id = new.aircraft_id;

  maintenance_detail := concat_ws(' · ',
    case when new.hundred_hour_due_hours is not null then '100-hour at ' || new.hundred_hour_due_hours::text end,
    case when new.annual_due_date is not null then 'Annual ' || new.annual_due_date::text end,
    case when new.static_due_date is not null then 'Static ' || new.static_due_date::text end,
    case when new.transponder_due_date is not null then 'Transponder ' || new.transponder_due_date::text end,
    case when new.elt_due_date is not null then 'ELT ' || new.elt_due_date::text end
  );

  for member_record in
    select user_id from public.organization_members where organization_id = aircraft_record.organization_id
  loop
    perform private.create_user_notification(
      member_record.user_id,
      'Aircraft maintenance updated',
      aircraft_record.tail_number || ': ' || coalesce(nullif(maintenance_detail, ''), 'No due dates recorded.'),
      'organization', 'normal', aircraft_record.organization_id, aircraft_record.organization_name,
      '/dashboard/my-aircraft',
      'aircraft-maintenance:' || new.aircraft_id::text || ':' || extract(epoch from new.updated_at)::bigint::text,
      new.updated_by
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_organization_aircraft_maintenance_change on public.organization_aircraft_maintenance;
create trigger notify_organization_aircraft_maintenance_change
after insert or update on public.organization_aircraft_maintenance
for each row execute function private.notify_organization_aircraft_maintenance_change();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notification_reads'
  ) then
    alter publication supabase_realtime add table public.notification_reads;
  end if;
end
$$;
