-- Additive setup controls. Existing lessons, memberships and preferences are retained.
-- Production migration version: 20260902230221.
create function private.schedule_instructor_ready(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p
 join public.saved_people person on person.id=p.self_person_id and person.user_id=p.id and person.role='self'
 join public.saved_person_certificates c on c.person_id=person.id and c.user_id=p.id
 where p.id=p_user and not private.is_placeholder_person_name(person.display_name)
 and c.certificate_type in ('flight_instructor','ground_instructor')
 and nullif(btrim(c.certificate_number),'') is not null
 and exists(select 1 from unnest(c.ratings) r where nullif(btrim(r),'') is not null)
 and coalesce(c.last_event_date,c.issue_date) is not null);
$$;
revoke all on function private.schedule_instructor_ready(uuid) from public,anon,authenticated;

create function private.schedule_student_invited(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cfi_schedule_student_grants g
 join public.saved_person_account_links l on l.owner_user_id=g.cfi_user_id and l.saved_person_id=g.saved_person_id and l.linked_user_id=g.student_user_id
 where g.student_user_id=p_user and g.access_enabled)
 or exists(select 1 from private.cfi_person_student_grants g
 join public.saved_person_account_links l on l.owner_user_id=g.cfi_user_id and l.saved_person_id=g.saved_person_id
 where g.access_enabled and l.linked_user_id=p_user);
$$;
revoke all on function private.schedule_student_invited(uuid) from public,anon,authenticated;

create function public.get_schedule_eligibility()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('can_instruct',auth.uid() is not null and private.schedule_instructor_ready(auth.uid()),
 'invited_student',auth.uid() is not null and private.schedule_student_invited(auth.uid()));
$$;
revoke all on function public.get_schedule_eligibility() from public,anon;
grant execute on function public.get_schedule_eligibility() to authenticated;

create function private.check_schedule_activation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if 'cfi_schedule'=any(new.enabled_feature_ids) then
  if tg_op='UPDATE' then
   if 'cfi_schedule'=any(old.enabled_feature_ids) then return new; end if;
  end if;
  if not (private.schedule_instructor_ready(new.user_id) or private.schedule_student_invited(new.user_id)) then
   raise exception 'Complete your own Flight Instructor or Ground Instructor information in People before adding Schedule. Invited students can join without instructor information.' using errcode='42501';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function private.check_schedule_activation() from public,anon,authenticated;
create trigger check_schedule_activation before insert or update of enabled_feature_ids on public.dashboard_preferences
for each row execute function private.check_schedule_activation();

create table private.schedule_availability_reviews (
 user_id uuid not null references auth.users(id) on delete cascade,
 cfi_user_id uuid not null references auth.users(id) on delete cascade,
 confirmed_through date not null,
 confirmed_at timestamptz not null default now(),
 signature text not null,
 primary key(user_id,cfi_user_id)
);
create index schedule_availability_reviews_cfi_idx on private.schedule_availability_reviews(cfi_user_id);
alter table private.schedule_availability_reviews enable row level security;
revoke all on private.schedule_availability_reviews from public,anon,authenticated;

create function private.schedule_availability_signature(p_cfi uuid,p_student uuid,p_kind text)
returns text language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_object('slots',coalesce((select jsonb_agg(s order by s.id) from (
 select id,scope,weekday,availability_date,start_minute,end_minute,timezone from public.cfi_schedule_availability_slots where p_kind='account' and cfi_user_id=p_cfi and student_user_id=p_student
 union all
 select id,scope,weekday,availability_date,start_minute,end_minute,timezone from private.cfi_person_availability_slots where p_kind='person' and cfi_user_id=p_cfi and student_user_id=p_student
 ) s),'[]'::jsonb),'dates',coalesce((select jsonb_agg(d order by d.availability_date) from (
 select availability_date,timezone,source from public.cfi_schedule_availability_override_dates where p_kind='account' and cfi_user_id=p_cfi and student_user_id=p_student
 union all
 select availability_date,timezone,source from private.cfi_person_availability_override_dates where p_kind='person' and cfi_user_id=p_cfi and student_user_id=p_student
 ) d),'[]'::jsonb))::text);
$$;
revoke all on function private.schedule_availability_signature(uuid,uuid,text) from public,anon,authenticated;

