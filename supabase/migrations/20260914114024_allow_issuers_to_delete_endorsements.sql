-- The issuing instructor owns the endorsement lifecycle. Organization managers,
-- students, and other instructors retain read-only access through existing RLS.
drop policy if exists endorsement_records_delete_personal_own
  on public.endorsement_records;
drop policy if exists endorsement_records_delete_issued_own
  on public.endorsement_records;

create policy endorsement_records_delete_issued_own
on public.endorsement_records for delete to authenticated
using (user_id = (select auth.uid()));
