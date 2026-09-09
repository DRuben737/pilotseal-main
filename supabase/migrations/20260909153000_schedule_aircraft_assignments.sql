-- Aircraft-aware personal scheduling. All changes are additive; existing lessons
-- remain valid with an unassigned aircraft and legacy resource blocks continue
-- to mean that every aircraft is unavailable.

alter table public.cfi_schedule_events
  add column if not exists aircraft_id uuid references public.aircraft(id) on delete set null;
alter table private.cfi_person_events
  add column if not exists aircraft_id uuid references public.aircraft(id) on delete set null;
alter table public.cfi_schedule_unavailable_blocks
  add column if not exists aircraft_id uuid references public.aircraft(id) on delete set null;

create index if not exists cfi_schedule_events_aircraft_range_idx
  on public.cfi_schedule_events (aircraft_id, start_at, end_at)
  where aircraft_id is not null and status = 'scheduled';
create index if not exists cfi_person_events_aircraft_range_idx
  on private.cfi_person_events (aircraft_id, start_at, end_at)
  where aircraft_id is not null and status = 'scheduled';
create index if not exists cfi_schedule_blocks_aircraft_range_idx
  on public.cfi_schedule_unavailable_blocks (aircraft_id, start_at, end_at)
  where aircraft_id is not null;

