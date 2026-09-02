-- Private revisions cover lessons, resources, availability and permissions, so
-- publication never relies on an obsolete availability/conflict preview.
create table private.cfi_schedule_revisions (
  cfi_user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0
);
create table private.cfi_schedule_batch_context (
  cfi_user_id uuid primary key,
  transaction_id bigint not null
);
create table private.cfi_schedule_publications (
  id uuid primary key,
  cfi_user_id uuid not null references auth.users(id) on delete cascade,
  changes jsonb not null,
  revision bigint not null
);
create index cfi_schedule_publications_cfi_idx on private.cfi_schedule_publications(cfi_user_id);
alter table private.cfi_schedule_revisions enable row level security;
alter table private.cfi_schedule_batch_context enable row level security;
alter table private.cfi_schedule_publications enable row level security;
revoke all on private.cfi_schedule_revisions, private.cfi_schedule_batch_context, private.cfi_schedule_publications from public, anon, authenticated;

create function private.touch_cfi_schedule_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cfi_id uuid;
begin
  if tg_op = 'DELETE' then cfi_id := old.cfi_user_id; else cfi_id := new.cfi_user_id; end if;
  -- Cascading account deletion must not recreate a revision for a deleted user.
  if not exists(select 1 from auth.users where id = cfi_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  insert into private.cfi_schedule_revisions(cfi_user_id, revision) values (cfi_id, 1)
  on conflict (cfi_user_id) do update set revision = cfi_schedule_revisions.revision + 1;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.touch_cfi_schedule_revision() from public;

do $$
declare table_name text;
begin
  foreach table_name in array array['cfi_schedule_events', 'cfi_schedule_unavailable_blocks', 'cfi_schedule_student_grants', 'cfi_schedule_availability_slots', 'cfi_schedule_availability_override_dates', 'cfi_schedule_week_overrides'] loop
    execute format('create trigger schedule_revision before insert or update or delete on public.%I for each row execute function private.touch_cfi_schedule_revision()', table_name);
  end loop;
end;
$$;

-- Keep overlap protection, but allow an atomic batch to validate its final
-- arrangement rather than fail against intermediate positions.
drop trigger cfi_schedule_events_conflict on public.cfi_schedule_events;
create or replace function private.enforce_cfi_schedule_event_conflict()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    select 1 from public.cfi_schedule_events current_event
    join public.cfi_schedule_events other on other.cfi_user_id = current_event.cfi_user_id
      and other.id <> current_event.id and other.status = 'scheduled'
      and current_event.start_at < other.end_at and current_event.end_at > other.start_at
    where current_event.id = new.id and current_event.status = 'scheduled'
  ) then
    raise exception 'This lesson overlaps another scheduled lesson.' using errcode = '23P01';
  end if;
  return new;
end;
$$;
create constraint trigger cfi_schedule_events_conflict
after insert or update on public.cfi_schedule_events
deferrable initially immediate for each row execute function private.enforce_cfi_schedule_event_conflict();

create function private.cfi_schedule_batch_active(p_cfi_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.cfi_schedule_batch_context where cfi_user_id = p_cfi_id and transaction_id = txid_current());
$$;
revoke all on function private.cfi_schedule_batch_active(uuid) from public;
grant execute on function private.cfi_schedule_batch_active(uuid) to authenticated, service_role;
drop trigger cfi_schedule_events_notify on public.cfi_schedule_events;
create trigger cfi_schedule_events_notify after insert or update on public.cfi_schedule_events
for each row when (not private.cfi_schedule_batch_active(new.cfi_user_id))
execute function private.notify_cfi_schedule_student();

