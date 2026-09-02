-- Additive People-based scheduling. Existing account-backed records stay intact.
-- student_user_id in these PRIVATE tables is a stable saved_people ID, never
-- an authentication identity. Only accepted account links confer student access.
create table private.cfi_person_student_grants (like public.cfi_schedule_student_grants including all);
alter table private.cfi_person_student_grants enable row level security;
revoke all on private.cfi_person_student_grants from public, anon, authenticated;
create trigger schedule_revision before insert or update or delete on private.cfi_person_student_grants
for each row execute function private.touch_cfi_schedule_revision();
create table private.cfi_person_week_overrides (like public.cfi_schedule_week_overrides including all);
alter table private.cfi_person_week_overrides enable row level security;
revoke all on private.cfi_person_week_overrides from public, anon, authenticated;
create trigger schedule_revision before insert or update or delete on private.cfi_person_week_overrides
for each row execute function private.touch_cfi_schedule_revision();
alter table private.cfi_person_week_overrides add foreign key(cfi_user_id,student_user_id) references private.cfi_person_student_grants(cfi_user_id,student_user_id) on delete restrict;
create table private.cfi_person_availability_override_dates (like public.cfi_schedule_availability_override_dates including all);
alter table private.cfi_person_availability_override_dates enable row level security;
revoke all on private.cfi_person_availability_override_dates from public, anon, authenticated;
create trigger schedule_revision before insert or update or delete on private.cfi_person_availability_override_dates
for each row execute function private.touch_cfi_schedule_revision();
alter table private.cfi_person_availability_override_dates add foreign key(cfi_user_id,student_user_id) references private.cfi_person_student_grants(cfi_user_id,student_user_id) on delete restrict;
create table private.cfi_person_availability_slots (like public.cfi_schedule_availability_slots including all);
alter table private.cfi_person_availability_slots enable row level security;
revoke all on private.cfi_person_availability_slots from public, anon, authenticated;
create trigger schedule_revision before insert or update or delete on private.cfi_person_availability_slots
for each row execute function private.touch_cfi_schedule_revision();
alter table private.cfi_person_availability_slots add foreign key(cfi_user_id,student_user_id) references private.cfi_person_student_grants(cfi_user_id,student_user_id) on delete restrict;
create table private.cfi_person_events (like public.cfi_schedule_events including all);
alter table private.cfi_person_events enable row level security;
revoke all on private.cfi_person_events from public, anon, authenticated;
create trigger schedule_revision before insert or update or delete on private.cfi_person_events
for each row execute function private.touch_cfi_schedule_revision();
alter table private.cfi_person_events add foreign key(cfi_user_id,student_user_id) references private.cfi_person_student_grants(cfi_user_id,student_user_id) on delete restrict;

alter table private.cfi_person_student_grants
  add foreign key(cfi_user_id) references auth.users(id) on delete cascade,
  add foreign key(saved_person_id) references public.saved_people(id) on delete restrict,
  add check(student_user_id = saved_person_id);
create function private.cfi_person_account(p_cfi uuid,p_person uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select linked_user_id from public.saved_person_account_links
  where owner_user_id=p_cfi and saved_person_id=p_person;
$$;
revoke all on function private.cfi_person_account(uuid,uuid) from public,anon,authenticated;

create function private.can_edit_cfi_person(p_cfi uuid,p_person uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from private.cfi_person_student_grants g
    where g.cfi_user_id=p_cfi and g.student_user_id=p_person
      and (p_cfi=auth.uid() or (g.access_enabled and private.cfi_person_account(p_cfi,p_person)=auth.uid()))
  );
$$;
revoke all on function private.can_edit_cfi_person(uuid,uuid) from public,anon,authenticated;

create function public.list_my_cfi_schedule_access_v2()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item),'[]'::jsonb) from (
   select to_jsonb(a)||jsonb_build_object('storage_kind','account','account_user_id',a.student_user_id) item
   from public.list_my_cfi_schedule_access() a
   union all
   select jsonb_build_object(
    'cfi_user_id',g.cfi_user_id,'cfi_name',coalesce(nullif(p.display_name,''),'Instructor'),
    'student_user_id',g.student_user_id,'saved_person_id',g.saved_person_id,
    'student_name',s.display_name,'default_weekly_sessions',g.default_weekly_sessions,
    'default_duration_min',g.default_duration_min,'color',g.color,'access_enabled',g.access_enabled,
    'caller_role',case when auth.uid()=g.cfi_user_id then 'cfi' else 'student' end,
    'storage_kind','person','account_user_id',private.cfi_person_account(g.cfi_user_id,g.saved_person_id))
   from private.cfi_person_student_grants g
   join public.saved_people s on s.id=g.saved_person_id
   left join public.profiles p on p.id=g.cfi_user_id
   where auth.uid()=g.cfi_user_id or (g.access_enabled and private.cfi_person_account(g.cfi_user_id,g.saved_person_id)=auth.uid())
 ) rows;