create or replace function private.can_schedule_aircraft(p_aircraft_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_aircraft_id is not null and p_user_id is not null and exists (
    select 1
    from public.aircraft a
    where a.id = p_aircraft_id
      and (
        exists (
          select 1 from public.saved_aircraft saved
          where saved.aircraft_id = a.id and saved.user_id = p_user_id
        )
        or (
          a.visibility = 'organization'
          and a.organization_id is not null
          and private.is_organization_member(a.organization_id, p_user_id)
        )
        or exists (
          select 1
          from public.aircraft_organization_assignments assignment
          where assignment.aircraft_id = a.id
            and private.is_organization_member(assignment.organization_id, p_user_id)
        )
      )
  );
$$;
revoke all on function private.can_schedule_aircraft(uuid,uuid) from public,anon,authenticated;

create or replace function public.list_my_schedule_aircraft()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then '[]'::jsonb else coalesce(jsonb_agg(row_data order by row_data->>'tail_number'),'[]'::jsonb) end
  from (
    select jsonb_build_object(
      'id', a.id,
      'tail_number', coalesce(nullif(btrim(a.tail_number),''), nullif(btrim(a.name),''), 'Aircraft'),
      'model_name', model.name,
      'organization_id', a.organization_id,
      'operational_status', coalesce(mx.operational_status,'available'),
      'operational_status_note', mx.operational_status_note,
      'status_updated_at', mx.updated_at
    ) row_data
    from public.aircraft a
    left join public.aircraft_models model on model.id = a.model_id
    left join public.organization_aircraft_maintenance mx on mx.aircraft_id = a.id
    where private.can_schedule_aircraft(a.id, auth.uid())
  ) rows;
$$;
revoke all on function public.list_my_schedule_aircraft() from public,anon;
grant execute on function public.list_my_schedule_aircraft() to authenticated;

create or replace function private.validate_cfi_schedule_aircraft()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.lesson_kind = 'ground' then
    new.aircraft_id := null;
  elsif new.aircraft_id is not null and not private.can_schedule_aircraft(new.aircraft_id,new.cfi_user_id) then
    raise exception 'The selected aircraft is no longer available to this instructor.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_cfi_schedule_aircraft() from public,anon,authenticated;
create trigger validate_schedule_aircraft before insert or update of lesson_kind,aircraft_id,cfi_user_id
on public.cfi_schedule_events for each row execute function private.validate_cfi_schedule_aircraft();
create trigger validate_person_schedule_aircraft before insert or update of lesson_kind,aircraft_id,cfi_user_id
on private.cfi_person_events for each row execute function private.validate_cfi_schedule_aircraft();

create or replace function private.validate_cfi_aircraft_block()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.aircraft_id is not null and not private.can_schedule_aircraft(new.aircraft_id,new.cfi_user_id) then
    raise exception 'The selected aircraft is no longer available to this instructor.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_cfi_aircraft_block() from public,anon,authenticated;
create trigger validate_schedule_aircraft_block before insert or update of aircraft_id,cfi_user_id
on public.cfi_schedule_unavailable_blocks for each row execute function private.validate_cfi_aircraft_block();

create or replace function public.get_cfi_schedule_snapshot_v2(p_range_start timestamptz,p_range_end timestamptz,p_cfi_id uuid default null)
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

 select coalesce(jsonb_agg(jsonb_build_object(
   'id',e.id,'entry_type',case when owner or e.account_id=caller then 'lesson' else 'unavailable' end,
   'unavailable_kind',case when owner or e.account_id=caller then null else 'private_lesson' end,
   'student_user_id',case when owner or e.account_id=caller then e.student_user_id end,
   'student_name',case when owner or e.account_id=caller then e.student_name end,
   'lesson_kind',case when owner or e.account_id=caller then e.lesson_kind end,
   'aircraft_id',case when owner or e.account_id=caller then e.aircraft_id end,
   'aircraft_tail_number',case when owner or e.account_id=caller then ac.tail_number end,
   'aircraft_status',case when owner or e.account_id=caller then coalesce(mx.operational_status,'available') end,
   'aircraft_status_note',case when owner then mx.operational_status_note end,
   'aircraft_conflict',case when (owner or e.account_id=caller) and e.aircraft_id is not null then (
      exists(select 1 from public.cfi_schedule_events x where x.aircraft_id=e.aircraft_id and x.cfi_user_id<>e.cfi_user_id and x.status='scheduled' and x.start_at<e.end_at and x.end_at>e.start_at)
      or exists(select 1 from private.cfi_person_events x where x.aircraft_id=e.aircraft_id and x.cfi_user_id<>e.cfi_user_id and x.status='scheduled' and x.start_at<e.end_at and x.end_at>e.start_at)
   ) else false end,
   'start_at',e.start_at,'end_at',e.end_at,'note',case when owner or e.account_id=caller then e.note else '' end,
   'auto_generated',case when owner or e.account_id=caller then e.auto_generated else false end,
   'status',e.status,'is_own',coalesce(e.account_id=caller,false)
 )),'[]'::jsonb) into entries from (
   select ev.id,ev.cfi_user_id,ev.student_user_id,s.display_name student_name,ev.lesson_kind,ev.aircraft_id,ev.start_at,ev.end_at,ev.note,ev.auto_generated,ev.status,case when g.access_enabled then ev.student_user_id end account_id
   from public.cfi_schedule_events ev join public.cfi_schedule_student_grants g using(cfi_user_id,student_user_id)
   join public.saved_people s on s.id=g.saved_person_id where ev.cfi_user_id=cfi
   union all
   select ev.id,ev.cfi_user_id,ev.student_user_id,s.display_name,ev.lesson_kind,ev.aircraft_id,ev.start_at,ev.end_at,ev.note,ev.auto_generated,ev.status,case when g.access_enabled then private.cfi_person_account(cfi,ev.student_user_id) end
   from private.cfi_person_events ev join private.cfi_person_student_grants g using(cfi_user_id,student_user_id)
   join public.saved_people s on s.id=ev.student_user_id where ev.cfi_user_id=cfi
 ) e
 left join public.aircraft ac on ac.id=e.aircraft_id
 left join public.organization_aircraft_maintenance mx on mx.aircraft_id=e.aircraft_id
 where e.status='scheduled' and e.start_at<p_range_end and e.end_at>p_range_start;

 entries:=entries || coalesce((select jsonb_agg(jsonb_build_object(
   'id',b.id,'entry_type','unavailable','unavailable_kind','aircraft','student_user_id',null,'student_name',null,'lesson_kind',null,
   'aircraft_id',b.aircraft_id,'aircraft_tail_number',a.tail_number,'aircraft_status',coalesce(mx.operational_status,'available'),
   'aircraft_status_note',case when owner then mx.operational_status_note end,'aircraft_conflict',false,
   'start_at',b.start_at,'end_at',b.end_at,'note',case when owner then b.note else '' end,'auto_generated',false,'status','scheduled','is_own',false))
 from public.cfi_schedule_unavailable_blocks b
 left join public.aircraft a on a.id=b.aircraft_id
 left join public.organization_aircraft_maintenance mx on mx.aircraft_id=b.aircraft_id
 where b.cfi_user_id=cfi and b.start_at<p_range_end and b.end_at>p_range_start),'[]'::jsonb);

 result:=jsonb_build_object('entries',entries,
 'revision',coalesce((select revision from private.cfi_schedule_revisions where cfi_user_id=cfi),0)::text,
 'access',coalesce((select jsonb_agg(a) from jsonb_array_elements(access_rows) a where (a->>'cfi_user_id')::uuid=cfi),'[]'::jsonb),
 'blocks',case when owner then coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('aircraft_tail_number',a.tail_number)) from public.cfi_schedule_unavailable_blocks b left join public.aircraft a on a.id=b.aircraft_id where b.cfi_user_id=cfi and b.start_at<p_range_end and b.end_at>p_range_start),'[]'::jsonb) else '[]'::jsonb end,
 'aircraft',case when owner then public.list_my_schedule_aircraft() else '[]'::jsonb end,
 'aircraftReservations',case when owner then coalesce((select jsonb_agg(r) from (
    select e.aircraft_id,e.start_at,e.end_at,'lesson'::text source from public.cfi_schedule_events e where e.cfi_user_id<>cfi and e.status='scheduled' and e.aircraft_id is not null and private.can_schedule_aircraft(e.aircraft_id,cfi) and e.start_at<p_range_end and e.end_at>p_range_start
    union all select e.aircraft_id,e.start_at,e.end_at,'lesson' from private.cfi_person_events e where e.cfi_user_id<>cfi and e.status='scheduled' and e.aircraft_id is not null and private.can_schedule_aircraft(e.aircraft_id,cfi) and e.start_at<p_range_end and e.end_at>p_range_start
    union all select b.aircraft_id,b.start_at,b.end_at,'block' from public.cfi_schedule_unavailable_blocks b where b.cfi_user_id<>cfi and b.aircraft_id is not null and private.can_schedule_aircraft(b.aircraft_id,cfi) and b.start_at<p_range_end and b.end_at>p_range_start
 ) r),'[]'::jsonb) else '[]'::jsonb end);
 result:=result || jsonb_build_object('slots',coalesce((select jsonb_agg(r) from (
 select s.* from public.cfi_schedule_availability_slots s where s.cfi_user_id=cfi and (owner or s.student_user_id=caller)
 union all select s.* from private.cfi_person_availability_slots s where s.cfi_user_id=cfi and (owner or private.can_edit_cfi_person(cfi,s.student_user_id))
 ) r),'[]'::jsonb));
 result:=result || jsonb_build_object('overrideDates',coalesce((select jsonb_agg(r) from (
 select s.* from public.cfi_schedule_availability_override_dates s where s.cfi_user_id=cfi and (owner or s.student_user_id=caller)
 union all select s.* from private.cfi_person_availability_override_dates s where s.cfi_user_id=cfi and (owner or private.can_edit_cfi_person(cfi,s.student_user_id))
 ) r),'[]'::jsonb));
 result:=result || jsonb_build_object('weekOverrides',coalesce((select jsonb_agg(r) from (
 select s.* from public.cfi_schedule_week_overrides s where s.cfi_user_id=cfi and (owner or s.student_user_id=caller)
 union all select s.* from private.cfi_person_week_overrides s where s.cfi_user_id=cfi and (owner or private.can_edit_cfi_person(cfi,s.student_user_id))
 ) r),'[]'::jsonb));
 return result;
