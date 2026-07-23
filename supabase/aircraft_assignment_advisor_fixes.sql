create index if not exists aircraft_assignments_assigned_by_idx
on public.aircraft_organization_assignments (assigned_by)
where assigned_by is not null;

create index if not exists aircraft_assignment_audit_aircraft_idx
on public.aircraft_organization_assignment_audit_logs (aircraft_id)
where aircraft_id is not null;

create index if not exists aircraft_assignment_audit_organization_idx
on public.aircraft_organization_assignment_audit_logs (organization_id)
where organization_id is not null;

create index if not exists aircraft_assignment_audit_actor_idx
on public.aircraft_organization_assignment_audit_logs (actor_user_id)
where actor_user_id is not null;

drop policy if exists aircraft_assignment_audit_deny_direct_read
on public.aircraft_organization_assignment_audit_logs;
create policy aircraft_assignment_audit_deny_direct_read
on public.aircraft_organization_assignment_audit_logs
for select
to authenticated
using (false);

alter function public.list_organization_aircraft(uuid) security invoker;
