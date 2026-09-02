-- Optional personal CFI scheduling. Feature activation is deliberately stored
-- separately from schedule data so removing the widget never deletes records.

alter table public.dashboard_preferences
  add column if not exists enabled_feature_ids text[] not null default '{}'::text[];

alter table public.notification_preferences
  add column if not exists schedule_notifications_enabled boolean not null default true;

alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('system', 'reminder', 'organization', 'schedule'));

create or replace function private.enforce_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  preferences public.notification_preferences%rowtype;
begin
  if new.recipient_user_id is null
    or new.priority = 'critical'
    or not coalesce(new.is_active, true)
  then
    return new;
  end if;

  select preference.* into preferences
  from public.notification_preferences preference
  where preference.user_id = new.recipient_user_id;

  if not found then return new; end if;
  if new.kind = 'reminder' and not preferences.personal_reminders_enabled then return null; end if;
  if new.kind = 'organization' and not preferences.organization_messages_enabled then return null; end if;
  if new.kind = 'system' and not preferences.platform_notices_enabled then return null; end if;
  if new.kind = 'schedule' and not preferences.schedule_notifications_enabled then return null; end if;
  return new;
end;
$$;

revoke all on function private.enforce_notification_preferences() from public;

create table public.cfi_schedule_student_grants (
  cfi_user_id uuid not null references auth.users(id) on delete cascade,
  saved_person_id uuid not null references public.saved_people(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  access_enabled boolean not null default true,
  default_weekly_sessions integer not null default 3 check (default_weekly_sessions between 0 and 14),
  default_duration_min integer not null default 120 check (default_duration_min between 30 and 480),
  color text not null default '#2563eb' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (cfi_user_id, student_user_id),
  unique (saved_person_id),
  check (cfi_user_id <> student_user_id)
);

create index cfi_schedule_student_grants_student_idx
  on public.cfi_schedule_student_grants (student_user_id, cfi_user_id);

create table public.cfi_schedule_week_overrides (
  cfi_user_id uuid not null,
  student_user_id uuid not null,
  week_start date not null,
  target_sessions integer not null check (target_sessions between 0 and 14),
  duration_min integer not null check (duration_min between 30 and 480),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (cfi_user_id, student_user_id, week_start),
  foreign key (cfi_user_id, student_user_id)
    references public.cfi_schedule_student_grants(cfi_user_id, student_user_id)
    on delete cascade
);

create table public.cfi_schedule_availability_override_dates (
  cfi_user_id uuid not null,
  student_user_id uuid not null,
  availability_date date not null,
  timezone text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (cfi_user_id, student_user_id, availability_date),
  foreign key (cfi_user_id, student_user_id)
    references public.cfi_schedule_student_grants(cfi_user_id, student_user_id)
    on delete cascade,
  check (char_length(timezone) between 1 and 80)
);

create table public.cfi_schedule_availability_slots (
  id uuid primary key default gen_random_uuid(),
  cfi_user_id uuid not null,
  student_user_id uuid not null,
  scope text not null check (scope in ('weekly', 'date')),
  weekday smallint,
  availability_date date,
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440),
  timezone text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  foreign key (cfi_user_id, student_user_id)
    references public.cfi_schedule_student_grants(cfi_user_id, student_user_id)
    on delete cascade,
  check (end_minute - start_minute >= 120),
  check (char_length(timezone) between 1 and 80),
  check (
    (scope = 'weekly' and weekday between 1 and 7 and availability_date is null)
    or (scope = 'date' and weekday is null and availability_date is not null)
  )
);

create index cfi_schedule_availability_slots_lookup_idx
  on public.cfi_schedule_availability_slots
  (cfi_user_id, student_user_id, scope, availability_date, weekday);