end;
$$;
revoke all on function public.get_cfi_schedule_snapshot_v2(timestamptz,timestamptz,uuid) from public,anon;
grant execute on function public.get_cfi_schedule_snapshot_v2(timestamptz,timestamptz,uuid) to authenticated;

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
        update private.cfi_person_events set lesson_kind=change_row.lesson_kind,aircraft_id=case when change_row.lesson_kind='flight' then change_row.aircraft_id end,start_at=change_row.start_at,end_at=change_row.end_at,note=change_row.note,status=change_row.status where id=change_row.id;
      else
        if change_row.status is distinct from 'scheduled' or not exists(select 1 from private.cfi_person_student_grants where cfi_user_id=caller_id and student_user_id=change_row.student_user_id and access_enabled) then raise exception 'Active student access is required for a new lesson.' using errcode='42501'; end if;
        insert into private.cfi_person_events(id,cfi_user_id,student_user_id,lesson_kind,aircraft_id,start_at,end_at,note,status,auto_generated,created_by) values(change_row.id,caller_id,change_row.student_user_id,change_row.lesson_kind,case when change_row.lesson_kind='flight' then change_row.aircraft_id end,change_row.start_at,change_row.end_at,change_row.note,'scheduled',coalesce(change_row.auto_generated,false),caller_id);
      end if;
      recipient:=private.cfi_person_account(caller_id,change_row.student_user_id);
      if recipient is not null and exists(select 1 from private.cfi_person_student_grants where cfi_user_id=caller_id and student_user_id=change_row.student_user_id and access_enabled) then affected_students:=array_append(affected_students,recipient); end if;
      continue;
    end if;
    select * into existing from public.cfi_schedule_events where id=change_row.id;
    if found then
      if existing.cfi_user_id<>caller_id or existing.student_user_id is distinct from change_row.student_user_id or existing.status<>'scheduled' then raise exception 'You cannot edit this lesson.' using errcode='42501'; end if;
      if (existing.lesson_kind,existing.aircraft_id,existing.start_at,existing.end_at,existing.note,existing.status) is not distinct from (change_row.lesson_kind,change_row.aircraft_id,change_row.start_at,change_row.end_at,change_row.note,change_row.status) then continue; end if;
      update public.cfi_schedule_events set lesson_kind=change_row.lesson_kind,aircraft_id=case when change_row.lesson_kind='flight' then change_row.aircraft_id end,start_at=change_row.start_at,end_at=change_row.end_at,note=change_row.note,status=change_row.status where id=change_row.id;
    else
      if change_row.status is distinct from 'scheduled' or not exists(select 1 from public.cfi_schedule_student_grants where cfi_user_id=caller_id and student_user_id=change_row.student_user_id and access_enabled) then raise exception 'Active student access is required for a new lesson.' using errcode='42501'; end if;
      insert into public.cfi_schedule_events(id,cfi_user_id,student_user_id,lesson_kind,aircraft_id,start_at,end_at,note,status,auto_generated,created_by) values(change_row.id,caller_id,change_row.student_user_id,change_row.lesson_kind,case when change_row.lesson_kind='flight' then change_row.aircraft_id end,change_row.start_at,change_row.end_at,change_row.note,'scheduled',coalesce(change_row.auto_generated,false),caller_id);
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
