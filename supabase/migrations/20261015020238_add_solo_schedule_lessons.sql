alter table public.cfi_schedule_events
  drop constraint cfi_schedule_events_lesson_kind_check,
  add constraint cfi_schedule_events_lesson_kind_check
    check (lesson_kind in ('flight','ground','solo'));

alter table private.cfi_person_events
  drop constraint cfi_schedule_events_lesson_kind_check,
  add constraint cfi_schedule_events_lesson_kind_check
    check (lesson_kind in ('flight','ground','solo'));

create or replace function private.validate_cfi_schedule_aircraft()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.lesson_kind = 'ground' then
    new.aircraft_id := null;
  elsif new.lesson_kind = 'solo' and new.aircraft_id is null then
    raise exception 'Solo lessons require an aircraft.' using errcode='23514';
  elsif new.aircraft_id is not null and not private.can_schedule_aircraft(new.aircraft_id,new.cfi_user_id) then
    raise exception 'The selected aircraft is no longer available to this instructor.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_cfi_schedule_aircraft() from public,anon,authenticated;

create or replace function public.publish_cfi_schedule_draft(p_expected_revision bigint, p_batch_id uuid, p_changes jsonb)
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
  for change_row in select * from jsonb_to_recordset(p_changes) as x(id uuid,student_user_id uuid,lesson_kind text,aircraft_id uuid,start_at timestamptz,end_at timestamptz,note text,status text,auto_generated boolean) loop
    select * into person_existing from private.cfi_person_events where id=change_row.id;
    if found or exists(select 1 from private.cfi_person_student_grants where cfi_user_id=caller_id and student_user_id=change_row.student_user_id) then
      if exists(select 1 from public.cfi_schedule_events where id=change_row.id) then raise exception 'Invalid lesson ID.' using errcode='22023'; end if;
      if person_existing.id is not null then
        if person_existing.cfi_user_id<>caller_id or person_existing.student_user_id is distinct from change_row.student_user_id or person_existing.status<>'scheduled' then raise exception 'You cannot edit this lesson.' using errcode='42501'; end if;
        if (person_existing.lesson_kind,person_existing.aircraft_id,person_existing.start_at,person_existing.end_at,person_existing.note,person_existing.status) is not distinct from (change_row.lesson_kind,change_row.aircraft_id,change_row.start_at,change_row.end_at,change_row.note,change_row.status) then continue; end if;
        update private.cfi_person_events set lesson_kind=change_row.lesson_kind,aircraft_id=case when change_row.lesson_kind in ('flight','solo') then change_row.aircraft_id end,start_at=change_row.start_at,end_at=change_row.end_at,note=change_row.note,status=change_row.status where id=change_row.id;
      else
        if change_row.status is distinct from 'scheduled' or not exists(select 1 from private.cfi_person_student_grants where cfi_user_id=caller_id and student_user_id=change_row.student_user_id and access_enabled) then raise exception 'Active student access is required for a new lesson.' using errcode='42501'; end if;
        insert into private.cfi_person_events(id,cfi_user_id,student_user_id,lesson_kind,aircraft_id,start_at,end_at,note,status,auto_generated,created_by) values(change_row.id,caller_id,change_row.student_user_id,change_row.lesson_kind,case when change_row.lesson_kind in ('flight','solo') then change_row.aircraft_id end,change_row.start_at,change_row.end_at,change_row.note,'scheduled',coalesce(change_row.auto_generated,false),caller_id);
      end if;
      recipient:=private.cfi_person_account(caller_id,change_row.student_user_id);
      if recipient is not null and exists(select 1 from private.cfi_person_student_grants where cfi_user_id=caller_id and student_user_id=change_row.student_user_id and access_enabled) then affected_students:=array_append(affected_students,recipient); end if;
      continue;
    end if;
    select * into existing from public.cfi_schedule_events where id=change_row.id;
    if found then
      if existing.cfi_user_id<>caller_id or existing.student_user_id is distinct from change_row.student_user_id or existing.status<>'scheduled' then raise exception 'You cannot edit this lesson.' using errcode='42501'; end if;
      if (existing.lesson_kind,existing.aircraft_id,existing.start_at,existing.end_at,existing.note,existing.status) is not distinct from (change_row.lesson_kind,change_row.aircraft_id,change_row.start_at,change_row.end_at,change_row.note,change_row.status) then continue; end if;
      update public.cfi_schedule_events set lesson_kind=change_row.lesson_kind,aircraft_id=case when change_row.lesson_kind in ('flight','solo') then change_row.aircraft_id end,start_at=change_row.start_at,end_at=change_row.end_at,note=change_row.note,status=change_row.status where id=change_row.id;
    else
      if change_row.status is distinct from 'scheduled' or not exists(select 1 from public.cfi_schedule_student_grants where cfi_user_id=caller_id and student_user_id=change_row.student_user_id and access_enabled) then raise exception 'Active student access is required for a new lesson.' using errcode='42501'; end if;
      insert into public.cfi_schedule_events(id,cfi_user_id,student_user_id,lesson_kind,aircraft_id,start_at,end_at,note,status,auto_generated,created_by) values(change_row.id,caller_id,change_row.student_user_id,change_row.lesson_kind,case when change_row.lesson_kind in ('flight','solo') then change_row.aircraft_id end,change_row.start_at,change_row.end_at,change_row.note,'scheduled',coalesce(change_row.auto_generated,false),caller_id);
    end if;
    affected_students:=array_append(affected_students,change_row.student_user_id);
  end loop;
  set constraints public.cfi_schedule_events_conflict,public.cfi_person_cross_conflict,private.cfi_person_conflict immediate;
  delete from private.cfi_schedule_batch_context where cfi_user_id=caller_id;
  for recipient in select distinct unnest(affected_students) loop
    perform private.create_user_notification(recipient,'Schedule updated','Your instructor changed your lessons. Open Schedule to review the final details.','schedule','normal',null,'Schedule','/dashboard/schedule','cfi-schedule-publish:'||p_batch_id::text||':'||recipient::text,caller_id);
  end loop;
  select revision into current_revision from private.cfi_schedule_revisions where cfi_user_id=caller_id;
  insert into private.cfi_schedule_publications values(p_batch_id,caller_id,p_changes,current_revision);
  return current_revision::text;
end;
$$;
revoke all on function public.publish_cfi_schedule_draft(bigint,uuid,jsonb) from public,anon;
grant execute on function public.publish_cfi_schedule_draft(bigint,uuid,jsonb) to authenticated;
