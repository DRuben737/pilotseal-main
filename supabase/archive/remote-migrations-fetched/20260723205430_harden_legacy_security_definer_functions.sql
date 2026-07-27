-- These legacy SECURITY DEFINER functions predate explicit Data API grants.
-- Keep the two compatibility RPCs available to signed-in users, while removing
-- anonymous access from every privileged function in this group.

alter function public.approve_aircraft_update_request(uuid)
set search_path = '';
revoke all on function public.approve_aircraft_update_request(uuid)
from public, anon;
grant execute on function public.approve_aircraft_update_request(uuid)
to authenticated, service_role;

alter function public.attach_aircraft_by_tail(
  uuid, uuid, text, numeric, numeric, numeric
)
set search_path = '';
revoke all on function public.attach_aircraft_by_tail(
  uuid, uuid, text, numeric, numeric, numeric
)
from public, anon;
grant execute on function public.attach_aircraft_by_tail(
  uuid, uuid, text, numeric, numeric, numeric
)
to authenticated, service_role;

-- This function is invoked by pg_cron as the database owner. Browser roles do
-- not need direct access.
alter function public.cleanup_route_sessions()
set search_path = '';
revoke all on function public.cleanup_route_sessions()
from public, anon, authenticated;

-- Trigger execution does not require callers inserting into auth.users to have
-- direct EXECUTE permission on the trigger function.
alter function public.handle_new_user()
set search_path = '';
revoke all on function public.handle_new_user()
from public, anon, authenticated;
grant execute on function public.handle_new_user()
to supabase_auth_admin;;
