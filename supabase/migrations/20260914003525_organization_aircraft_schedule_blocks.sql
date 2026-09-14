-- New aircraft blocks must always identify one aircraft. Legacy fleet-wide
-- blocks remain readable until their owner edits or removes them.
alter table public.cfi_schedule_unavailable_blocks
  add constraint cfi_schedule_blocks_require_aircraft
  check (aircraft_id is not null) not valid;

create or replace function private.touch_shared_aircraft_schedule_revisions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  aircraft_value uuid;
  aircraft_values uuid[];
  owner_value uuid;
begin
  if tg_op = 'INSERT' then
    aircraft_values := array[new.aircraft_id];
    owner_value := new.cfi_user_id;
  elsif tg_op = 'DELETE' then
    aircraft_values := array[old.aircraft_id];
    owner_value := old.cfi_user_id;
  else
    aircraft_values := array[old.aircraft_id, new.aircraft_id];
    owner_value := new.cfi_user_id;
  end if;

  for aircraft_value in
    select distinct ids.aircraft_id
    from unnest(aircraft_values) ids(aircraft_id)
    where ids.aircraft_id is not null
  loop
    insert into private.cfi_schedule_revisions(cfi_user_id, revision)
    select affected.user_id, 1
    from (
      select saved.user_id
      from public.saved_aircraft saved
      where saved.aircraft_id = aircraft_value
      union
      select member.user_id
      from public.organization_members member
      where member.organization_id in (
        select aircraft.organization_id
        from public.aircraft aircraft
        where aircraft.id = aircraft_value and aircraft.organization_id is not null
        union
        select assignment.organization_id
        from public.aircraft_organization_assignments assignment
        where assignment.aircraft_id = aircraft_value
      )
    ) affected
    where affected.user_id <> owner_value
    on conflict (cfi_user_id) do update
      set revision = private.cfi_schedule_revisions.revision + 1;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.touch_shared_aircraft_schedule_revisions() from public, anon, authenticated;

create trigger schedule_shared_aircraft_revision
after insert or update of aircraft_id, start_at, end_at or delete
on public.cfi_schedule_unavailable_blocks
for each row execute function private.touch_shared_aircraft_schedule_revisions();

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
   'aircraft_status_note',case when b.cfi_user_id=caller then mx.operational_status_note end,'aircraft_conflict',false,
   'block_owner_name',coalesce(nullif(btrim(creator.display_name),''),'Another instructor'),
   'start_at',b.start_at,'end_at',b.end_at,'note',case when b.cfi_user_id=caller then b.note else '' end,'auto_generated',false,'status','scheduled','is_own',b.cfi_user_id=caller))
 from public.cfi_schedule_unavailable_blocks b
 left join public.aircraft a on a.id=b.aircraft_id
 left join public.organization_aircraft_maintenance mx on mx.aircraft_id=b.aircraft_id
 left join public.profiles creator on creator.id=b.cfi_user_id
 where (b.cfi_user_id=cfi or (b.aircraft_id is not null and private.can_schedule_aircraft(b.aircraft_id,cfi)))
   and b.start_at<p_range_end and b.end_at>p_range_start),'[]'::jsonb);

 result:=jsonb_build_object('entries',entries,
 'revision',coalesce((select revision from private.cfi_schedule_revisions where cfi_user_id=cfi),0)::text,
 'access',coalesce((select jsonb_agg(a) from jsonb_array_elements(access_rows) a where (a->>'cfi_user_id')::uuid=cfi),'[]'::jsonb),
 'blocks',case when owner then coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object(
   'aircraft_tail_number',a.tail_number,
   'can_manage',b.cfi_user_id=caller,
   'note',case when b.cfi_user_id=caller then b.note else '' end,
   'block_owner_name',coalesce(nullif(btrim(creator.display_name),''),'Another instructor')))
   from public.cfi_schedule_unavailable_blocks b
   left join public.aircraft a on a.id=b.aircraft_id
   left join public.profiles creator on creator.id=b.cfi_user_id
   where (b.cfi_user_id=cfi or (b.aircraft_id is not null and private.can_schedule_aircraft(b.aircraft_id,cfi)))
     and b.start_at<p_range_end and b.end_at>p_range_start),'[]'::jsonb) else '[]'::jsonb end,
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
