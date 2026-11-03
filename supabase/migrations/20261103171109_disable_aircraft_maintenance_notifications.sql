-- Maintenance and model metadata changes remain visible in the aircraft
-- workspace. They are routine edits and should not generate inbox or push
-- notifications for organization members.
drop trigger if exists notify_organization_aircraft_maintenance_change
on public.organization_aircraft_maintenance;

drop function if exists private.notify_organization_aircraft_maintenance_change();