create function public.get_cfi_schedule_editor_snapshot(p_range_start timestamptz, p_range_end timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller_id uuid := auth.uid();
begin
  if caller_id is null or p_range_start is null or p_range_end is null or p_range_end <= p_range_start then
    raise exception 'Invalid schedule request.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'revision', coalesce((select revision from private.cfi_schedule_revisions where cfi_user_id = caller_id), 0)::text,
    'entries', coalesce((select jsonb_agg(e) from public.list_cfi_schedule_entries(caller_id, p_range_start, p_range_end) e), '[]'::jsonb),
    'slots', coalesce((select jsonb_agg(s) from public.cfi_schedule_availability_slots s where cfi_user_id = caller_id), '[]'::jsonb),
    'overrideDates', coalesce((select jsonb_agg(d) from public.cfi_schedule_availability_override_dates d where cfi_user_id = caller_id), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(b) from public.cfi_schedule_unavailable_blocks b where cfi_user_id = caller_id and start_at < p_range_end and end_at > p_range_start), '[]'::jsonb),
    'weekOverrides', coalesce((select jsonb_agg(w) from public.cfi_schedule_week_overrides w where cfi_user_id = caller_id), '[]'::jsonb),
    'access', coalesce((select jsonb_agg(a) from public.list_my_cfi_schedule_access() a where caller_role = 'cfi'), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_cfi_schedule_editor_snapshot(timestamptz,timestamptz) from public, anon;
grant execute on function public.get_cfi_schedule_editor_snapshot(timestamptz,timestamptz) to authenticated;

create or replace function public.publish_cfi_schedule_draft(p_expected_revision bigint, p_batch_id uuid, p_changes jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := auth.uid();
  current_revision bigint;
  change_row record;
  existing public.cfi_schedule_events%rowtype;
  receipt private.cfi_schedule_publications%rowtype;
  affected_students uuid[] := array[]::uuid[];
  recipient uuid;
begin
  if caller_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_batch_id is null or p_expected_revision is null or jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 200 then
    raise exception 'Invalid schedule draft.' using errcode = '22023';
  end if;
  insert into private.cfi_schedule_revisions(cfi_user_id) values(caller_id) on conflict do nothing;
  select revision into current_revision from private.cfi_schedule_revisions where cfi_user_id = caller_id for update;
  select * into receipt from private.cfi_schedule_publications where id = p_batch_id;
  if found then
    if receipt.cfi_user_id <> caller_id or receipt.changes <> p_changes then raise exception 'Invalid publication retry.' using errcode = '22023'; end if;
    return receipt.revision::text;
  end if;
  if current_revision <> p_expected_revision then
    -- This is an application conflict, not a retryable database serialization
    -- failure. PT409 reaches the browser immediately as HTTP 409.
    raise exception 'The schedule or availability changed. Review the latest schedule before publishing.' using errcode = 'PT409';
  end if;
  if (select count(*) from jsonb_array_elements(p_changes)) <> (select count(distinct value->>'id') from jsonb_array_elements(p_changes)) then
    raise exception 'Duplicate or missing lesson IDs.' using errcode = '22023';
  end if;

  insert into private.cfi_schedule_batch_context values(caller_id, txid_current());
  set constraints public.cfi_schedule_events_conflict deferred;
  for change_row in select * from jsonb_to_recordset(p_changes) as x(
    id uuid, student_user_id uuid, lesson_kind text, start_at timestamptz, end_at timestamptz, note text, status text, auto_generated boolean
  ) loop
    select * into existing from public.cfi_schedule_events where id = change_row.id;
    if found then
      if existing.cfi_user_id <> caller_id or existing.student_user_id is distinct from change_row.student_user_id or existing.status <> 'scheduled' then
        raise exception 'You cannot edit this lesson.' using errcode = '42501';
      end if;
      if (existing.lesson_kind, existing.start_at, existing.end_at, existing.note, existing.status) is not distinct from
         (change_row.lesson_kind, change_row.start_at, change_row.end_at, change_row.note, change_row.status) then continue; end if;
      update public.cfi_schedule_events set lesson_kind = change_row.lesson_kind, start_at = change_row.start_at,
        end_at = change_row.end_at, note = change_row.note, status = change_row.status where id = change_row.id;
    else
      if change_row.status is distinct from 'scheduled' or not exists(select 1 from public.cfi_schedule_student_grants where cfi_user_id = caller_id and student_user_id = change_row.student_user_id and access_enabled) then
        raise exception 'Active student access is required for a new lesson.' using errcode = '42501';
      end if;
      insert into public.cfi_schedule_events(id,cfi_user_id,student_user_id,lesson_kind,start_at,end_at,note,status,auto_generated,created_by)
      values(change_row.id,caller_id,change_row.student_user_id,change_row.lesson_kind,change_row.start_at,change_row.end_at,change_row.note,'scheduled',coalesce(change_row.auto_generated,false),caller_id);
    end if;
    affected_students := array_append(affected_students, change_row.student_user_id);
  end loop;
  set constraints public.cfi_schedule_events_conflict immediate;
  delete from private.cfi_schedule_batch_context where cfi_user_id = caller_id;
  for recipient in select distinct unnest(affected_students) loop
    perform private.create_user_notification(recipient, 'Schedule updated',
      'Your instructor published changes to your lessons. Open your schedule to review the final times.',
      'schedule','normal',null,'CFI schedule','/dashboard/schedule','cfi-schedule-publish:' || p_batch_id::text || ':' || recipient::text,caller_id);
  end loop;
  select revision into current_revision from private.cfi_schedule_revisions where cfi_user_id = caller_id;
  insert into private.cfi_schedule_publications values(p_batch_id,caller_id,p_changes,current_revision);
  return current_revision::text;
end;
$$;
revoke all on function public.publish_cfi_schedule_draft(bigint,uuid,jsonb) from public, anon;
grant execute on function public.publish_cfi_schedule_draft(bigint,uuid,jsonb) to authenticated;

alter table public.cfi_schedule_availability_override_dates add column source text not null default 'manual' check(source in ('manual','auto'));

create function public.save_cfi_schedule_availability(p_cfi_id uuid, p_timezone text, p_scope text, p_weekday integer, p_date date, p_slots jsonb, p_autofill boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  student_id uuid := auth.uid();
  today date := (current_timestamp at time zone p_timezone)::date;
  fill_date date;
  filled integer := 0;
begin
  if student_id is null or not private.has_cfi_schedule_access(p_cfi_id, student_id) then raise exception 'Schedule access is required.' using errcode = '42501'; end if;
  if p_scope is null or p_scope not in ('weekly','date') or jsonb_typeof(p_slots) is distinct from 'array' or jsonb_array_length(p_slots) > 12 then raise exception 'Invalid availability.' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_to_recordset(p_slots) as s(start_minute integer,end_minute integer) where start_minute is null or end_minute is null or start_minute < 0 or end_minute > 1440 or end_minute - start_minute < 120) then
    raise exception 'Each availability period must be at least two hours.' using errcode = '22023';
  end if;
  -- Lock the same revision before touching related rows in this transaction.
  insert into private.cfi_schedule_revisions(cfi_user_id) values(p_cfi_id) on conflict do nothing;
  perform 1 from private.cfi_schedule_revisions where cfi_user_id = p_cfi_id for update;
  if p_scope = 'date' then
    if p_date is null or p_date < today or p_date >= today + 28 then raise exception 'Choose a date within the next four weeks.' using errcode = '22023'; end if;
    insert into public.cfi_schedule_availability_override_dates(cfi_user_id,student_user_id,availability_date,timezone,source)
    values(p_cfi_id,student_id,p_date,p_timezone,'manual')
    on conflict(cfi_user_id,student_user_id,availability_date) do update set timezone = excluded.timezone, source = 'manual';
    delete from public.cfi_schedule_availability_slots where cfi_user_id = p_cfi_id and student_user_id = student_id and scope = 'date' and availability_date = p_date;
    insert into public.cfi_schedule_availability_slots(cfi_user_id,student_user_id,scope,availability_date,start_minute,end_minute,timezone)
    select p_cfi_id,student_id,'date',p_date,s.start_minute,s.end_minute,p_timezone from jsonb_to_recordset(p_slots) as s(start_minute integer,end_minute integer);
    return 1;
  end if;
  if p_weekday is null or p_weekday not between 1 and 7 then raise exception 'Invalid weekday.' using errcode = '22023'; end if;
  delete from public.cfi_schedule_availability_slots where cfi_user_id = p_cfi_id and student_user_id = student_id and scope = 'weekly' and weekday = p_weekday;
  insert into public.cfi_schedule_availability_slots(cfi_user_id,student_user_id,scope,weekday,start_minute,end_minute,timezone)
  select p_cfi_id,student_id,'weekly',p_weekday,s.start_minute,s.end_minute,p_timezone from jsonb_to_recordset(p_slots) as s(start_minute integer,end_minute integer);
  if p_autofill then
    for fill_date in select today + n from generate_series(0,27) n where extract(isodow from today + n) = p_weekday loop
      if exists(select 1 from public.cfi_schedule_availability_override_dates where cfi_user_id = p_cfi_id and student_user_id = student_id and availability_date = fill_date and source = 'manual') then continue; end if;
      insert into public.cfi_schedule_availability_override_dates(cfi_user_id,student_user_id,availability_date,timezone,source)
      values(p_cfi_id,student_id,fill_date,p_timezone,'auto') on conflict(cfi_user_id,student_user_id,availability_date) do update set timezone = excluded.timezone;
      delete from public.cfi_schedule_availability_slots where cfi_user_id = p_cfi_id and student_user_id = student_id and scope = 'date' and availability_date = fill_date;
      insert into public.cfi_schedule_availability_slots(cfi_user_id,student_user_id,scope,availability_date,start_minute,end_minute,timezone)
      select p_cfi_id,student_id,'date',fill_date,s.start_minute,s.end_minute,p_timezone from jsonb_to_recordset(p_slots) as s(start_minute integer,end_minute integer);
      filled := filled + 1;
    end loop;
  end if;
  return filled;
end;
$$;
revoke all on function public.save_cfi_schedule_availability(uuid,text,text,integer,date,jsonb,boolean) from public, anon;
grant execute on function public.save_cfi_schedule_availability(uuid,text,text,integer,date,jsonb,boolean) to authenticated;