$$;
revoke all on function public.list_my_cfi_schedule_access_v2() from public,anon;
grant execute on function public.list_my_cfi_schedule_access_v2() to authenticated;

create function public.set_cfi_person_access(p_person uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();
begin
 if caller is null or p_enabled is null or not exists(
   select 1 from public.saved_people where id=p_person and user_id=caller and role='student'
 ) then raise exception 'Choose one of your students from People.' using errcode='42501'; end if;
 -- Serialize enrollment with edits/publication.
 insert into private.cfi_schedule_revisions(cfi_user_id) values(caller) on conflict do nothing;
 perform 1 from private.cfi_schedule_revisions where cfi_user_id=caller for update;
 if exists(select 1 from public.cfi_schedule_student_grants where saved_person_id=p_person) then
   raise exception 'This student already has account-based scheduling.' using errcode='22023';
 end if;
 insert into private.cfi_person_student_grants(cfi_user_id,saved_person_id,student_user_id,access_enabled)
 values(caller,p_person,p_person,p_enabled)
 on conflict(cfi_user_id,student_user_id) do update set access_enabled=excluded.access_enabled;
end;
$$;
revoke all on function public.set_cfi_person_access(uuid,boolean) from public,anon;
grant execute on function public.set_cfi_person_access(uuid,boolean) to authenticated;

create function public.get_cfi_schedule_snapshot_v2(p_range_start timestamptz,p_range_end timestamptz,p_cfi_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 caller uuid:=auth.uid(); cfi uuid:=coalesce(p_cfi_id,auth.uid()); owner boolean;
 access_rows jsonb; entries jsonb; result jsonb;
begin
 owner:=caller=cfi;
 if caller is null or p_range_start is null or p_range_end is null or p_range_end<=p_range_start then
   raise exception 'Invalid schedule request.' using errcode='22023'; end if;
 access_rows:=public.list_my_cfi_schedule_access_v2();
 if not owner and not exists(select 1 from jsonb_array_elements(access_rows) a where (a->>'cfi_user_id')::uuid=cfi and (a->>'access_enabled')::boolean) then
   raise exception 'Schedule access is required.' using errcode='42501'; end if;
 -- Normalize both stores, then redact every non-owned student's details.
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',e.id,'entry_type',case when owner or e.account_id=caller then 'lesson' else 'unavailable' end,
   'student_user_id',case when owner or e.account_id=caller then e.student_user_id end,
   'student_name',case when owner or e.account_id=caller then e.student_name end,
   'lesson_kind',case when owner or e.account_id=caller then e.lesson_kind end,
   'start_at',e.start_at,'end_at',e.end_at,'note',case when owner or e.account_id=caller then e.note else '' end,
   'auto_generated',case when owner or e.account_id=caller then e.auto_generated else false end,
   'status',e.status,'is_own',coalesce(e.account_id=caller,false)
 )),'[]'::jsonb) into entries from (
   select ev.id,ev.student_user_id,s.display_name student_name,ev.lesson_kind,ev.start_at,ev.end_at,ev.note,ev.auto_generated,ev.status,case when g.access_enabled then ev.student_user_id end account_id
   from public.cfi_schedule_events ev join public.cfi_schedule_student_grants g using(cfi_user_id,student_user_id)
   join public.saved_people s on s.id=g.saved_person_id where ev.cfi_user_id=cfi
   union all
   select ev.id,ev.student_user_id,s.display_name,ev.lesson_kind,ev.start_at,ev.end_at,ev.note,ev.auto_generated,ev.status,case when g.access_enabled then private.cfi_person_account(cfi,ev.student_user_id) end
   from private.cfi_person_events ev join private.cfi_person_student_grants g using(cfi_user_id,student_user_id)
   join public.saved_people s on s.id=ev.student_user_id where ev.cfi_user_id=cfi
 ) e where e.status='scheduled' and e.start_at<p_range_end and e.end_at>p_range_start;
 entries:=entries || coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'entry_type','unavailable','student_user_id',null,'student_name',null,'lesson_kind',null,'start_at',b.start_at,'end_at',b.end_at,'note',case when owner then b.note else '' end,'auto_generated',false,'status','scheduled','is_own',false))
 from public.cfi_schedule_unavailable_blocks b where b.cfi_user_id=cfi and b.start_at<p_range_end and b.end_at>p_range_start),'[]'::jsonb);
 result:=jsonb_build_object('entries',entries,
 'revision',coalesce((select revision from private.cfi_schedule_revisions where cfi_user_id=cfi),0)::text,
 'access',coalesce((select jsonb_agg(a) from jsonb_array_elements(access_rows) a where (a->>'cfi_user_id')::uuid=cfi),'[]'::jsonb),
 'blocks',case when owner then coalesce((select jsonb_agg(b) from public.cfi_schedule_unavailable_blocks b where b.cfi_user_id=cfi and b.start_at<p_range_end and b.end_at>p_range_start),'[]'::jsonb) else '[]'::jsonb end);
 result:=result || jsonb_build_object('slots',coalesce((select jsonb_agg(r) from (
 select s.* from public.cfi_schedule_availability_slots s where s.cfi_user_id=cfi and (owner or s.student_user_id=caller)
 union all
 select s.* from private.cfi_person_availability_slots s where s.cfi_user_id=cfi and (owner or private.can_edit_cfi_person(cfi,s.student_user_id))
 ) r),'[]'::jsonb));
 result:=result || jsonb_build_object('overrideDates',coalesce((select jsonb_agg(r) from (
 select s.* from public.cfi_schedule_availability_override_dates s where s.cfi_user_id=cfi and (owner or s.student_user_id=caller)
 union all
 select s.* from private.cfi_person_availability_override_dates s where s.cfi_user_id=cfi and (owner or private.can_edit_cfi_person(cfi,s.student_user_id))
 ) r),'[]'::jsonb));
 result:=result || jsonb_build_object('weekOverrides',coalesce((select jsonb_agg(r) from (
 select s.* from public.cfi_schedule_week_overrides s where s.cfi_user_id=cfi and (owner or s.student_user_id=caller)
 union all
 select s.* from private.cfi_person_week_overrides s where s.cfi_user_id=cfi and (owner or private.can_edit_cfi_person(cfi,s.student_user_id))
 ) r),'[]'::jsonb));
 return result;
