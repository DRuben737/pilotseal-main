-- Organization SOPM maneuver templates and additive instructor guidance.
-- Official ACS content remains in training_subjects; these rows only describe
-- how a particular organization or instructor prepares and flies a maneuver.

create table public.organization_training_maneuver_guides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_id uuid not null references public.training_subjects(id) on delete cascade,
  component_key text not null,
  title text not null,
  revision_label text not null default '',
  source_name text not null default '',
  source_pages text not null default '',
  applicable_aircraft text[] not null default '{}'::text[],
  setup_items text[] not null default '{}'::text[],
  fly_items text[] not null default '{}'::text[],
  exit_items text[] not null default '{}'::text[],
  callouts text[] not null default '{}'::text[],
  enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, subject_id, component_key),
  check (char_length(component_key) between 1 and 80),
  check (char_length(title) between 1 and 160),
  check (char_length(revision_label) <= 80),
  check (char_length(source_name) <= 180),
  check (char_length(source_pages) <= 80),
  check (cardinality(applicable_aircraft) <= 30),
  check (cardinality(setup_items) between 1 and 20),
  check (cardinality(fly_items) between 1 and 20),
  check (cardinality(exit_items) between 1 and 20),
  check (cardinality(callouts) <= 20)
);

create index organization_training_maneuver_guides_subject_idx
  on public.organization_training_maneuver_guides
  (organization_id, subject_id, component_key);

create table public.instructor_training_maneuver_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instructor_user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.training_subjects(id) on delete cascade,
  component_key text not null,
  setup_notes text[] not null default '{}'::text[],
  fly_notes text[] not null default '{}'::text[],
  exit_notes text[] not null default '{}'::text[],
  callouts text[] not null default '{}'::text[],
  resources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, instructor_user_id, subject_id, component_key),
  check (char_length(component_key) between 1 and 80),
  check (cardinality(setup_notes) <= 20),
  check (cardinality(fly_notes) <= 20),
  check (cardinality(exit_notes) <= 20),
  check (cardinality(callouts) <= 20),
  check (jsonb_typeof(resources) = 'array')
);

create index instructor_training_maneuver_overrides_subject_idx
  on public.instructor_training_maneuver_overrides
  (organization_id, instructor_user_id, subject_id, component_key);

alter table public.organization_training_maneuver_guides enable row level security;
alter table public.instructor_training_maneuver_overrides enable row level security;

revoke all on table public.organization_training_maneuver_guides from public, anon, authenticated;
revoke all on table public.instructor_training_maneuver_overrides from public, anon, authenticated;
grant select, insert, update, delete on table public.organization_training_maneuver_guides to authenticated;
grant select, insert, update, delete on table public.instructor_training_maneuver_overrides to authenticated;
grant all on table public.organization_training_maneuver_guides to service_role;
grant all on table public.instructor_training_maneuver_overrides to service_role;

create or replace function private.can_read_organization_training_maneuver(
  p_organization_id uuid,
  p_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    private.is_platform_admin()
    or private.can_manage_organization(p_organization_id)
    or private.is_organization_member(p_organization_id)
    or exists (
      select 1
      from private.training_guide_instructor_access access
      where access.student_user_id = auth.uid()
        and access.organization_id = p_organization_id
        and access.subject_id = p_subject_id
    )
  );
$$;

revoke all on function private.can_read_organization_training_maneuver(uuid, uuid)
from public, anon, authenticated;
grant execute on function private.can_read_organization_training_maneuver(uuid, uuid)
to authenticated, service_role;

create or replace function private.can_read_instructor_training_maneuver(
  p_organization_id uuid,
  p_instructor_user_id uuid,
  p_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    auth.uid() = p_instructor_user_id
    or private.is_platform_admin()
    or private.can_manage_organization(p_organization_id)
    or exists (
      select 1
      from private.training_guide_instructor_access access
      where access.student_user_id = auth.uid()
        and access.organization_id = p_organization_id
        and access.instructor_user_id = p_instructor_user_id
        and access.subject_id = p_subject_id
    )
  );
$$;

revoke all on function private.can_read_instructor_training_maneuver(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function private.can_read_instructor_training_maneuver(uuid, uuid, uuid)
to authenticated, service_role;

create policy organization_training_maneuver_guides_read
on public.organization_training_maneuver_guides for select to authenticated
using (
  (enabled and private.can_read_organization_training_maneuver(organization_id, subject_id))
  or private.can_manage_organization(organization_id)
  or private.is_platform_admin()
);

create policy organization_training_maneuver_guides_insert_manager
on public.organization_training_maneuver_guides for insert to authenticated
with check (
  private.can_manage_organization(organization_id)
  or private.is_platform_admin()
);

create policy organization_training_maneuver_guides_update_manager
on public.organization_training_maneuver_guides for update to authenticated
using (
  private.can_manage_organization(organization_id)
  or private.is_platform_admin()
)
with check (
  private.can_manage_organization(organization_id)
  or private.is_platform_admin()
);

create policy organization_training_maneuver_guides_delete_manager
on public.organization_training_maneuver_guides for delete to authenticated
using (
  private.can_manage_organization(organization_id)
  or private.is_platform_admin()
);

create policy instructor_training_maneuver_overrides_read
on public.instructor_training_maneuver_overrides for select to authenticated
using (
  private.can_read_instructor_training_maneuver(
    organization_id,
    instructor_user_id,
    subject_id
  )
);

create policy instructor_training_maneuver_overrides_insert_owner
on public.instructor_training_maneuver_overrides for insert to authenticated
with check (
  instructor_user_id = auth.uid()
  and private.is_organization_instructor(organization_id)
);

create policy instructor_training_maneuver_overrides_update_owner
on public.instructor_training_maneuver_overrides for update to authenticated
using (instructor_user_id = auth.uid())
with check (
  instructor_user_id = auth.uid()
  and private.is_organization_instructor(organization_id)
);

create policy instructor_training_maneuver_overrides_delete_owner
on public.instructor_training_maneuver_overrides for delete to authenticated
using (instructor_user_id = auth.uid());

create trigger touch_organization_training_maneuver_guide
before update on public.organization_training_maneuver_guides
for each row execute function private.touch_training_guide_row();

create trigger touch_instructor_training_maneuver_override
before update on public.instructor_training_maneuver_overrides
for each row execute function private.touch_training_guide_row();
