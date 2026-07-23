create table if not exists public.platform_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  target_user_id uuid references public.profiles(id) on delete set null,
  target_email text not null,
  action text not null check (action in ('granted', 'revoked')),
  previous_role text,
  new_role text not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists platform_admin_audit_logs_created_idx
on public.platform_admin_audit_logs (created_at desc);

create index if not exists platform_admin_audit_logs_target_idx
on public.platform_admin_audit_logs (target_user_id, created_at desc);

alter table public.platform_admin_audit_logs enable row level security;

revoke all on table public.platform_admin_audit_logs from anon, authenticated;

-- Profiles are created by the auth trigger. Browser clients may update only the
-- editable profile fields; the platform role is intentionally excluded.
revoke insert on table public.profiles from anon, authenticated;
revoke update on table public.profiles from anon, authenticated;

grant update (
  display_name,
  medical_class,
  medical_birth_date,
  medical_exam_date,
  self_person_id
) on table public.profiles to authenticated;

create or replace function public.list_platform_admins()
returns table (
  id uuid,
  email text,
  display_name text,
  role text,
  created_at timestamp without time zone
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
    profiles.id,
    profiles.email,
    profiles.display_name,
    profiles.role,
    profiles.created_at
  from public.profiles as profiles
  where profiles.role = 'admin'
  order by lower(coalesce(profiles.email, '')), profiles.created_at;
end;
$$;

create or replace function public.list_platform_admin_audit_log(p_limit integer default 100)
returns table (
  id uuid,
  actor_user_id uuid,
  actor_email text,
  target_user_id uuid,
  target_email text,
  action text,
  previous_role text,
  new_role text,
  reason text,
  created_at timestamptz
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
    logs.id,
    logs.actor_user_id,
    logs.actor_email,
    logs.target_user_id,
    logs.target_email,
    logs.action,
    logs.previous_role,
    logs.new_role,
    logs.reason,
    logs.created_at
  from public.platform_admin_audit_logs as logs
  order by logs.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

create or replace function public.set_platform_admin_by_email(
  p_email text,
  p_make_admin boolean,
  p_reason text
)
returns table (
  id uuid,
  email text,
  display_name text,
  role text,
  created_at timestamp without time zone
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_email text;
  v_target public.profiles%rowtype;
  v_normalized_email text := lower(trim(coalesce(p_email, '')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_admin_count integer;
  v_new_role text;
begin
  if v_actor_id is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  -- Serialize all platform-role changes, then re-check the actor's authority.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pilotseal.platform_admin_access', 0)
  );

  if not private.is_platform_admin(v_actor_id) then
    raise exception 'Platform administrator access is required.'
      using errcode = '42501';
  end if;

  if v_normalized_email = '' then
    raise exception 'Enter the registered account email.' using errcode = '22023';
  end if;

  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'Reason must be between 3 and 500 characters.'
      using errcode = '22023';
  end if;

  select profiles.*
  into v_target
  from public.profiles as profiles
  where lower(trim(coalesce(profiles.email, ''))) = v_normalized_email
  order by profiles.created_at
  limit 1
  for update;

  if not found then
    raise exception 'No registered account matches that email.'
      using errcode = 'P0002';
  end if;

  select profiles.email
  into v_actor_email
  from public.profiles as profiles
  where profiles.id = v_actor_id;

  if p_make_admin then
    if v_target.role = 'admin' then
      raise exception 'This account is already a platform administrator.'
        using errcode = '22023';
    end if;
    v_new_role := 'admin';
  else
    if v_target.role is distinct from 'admin' then
      raise exception 'This account is not a platform administrator.'
        using errcode = '22023';
    end if;

    if v_target.id = v_actor_id then
      raise exception 'You cannot revoke your own platform access.'
        using errcode = '22023';
    end if;

    select count(*)
    into v_admin_count
    from public.profiles as profiles
    where profiles.role = 'admin';

    if v_admin_count <= 1 then
      raise exception 'The last platform administrator cannot be revoked.'
        using errcode = '22023';
    end if;

    v_new_role := 'user';
  end if;

  update public.profiles as profiles
  set role = v_new_role
  where profiles.id = v_target.id;

  insert into public.platform_admin_audit_logs (
    actor_user_id,
    actor_email,
    target_user_id,
    target_email,
    action,
    previous_role,
    new_role,
    reason
  )
  values (
    v_actor_id,
    v_actor_email,
    v_target.id,
    coalesce(v_target.email, v_normalized_email),
    case when p_make_admin then 'granted' else 'revoked' end,
    v_target.role,
    v_new_role,
    v_reason
  );

  return query
  select
    profiles.id,
    profiles.email,
    profiles.display_name,
    profiles.role,
    profiles.created_at
  from public.profiles as profiles
  where profiles.id = v_target.id;
end;
$$;

revoke all on function public.list_platform_admins() from public, anon, authenticated;
revoke all on function public.list_platform_admin_audit_log(integer) from public, anon, authenticated;
revoke all on function public.set_platform_admin_by_email(text, boolean, text) from public, anon, authenticated;

grant execute on function public.list_platform_admins() to authenticated;
grant execute on function public.list_platform_admin_audit_log(integer) to authenticated;
grant execute on function public.set_platform_admin_by_email(text, boolean, text) to authenticated;
