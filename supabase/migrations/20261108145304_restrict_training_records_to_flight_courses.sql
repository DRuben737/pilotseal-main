-- The current printable Training Record is the USATS flight-course format.
-- Ground-school courses require a separate record layout and cannot be stored here.

create or replace function private.require_flight_training_record_course()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  course_key text;
begin
  select course.stable_key
  into course_key
  from public.training_courses course
  where course.id = new.course_id;

  if course_key ~* '(^|\.)ground(\.|$)' then
    raise exception 'Ground courses require the Ground Training Record format.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function private.require_flight_training_record_course()
  from public, anon, authenticated;

drop trigger if exists require_flight_training_record_course
  on public.training_records;
create trigger require_flight_training_record_course
before insert or update of course_id
on public.training_records
for each row execute function private.require_flight_training_record_course();