create table public.cfi_schedule_unavailable_blocks (
  id uuid primary key default gen_random_uuid(),
  cfi_user_id uuid not null references auth.users(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (end_at > start_at),
  check (end_at <= start_at + interval '24 hours'),
  check (char_length(note) <= 300)
);

create index cfi_schedule_unavailable_blocks_range_idx
  on public.cfi_schedule_unavailable_blocks (cfi_user_id, start_at, end_at);

create table public.cfi_schedule_events (
  id uuid primary key default gen_random_uuid(),
  cfi_user_id uuid not null,
  student_user_id uuid not null,
  lesson_kind text not null default 'flight' check (lesson_kind in ('flight', 'ground')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  note text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  auto_generated boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  foreign key (cfi_user_id, student_user_id)
    references public.cfi_schedule_student_grants(cfi_user_id, student_user_id)
    on delete restrict,
  check (end_at > start_at),
  check (end_at <= start_at + interval '12 hours'),
  check (char_length(note) <= 500)
);

create index cfi_schedule_events_range_idx
  on public.cfi_schedule_events (cfi_user_id, start_at, end_at)
  where status = 'scheduled';
create index cfi_schedule_events_student_idx
  on public.cfi_schedule_events (student_user_id, start_at desc);

create or replace function private.has_cfi_schedule_access(
  p_cfi_user_id uuid,
  p_student_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.cfi_schedule_student_grants grant_row
    where grant_row.cfi_user_id = p_cfi_user_id
      and grant_row.student_user_id = p_student_user_id
      and grant_row.access_enabled
  );
$$;

revoke all on function private.has_cfi_schedule_access(uuid, uuid) from public;
grant execute on function private.has_cfi_schedule_access(uuid, uuid) to authenticated, service_role;

create or replace function private.prepare_cfi_schedule_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function private.disable_unlinked_cfi_schedule_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cfi_schedule_student_grants
  set access_enabled = false,
      updated_at = timezone('utc', now())
  where saved_person_id = old.saved_person_id
    and cfi_user_id = old.owner_user_id
    and student_user_id = old.linked_user_id;
  return old;
end;
$$;

create or replace function private.enforce_cfi_schedule_event_conflict()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'scheduled' and exists (
    select 1
    from public.cfi_schedule_events other
    where other.cfi_user_id = new.cfi_user_id
      and other.status = 'scheduled'
      and other.id <> new.id
      and new.start_at < other.end_at
      and new.end_at > other.start_at
  ) then
    raise exception 'This lesson overlaps another scheduled lesson.' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create or replace function private.notify_cfi_schedule_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  instructor_name text;
  notification_title text;
  notification_message text;
begin
  select coalesce(nullif(btrim(profile.display_name), ''), 'Your instructor')
  into instructor_name
  from public.profiles profile
  where profile.id = new.cfi_user_id;

  if tg_op = 'INSERT' then
    notification_title := 'Lesson scheduled';
    notification_message := instructor_name || ' added a ' || new.lesson_kind || ' lesson to your schedule.';
  elsif old.status = 'scheduled' and new.status = 'cancelled' then
    notification_title := 'Lesson cancelled';
    notification_message := instructor_name || ' cancelled a lesson on your schedule.';
  elsif old.start_at is distinct from new.start_at
    or old.end_at is distinct from new.end_at
    or old.lesson_kind is distinct from new.lesson_kind
  then
    notification_title := 'Lesson updated';
    notification_message := instructor_name || ' changed a lesson on your schedule.';
  else
    return new;
  end if;

  perform private.create_user_notification(
    new.student_user_id,
    notification_title,
    notification_message,
    'schedule',
    'normal',
    null,
    'CFI schedule',
    '/dashboard/schedule',
    'cfi-schedule-event:' || new.id::text || ':' || extract(epoch from new.updated_at)::bigint::text,
    new.cfi_user_id
  );
  return new;
end;
$$;

revoke all on function private.prepare_cfi_schedule_row() from public;
revoke all on function private.disable_unlinked_cfi_schedule_access() from public;
revoke all on function private.enforce_cfi_schedule_event_conflict() from public;
revoke all on function private.notify_cfi_schedule_student() from public;

create trigger cfi_schedule_student_grants_touch
before update on public.cfi_schedule_student_grants
for each row execute function private.prepare_cfi_schedule_row();
create trigger saved_person_account_link_disable_schedule
after delete on public.saved_person_account_links
for each row execute function private.disable_unlinked_cfi_schedule_access();
create trigger cfi_schedule_week_overrides_touch
before update on public.cfi_schedule_week_overrides
for each row execute function private.prepare_cfi_schedule_row();
create trigger cfi_schedule_availability_override_dates_touch
before update on public.cfi_schedule_availability_override_dates
for each row execute function private.prepare_cfi_schedule_row();
create trigger cfi_schedule_availability_slots_touch
before update on public.cfi_schedule_availability_slots
for each row execute function private.prepare_cfi_schedule_row();
create trigger cfi_schedule_unavailable_blocks_touch
before update on public.cfi_schedule_unavailable_blocks
for each row execute function private.prepare_cfi_schedule_row();
create trigger cfi_schedule_events_touch
before update on public.cfi_schedule_events
for each row execute function private.prepare_cfi_schedule_row();
create trigger cfi_schedule_events_conflict
before insert or update on public.cfi_schedule_events
for each row execute function private.enforce_cfi_schedule_event_conflict();
create trigger cfi_schedule_events_notify
after insert or update on public.cfi_schedule_events
for each row execute function private.notify_cfi_schedule_student();

alter table public.cfi_schedule_student_grants enable row level security;
alter table public.cfi_schedule_week_overrides enable row level security;
alter table public.cfi_schedule_availability_override_dates enable row level security;
alter table public.cfi_schedule_availability_slots enable row level security;
alter table public.cfi_schedule_unavailable_blocks enable row level security;
alter table public.cfi_schedule_events enable row level security;

create policy cfi_schedule_student_grants_select_participant
on public.cfi_schedule_student_grants for select to authenticated
using (cfi_user_id = (select auth.uid()) or (student_user_id = (select auth.uid()) and access_enabled));
create policy cfi_schedule_student_grants_insert_cfi
on public.cfi_schedule_student_grants for insert to authenticated
with check (
  cfi_user_id = (select auth.uid())
  and exists (
    select 1 from public.saved_person_account_links account_link
    where account_link.saved_person_id = cfi_schedule_student_grants.saved_person_id
      and account_link.owner_user_id = (select auth.uid())
      and account_link.linked_user_id = cfi_schedule_student_grants.student_user_id
  )
);
create policy cfi_schedule_student_grants_update_cfi
on public.cfi_schedule_student_grants for update to authenticated
using (cfi_user_id = (select auth.uid()))
with check (
  cfi_user_id = (select auth.uid())
  and exists (
    select 1 from public.saved_person_account_links account_link
    where account_link.saved_person_id = cfi_schedule_student_grants.saved_person_id
      and account_link.owner_user_id = (select auth.uid())
      and account_link.linked_user_id = cfi_schedule_student_grants.student_user_id
  )
);
create policy cfi_schedule_student_grants_delete_cfi
on public.cfi_schedule_student_grants for delete to authenticated
using (cfi_user_id = (select auth.uid()));

create policy cfi_schedule_week_overrides_select_participant
on public.cfi_schedule_week_overrides for select to authenticated
using (
  cfi_user_id = (select auth.uid())
  or (
    student_user_id = (select auth.uid())
    and (select private.has_cfi_schedule_access(cfi_user_id, student_user_id))
  )
);
create policy cfi_schedule_week_overrides_insert_cfi
on public.cfi_schedule_week_overrides for insert to authenticated
with check (cfi_user_id = (select auth.uid()));
create policy cfi_schedule_week_overrides_update_cfi
on public.cfi_schedule_week_overrides for update to authenticated
using (cfi_user_id = (select auth.uid()))
with check (cfi_user_id = (select auth.uid()));
create policy cfi_schedule_week_overrides_delete_cfi
on public.cfi_schedule_week_overrides for delete to authenticated
using (cfi_user_id = (select auth.uid()));

create policy cfi_schedule_availability_dates_select_participant
on public.cfi_schedule_availability_override_dates for select to authenticated
using (
  cfi_user_id = (select auth.uid())
  or (
    student_user_id = (select auth.uid())
    and (select private.has_cfi_schedule_access(cfi_user_id, student_user_id))
  )
);
create policy cfi_schedule_availability_dates_insert_student
on public.cfi_schedule_availability_override_dates for insert to authenticated
with check (
  student_user_id = (select auth.uid())
  and (select private.has_cfi_schedule_access(cfi_user_id, student_user_id))
);
create policy cfi_schedule_availability_dates_update_student
on public.cfi_schedule_availability_override_dates for update to authenticated
using (student_user_id = (select auth.uid()))
with check (
  student_user_id = (select auth.uid())
  and (select private.has_cfi_schedule_access(cfi_user_id, student_user_id))
);
create policy cfi_schedule_availability_dates_delete_student
on public.cfi_schedule_availability_override_dates for delete to authenticated
using (student_user_id = (select auth.uid()));

create policy cfi_schedule_availability_slots_select_participant
on public.cfi_schedule_availability_slots for select to authenticated
using (
  cfi_user_id = (select auth.uid())
  or (
    student_user_id = (select auth.uid())
    and (select private.has_cfi_schedule_access(cfi_user_id, student_user_id))
  )
);
create policy cfi_schedule_availability_slots_insert_student
on public.cfi_schedule_availability_slots for insert to authenticated
with check (
  student_user_id = (select auth.uid())
  and (select private.has_cfi_schedule_access(cfi_user_id, student_user_id))
);
create policy cfi_schedule_availability_slots_update_student
on public.cfi_schedule_availability_slots for update to authenticated
using (student_user_id = (select auth.uid()))
with check (
  student_user_id = (select auth.uid())
  and (select private.has_cfi_schedule_access(cfi_user_id, student_user_id))
);
create policy cfi_schedule_availability_slots_delete_student
on public.cfi_schedule_availability_slots for delete to authenticated
using (student_user_id = (select auth.uid()));

create policy cfi_schedule_unavailable_blocks_select_cfi
on public.cfi_schedule_unavailable_blocks for select to authenticated
using (cfi_user_id = (select auth.uid()));
create policy cfi_schedule_unavailable_blocks_insert_cfi
on public.cfi_schedule_unavailable_blocks for insert to authenticated
with check (cfi_user_id = (select auth.uid()));
create policy cfi_schedule_unavailable_blocks_update_cfi
on public.cfi_schedule_unavailable_blocks for update to authenticated
using (cfi_user_id = (select auth.uid()))
with check (cfi_user_id = (select auth.uid()));
create policy cfi_schedule_unavailable_blocks_delete_cfi
on public.cfi_schedule_unavailable_blocks for delete to authenticated
using (cfi_user_id = (select auth.uid()));

create policy cfi_schedule_events_select_participant
on public.cfi_schedule_events for select to authenticated
using (
  cfi_user_id = (select auth.uid())
  or (
    student_user_id = (select auth.uid())
    and (select private.has_cfi_schedule_access(cfi_user_id, student_user_id))
  )
);
create policy cfi_schedule_events_insert_cfi
on public.cfi_schedule_events for insert to authenticated
with check (cfi_user_id = (select auth.uid()) and created_by = (select auth.uid()));
create policy cfi_schedule_events_update_cfi
on public.cfi_schedule_events for update to authenticated
using (cfi_user_id = (select auth.uid()))
with check (cfi_user_id = (select auth.uid()));
create policy cfi_schedule_events_delete_cfi
on public.cfi_schedule_events for delete to authenticated
using (cfi_user_id = (select auth.uid()));

revoke all on table public.cfi_schedule_student_grants from public, anon, authenticated;
revoke all on table public.cfi_schedule_week_overrides from public, anon, authenticated;
revoke all on table public.cfi_schedule_availability_override_dates from public, anon, authenticated;
revoke all on table public.cfi_schedule_availability_slots from public, anon, authenticated;
revoke all on table public.cfi_schedule_unavailable_blocks from public, anon, authenticated;
revoke all on table public.cfi_schedule_events from public, anon, authenticated;

grant select, insert, update, delete on table public.cfi_schedule_student_grants to authenticated;
grant select, insert, update, delete on table public.cfi_schedule_week_overrides to authenticated;
grant select, insert, update, delete on table public.cfi_schedule_availability_override_dates to authenticated;
grant select, insert, update, delete on table public.cfi_schedule_availability_slots to authenticated;
grant select, insert, update, delete on table public.cfi_schedule_unavailable_blocks to authenticated;
grant select, insert, update, delete on table public.cfi_schedule_events to authenticated;
grant all on table public.cfi_schedule_student_grants to service_role;
grant all on table public.cfi_schedule_week_overrides to service_role;
grant all on table public.cfi_schedule_availability_override_dates to service_role;
grant all on table public.cfi_schedule_availability_slots to service_role;
grant all on table public.cfi_schedule_unavailable_blocks to service_role;
grant all on table public.cfi_schedule_events to service_role;

create or replace function public.list_my_cfi_schedule_access()
returns table (
  cfi_user_id uuid,
  cfi_name text,
  student_user_id uuid,
  student_name text,
  saved_person_id uuid,
  default_weekly_sessions integer,
  default_duration_min integer,
  color text,
  access_enabled boolean,
  caller_role text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    grant_row.cfi_user_id,
    coalesce(nullif(btrim(cfi_profile.display_name), ''), 'Instructor')::text,
    grant_row.student_user_id,
    coalesce(nullif(btrim(saved_person.display_name), ''), nullif(btrim(student_profile.display_name), ''), 'Student')::text,
    grant_row.saved_person_id,
    grant_row.default_weekly_sessions,
    grant_row.default_duration_min,
    grant_row.color,
    grant_row.access_enabled,
    case when grant_row.cfi_user_id = auth.uid() then 'cfi' else 'student' end::text
  from public.cfi_schedule_student_grants grant_row
  join public.saved_people saved_person on saved_person.id = grant_row.saved_person_id
  left join public.profiles cfi_profile on cfi_profile.id = grant_row.cfi_user_id
  left join public.profiles student_profile on student_profile.id = grant_row.student_user_id
  where auth.uid() is not null
    and (
      grant_row.cfi_user_id = auth.uid()
      or (grant_row.student_user_id = auth.uid() and grant_row.access_enabled)
    )
  order by 10, 4;
$$;

create or replace function public.list_cfi_schedule_entries(
  p_cfi_user_id uuid,
  p_range_start timestamptz,
  p_range_end timestamptz
)
returns table (
  id uuid,
  entry_type text,
  student_user_id uuid,
  student_name text,
  lesson_kind text,
  start_at timestamptz,
  end_at timestamptz,
  note text,
  auto_generated boolean,
  status text,
  is_own boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_is_cfi boolean := caller_id = p_cfi_user_id;
begin
  if caller_id is null or p_range_end <= p_range_start then
    raise exception 'Invalid schedule request.' using errcode = '22023';
  end if;
  if not caller_is_cfi and not private.has_cfi_schedule_access(p_cfi_user_id, caller_id) then
    raise exception 'Schedule access is required.' using errcode = '42501';
  end if;

  return query
  select
    event.id,
    case when caller_is_cfi or event.student_user_id = caller_id then 'lesson' else 'unavailable' end::text,
    case when caller_is_cfi or event.student_user_id = caller_id then event.student_user_id else null end,
    case when caller_is_cfi or event.student_user_id = caller_id
      then coalesce(nullif(btrim(person.display_name), ''), 'Student') else null end::text,
    case when caller_is_cfi or event.student_user_id = caller_id then event.lesson_kind else null end::text,
    event.start_at,
    event.end_at,
    case when caller_is_cfi or event.student_user_id = caller_id then event.note else '' end::text,
    case when caller_is_cfi or event.student_user_id = caller_id then event.auto_generated else false end,
    event.status,
    event.student_user_id = caller_id
  from public.cfi_schedule_events event
  join public.cfi_schedule_student_grants grant_row
    on grant_row.cfi_user_id = event.cfi_user_id
   and grant_row.student_user_id = event.student_user_id
  join public.saved_people person on person.id = grant_row.saved_person_id
  where event.cfi_user_id = p_cfi_user_id
    and event.status = 'scheduled'
    and event.start_at < p_range_end
    and event.end_at > p_range_start

  union all

  select
    block.id,
    'unavailable'::text,
    null::uuid,
    null::text,
    null::text,
    block.start_at,
    block.end_at,
    case when caller_is_cfi then block.note else '' end::text,
    false,
    'scheduled'::text,
    false
  from public.cfi_schedule_unavailable_blocks block
  where block.cfi_user_id = p_cfi_user_id
    and block.start_at < p_range_end
    and block.end_at > p_range_start
  order by 6, 7;
end;
$$;

revoke all on function public.list_my_cfi_schedule_access() from public, anon, authenticated;
revoke all on function public.list_cfi_schedule_entries(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.list_my_cfi_schedule_access() to authenticated;
grant execute on function public.list_cfi_schedule_entries(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.list_my_cfi_schedule_access() to service_role;
grant execute on function public.list_cfi_schedule_entries(uuid, timestamptz, timestamptz) to service_role;
