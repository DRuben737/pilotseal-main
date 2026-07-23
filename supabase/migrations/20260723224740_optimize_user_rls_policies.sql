-- Cache auth.uid() once per statement instead of re-evaluating it for every row.
-- Consolidate duplicate permissive policies and scope personal data to authenticated users.

drop policy if exists "profiles_read_own" on public.profiles;
drop policy if exists "read own profile" on public.profiles;
drop policy if exists "insert own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "profiles_insert_own"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

create policy "profiles_update_own"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "read own saved people" on public.saved_people;
drop policy if exists "insert own saved people" on public.saved_people;
drop policy if exists "delete own saved people" on public.saved_people;
drop policy if exists "saved_people_select_own" on public.saved_people;
drop policy if exists "saved_people_insert_own" on public.saved_people;
drop policy if exists "saved_people_update_own" on public.saved_people;
drop policy if exists "saved_people_delete_own" on public.saved_people;

create policy "saved_people_select_own"
on public.saved_people for select to authenticated
using ((select auth.uid()) = user_id);

create policy "saved_people_insert_own"
on public.saved_people for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "saved_people_update_own"
on public.saved_people for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "saved_people_delete_own"
on public.saved_people for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users can read own logbook" on public.logbook;
drop policy if exists "users can insert own logbook" on public.logbook;
drop policy if exists "users can update own logbook" on public.logbook;
drop policy if exists "users can delete own logbook" on public.logbook;
drop policy if exists "logbook_select_own" on public.logbook;
drop policy if exists "logbook_insert_own" on public.logbook;
drop policy if exists "logbook_update_own" on public.logbook;
drop policy if exists "logbook_delete_own" on public.logbook;

create policy "logbook_select_own"
on public.logbook for select to authenticated
using ((select auth.uid()) = user_id);

create policy "logbook_insert_own"
on public.logbook for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "logbook_update_own"
on public.logbook for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "logbook_delete_own"
on public.logbook for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "saved_person_certificates_select_own"
on public.saved_person_certificates;
drop policy if exists "saved_person_certificates_insert_own"
on public.saved_person_certificates;
drop policy if exists "saved_person_certificates_update_own"
on public.saved_person_certificates;
drop policy if exists "saved_person_certificates_delete_own"
on public.saved_person_certificates;

create policy "saved_person_certificates_select_own"
on public.saved_person_certificates for select to authenticated
using ((select auth.uid()) = user_id);

create policy "saved_person_certificates_insert_own"
on public.saved_person_certificates for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "saved_person_certificates_update_own"
on public.saved_person_certificates for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "saved_person_certificates_delete_own"
on public.saved_person_certificates for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "saved_aircraft_select_own" on public.saved_aircraft;
drop policy if exists "saved_aircraft_insert_own" on public.saved_aircraft;
drop policy if exists "saved_aircraft_update_own" on public.saved_aircraft;
drop policy if exists "saved_aircraft_delete_own" on public.saved_aircraft;

create policy "saved_aircraft_select_own"
on public.saved_aircraft for select to authenticated
using ((select auth.uid()) = user_id);

create policy "saved_aircraft_insert_own"
on public.saved_aircraft for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "saved_aircraft_update_own"
on public.saved_aircraft for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "saved_aircraft_delete_own"
on public.saved_aircraft for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "aircraft_update_requests_select_own_or_admin"
on public.aircraft_update_requests;
drop policy if exists "aircraft_update_requests_insert_own"
on public.aircraft_update_requests;
drop policy if exists "aircraft_update_requests_admin_update"
on public.aircraft_update_requests;
drop policy if exists "aircraft_update_requests_admin_delete"
on public.aircraft_update_requests;

create policy "aircraft_update_requests_select_own_or_admin"
on public.aircraft_update_requests for select to authenticated
using (
  submitted_by = (select auth.uid())
  or exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  )
);

create policy "aircraft_update_requests_insert_own"
on public.aircraft_update_requests for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'pending'
);

create policy "aircraft_update_requests_admin_update"
on public.aircraft_update_requests for update to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  )
);

create policy "aircraft_update_requests_admin_delete"
on public.aircraft_update_requests for delete to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  )
);
