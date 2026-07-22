-- Organization-owned aircraft models and organization endorsement change requests.

alter table public.aircraft_models
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

create index if not exists aircraft_models_organization_id_idx
  on public.aircraft_models (organization_id);

alter table public.aircraft_models enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'aircraft_models'
  loop
    execute format('drop policy if exists %I on public.aircraft_models', policy_record.policyname);
  end loop;
end
$$;

create policy aircraft_models_select_visible
on public.aircraft_models
for select
to anon, authenticated
using (
  organization_id is null
  or (organization_id is not null and (select private.is_organization_member(organization_id)))
  or (select private.is_platform_admin())
);

create policy aircraft_models_insert_authorized
on public.aircraft_models
for insert
to authenticated
with check (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.can_manage_organization(organization_id)))
);

create policy aircraft_models_update_authorized
on public.aircraft_models
for update
to authenticated
using (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.can_manage_organization(organization_id)))
)
with check (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.can_manage_organization(organization_id)))
);

create policy aircraft_models_delete_authorized
on public.aircraft_models
for delete
to authenticated
using (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.can_manage_organization(organization_id)))
);

revoke all on public.aircraft_models from public;
grant select on public.aircraft_models to anon, authenticated;
grant insert, update, delete on public.aircraft_models to authenticated;

create or replace function private.validate_aircraft_model_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  model_organization_id uuid;
begin
  select organization_id
  into model_organization_id
  from public.aircraft_models
  where id = new.model_id;

  if not found then
    raise exception 'Aircraft model not found.' using errcode = '23503';
  end if;

  if new.visibility = 'organization' then
    if new.organization_id is null then
      raise exception 'Organization aircraft must belong to an organization.' using errcode = '23514';
    end if;
    if model_organization_id is not null and model_organization_id <> new.organization_id then
      raise exception 'Aircraft model belongs to a different organization.' using errcode = '23514';
    end if;
  elsif model_organization_id is not null then
    raise exception 'Organization aircraft models cannot be used outside their organization.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_aircraft_model_scope on public.aircraft;
create trigger validate_aircraft_model_scope
before insert or update of model_id, visibility, organization_id
on public.aircraft
for each row execute function private.validate_aircraft_model_scope();

create or replace function private.is_organization_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where user_id = auth.uid()
      and role in ('owner', 'organization_admin')
  );
$$;

drop policy if exists endorsement_templates_select_visible_authenticated
  on public.endorsement_templates;
create policy endorsement_templates_select_visible_authenticated
on public.endorsement_templates
for select
to authenticated
using (
  status = 'active'
  or (select private.is_organization_manager())
  or (select private.is_platform_admin())
);

create table if not exists public.endorsement_template_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  template_id uuid references public.endorsement_templates(id) on delete set null,
  action text not null check (action in ('create', 'update')),
  proposed_data jsonb not null check (jsonb_typeof(proposed_data) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint endorsement_request_action_target_check check (
    (action = 'create' and template_id is null)
    or (action = 'update' and template_id is not null)
  )
);

create index if not exists endorsement_change_requests_org_idx
  on public.endorsement_template_change_requests (organization_id, submitted_at desc);
create index if not exists endorsement_change_requests_pending_idx
  on public.endorsement_template_change_requests (status, submitted_at)
  where status = 'pending';

alter table public.endorsement_template_change_requests enable row level security;

drop policy if exists endorsement_change_requests_select_authorized
  on public.endorsement_template_change_requests;
create policy endorsement_change_requests_select_authorized
on public.endorsement_template_change_requests
for select
to authenticated
using (
  (select private.can_manage_organization(organization_id))
  or (select private.is_platform_admin())
);

revoke all on public.endorsement_template_change_requests from public, anon, authenticated;
grant select on public.endorsement_template_change_requests to authenticated;

