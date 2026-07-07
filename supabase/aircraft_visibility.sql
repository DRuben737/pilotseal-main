alter table public.aircraft
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists visibility text not null default 'shared';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'aircraft_visibility_check'
      and conrelid = 'public.aircraft'::regclass
  ) then
    alter table public.aircraft
      add constraint aircraft_visibility_check
      check (visibility in ('shared', 'private'));
  end if;
end $$;

create index if not exists aircraft_owner_user_id_idx
on public.aircraft (owner_user_id);

create index if not exists aircraft_visibility_idx
on public.aircraft (visibility);

alter table public.aircraft enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'aircraft'
      and policyname = 'aircraft_select_visible'
  ) then
    create policy "aircraft_select_visible"
    on public.aircraft
    for select
    to authenticated
    using (
      visibility = 'shared'
      or owner_user_id = (select auth.uid())
      or exists (
        select 1
        from public.profiles
        where profiles.id = (select auth.uid())
          and profiles.role = 'admin'
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'aircraft'
      and policyname = 'aircraft_insert_owner_or_admin'
  ) then
    create policy "aircraft_insert_owner_or_admin"
    on public.aircraft
    for insert
    to authenticated
    with check (
      (
        visibility = 'private'
        and owner_user_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.profiles
        where profiles.id = (select auth.uid())
          and profiles.role = 'admin'
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'aircraft'
      and policyname = 'aircraft_update_owner_or_admin'
  ) then
    create policy "aircraft_update_owner_or_admin"
    on public.aircraft
    for update
    to authenticated
    using (
      owner_user_id = (select auth.uid())
      or exists (
        select 1
        from public.profiles
        where profiles.id = (select auth.uid())
          and profiles.role = 'admin'
      )
    )
    with check (
      owner_user_id = (select auth.uid())
      or exists (
        select 1
        from public.profiles
        where profiles.id = (select auth.uid())
          and profiles.role = 'admin'
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'aircraft'
      and policyname = 'aircraft_delete_owner_or_admin'
  ) then
    create policy "aircraft_delete_owner_or_admin"
    on public.aircraft
    for delete
    to authenticated
    using (
      owner_user_id = (select auth.uid())
      or exists (
        select 1
        from public.profiles
        where profiles.id = (select auth.uid())
          and profiles.role = 'admin'
      )
    );
  end if;
end $$;
