-- Student aircraft preferences and delegated instructor assignments.
-- cfi_user_id remains the schedule owner/author; assigned_instructor_user_id is
-- the instructor whose time the lesson occupies.

alter table public.cfi_schedule_events
  add column if not exists assigned_instructor_user_id uuid references auth.users(id) on delete restrict;
alter table private.cfi_person_events
  add column if not exists assigned_instructor_user_id uuid references auth.users(id) on delete restrict;

update public.cfi_schedule_events
set assigned_instructor_user_id = cfi_user_id
where assigned_instructor_user_id is null;
update private.cfi_person_events
set assigned_instructor_user_id = cfi_user_id
where assigned_instructor_user_id is null;

alter table public.cfi_schedule_events
  alter column assigned_instructor_user_id set not null;
alter table private.cfi_person_events
  alter column assigned_instructor_user_id set not null;

create index if not exists cfi_schedule_events_assigned_range_idx
  on public.cfi_schedule_events (assigned_instructor_user_id, start_at, end_at)
  where status = 'scheduled';
create index if not exists cfi_person_events_assigned_range_idx
  on private.cfi_person_events (assigned_instructor_user_id, start_at, end_at)
  where status = 'scheduled';

create table public.cfi_schedule_aircraft_preferences (
  cfi_user_id uuid not null,
  student_user_id uuid not null,
  aircraft_id uuid not null references public.aircraft(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (cfi_user_id, student_user_id, aircraft_id)
);

create index cfi_schedule_aircraft_preferences_student_idx
  on public.cfi_schedule_aircraft_preferences (student_user_id, cfi_user_id);

alter table public.cfi_schedule_aircraft_preferences enable row level security;

revoke all on table public.cfi_schedule_aircraft_preferences from public, anon, authenticated;
grant all on table public.cfi_schedule_aircraft_preferences to service_role;

create trigger schedule_revision
before insert or update or delete on public.cfi_schedule_aircraft_preferences
for each row execute function private.touch_cfi_schedule_revision();

create or replace function private.can_assign_schedule_instructor(
  p_scheduler_user_id uuid,
  p_assigned_instructor_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_scheduler_user_id is not null
    and p_assigned_instructor_user_id is not null
    and (
      p_scheduler_user_id = p_assigned_instructor_user_id
      or exists (
        select 1
        from public.organization_members scheduler
        join public.organization_members assigned
          on assigned.organization_id = scheduler.organization_id
        where scheduler.user_id = p_scheduler_user_id
          and scheduler.teaching_role = 'instructor'
          and assigned.user_id = p_assigned_instructor_user_id
          and assigned.teaching_role = 'instructor'
      )
    );
$$;

revoke all on function private.can_assign_schedule_instructor(uuid, uuid)
from public, anon, authenticated;

create or replace function private.validate_schedule_instructor_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.assigned_instructor_user_id := coalesce(new.assigned_instructor_user_id, new.cfi_user_id);
  if not private.can_assign_schedule_instructor(new.cfi_user_id, new.assigned_instructor_user_id) then
    raise exception 'Choose yourself or a current instructor in one of your organizations.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_schedule_instructor_assignment()
from public, anon, authenticated;

create trigger validate_schedule_instructor_assignment
before insert or update of cfi_user_id, assigned_instructor_user_id
on public.cfi_schedule_events
for each row execute function private.validate_schedule_instructor_assignment();

create trigger validate_person_schedule_instructor_assignment
before insert or update of cfi_user_id, assigned_instructor_user_id
on private.cfi_person_events
for each row execute function private.validate_schedule_instructor_assignment();

create or replace function private.validate_cfi_schedule_aircraft()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.assigned_instructor_user_id := coalesce(new.assigned_instructor_user_id, new.cfi_user_id);
  if new.lesson_kind = 'ground' then
    new.aircraft_id := null;
  elsif new.lesson_kind = 'solo' and new.aircraft_id is null then
    raise exception 'Solo lessons require an aircraft.' using errcode='23514';
  elsif new.aircraft_id is not null and (
    not private.can_schedule_aircraft(new.aircraft_id, new.cfi_user_id)
    or not private.can_schedule_aircraft(new.aircraft_id, new.assigned_instructor_user_id)
  ) then
    raise exception 'The selected aircraft must be available to both the scheduling and assigned instructors.' using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_cfi_schedule_aircraft()
from public, anon, authenticated;

create or replace function private.enforce_cfi_schedule_event_conflict()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    select 1 from public.cfi_schedule_events current_event
    join public.cfi_schedule_events other
      on other.id <> current_event.id and other.status = 'scheduled'
      and current_event.start_at < other.end_at and current_event.end_at > other.start_at
      and (
        current_event.student_user_id = other.student_user_id
        or (
          other.assigned_instructor_user_id = current_event.assigned_instructor_user_id
          and current_event.lesson_kind <> 'solo' and other.lesson_kind <> 'solo'
        )
      )
    where current_event.id = new.id and current_event.status = 'scheduled'
  ) then
    raise exception 'This lesson overlaps another scheduled lesson.' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create or replace function private.enforce_cfi_person_conflict()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(
  with lessons as (
   select id,assigned_instructor_user_id,student_user_id,lesson_kind,start_at,end_at,false as person
   from public.cfi_schedule_events where status='scheduled'
   union all
   select id,assigned_instructor_user_id,student_user_id,lesson_kind,start_at,end_at,true as person
   from private.cfi_person_events where status='scheduled'
  )
  select 1 from lessons a join lessons b
    on (a.person or b.person)
    and (a.id<>b.id or a.person<>b.person)
    and a.start_at<b.end_at and a.end_at>b.start_at
    and (
      a.student_user_id=b.student_user_id
      or (
        a.assigned_instructor_user_id=b.assigned_instructor_user_id
        and a.lesson_kind<>'solo' and b.lesson_kind<>'solo'
      )
    )
  where a.id=new.id
 ) then
   raise exception 'This lesson overlaps another scheduled lesson.' using errcode='23P01';
 end if;
 return new;
end;
$$;

revoke all on function private.enforce_cfi_person_conflict()
from public, anon, authenticated;

drop policy if exists cfi_schedule_events_select_participant on public.cfi_schedule_events;
create policy cfi_schedule_events_select_participant
on public.cfi_schedule_events for select to authenticated
using (
  cfi_user_id = (select auth.uid())
  or assigned_instructor_user_id = (select auth.uid())
  or (
    student_user_id = (select auth.uid())
    and (select private.has_cfi_schedule_access(cfi_user_id, student_user_id))
  )
);

create or replace function public.save_cfi_schedule_aircraft_preferences(
  p_cfi_id uuid,
  p_aircraft_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  schedule_student_id uuid;
begin
  select grant_row.student_user_id into schedule_student_id
  from public.cfi_schedule_student_grants grant_row
  where grant_row.cfi_user_id=p_cfi_id and grant_row.student_user_id=caller and grant_row.access_enabled;
  if schedule_student_id is null then
    select grant_row.student_user_id into schedule_student_id
    from private.cfi_person_student_grants grant_row
    where grant_row.cfi_user_id=p_cfi_id and grant_row.access_enabled
      and private.cfi_person_account(p_cfi_id,grant_row.student_user_id)=caller
    limit 1;
  end if;
  if caller is null or schedule_student_id is null then
    raise exception 'Active schedule access is required.' using errcode = '42501';
  end if;
  if p_aircraft_ids is null or cardinality(p_aircraft_ids) > 20
    or cardinality(p_aircraft_ids) <> (select count(distinct aircraft_id) from unnest(p_aircraft_ids) aircraft_id)
    or exists (
      select 1 from unnest(p_aircraft_ids) aircraft_id
      where not private.can_schedule_aircraft(aircraft_id, p_cfi_id)
    )
  then
    raise exception 'Choose only aircraft available on this instructor schedule.' using errcode = '22023';
  end if;

  insert into private.cfi_schedule_revisions(cfi_user_id) values(p_cfi_id)
  on conflict do nothing;
  perform 1 from private.cfi_schedule_revisions where cfi_user_id=p_cfi_id for update;

  delete from public.cfi_schedule_aircraft_preferences
  where cfi_user_id=p_cfi_id and student_user_id=schedule_student_id;

  insert into public.cfi_schedule_aircraft_preferences(cfi_user_id,student_user_id,aircraft_id)
  select p_cfi_id,schedule_student_id,aircraft_id from unnest(p_aircraft_ids) aircraft_id;
end;
$$;

revoke all on function public.save_cfi_schedule_aircraft_preferences(uuid, uuid[])
from public, anon;
grant execute on function public.save_cfi_schedule_aircraft_preferences(uuid, uuid[])
to authenticated;

create or replace function public.get_cfi_schedule_collaboration(
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_cfi_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  cfi uuid := coalesce(p_cfi_id, auth.uid());
  owner boolean := caller=cfi;
  has_access boolean;
  student_key uuid;
begin
  if caller is null or p_range_start is null or p_range_end is null or p_range_end<=p_range_start then
    raise exception 'Invalid schedule request.' using errcode='22023';
  end if;
  if not owner then
    select grant_row.student_user_id into student_key
    from public.cfi_schedule_student_grants grant_row
    where grant_row.cfi_user_id=cfi and grant_row.student_user_id=caller and grant_row.access_enabled;
    if student_key is null then
      select grant_row.student_user_id into student_key
      from private.cfi_person_student_grants grant_row
      where grant_row.cfi_user_id=cfi and grant_row.access_enabled
        and private.cfi_person_account(cfi,grant_row.student_user_id)=caller
      limit 1;
    end if;
  end if;
  has_access := owner or student_key is not null;
  if not has_access then
    raise exception 'Schedule access is required.' using errcode='42501';
  end if;

  return jsonb_build_object(
    'aircraft', coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,
      'tail_number',coalesce(nullif(btrim(a.tail_number),''),nullif(btrim(a.name),''),'Aircraft'),
      'model_name',model.name,
      'organization_id',a.organization_id,
      'operational_status',coalesce(mx.operational_status,'available'),
      'operational_status_note',case when owner then mx.operational_status_note end,
      'status_updated_at',mx.updated_at
    ) order by coalesce(nullif(btrim(a.tail_number),''),nullif(btrim(a.name),''),'Aircraft'))
    from public.aircraft a
    left join public.aircraft_models model on model.id=a.model_id
    left join public.organization_aircraft_maintenance mx on mx.aircraft_id=a.id
    where private.can_schedule_aircraft(a.id,cfi)),'[]'::jsonb),
    'aircraftPreferences', coalesce((select jsonb_agg(jsonb_build_object(
      'cfi_user_id',p.cfi_user_id,'student_user_id',p.student_user_id,'aircraft_id',p.aircraft_id
    )) from public.cfi_schedule_aircraft_preferences p
    where p.cfi_user_id=cfi and (owner or p.student_user_id=student_key)),'[]'::jsonb),
    'assignmentInstructors', case when owner then coalesce((select jsonb_agg(row_data order by row_data->>'name') from (
      select distinct jsonb_build_object(
        'user_id',profile.id,
        'name',coalesce(nullif(btrim(profile.display_name),''),profile.email,'Instructor')
      ) row_data
      from public.profiles profile
      where profile.id=caller
        or exists (
          select 1 from public.organization_members mine
          join public.organization_members colleague on colleague.organization_id=mine.organization_id
          where mine.user_id=caller and mine.teaching_role='instructor'
            and colleague.user_id=profile.id and colleague.teaching_role='instructor'
        )
    ) instructors),'[]'::jsonb) else '[]'::jsonb end,
    'assignmentMetadata', coalesce((select jsonb_agg(metadata) from (
      select jsonb_build_object(
        'id',event.id,
        'schedule_owner_user_id',event.cfi_user_id,
        'assigned_instructor_user_id',event.assigned_instructor_user_id,
        'assigned_instructor_name',coalesce(nullif(btrim(assigned.display_name),''),assigned.email,'Instructor'),
        'scheduled_by_user_id',event.created_by,
        'scheduled_by_name',coalesce(nullif(btrim(scheduler.display_name),''),scheduler.email,'Instructor'),
        'occupies_instructor_time',event.assigned_instructor_user_id=cfi,
        'can_edit',owner and event.cfi_user_id=caller
      ) metadata
      from public.cfi_schedule_events event
      left join public.profiles assigned on assigned.id=event.assigned_instructor_user_id
      left join public.profiles scheduler on scheduler.id=event.created_by
      where event.status='scheduled' and event.start_at<p_range_end and event.end_at>p_range_start
        and (
          (owner and (event.cfi_user_id=cfi or event.assigned_instructor_user_id=cfi))
          or (not owner and event.cfi_user_id=cfi and event.student_user_id=caller)
        )
      union all
      select jsonb_build_object(
        'id',event.id,
        'schedule_owner_user_id',event.cfi_user_id,
        'assigned_instructor_user_id',event.assigned_instructor_user_id,
        'assigned_instructor_name',coalesce(nullif(btrim(assigned.display_name),''),assigned.email,'Instructor'),
        'scheduled_by_user_id',event.created_by,
        'scheduled_by_name',coalesce(nullif(btrim(scheduler.display_name),''),scheduler.email,'Instructor'),
        'occupies_instructor_time',event.assigned_instructor_user_id=cfi,
        'can_edit',owner and event.cfi_user_id=caller
      ) metadata
      from private.cfi_person_events event
      left join public.profiles assigned on assigned.id=event.assigned_instructor_user_id
      left join public.profiles scheduler on scheduler.id=event.created_by
      where event.status='scheduled' and event.start_at<p_range_end and event.end_at>p_range_start
        and (
          (owner and (event.cfi_user_id=cfi or event.assigned_instructor_user_id=cfi))
          or (not owner and event.cfi_user_id=cfi and event.student_user_id=student_key)
        )
    ) rows),'[]'::jsonb),
    'assignedEntries', case when owner then coalesce((select jsonb_agg(entry) from (
      select jsonb_build_object(
        'id',event.id,'entry_type','lesson','student_user_id',event.student_user_id,
        'student_name',student.display_name,'lesson_kind',event.lesson_kind,
        'aircraft_id',event.aircraft_id,'aircraft_tail_number',aircraft.tail_number,
        'aircraft_status',coalesce(mx.operational_status,'available'),
        'aircraft_status_note',mx.operational_status_note,'aircraft_conflict',false,
        'unavailable_kind',null,'block_owner_name',null,
        'start_at',event.start_at,'end_at',event.end_at,'note',event.note,
        'auto_generated',event.auto_generated,'status',event.status,'is_own',false
      ) entry
      from public.cfi_schedule_events event
      join public.cfi_schedule_student_grants grant_row using(cfi_user_id,student_user_id)
      join public.saved_people student on student.id=grant_row.saved_person_id
      left join public.aircraft aircraft on aircraft.id=event.aircraft_id
      left join public.organization_aircraft_maintenance mx on mx.aircraft_id=event.aircraft_id
      where event.assigned_instructor_user_id=cfi and event.cfi_user_id<>cfi
        and event.status='scheduled' and event.start_at<p_range_end and event.end_at>p_range_start
      union all
      select jsonb_build_object(
        'id',event.id,'entry_type','lesson','student_user_id',event.student_user_id,
        'student_name',student.display_name,'lesson_kind',event.lesson_kind,
        'aircraft_id',event.aircraft_id,'aircraft_tail_number',aircraft.tail_number,
        'aircraft_status',coalesce(mx.operational_status,'available'),
        'aircraft_status_note',mx.operational_status_note,'aircraft_conflict',false,
        'unavailable_kind',null,'block_owner_name',null,
        'start_at',event.start_at,'end_at',event.end_at,'note',event.note,
        'auto_generated',event.auto_generated,'status',event.status,'is_own',false
      ) entry
      from private.cfi_person_events event
      join public.saved_people student on student.id=event.student_user_id
      left join public.aircraft aircraft on aircraft.id=event.aircraft_id
      left join public.organization_aircraft_maintenance mx on mx.aircraft_id=event.aircraft_id
      where event.assigned_instructor_user_id=cfi and event.cfi_user_id<>cfi
        and event.status='scheduled' and event.start_at<p_range_end and event.end_at>p_range_start
    ) rows),'[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.get_cfi_schedule_collaboration(timestamptz,timestamptz,uuid)
from public, anon;
grant execute on function public.get_cfi_schedule_collaboration(timestamptz,timestamptz,uuid)
to authenticated;

create or replace function public.publish_cfi_schedule_draft_v2(
  p_expected_revision bigint,
  p_batch_id uuid,
  p_changes jsonb
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := auth.uid(); current_revision bigint; change_row record;
  existing public.cfi_schedule_events%rowtype; person_existing private.cfi_person_events%rowtype;
  receipt private.cfi_schedule_publications%rowtype; affected_students uuid[] := array[]::uuid[]; recipient uuid;
begin
  if caller_id is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_batch_id is null or p_expected_revision is null or jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 200 then raise exception 'Invalid schedule draft.' using errcode='22023'; end if;
  insert into private.cfi_schedule_revisions(cfi_user_id) values(caller_id) on conflict do nothing;
  select revision into current_revision from private.cfi_schedule_revisions where cfi_user_id=caller_id for update;
  select * into receipt from private.cfi_schedule_publications where id=p_batch_id;
  if found then
    if receipt.cfi_user_id<>caller_id or receipt.changes<>p_changes then raise exception 'Invalid publication retry.' using errcode='22023'; end if;
    return receipt.revision::text;
  end if;
  if current_revision<>p_expected_revision then raise exception 'The schedule or availability changed. Review the latest schedule before publishing.' using errcode='PT409'; end if;
  if (select count(*) from jsonb_array_elements(p_changes))<>(select count(distinct value->>'id') from jsonb_array_elements(p_changes)) then raise exception 'Duplicate or missing lesson IDs.' using errcode='22023'; end if;
  insert into private.cfi_schedule_batch_context values(caller_id,txid_current());
  set constraints public.cfi_schedule_events_conflict,public.cfi_person_cross_conflict,private.cfi_person_conflict deferred;
  for change_row in select * from jsonb_to_recordset(p_changes) as x(
    id uuid,student_user_id uuid,lesson_kind text,aircraft_id uuid,assigned_instructor_user_id uuid,
    start_at timestamptz,end_at timestamptz,note text,status text,auto_generated boolean
  ) loop
    change_row.assigned_instructor_user_id := coalesce(change_row.assigned_instructor_user_id, caller_id);
    if not private.can_assign_schedule_instructor(caller_id,change_row.assigned_instructor_user_id) then
      raise exception 'Choose yourself or a current instructor in one of your organizations.' using errcode='42501';
    end if;
    select * into person_existing from private.cfi_person_events where id=change_row.id;
    if found or exists(select 1 from private.cfi_person_student_grants where cfi_user_id=caller_id and student_user_id=change_row.student_user_id) then
      if exists(select 1 from public.cfi_schedule_events where id=change_row.id) then raise exception 'Invalid lesson ID.' using errcode='22023'; end if;
      if person_existing.id is not null then
        if person_existing.cfi_user_id<>caller_id or person_existing.student_user_id is distinct from change_row.student_user_id or person_existing.status<>'scheduled' then raise exception 'You cannot edit this lesson.' using errcode='42501'; end if;
        if (person_existing.lesson_kind,person_existing.aircraft_id,person_existing.assigned_instructor_user_id,person_existing.start_at,person_existing.end_at,person_existing.note,person_existing.status)
          is not distinct from (change_row.lesson_kind,change_row.aircraft_id,change_row.assigned_instructor_user_id,change_row.start_at,change_row.end_at,change_row.note,change_row.status) then continue; end if;
        update private.cfi_person_events set lesson_kind=change_row.lesson_kind,aircraft_id=case when change_row.lesson_kind in ('flight','solo') then change_row.aircraft_id end,
          assigned_instructor_user_id=change_row.assigned_instructor_user_id,start_at=change_row.start_at,end_at=change_row.end_at,note=change_row.note,status=change_row.status where id=change_row.id;
      else
        if change_row.status is distinct from 'scheduled' or not exists(select 1 from private.cfi_person_student_grants where cfi_user_id=caller_id and student_user_id=change_row.student_user_id and access_enabled) then raise exception 'Active student access is required for a new lesson.' using errcode='42501'; end if;
        insert into private.cfi_person_events(id,cfi_user_id,student_user_id,lesson_kind,aircraft_id,assigned_instructor_user_id,start_at,end_at,note,status,auto_generated,created_by)
        values(change_row.id,caller_id,change_row.student_user_id,change_row.lesson_kind,case when change_row.lesson_kind in ('flight','solo') then change_row.aircraft_id end,change_row.assigned_instructor_user_id,change_row.start_at,change_row.end_at,change_row.note,'scheduled',coalesce(change_row.auto_generated,false),caller_id);
      end if;
      recipient:=private.cfi_person_account(caller_id,change_row.student_user_id);
      if recipient is not null and exists(select 1 from private.cfi_person_student_grants where cfi_user_id=caller_id and student_user_id=change_row.student_user_id and access_enabled) then affected_students:=array_append(affected_students,recipient); end if;
      continue;
    end if;
    select * into existing from public.cfi_schedule_events where id=change_row.id;
    if found then
      if existing.cfi_user_id<>caller_id or existing.student_user_id is distinct from change_row.student_user_id or existing.status<>'scheduled' then raise exception 'You cannot edit this lesson.' using errcode='42501'; end if;
      if (existing.lesson_kind,existing.aircraft_id,existing.assigned_instructor_user_id,existing.start_at,existing.end_at,existing.note,existing.status)
        is not distinct from (change_row.lesson_kind,change_row.aircraft_id,change_row.assigned_instructor_user_id,change_row.start_at,change_row.end_at,change_row.note,change_row.status) then continue; end if;
      update public.cfi_schedule_events set lesson_kind=change_row.lesson_kind,aircraft_id=case when change_row.lesson_kind in ('flight','solo') then change_row.aircraft_id end,
        assigned_instructor_user_id=change_row.assigned_instructor_user_id,start_at=change_row.start_at,end_at=change_row.end_at,note=change_row.note,status=change_row.status where id=change_row.id;
    else
      if change_row.status is distinct from 'scheduled' or not exists(select 1 from public.cfi_schedule_student_grants where cfi_user_id=caller_id and student_user_id=change_row.student_user_id and access_enabled) then raise exception 'Active student access is required for a new lesson.' using errcode='42501'; end if;
      insert into public.cfi_schedule_events(id,cfi_user_id,student_user_id,lesson_kind,aircraft_id,assigned_instructor_user_id,start_at,end_at,note,status,auto_generated,created_by)
      values(change_row.id,caller_id,change_row.student_user_id,change_row.lesson_kind,case when change_row.lesson_kind in ('flight','solo') then change_row.aircraft_id end,change_row.assigned_instructor_user_id,change_row.start_at,change_row.end_at,change_row.note,'scheduled',coalesce(change_row.auto_generated,false),caller_id);
    end if;
    affected_students:=array_append(affected_students,change_row.student_user_id);
  end loop;
  set constraints public.cfi_schedule_events_conflict,public.cfi_person_cross_conflict,private.cfi_person_conflict immediate;
  delete from private.cfi_schedule_batch_context where cfi_user_id=caller_id;
  for recipient in select distinct unnest(affected_students) loop
    perform private.create_user_notification(recipient,'Schedule updated','Your lesson schedule changed. Open Schedule to review the instructor, aircraft and final time.','schedule','normal',null,'Schedule','/dashboard/schedule','cfi-schedule-publish:'||p_batch_id::text||':'||recipient::text,caller_id);
  end loop;
  select revision into current_revision from private.cfi_schedule_revisions where cfi_user_id=caller_id;
  insert into private.cfi_schedule_publications values(p_batch_id,caller_id,p_changes,current_revision);
  return current_revision::text;
end;
$$;

revoke all on function public.publish_cfi_schedule_draft_v2(bigint,uuid,jsonb)
from public, anon;
grant execute on function public.publish_cfi_schedule_draft_v2(bigint,uuid,jsonb)
to authenticated;