end;
$$;
revoke all on function public.get_cfi_schedule_snapshot_v2(timestamptz,timestamptz,uuid) from public,anon;
grant execute on function public.get_cfi_schedule_snapshot_v2(timestamptz,timestamptz,uuid) to authenticated;

-- Account linking changes visibility, not record identity or record ownership.
create function private.touch_cfi_person_link_revision()
returns trigger language plpgsql security definer set search_path='' as $$
declare cfi uuid; person uuid;
begin
 if tg_op='DELETE' then cfi:=old.owner_user_id; person:=old.saved_person_id;
 else cfi:=new.owner_user_id; person:=new.saved_person_id; end if;
 if exists(select 1 from private.cfi_person_student_grants where cfi_user_id=cfi and saved_person_id=person)
 and exists(select 1 from auth.users where id=cfi) then
   insert into private.cfi_schedule_revisions(cfi_user_id,revision) values(cfi,1)
   on conflict(cfi_user_id) do update set revision=cfi_schedule_revisions.revision+1;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end;
$$;
revoke all on function private.touch_cfi_person_link_revision() from public,anon,authenticated;
create trigger cfi_person_link_revision before insert or update or delete on public.saved_person_account_links
for each row execute function private.touch_cfi_person_link_revision();
create function public.save_cfi_person_availability(p_cfi_id uuid, p_person_id uuid, p_timezone text, p_scope text, p_weekday integer, p_date date, p_slots jsonb, p_autofill boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  student_id uuid := p_person_id;
  today date := (current_timestamp at time zone p_timezone)::date;
  fill_date date;
  filled integer := 0;
begin
  if not private.can_edit_cfi_person(p_cfi_id, student_id) then raise exception 'Schedule access is required.' using errcode = '42501'; end if;
  if p_scope is null or p_scope not in ('weekly','date') or jsonb_typeof(p_slots) is distinct from 'array' or jsonb_array_length(p_slots) > 12 then raise exception 'Invalid availability.' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_to_recordset(p_slots) as s(start_minute integer,end_minute integer) where start_minute is null or end_minute is null or start_minute < 0 or end_minute > 1440 or end_minute - start_minute < 120) then
    raise exception 'Each availability period must be at least two hours.' using errcode = '22023';
  end if;
  -- Lock the same revision before touching related rows in this transaction.
  insert into private.cfi_schedule_revisions(cfi_user_id) values(p_cfi_id) on conflict do nothing;
  perform 1 from private.cfi_schedule_revisions where cfi_user_id = p_cfi_id for update;
  if p_scope = 'date' then
    if p_date is null or p_date < today or p_date >= today + 28 then raise exception 'Choose a date within the next four weeks.' using errcode = '22023'; end if;
    insert into private.cfi_person_availability_override_dates(cfi_user_id,student_user_id,availability_date,timezone,source)
    values(p_cfi_id,student_id,p_date,p_timezone,'manual')
    on conflict(cfi_user_id,student_user_id,availability_date) do update set timezone = excluded.timezone, source = 'manual';
    delete from private.cfi_person_availability_slots where cfi_user_id = p_cfi_id and student_user_id = student_id and scope = 'date' and availability_date = p_date;
    insert into private.cfi_person_availability_slots(cfi_user_id,student_user_id,scope,availability_date,start_minute,end_minute,timezone)
    select p_cfi_id,student_id,'date',p_date,s.start_minute,s.end_minute,p_timezone from jsonb_to_recordset(p_slots) as s(start_minute integer,end_minute integer);
    return 1;
  end if;
  if p_weekday is null or p_weekday not between 1 and 7 then raise exception 'Invalid weekday.' using errcode = '22023'; end if;
  delete from private.cfi_person_availability_slots where cfi_user_id = p_cfi_id and student_user_id = student_id and scope = 'weekly' and weekday = p_weekday;
  insert into private.cfi_person_availability_slots(cfi_user_id,student_user_id,scope,weekday,start_minute,end_minute,timezone)
  select p_cfi_id,student_id,'weekly',p_weekday,s.start_minute,s.end_minute,p_timezone from jsonb_to_recordset(p_slots) as s(start_minute integer,end_minute integer);
  if p_autofill then
    for fill_date in select today + n from generate_series(0,27) n where extract(isodow from today + n) = p_weekday loop
      if exists(select 1 from private.cfi_person_availability_override_dates where cfi_user_id = p_cfi_id and student_user_id = student_id and availability_date = fill_date and source = 'manual') then continue; end if;
      insert into private.cfi_person_availability_override_dates(cfi_user_id,student_user_id,availability_date,timezone,source)
      values(p_cfi_id,student_id,fill_date,p_timezone,'auto') on conflict(cfi_user_id,student_user_id,availability_date) do update set timezone = excluded.timezone;
      delete from private.cfi_person_availability_slots where cfi_user_id = p_cfi_id and student_user_id = student_id and scope = 'date' and availability_date = fill_date;
      insert into private.cfi_person_availability_slots(cfi_user_id,student_user_id,scope,availability_date,start_minute,end_minute,timezone)
      select p_cfi_id,student_id,'date',fill_date,s.start_minute,s.end_minute,p_timezone from jsonb_to_recordset(p_slots) as s(start_minute integer,end_minute integer);
      filled := filled + 1;
    end loop;
  end if;
  return filled;
