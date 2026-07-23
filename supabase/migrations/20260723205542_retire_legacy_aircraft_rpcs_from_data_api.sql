-- The current web client no longer calls these legacy RPCs. Remove them from
-- the signed-in Data API surface while retaining service-role access for
-- controlled recovery or migration work.
revoke all on function public.approve_aircraft_update_request(uuid)
from authenticated;
revoke all on function public.attach_aircraft_by_tail(
  uuid, uuid, text, numeric, numeric, numeric
)
from authenticated;

grant execute on function public.approve_aircraft_update_request(uuid)
to service_role;
grant execute on function public.attach_aircraft_by_tail(
  uuid, uuid, text, numeric, numeric, numeric
)
to service_role;