create or replace function public.submit_endorsement_template_change_request(
  p_organization_id uuid,
  p_template_id uuid,
  p_action text,
  p_proposed_data jsonb
)
returns public.endorsement_template_change_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.endorsement_template_change_requests;
begin
  if auth.uid() is null or not private.can_manage_organization(p_organization_id) then
    raise exception 'Only organization owners and administrators can propose endorsement changes.' using errcode = '42501';
  end if;
  if p_action not in ('create', 'update') then
    raise exception 'Unsupported endorsement change action.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_proposed_data) <> 'object'
     or coalesce(trim(p_proposed_data->>'key'), '') = ''
     or coalesce(trim(p_proposed_data->>'title'), '') = ''
     or coalesce(trim(p_proposed_data->>'body'), '') = ''
     or jsonb_typeof(p_proposed_data->'fields') <> 'array' then
    raise exception 'The endorsement proposal is incomplete.' using errcode = '22023';
  end if;
  if p_action = 'create' and p_template_id is not null then
    raise exception 'A create proposal cannot target an existing endorsement.' using errcode = '22023';
  end if;
  if p_action = 'update' and not exists (
    select 1 from public.endorsement_templates where id = p_template_id
  ) then
    raise exception 'Endorsement template not found.' using errcode = 'P0002';
  end if;

  insert into public.endorsement_template_change_requests (
    organization_id, template_id, action, proposed_data, submitted_by
  ) values (
    p_organization_id, p_template_id, p_action, p_proposed_data, auth.uid()
  ) returning * into result;

  return result;
end;
$$;

create or replace function public.review_endorsement_template_change_request(
  p_request_id uuid,
  p_approve boolean,
  p_review_note text default null
)
returns public.endorsement_template_change_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.endorsement_template_change_requests;
  applied_template_id uuid;
begin
  if auth.uid() is null or not private.is_platform_admin() then
    raise exception 'Only a platform administrator can review endorsement changes.' using errcode = '42501';
  end if;

  select * into request_record
  from public.endorsement_template_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Endorsement change request not found.' using errcode = 'P0002';
  end if;
  if request_record.status <> 'pending' then
    raise exception 'This endorsement change request has already been reviewed.' using errcode = '22023';
  end if;

  if p_approve then
    if request_record.action = 'create' then
      insert into public.endorsement_templates (
        key, reference_number, title, body, fields, category, status, sort_order, created_by, updated_by
      ) values (
        request_record.proposed_data->>'key',
        nullif(request_record.proposed_data->>'reference_number', ''),
        request_record.proposed_data->>'title',
        request_record.proposed_data->>'body',
        request_record.proposed_data->'fields',
        nullif(request_record.proposed_data->>'category', ''),
        coalesce(nullif(request_record.proposed_data->>'status', ''), 'inactive'),
        coalesce((request_record.proposed_data->>'sort_order')::integer, 0),
        request_record.submitted_by,
        auth.uid()
      ) returning id into applied_template_id;
    else
      update public.endorsement_templates
      set key = request_record.proposed_data->>'key',
          reference_number = nullif(request_record.proposed_data->>'reference_number', ''),
          title = request_record.proposed_data->>'title',
          body = request_record.proposed_data->>'body',
          fields = request_record.proposed_data->'fields',
          category = nullif(request_record.proposed_data->>'category', ''),
          status = coalesce(nullif(request_record.proposed_data->>'status', ''), 'inactive'),
          sort_order = coalesce((request_record.proposed_data->>'sort_order')::integer, 0),
          updated_by = auth.uid()
      where id = request_record.template_id;
      if not found then
        raise exception 'The target endorsement no longer exists.' using errcode = 'P0002';
      end if;
      applied_template_id := request_record.template_id;
    end if;
  end if;

  update public.endorsement_template_change_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      template_id = coalesce(applied_template_id, template_id),
      reviewed_by = auth.uid(),
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      reviewed_at = now()
  where id = p_request_id
  returning * into request_record;

  return request_record;
end;
$$;

revoke all on function public.submit_endorsement_template_change_request(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.submit_endorsement_template_change_request(uuid, uuid, text, jsonb) to authenticated;
revoke all on function public.review_endorsement_template_change_request(uuid, boolean, text) from public, anon;
grant execute on function public.review_endorsement_template_change_request(uuid, boolean, text) to authenticated;
