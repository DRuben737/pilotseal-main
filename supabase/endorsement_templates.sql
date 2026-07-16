create table if not exists public.endorsement_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  body text not null,
  fields jsonb not null default '[]'::jsonb,
  category text,
  source text,
  source_date text,
  status text not null default 'inactive',
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.endorsement_template_settings (
  id text primary key default 'default',
  source text not null,
  source_date text not null,
  updated_date text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint endorsement_template_settings_singleton_check check (id = 'default')
);

insert into public.endorsement_template_settings (id, source, source_date, updated_date)
values ('default', 'AC 61-65K Appendix A', '2025-11-14', '2026-07-16')
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'endorsement_templates_status_check'
      and conrelid = 'public.endorsement_templates'::regclass
  ) then
    alter table public.endorsement_templates
      add constraint endorsement_templates_status_check
      check (status in ('active', 'inactive', 'archived'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'endorsement_templates_fields_array_check'
      and conrelid = 'public.endorsement_templates'::regclass
  ) then
    alter table public.endorsement_templates
      add constraint endorsement_templates_fields_array_check
      check (jsonb_typeof(fields) = 'array');
  end if;
end $$;

create index if not exists endorsement_templates_status_sort_idx
on public.endorsement_templates (status, sort_order, title);

create index if not exists endorsement_templates_category_idx
on public.endorsement_templates (category);

create index if not exists endorsement_templates_created_by_idx
on public.endorsement_templates (created_by);

create index if not exists endorsement_templates_updated_by_idx
on public.endorsement_templates (updated_by);

create index if not exists endorsement_template_settings_updated_by_idx
on public.endorsement_template_settings (updated_by);

create or replace function public.set_endorsement_templates_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists endorsement_templates_set_updated_at on public.endorsement_templates;
create trigger endorsement_templates_set_updated_at
before update on public.endorsement_templates
for each row
execute function public.set_endorsement_templates_updated_at();

create or replace function public.set_endorsement_template_settings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists endorsement_template_settings_set_updated_at on public.endorsement_template_settings;
create trigger endorsement_template_settings_set_updated_at
before update on public.endorsement_template_settings
for each row
execute function public.set_endorsement_template_settings_updated_at();

alter table public.endorsement_templates enable row level security;
alter table public.endorsement_template_settings enable row level security;

revoke all on public.endorsement_templates from anon, authenticated;
grant select on public.endorsement_templates to anon, authenticated;
grant insert, update, delete on public.endorsement_templates to authenticated;

revoke all on public.endorsement_template_settings from anon, authenticated;
grant select on public.endorsement_template_settings to anon, authenticated;
grant update on public.endorsement_template_settings to authenticated;

drop policy if exists "endorsement_templates_select_active" on public.endorsement_templates;
drop policy if exists "endorsement_templates_select_admin" on public.endorsement_templates;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'endorsement_templates'
      and policyname = 'endorsement_templates_select_active_anon'
  ) then
    create policy "endorsement_templates_select_active_anon"
    on public.endorsement_templates
    for select
    to anon
    using (status = 'active');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'endorsement_templates'
      and policyname = 'endorsement_templates_select_visible_authenticated'
  ) then
    create policy "endorsement_templates_select_visible_authenticated"
    on public.endorsement_templates
    for select
    to authenticated
    using (
      status = 'active'
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
      and tablename = 'endorsement_templates'
      and policyname = 'endorsement_templates_insert_admin'
  ) then
    create policy "endorsement_templates_insert_admin"
    on public.endorsement_templates
    for insert
    to authenticated
    with check (
      exists (
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
      and tablename = 'endorsement_templates'
      and policyname = 'endorsement_templates_update_admin'
  ) then
    create policy "endorsement_templates_update_admin"
    on public.endorsement_templates
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.profiles
        where profiles.id = (select auth.uid())
          and profiles.role = 'admin'
      )
    )
    with check (
      exists (
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
      and tablename = 'endorsement_templates'
      and policyname = 'endorsement_templates_delete_admin'
  ) then
    create policy "endorsement_templates_delete_admin"
    on public.endorsement_templates
    for delete
    to authenticated
    using (
      exists (
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
      and tablename = 'endorsement_template_settings'
      and policyname = 'endorsement_template_settings_select'
  ) then
    create policy "endorsement_template_settings_select"
    on public.endorsement_template_settings
    for select
    to anon, authenticated
    using (id = 'default');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'endorsement_template_settings'
      and policyname = 'endorsement_template_settings_update_admin'
  ) then
    create policy "endorsement_template_settings_update_admin"
    on public.endorsement_template_settings
    for update
    to authenticated
    using (
      id = 'default'
      and exists (
        select 1
        from public.profiles
        where profiles.id = (select auth.uid())
          and profiles.role = 'admin'
      )
    )
    with check (
      id = 'default'
      and exists (
        select 1
        from public.profiles
        where profiles.id = (select auth.uid())
          and profiles.role = 'admin'
      )
    );
  end if;
end $$;
