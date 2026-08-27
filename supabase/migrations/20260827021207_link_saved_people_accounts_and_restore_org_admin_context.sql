-- Keep platform administrators scoped to organizations where they are actual
-- members, while preserving their effective platform-admin capabilities inside
-- those organizations.
create or replace function public.get_my_organizations()
returns table (
  id uuid,
  name text,
  member_role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    organizations.id,
    organizations.name,
    case
      when private.is_platform_admin(auth.uid()) then 'platform_admin'
      else organization_members.role
    end as member_role,
    organizations.created_at
  from public.organization_members
  join public.organizations
    on organizations.id = organization_members.organization_id
  where auth.uid() is not null
    and organization_members.user_id = auth.uid()
  order by organizations.name;
$$;

revoke all on function public.get_my_organizations() from public, anon, authenticated;
grant execute on function public.get_my_organizations() to authenticated;

-- A private saved person remains owned by the instructor. This table only adds
-- a logical identity link to a verified PilotSeal account; it does not expose or
-- transfer the instructor's private notes, certificates, or record ownership.
create table if not exists public.saved_person_account_links (
  saved_person_id uuid primary key
    references public.saved_people(id) on delete cascade,
  owner_user_id uuid not null
    references auth.users(id) on delete cascade,
  linked_user_id uuid not null
    references public.profiles(id) on delete cascade,
  linked_at timestamptz not null default timezone('utc', now()),
  constraint saved_person_account_links_not_self_check
    check (owner_user_id <> linked_user_id),
  constraint saved_person_account_links_owner_linked_key
    unique (owner_user_id, linked_user_id)
);

create index if not exists saved_person_account_links_linked_user_idx
on public.saved_person_account_links (linked_user_id);

alter table public.saved_person_account_links enable row level security;

drop policy if exists saved_person_account_links_select_own
on public.saved_person_account_links;
create policy saved_person_account_links_select_own
on public.saved_person_account_links
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

revoke all on table public.saved_person_account_links from public, anon, authenticated;
grant select on table public.saved_person_account_links to authenticated;
grant all on table public.saved_person_account_links to service_role;

create or replace function public.link_saved_person_account(
  p_saved_person_id uuid,
  p_email text
)
returns public.saved_person_account_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_person public.saved_people;
  v_linked_user_id uuid;
  v_link public.saved_person_account_links;
begin
  if v_caller_id is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select * into v_person
  from public.saved_people
  where id = p_saved_person_id
    and user_id = v_caller_id
  for update;

  if not found or v_person.role = 'self' then
    raise exception 'Saved person not found.' using errcode = 'P0002';
  end if;

  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  select auth_users.id into v_linked_user_id
  from auth.users as auth_users
  where lower(btrim(coalesce(auth_users.email, ''))) = v_email
    and auth_users.email_confirmed_at is not null
  order by auth_users.created_at
  limit 1;

  if v_linked_user_id is null then
    raise exception 'No verified PilotSeal account matches that email.' using errcode = 'P0002';
  end if;

  if v_linked_user_id = v_caller_id then
    raise exception 'A saved person cannot be linked to your own account.' using errcode = '22023';
  end if;

  insert into public.saved_person_account_links (
    saved_person_id,
    owner_user_id,
    linked_user_id
  ) values (
    v_person.id,
    v_caller_id,
    v_linked_user_id
  )
  on conflict (saved_person_id) do update
  set owner_user_id = excluded.owner_user_id,
      linked_user_id = excluded.linked_user_id,
      linked_at = timezone('utc', now())
  returning * into v_link;

  return v_link;
end;
$$;

create or replace function public.unlink_saved_person_account(
  p_saved_person_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  delete from public.saved_person_account_links as links
  where links.saved_person_id = p_saved_person_id
    and links.owner_user_id = auth.uid();

  if not found then
    raise exception 'Linked saved person not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.list_my_saved_person_account_links()
returns table (
  saved_person_id uuid,
  owner_user_id uuid,
  linked_user_id uuid,
  linked_at timestamptz,
  shared_organization_names text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    links.saved_person_id,
    links.owner_user_id,
    links.linked_user_id,
    links.linked_at,
    coalesce(
      array_agg(distinct organizations.name order by organizations.name)
        filter (where caller_members.user_id is not null),
      '{}'::text[]
    ) as shared_organization_names
  from public.saved_person_account_links as links
  left join public.organization_members as linked_members
    on linked_members.user_id = links.linked_user_id
  left join public.organizations
    on organizations.id = linked_members.organization_id
  left join public.organization_members as caller_members
    on caller_members.organization_id = linked_members.organization_id
   and caller_members.user_id = auth.uid()
  where auth.uid() is not null
    and links.owner_user_id = auth.uid()
  group by
    links.saved_person_id,
    links.owner_user_id,
    links.linked_user_id,
    links.linked_at
  order by links.linked_at desc;
$$;

revoke all on function public.link_saved_person_account(uuid, text)
from public, anon, authenticated;
revoke all on function public.unlink_saved_person_account(uuid)
from public, anon, authenticated;
revoke all on function public.list_my_saved_person_account_links()
from public, anon, authenticated;
grant execute on function public.link_saved_person_account(uuid, text)
to authenticated;
grant execute on function public.unlink_saved_person_account(uuid)
to authenticated;
grant execute on function public.list_my_saved_person_account_links()
to authenticated;
