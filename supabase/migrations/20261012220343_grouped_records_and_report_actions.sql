-- Visibility is separate from processing status. Deleted records are not recoverable.
alter table public.organization_reports
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid,
  add column if not exists deleted_supersedes_report_id uuid;
alter table public.asr_reports add column if not exists deleted_source_report_id uuid;

create table if not exists public.record_action_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  record_id uuid not null,
  record_kind text not null check (record_kind in ('report', 'endorsement')),
  action text not null check (action in ('hidden', 'unhidden', 'deleted', 'returned_to_service', 'related_report_deleted')),
  actor_user_id uuid not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists record_action_audit_org_record_idx on public.record_action_audit(organization_id, record_id, created_at);
create index if not exists record_action_audit_record_action_idx on public.record_action_audit(record_id, action);
alter table public.record_action_audit enable row level security;
revoke all on public.record_action_audit from anon, authenticated;
grant select on public.record_action_audit to authenticated;
grant all on public.record_action_audit to service_role;
drop policy if exists record_action_audit_read on public.record_action_audit;
create policy record_action_audit_read on public.record_action_audit for select to authenticated
  using (private.can_manage_organization(organization_id, (select auth.uid())));

create table if not exists public.organization_endorsement_visibility (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  record_id uuid not null references public.endorsement_records(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  hidden_by uuid not null,
  primary key (organization_id, record_id)
);
create index if not exists organization_endorsement_visibility_record_idx on public.organization_endorsement_visibility(record_id);
alter table public.organization_endorsement_visibility enable row level security;
revoke all on public.organization_endorsement_visibility from anon, authenticated;
grant select on public.organization_endorsement_visibility to authenticated;
grant all on public.organization_endorsement_visibility to service_role;
drop policy if exists organization_endorsement_visibility_read on public.organization_endorsement_visibility;
create policy organization_endorsement_visibility_read on public.organization_endorsement_visibility for select to authenticated
  using (private.can_manage_organization(organization_id, (select auth.uid())) or exists (
    select 1 from public.endorsement_records r where r.id = record_id and (r.user_id = (select auth.uid()) or r.student_user_id = (select auth.uid()))
  ));

create or replace function public.set_organization_endorsement_hidden(p_organization_id uuid, p_record_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.can_manage_organization(p_organization_id, auth.uid()) then
    raise exception 'You do not have permission to hide organization records.' using errcode = '42501';
  end if;
  if p_hidden is null then raise exception 'Choose Hide or Unhide.' using errcode = '22023'; end if;
  perform 1 from public.endorsement_records where id = p_record_id for update;
  if not found or not exists (select 1 from private.endorsement_record_organization_access
    where organization_id = p_organization_id and record_id = p_record_id) then
    raise exception 'Record not found in this organization.' using errcode = 'P0002';
  end if;
  if p_hidden then
    insert into public.organization_endorsement_visibility(organization_id, record_id, hidden_by)
    values (p_organization_id, p_record_id, auth.uid()) on conflict do nothing;
  else
    delete from public.organization_endorsement_visibility where organization_id = p_organization_id and record_id = p_record_id;
  end if;
  if found then
    insert into public.record_action_audit(organization_id, record_id, record_kind, action, actor_user_id)
    values (p_organization_id, p_record_id, 'endorsement', case when p_hidden then 'hidden' else 'unhidden' end, auth.uid());
  end if;
end; $$;
revoke all on function public.set_organization_endorsement_hidden(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_organization_endorsement_hidden(uuid, uuid, boolean) to authenticated;

-- Platform administrators may inspect/delete any report, including unsubmitted drafts.
do $$ declare v_definition text; begin
  v_definition := pg_get_functiondef('private.can_read_organization_report(uuid,uuid)'::regprocedure);
  if position('select private.is_platform_admin(p_user_id) or exists' in v_definition) = 0 then
    execute replace(v_definition, 'select exists (', 'select private.is_platform_admin(p_user_id) or exists (');
  end if;
end; $$;

create or replace function public.list_report_organizations()
returns table(id uuid, name text, member_role text, teaching_role text, permissions text[], created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, case when private.is_platform_admin(auth.uid()) then 'platform_admin' else m.role end,
    m.teaching_role, private.organization_permissions(o.id, auth.uid()), o.created_at
  from public.organizations o left join public.organization_members m on m.organization_id = o.id and m.user_id = auth.uid()
  where auth.uid() is not null and (private.is_platform_admin(auth.uid()) or m.user_id is not null)
  order by lower(o.name), o.id;
$$;
revoke all on function public.list_report_organizations() from public, anon;
grant execute on function public.list_report_organizations() to authenticated;

do $$ declare v_definition text; begin
  v_definition := pg_get_functiondef('public.list_organization_report_people(uuid)'::regprocedure);
  if position('and not private.is_platform_admin(auth.uid())' in v_definition) = 0 then
    execute replace(v_definition, 'or not private.is_organization_member(p_organization_id, auth.uid())',
      'or (not private.is_organization_member(p_organization_id, auth.uid()) and not private.is_platform_admin(auth.uid()))');
  end if;
end; $$;

create or replace function private.report_aircraft_id(p_report_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(d.aircraft_id, s.aircraft_id) from public.organization_reports r
  left join public.aircraft_discrepancy_reports d on d.report_id = r.id
  left join public.asr_reports s on s.report_id = r.id where r.id = p_report_id;
$$;
revoke all on function private.report_aircraft_id(uuid) from public, anon, authenticated;

-- Use an organization that currently owns/has the aircraft and grants this actor fleet access.
-- A historical report's organization may no longer have the aircraft assigned.
create or replace function private.report_return_organization(p_report_organization uuid, p_aircraft_id uuid, p_user_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select candidate.id from (
    select a.organization_id as id, 0 as priority from public.aircraft a
      where a.id = p_aircraft_id and a.visibility = 'organization'
    union
    select assignment.organization_id, 1 from public.aircraft_organization_assignments assignment
      where assignment.aircraft_id = p_aircraft_id
  ) candidate
  where candidate.id is not null and private.has_organization_permission(candidate.id, 'fleet', p_user_id)
  order by (candidate.id = p_report_organization) desc, candidate.priority, candidate.id limit 1;
$$;
revoke all on function private.report_return_organization(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.get_organization_report_action_context(p_report_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_report public.organization_reports;
  v_aircraft uuid;
  v_meter public.organization_aircraft_maintenance;
  v_other jsonb;
  v_visible jsonb;
  v_return_organization uuid;
begin
  select * into v_report from public.organization_reports where id = p_report_id;
  if auth.uid() is null or v_report.id is null or not private.can_read_organization_report(p_report_id, auth.uid()) then
    raise exception 'Report not found or access denied.' using errcode = '42501';
  end if;
  v_aircraft := private.report_aircraft_id(p_report_id);
  v_return_organization := private.report_return_organization(v_report.organization_id, v_aircraft, auth.uid());
  select * into v_meter from public.organization_aircraft_maintenance where aircraft_id = v_aircraft;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'updated_at', r.updated_at) order by r.id), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'description', d.description) order by r.id)
      filter (where private.can_read_organization_report(r.id, auth.uid())), '[]'::jsonb)
  into v_other, v_visible from public.organization_reports r
  join public.aircraft_discrepancy_reports d on d.report_id = r.id
  where d.aircraft_id = v_aircraft and d.is_aircraft_down is true and r.status <> 'closed' and r.id <> p_report_id;
  return jsonb_build_object(
    'report_updated_at', v_report.updated_at,
    'can_delete', private.is_platform_admin(auth.uid()),
    'can_hide', private.can_manage_organization(v_report.organization_id, auth.uid()),
    'can_return_to_service', v_return_organization is not null,
    'return_organization_id', v_return_organization,
    'aircraft_id', v_aircraft, 'aircraft_status', v_meter.operational_status,
    'grounding_note', v_meter.operational_status_note,
    'other_grounding_reports', v_visible, 'other_grounding_count', jsonb_array_length(v_other),
    'token', md5(jsonb_build_object('report', p_report_id, 'aircraft', v_aircraft,
      'status', v_meter.operational_status, 'note', v_meter.operational_status_note,
      'meter_version', v_meter.updated_at, 'return_organization', v_return_organization, 'other', v_other)::text)
  );
end; $$;
revoke all on function public.get_organization_report_action_context(uuid) from public, anon;
grant execute on function public.get_organization_report_action_context(uuid) to authenticated;

create or replace function public.perform_organization_report_action(
  p_report_id uuid, p_expected_updated_at timestamptz, p_action text,
  p_return_to_service boolean default false, p_context_token text default null,
  p_review jsonb default null, p_safety_review jsonb default null, p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_report public.organization_reports;
  v_aircraft uuid;
  v_context jsonb;
  v_related record;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('close', 'hide', 'unhide', 'delete') then
    raise exception 'Choose a valid report action.' using errcode = '22023';
  end if;
  if p_return_to_service is null or (p_return_to_service and p_action not in ('close', 'delete')) then
    raise exception 'Aircraft status can only change when closing or deleting.' using errcode = '22023';
  end if;
  -- Linked/revision rows may span aircraft. Serialize combined actions before row locks,
  -- avoiding an A->B / B->A lock cycle during simultaneous close/delete requests.
  if p_action in ('close', 'delete') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pilotseal:report-actions', 0));
  end if;
  select * into v_report from public.organization_reports where id = p_report_id for update;
  if v_report.id is null then
    -- A retry may confirm an already completed deletion, but never disclose another user's report.
    if p_action = 'delete' and private.is_platform_admin(auth.uid()) and exists (
      select 1 from public.record_action_audit where record_id = p_report_id and record_kind = 'report' and action = 'deleted'
    ) then return; end if;
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;
  if p_action = 'delete' then
    if not private.is_platform_admin(auth.uid()) then raise exception 'Only platform administrators can delete reports.' using errcode = '42501'; end if;
    if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then
      raise exception 'Enter a deletion reason between 3 and 1000 characters.' using errcode = '22023';
    end if;
  elsif p_action in ('hide', 'unhide') then
    if not private.can_manage_organization(v_report.organization_id, auth.uid()) then
      raise exception 'You do not have permission to hide this report.' using errcode = '42501';
    end if;
    if p_action = 'hide' and v_report.status <> 'closed' then
      raise exception 'Close this report before hiding it.' using errcode = '22023';
    end if;
  else
    if not private.can_read_organization_report(p_report_id, auth.uid()) then
      raise exception 'You do not have permission to close this report.' using errcode = '42501';
    end if;
    if v_report.report_type = 'aircraft_discrepancy' and not private.can_manage_organization(v_report.organization_id, auth.uid()) then
      raise exception 'You do not have permission to close this report.' using errcode = '42501';
    end if;
    if v_report.report_type = 'asr' and not private.has_report_reviewer_capability(v_report.organization_id, 'safety_reviewer', auth.uid()) then
      raise exception 'Safety reviewer capability is required.' using errcode = '42501';
    end if;
    if v_report.status = 'closed' then
      if p_return_to_service and not exists (select 1 from public.record_action_audit where record_id = p_report_id and action = 'returned_to_service') then
        raise exception 'This report is already closed. Reload it before continuing.' using errcode = '22023';
      end if;
      return;
    end if;
  end if;
  if p_expected_updated_at is null or p_expected_updated_at is distinct from v_report.updated_at then
    raise exception 'This report changed. Reload it before continuing.' using errcode = '22023';
  end if;
  v_aircraft := private.report_aircraft_id(p_report_id);
  if p_return_to_service then
    -- The same row lock used by grounding/status updates serializes the combined operation.
    perform 1 from public.organization_aircraft_maintenance where aircraft_id = v_aircraft for update;
    v_context := public.get_organization_report_action_context(p_report_id);
    if not coalesce((v_context->>'can_return_to_service')::boolean, false) then
      raise exception 'Fleet management permission is required to return this aircraft to service.' using errcode = '42501';
    end if;
    if p_context_token is null or p_context_token is distinct from v_context->>'token' then
      raise exception 'Aircraft status or other reports changed. Reload the confirmation.' using errcode = '22023';
    end if;
    if v_context->>'aircraft_status' is distinct from 'grounded' then
      raise exception 'This aircraft is no longer Grounded.' using errcode = '22023';
    end if;
  end if;
  if p_action = 'close' then
    if v_report.report_type = 'aircraft_discrepancy' then
      perform public.close_aircraft_report(p_report_id, p_expected_updated_at, p_review);
    elsif v_report.report_type = 'asr' then
      if p_safety_review is null or jsonb_typeof(p_safety_review) <> 'object' then
        raise exception 'Complete the safety review before closing.' using errcode = '22023';
      end if;
      perform public.close_asr_report(p_report_id, p_safety_review->>'safetyComments',
        p_safety_review->>'hazardLogReference', p_safety_review->>'internalInvestigationReference',
        p_safety_review->>'title', coalesce(p_safety_review->'externalNotifications', '[]'::jsonb));
    else raise exception 'Unsupported report type.' using errcode = '22023'; end if;
  elsif p_action in ('hide', 'unhide') then
    if (p_action = 'hide') = (v_report.hidden_at is not null) then return; end if;
    update public.organization_reports set hidden_at = case when p_action = 'hide' then now() else null end,
      hidden_by = case when p_action = 'hide' then auth.uid() else null end, updated_at = now() where id = p_report_id;
    insert into public.record_action_audit(organization_id, record_id, record_kind, action, actor_user_id)
    values (v_report.organization_id, p_report_id, 'report', case when p_action = 'hide' then 'hidden' else 'unhidden' end, auth.uid());
  else
    -- Preserve a deleted-reference marker, not the deleted report or a recoverable copy.
    update public.asr_reports set deleted_source_report_id = p_report_id,
      report_data = jsonb_set(report_data, '{source_discrepancy_report_id}', '""'::jsonb, true)
      where source_discrepancy_report_id = p_report_id;
    update public.organization_reports set deleted_supersedes_report_id = p_report_id where supersedes_report_id = p_report_id;
    for v_related in select distinct r.id, r.organization_id from public.organization_reports r
      join public.organization_report_links l on (l.report_id = r.id or l.related_report_id = r.id)
      where (l.report_id = p_report_id or l.related_report_id = p_report_id) and r.id <> p_report_id
    loop
      insert into public.record_action_audit(organization_id, record_id, record_kind, action, actor_user_id, reason)
      values (v_related.organization_id, v_related.id, 'report', 'related_report_deleted', auth.uid(), p_report_id::text);
    end loop;
    insert into public.record_action_audit(organization_id, record_id, record_kind, action, actor_user_id, reason)
    values (v_report.organization_id, p_report_id, 'report', 'deleted', auth.uid(), btrim(p_reason));
    delete from public.organization_reports where id = p_report_id;
  end if;
  if p_return_to_service then
    perform public.update_organization_aircraft_status((v_context->>'return_organization_id')::uuid, v_aircraft, 'available', null);
    insert into public.record_action_audit(organization_id, record_id, record_kind, action, actor_user_id)
    values (v_report.organization_id, p_report_id, 'report', 'returned_to_service', auth.uid());
  end if;
end; $$;
revoke all on function public.perform_organization_report_action(uuid, timestamptz, text, boolean, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.perform_organization_report_action(uuid, timestamptz, text, boolean, text, jsonb, jsonb, text) to authenticated;
notify pgrst, 'reload schema';