end;
$$;
revoke all on function public.save_cfi_person_availability(uuid,uuid,text,text,integer,date,jsonb,boolean) from public, anon;
grant execute on function public.save_cfi_person_availability(uuid,uuid,text,text,integer,date,jsonb,boolean) to authenticated;

create function public.update_cfi_person_settings(p_cfi_id uuid,p_person_id uuid,p_settings jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.can_edit_cfi_person(p_cfi_id,p_person_id) then raise exception 'Schedule access is required.' using errcode='42501'; end if;
 perform 1 from private.cfi_schedule_revisions where cfi_user_id=p_cfi_id for update;
 update private.cfi_person_student_grants set
 default_weekly_sessions=(p_settings->>'weeklySessions')::integer,
 default_duration_min=(p_settings->>'durationMin')::integer,
 color=case when auth.uid()=p_cfi_id then p_settings->>'color' else color end
 where cfi_user_id=p_cfi_id and student_user_id=p_person_id;
 if (p_settings->>'useWeekOverride')::boolean then
  insert into private.cfi_person_week_overrides(cfi_user_id,student_user_id,week_start,target_sessions,duration_min)
  values(p_cfi_id,p_person_id,(p_settings->>'weekStart')::date,(p_settings->>'weekSessions')::integer,(p_settings->>'weekDurationMin')::integer)
  on conflict(cfi_user_id,student_user_id,week_start) do update set target_sessions=excluded.target_sessions,duration_min=excluded.duration_min;
 else
  delete from private.cfi_person_week_overrides where cfi_user_id=p_cfi_id and student_user_id=p_person_id and week_start=(p_settings->>'weekStart')::date;
 end if;
end;
$$;
revoke all on function public.update_cfi_person_settings(uuid,uuid,jsonb) from public,anon;
grant execute on function public.update_cfi_person_settings(uuid,uuid,jsonb) to authenticated;

create function public.clear_cfi_person_date(p_cfi_id uuid,p_person_id uuid,p_date date)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.can_edit_cfi_person(p_cfi_id,p_person_id) then raise exception 'Schedule access is required.' using errcode='42501'; end if;
 perform 1 from private.cfi_schedule_revisions where cfi_user_id=p_cfi_id for update;
 delete from private.cfi_person_availability_slots where cfi_user_id=p_cfi_id and student_user_id=p_person_id and scope='date' and availability_date=p_date;
 delete from private.cfi_person_availability_override_dates where cfi_user_id=p_cfi_id and student_user_id=p_person_id and availability_date=p_date;
end;
$$;
revoke all on function public.clear_cfi_person_date(uuid,uuid,date) from public,anon;
grant execute on function public.clear_cfi_person_date(uuid,uuid,date) to authenticated;

-- Keep the existing account-only overlap guard and add a final-state guard
-- covering BOTH stores. Shared revision locks serialize concurrent writers.
create function private.enforce_cfi_person_conflict()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(
  with lessons as (
   select id,cfi_user_id,start_at,end_at,false as person from public.cfi_schedule_events where cfi_user_id=new.cfi_user_id and status='scheduled'
   union all
   select id,cfi_user_id,start_at,end_at,true as person from private.cfi_person_events where cfi_user_id=new.cfi_user_id and status='scheduled'
  ) select 1 from lessons a join lessons b on (a.person or b.person) and (a.id<>b.id or a.person<>b.person) and a.start_at<b.end_at and a.end_at>b.start_at
 ) then raise exception 'This lesson overlaps another scheduled lesson.' using errcode='23P01'; end if;
 return new;
end;
$$;
revoke all on function private.enforce_cfi_person_conflict() from public,anon,authenticated;
create constraint trigger cfi_person_conflict after insert or update on private.cfi_person_events
deferrable initially immediate for each row execute function private.enforce_cfi_person_conflict();
create constraint trigger cfi_person_cross_conflict after insert or update on public.cfi_schedule_events
deferrable initially immediate for each row execute function private.enforce_cfi_person_conflict();
create or replace function public.publish_cfi_schedule_draft(p_expected_revision bigint, p_batch_id uuid, p_changes jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := auth.uid();
  current_revision bigint;
  change_row record;
  existing public.cfi_schedule_events%rowtype;
  person_existing private.cfi_person_events%rowtype;
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
  set constraints public.cfi_schedule_events_conflict, public.cfi_person_cross_conflict, private.cfi_person_conflict deferred;
  for change_row in select * from jsonb_to_recordset(p_changes) as x(
    id uuid, student_user_id uuid, lesson_kind text, start_at timestamptz, end_at timestamptz, note text, status text, auto_generated boolean
  ) loop

    select * into person_existing from private.cfi_person_events where id=change_row.id;
    if found or exists(select 1 from private.cfi_person_student_grants where cfi_user_id=caller_id and student_user_id=change_row.student_user_id) then
      if exists(select 1 from public.cfi_schedule_events where id=change_row.id) then raise exception 'Invalid lesson ID.' using errcode='22023'; end if;
      if person_existing.id is not null then
        if person_existing.cfi_user_id<>caller_id or person_existing.student_user_id is distinct from change_row.student_user_id or person_existing.status<>'scheduled' then
          raise exception 'You cannot edit this lesson.' using errcode='42501'; end if;
        if (person_existing.lesson_kind,person_existing.start_at,person_existing.end_at,person_existing.note,person_existing.status)
         is not distinct from (change_row.lesson_kind,change_row.start_at,change_row.end_at,change_row.note,change_row.status) then continue; end if;
        update private.cfi_person_events set lesson_kind=change_row.lesson_kind,start_at=change_row.start_at,
          end_at=change_row.end_at,note=change_row.note,status=change_row.status where id=change_row.id;
      else
        if change_row.status is distinct from 'scheduled' or not exists(select 1 from private.cfi_person_student_grants where cfi_user_id=caller_id and student_user_id=change_row.student_user_id and access_enabled) then
          raise exception 'Active student access is required for a new lesson.' using errcode='42501'; end if;
        insert into private.cfi_person_events(id,cfi_user_id,student_user_id,lesson_kind,start_at,end_at,note,status,auto_generated,created_by)
        values(change_row.id,caller_id,change_row.student_user_id,change_row.lesson_kind,change_row.start_at,change_row.end_at,change_row.note,'scheduled',coalesce(change_row.auto_generated,false),caller_id);
      end if;
      recipient:=private.cfi_person_account(caller_id,change_row.student_user_id);
      if recipient is not null and exists(select 1 from private.cfi_person_student_grants where cfi_user_id=caller_id and student_user_id=change_row.student_user_id and access_enabled) then
        affected_students:=array_append(affected_students,recipient);
      end if;
      continue;
    end if;
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
  set constraints public.cfi_schedule_events_conflict, public.cfi_person_cross_conflict, private.cfi_person_conflict immediate;
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

-- Prevent a linked People member from being enrolled a second time by an older client.
create function private.prevent_duplicate_cfi_person_grant()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.cfi_schedule_revisions(cfi_user_id) values(new.cfi_user_id) on conflict do nothing;
 perform 1 from private.cfi_schedule_revisions where cfi_user_id=new.cfi_user_id for update;
 if exists(select 1 from private.cfi_person_student_grants where saved_person_id=new.saved_person_id) then
   raise exception 'This student already has People-based scheduling.' using errcode='22023';
 end if;
 return new;
end;
$$;
revoke all on function private.prevent_duplicate_cfi_person_grant() from public,anon,authenticated;
create trigger cfi_person_no_duplicate before insert or update on public.cfi_schedule_student_grants
for each row execute function private.prevent_duplicate_cfi_person_grant();
