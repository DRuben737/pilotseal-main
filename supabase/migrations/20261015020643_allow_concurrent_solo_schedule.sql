create or replace function private.enforce_cfi_schedule_event_conflict()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    select 1 from public.cfi_schedule_events current_event
    join public.cfi_schedule_events other on other.cfi_user_id = current_event.cfi_user_id
      and other.id <> current_event.id and other.status = 'scheduled'
      and current_event.start_at < other.end_at and current_event.end_at > other.start_at
      and (
        current_event.student_user_id = other.student_user_id
        or (current_event.lesson_kind <> 'solo' and other.lesson_kind <> 'solo')
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
   select id,cfi_user_id,student_user_id,lesson_kind,start_at,end_at,false as person from public.cfi_schedule_events where cfi_user_id=new.cfi_user_id and status='scheduled'
   union all
   select id,cfi_user_id,student_user_id,lesson_kind,start_at,end_at,true as person from private.cfi_person_events where cfi_user_id=new.cfi_user_id and status='scheduled'
  ) select 1 from lessons a join lessons b on (a.person or b.person)
    and (a.id<>b.id or a.person<>b.person)
    and a.start_at<b.end_at and a.end_at>b.start_at
    and (a.student_user_id=b.student_user_id or (a.lesson_kind<>'solo' and b.lesson_kind<>'solo'))
 ) then raise exception 'This lesson overlaps another scheduled lesson.' using errcode='23P01'; end if;
 return new;
end;
$$;
revoke all on function private.enforce_cfi_person_conflict() from public,anon,authenticated;