create function public.get_schedule_availability_review(p_cfi_id uuid,p_timezone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member jsonb; review private.schedule_availability_reviews%rowtype;
begin
 select a into member from jsonb_array_elements(public.list_my_cfi_schedule_access_v2()) a
 where a->>'caller_role'='student' and (a->>'cfi_user_id')::uuid=p_cfi_id and (a->>'access_enabled')::boolean limit 1;
 if auth.uid() is null or member is null then raise exception 'Schedule access is required.' using errcode='42501'; end if;
 select * into review from private.schedule_availability_reviews where user_id=auth.uid() and cfi_user_id=p_cfi_id;
 return jsonb_build_object('confirmed_through',review.confirmed_through,'needs_review',
 review.signature is null or review.confirmed_through < (current_timestamp at time zone p_timezone)::date+6
 or review.signature <> private.schedule_availability_signature(p_cfi_id,(member->>'student_user_id')::uuid,member->>'storage_kind'));
end;
$$;
revoke all on function public.get_schedule_availability_review(uuid,text) from public,anon;
grant execute on function public.get_schedule_availability_review(uuid,text) to authenticated;

create function public.confirm_schedule_availability(p_cfi_id uuid,p_timezone text,p_days integer default 14)
returns void language plpgsql security definer set search_path='' as $$
declare member jsonb;
begin
 select a into member from jsonb_array_elements(public.list_my_cfi_schedule_access_v2()) a
 where a->>'caller_role'='student' and (a->>'cfi_user_id')::uuid=p_cfi_id and (a->>'access_enabled')::boolean limit 1;
 if auth.uid() is null or member is null then raise exception 'Schedule access is required.' using errcode='42501'; end if;
 if p_days is null or p_days not between 7 and 28 then raise exception 'Review at least seven days and at most four weeks.' using errcode='22023'; end if;
 insert into private.cfi_schedule_revisions(cfi_user_id) values(p_cfi_id) on conflict do nothing;
 perform 1 from private.cfi_schedule_revisions where cfi_user_id=p_cfi_id for update;
 insert into private.schedule_availability_reviews(user_id,cfi_user_id,confirmed_through,signature)
 values(auth.uid(),p_cfi_id,(current_timestamp at time zone p_timezone)::date+p_days-1,
 private.schedule_availability_signature(p_cfi_id,(member->>'student_user_id')::uuid,member->>'storage_kind'))
 on conflict(user_id,cfi_user_id) do update set confirmed_through=excluded.confirmed_through,signature=excluded.signature,confirmed_at=now();
end;
$$;
revoke all on function public.confirm_schedule_availability(uuid,text,integer) from public,anon;
grant execute on function public.confirm_schedule_availability(uuid,text,integer) to authenticated;

create function public.fill_schedule_availability_weeks(p_cfi_id uuid,p_timezone text,p_person_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare day integer; periods jsonb; filled integer:=0;
begin
 if auth.uid() is null or (p_person_id is null and not private.has_cfi_schedule_access(p_cfi_id,auth.uid()))
 or (p_person_id is not null and not private.can_edit_cfi_person(p_cfi_id,p_person_id)) then
  raise exception 'Schedule access is required.' using errcode='42501';
 end if;
 insert into private.cfi_schedule_revisions(cfi_user_id) values(p_cfi_id) on conflict do nothing;
 perform 1 from private.cfi_schedule_revisions where cfi_user_id=p_cfi_id for update;
 for day in 1..7 loop
  if p_person_id is null then
   select coalesce(jsonb_agg(jsonb_build_object('start_minute',start_minute,'end_minute',end_minute)),'[]'::jsonb) into periods
   from public.cfi_schedule_availability_slots where cfi_user_id=p_cfi_id and student_user_id=auth.uid() and scope='weekly' and weekday=day;
   filled:=filled+public.save_cfi_schedule_availability(p_cfi_id,p_timezone,'weekly',day,null,periods,true);
  else
   select coalesce(jsonb_agg(jsonb_build_object('start_minute',start_minute,'end_minute',end_minute)),'[]'::jsonb) into periods
   from private.cfi_person_availability_slots where cfi_user_id=p_cfi_id and student_user_id=p_person_id and scope='weekly' and weekday=day;
   filled:=filled+public.save_cfi_person_availability(p_cfi_id,p_person_id,p_timezone,'weekly',day,null,periods,true);
  end if;
 end loop;
 return filled;
end;
$$;
revoke all on function public.fill_schedule_availability_weeks(uuid,text,uuid) from public,anon;
grant execute on function public.fill_schedule_availability_weeks(uuid,text,uuid) to authenticated;
