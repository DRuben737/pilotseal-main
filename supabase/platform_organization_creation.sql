create table if not exists public.platform_organization_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  owner_user_id uuid references public.profiles(id) on delete set null,
  owner_email text not null,
  action text not null check (action in ('created')),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists platform_organization_audit_logs_created_idx
on public.platform_organization_audit_logs (created_at desc);

create index if not exists platform_organization_audit_logs_organization_idx
on public.platform_organization_audit_logs (organization_id, created_at desc);

alter table public.platform_organization_audit_logs enable row level security;

revoke all on table public.platform_organization_audit_logs from public, anon, authenticated;

create or replace function public.list_platform_organizations()
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  owner_user_id uuid,
  owner_email text,
  owner_display_name text,
  member_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
    raise exception 'Platform administrator access is required.'
      using errcode = '42501';
  end if;

  return query
  select
    organizations.id,
    organizations.name,
    organizations.created_at,
    owner_member.user_id,
    owner_profile.email,
    owner_profile.display_name,
    count(all_members.user_id)::bigint
  from public.organizations as organizations
  join public.organization_members as owner_member
    on owner_member.organization_id = organizations.id
   and owner_member.role = 'owner'
  left join public.profiles as owner_profile
    on owner_profile.id = owner_member.user_id
  left join public.organization_members as all_members
    on all_members.organization_id = organizations.id
  group by
    organizations.id,
    organizations.name,
    organizations.created_at,
    owner_member.user_id,
    owner_profile.email,
    owner_profile.display_name
  order by lower(organizations.name), organizations.created_at;
end;
$$;

create or replace function public.create_organization_for_registered_user(
  p_name text,
  p_owner_email text,
  p_reason text
)
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  owner_user_id uuid,
  owner_email text,
  owner_display_name text,
  member_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_email text;
  v_owner public.profiles%rowtype;
  v_organization public.organizations%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  v_normalized_email text := lower(trim(coalesce(p_owner_email, '')));
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if v_actor_id is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pilotseal.platform_organization_create:' || lower(v_name) || ':' || v_normalized_email,
      0
    )
  );

  if not private.is_platform_admin(v_actor_id) then
    raise exception 'Platform administrator access is required.'
      using errcode = '42501';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Organization name must be between 2 and 120 characters.'
      using errcode = '22023';
  end if;

  if v_normalized_email = '' then
    raise exception 'Enter the registered Owner email.' using errcode = '22023';
  end if;

  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'Reason must be between 3 and 500 characters.'
      using errcode = '22023';
  end if;

  select profiles.*
  into v_owner
  from public.profiles as profiles
  where lower(trim(coalesce(profiles.email, ''))) = v_normalized_email
  order by profiles.created_at
  limit 1
  for update;

  if not found then
    raise exception 'No registered account matches that email.'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.organizations as organizations
    join public.organization_members as members
      on members.organization_id = organizations.id
     and members.user_id = v_owner.id
     and members.role = 'owner'
    where lower(trim(organizations.name)) = lower(v_name)
  ) then
    raise exception 'This user already owns an organization with that name.'
      using errcode = '23505';
  end if;

  select profiles.email
  into v_actor_email
  from public.profiles as profiles
  where profiles.id = v_actor_id;

  insert into public.organizations (name, created_by)
  values (v_name, v_actor_id)
  returning * into v_organization;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    added_by
  ) values (
    v_organization.id,
    v_owner.id,
    'owner',
    v_actor_id
  );

  insert into public.platform_organization_audit_logs (
    organization_id,
    organization_name,
    actor_user_id,
    actor_email,
    owner_user_id,
    owner_email,
    action,
    reason
  ) values (
    v_organization.id,
    v_organization.name,
    v_actor_id,
    v_actor_email,
    v_owner.id,
    coalesce(v_owner.email, v_normalized_email),
    'created',
    v_reason
  );

  return query
  select
    v_organization.id,
    v_organization.name,
    v_organization.created_at,
    v_owner.id,
    v_owner.email,
    v_owner.display_name,
    1::bigint;
end;
$$;

revoke all on function public.list_platform_organizations() from public, anon, authenticated;
revoke all on function public.create_organization_for_registered_user(text, text, text) from public, anon, authenticated;

grant execute on function public.list_platform_organizations() to authenticated;
grant execute on function public.create_organization_for_registered_user(text, text, text) to authenticated;
