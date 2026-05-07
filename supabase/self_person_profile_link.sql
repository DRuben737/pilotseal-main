alter table if exists public.profiles
  add column if not exists self_person_id uuid;

alter table if exists public.profiles
  drop constraint if exists profiles_self_person_id_fkey;

alter table if exists public.profiles
  add constraint profiles_self_person_id_fkey
  foreign key (self_person_id)
  references public.saved_people(id)
  on delete set null;

alter table if exists public.saved_people
  drop constraint if exists saved_people_role_check;

alter table if exists public.saved_people
  add constraint saved_people_role_check
  check (role in ('self', 'cfi', 'student'));

with default_instructors as (
  select distinct on (user_id)
    user_id,
    person_id
  from public.saved_person_certificates
  where certificate_type in ('flight_instructor', 'ground_instructor')
    and is_default_for_endorsements = true
  order by user_id, created_at desc
)
update public.profiles as profiles
set self_person_id = default_instructors.person_id
from default_instructors
where profiles.id = default_instructors.user_id
  and profiles.self_person_id is null;

with name_matches as (
  select distinct on (profiles.id)
    profiles.id as user_id,
    saved_people.id as person_id
  from public.profiles as profiles
  join public.saved_people as saved_people
    on saved_people.user_id = profiles.id
   and lower(trim(saved_people.display_name)) = lower(trim(profiles.display_name))
  where profiles.self_person_id is null
    and profiles.display_name is not null
  order by profiles.id, saved_people.created_at desc
)
update public.profiles as profiles
set self_person_id = name_matches.person_id
from name_matches
where profiles.id = name_matches.user_id
  and profiles.self_person_id is null;

update public.saved_people as saved_people
set role = 'self'
from public.profiles as profiles
where profiles.self_person_id = saved_people.id
  and saved_people.user_id = profiles.id
  and saved_people.role <> 'self';
