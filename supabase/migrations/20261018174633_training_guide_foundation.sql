-- Training Guide: platform-owned ACS subjects, organization and instructor
-- guidance, organization-scoped student notes, and schedule subject links.

create table public.training_subjects (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique,
  certificate_code text not null,
  area_code text not null,
  area_title text not null,
  task_code text not null,
  title text not null,
  acs_document text not null,
  acs_version text not null,
  effective_date date,
  source_url text not null,
  components jsonb not null default '[]'::jsonb,
  study_guide jsonb not null default '{"what":"","why":"","how":[],"proficiency":""}'::jsonb,
  standards jsonb not null default '{"knowledge":[],"risk_management":[],"skills":[]}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (stable_key = lower(stable_key) and stable_key ~ '^[a-z0-9][a-z0-9._-]*$'),
  check (char_length(certificate_code) between 1 and 24),
  check (char_length(title) between 1 and 160),
  check (source_url ~ '^https://(www\.)?faa\.gov/'),
  check (jsonb_typeof(components) = 'array'),
  check (jsonb_typeof(study_guide) = 'object'
    and jsonb_typeof(coalesce(study_guide->'how', '[]'::jsonb)) = 'array'),
  check (jsonb_typeof(standards) = 'object')
);

create index training_subjects_catalog_idx
  on public.training_subjects (certificate_code, area_code, sort_order, title);

create table public.training_subject_references (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.training_subjects(id) on delete cascade,
  title text not null,
  document_number text not null default '',
  chapter text not null default '',
  page_label text not null default '',
  source_url text not null,
  sort_order integer not null default 0,
  verified_at date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (char_length(title) between 1 and 180),
  check (source_url ~ '^https://(www\.)?faa\.gov/')
);

create index training_subject_references_subject_idx
  on public.training_subject_references (subject_id, sort_order, title);

create table public.organization_training_guides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_id uuid not null references public.training_subjects(id) on delete cascade,
  enabled boolean not null default true,
  guidance text not null default '',
  resources jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, subject_id),
  check (char_length(guidance) <= 12000),
  check (jsonb_typeof(resources) = 'array')
);

create table public.instructor_training_guides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  instructor_user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.training_subjects(id) on delete cascade,
  explanation text not null default '',
  key_points text[] not null default '{}'::text[],
  resources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (char_length(explanation) <= 12000),
  check (coalesce(array_length(key_points, 1), 0) <= 40),
  check (jsonb_typeof(resources) = 'array')
);

create unique index instructor_training_guides_scope_idx
  on public.instructor_training_guides
  (instructor_user_id, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), subject_id);

create table public.training_subject_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_id uuid not null references public.training_subjects(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  component_key text,
  body text not null,
  status text not null default 'active' check (status in ('active', 'reported', 'hidden')),
  report_reason text,
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (char_length(body) between 1 and 2000),
  check (component_key is null or char_length(component_key) between 1 and 80),
  check (report_reason is null or char_length(report_reason) <= 500)
);

create index training_subject_notes_feed_idx
  on public.training_subject_notes (organization_id, subject_id, created_at desc);

create table public.student_training_subject_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  subject_id uuid not null references public.training_subjects(id) on delete cascade,
  instructor_user_id uuid not null references auth.users(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (instructor_user_id <> student_user_id),
  check (char_length(body) between 1 and 4000)
);

create unique index student_training_subject_notes_scope_idx
  on public.student_training_subject_notes
  (instructor_user_id, student_user_id, subject_id, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.cfi_schedule_event_subjects (
  event_id uuid not null references public.cfi_schedule_events(id) on delete cascade,
  subject_id uuid not null references public.training_subjects(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete set null,
  position integer not null default 0 check (position between 0 and 30),
  subject_snapshot jsonb not null,
  organization_guide_snapshot jsonb,
  instructor_guide_snapshot jsonb,
  personal_note text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (event_id, subject_id),
  check (jsonb_typeof(subject_snapshot) = 'object'),
  check (organization_guide_snapshot is null or jsonb_typeof(organization_guide_snapshot) = 'object'),
  check (instructor_guide_snapshot is null or jsonb_typeof(instructor_guide_snapshot) = 'object'),
  check (char_length(personal_note) <= 4000)
);

create table private.cfi_person_event_subjects (
  event_id uuid not null references private.cfi_person_events(id) on delete cascade,
  subject_id uuid not null references public.training_subjects(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete set null,
  position integer not null default 0 check (position between 0 and 30),
  subject_snapshot jsonb not null,
  organization_guide_snapshot jsonb,
  instructor_guide_snapshot jsonb,
  personal_note text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (event_id, subject_id),
  check (jsonb_typeof(subject_snapshot) = 'object'),
  check (organization_guide_snapshot is null or jsonb_typeof(organization_guide_snapshot) = 'object'),
  check (instructor_guide_snapshot is null or jsonb_typeof(instructor_guide_snapshot) = 'object'),
  check (char_length(personal_note) <= 4000)
);

-- Durable student access survives the Schedule service's 30-day event cleanup.
-- Normal schedule edits replace these rows by event; cancelled lessons remove them.
create table private.training_guide_student_assignments (
  event_id uuid not null,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.training_subjects(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete set null,
  cfi_user_id uuid not null references auth.users(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (event_id, subject_id),
  check (end_at > start_at)
);

create index training_guide_student_assignments_catalog_idx
  on private.training_guide_student_assignments
  (student_user_id, organization_id, subject_id, end_at desc);

alter table public.training_subjects enable row level security;
alter table public.training_subject_references enable row level security;
alter table public.organization_training_guides enable row level security;
alter table public.instructor_training_guides enable row level security;
alter table public.training_subject_notes enable row level security;
alter table public.student_training_subject_notes enable row level security;
alter table public.cfi_schedule_event_subjects enable row level security;
alter table private.cfi_person_event_subjects enable row level security;

revoke all on table public.training_subjects from public, anon, authenticated;
revoke all on table public.training_subject_references from public, anon, authenticated;
revoke all on table public.organization_training_guides from public, anon, authenticated;
revoke all on table public.instructor_training_guides from public, anon, authenticated;
revoke all on table public.training_subject_notes from public, anon, authenticated;
revoke all on table public.student_training_subject_notes from public, anon, authenticated;
revoke all on table public.cfi_schedule_event_subjects from public, anon, authenticated;
revoke all on table private.cfi_person_event_subjects from public, anon, authenticated;
revoke all on table private.training_guide_student_assignments from public, anon, authenticated;

grant select on table public.training_subjects to authenticated;
grant select on table public.training_subject_references to authenticated;
grant select, insert, update, delete on table public.organization_training_guides to authenticated;
grant select, insert, update, delete on table public.instructor_training_guides to authenticated;
grant select, insert, update, delete on table public.student_training_subject_notes to authenticated;
grant select on table public.cfi_schedule_event_subjects to authenticated;
grant all on table public.training_subjects to service_role;
grant all on table public.training_subject_references to service_role;
grant all on table public.organization_training_guides to service_role;
grant all on table public.instructor_training_guides to service_role;
grant all on table public.training_subject_notes to service_role;
grant all on table public.student_training_subject_notes to service_role;
grant all on table public.cfi_schedule_event_subjects to service_role;
grant all on table private.cfi_person_event_subjects to service_role;

create or replace function private.is_organization_student(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = p_user_id
      and member.teaching_role = 'student'
  );
$$;

revoke all on function private.is_organization_student(uuid, uuid)
from public, anon, authenticated;
grant execute on function private.is_organization_student(uuid, uuid)
to authenticated, service_role;

create policy training_subjects_read_published
on public.training_subjects for select to authenticated
using (status = 'published' or (select private.is_platform_admin()));

create policy training_subject_references_read_visible
on public.training_subject_references for select to authenticated
using (exists (
  select 1 from public.training_subjects subject
  where subject.id = subject_id
    and (subject.status = 'published' or (select private.is_platform_admin()))
));

create policy organization_training_guides_read_member
on public.organization_training_guides for select to authenticated
using (
  (enabled and (select private.is_organization_member(organization_id)))
  or (select private.can_manage_organization(organization_id))
);

create policy organization_training_guides_insert_manager
on public.organization_training_guides for insert to authenticated
with check ((select private.can_manage_organization(organization_id)));

create policy organization_training_guides_update_manager
on public.organization_training_guides for update to authenticated
using ((select private.can_manage_organization(organization_id)))
with check ((select private.can_manage_organization(organization_id)));

create policy organization_training_guides_delete_manager
on public.organization_training_guides for delete to authenticated
using ((select private.can_manage_organization(organization_id)));

create policy instructor_training_guides_read_owner_or_manager
on public.instructor_training_guides for select to authenticated
using (
  instructor_user_id = (select auth.uid())
  or (organization_id is not null and (select private.can_manage_organization(organization_id)))
  or (select private.is_platform_admin())
);

create policy instructor_training_guides_insert_owner
on public.instructor_training_guides for insert to authenticated
with check (
  instructor_user_id = (select auth.uid())
  and (organization_id is null or (select private.is_organization_instructor(organization_id)))
);

create policy instructor_training_guides_update_owner
on public.instructor_training_guides for update to authenticated
using (instructor_user_id = (select auth.uid()))
with check (
  instructor_user_id = (select auth.uid())
  and (organization_id is null or (select private.is_organization_instructor(organization_id)))
);

create policy instructor_training_guides_delete_owner
on public.instructor_training_guides for delete to authenticated
using (instructor_user_id = (select auth.uid()));

create policy student_training_subject_notes_read_participant
on public.student_training_subject_notes for select to authenticated
using (
  instructor_user_id = (select auth.uid())
  or student_user_id = (select auth.uid())
);

create policy student_training_subject_notes_insert_instructor
on public.student_training_subject_notes for insert to authenticated
with check (
  instructor_user_id = (select auth.uid())
  and (
    organization_id is null
    or (
      (select private.is_organization_instructor(organization_id))
      and (select private.is_organization_student(organization_id, student_user_id))
    )
  )
);

create policy student_training_subject_notes_update_instructor
on public.student_training_subject_notes for update to authenticated
using (instructor_user_id = (select auth.uid()))
with check (
  instructor_user_id = (select auth.uid())
  and (
    organization_id is null
    or (
      (select private.is_organization_instructor(organization_id))
      and (select private.is_organization_student(organization_id, student_user_id))
    )
  )
);

create policy student_training_subject_notes_delete_instructor
on public.student_training_subject_notes for delete to authenticated
using (instructor_user_id = (select auth.uid()));

create policy cfi_schedule_event_subjects_read_participant
on public.cfi_schedule_event_subjects for select to authenticated
using (exists (
  select 1 from public.cfi_schedule_events event
  where event.id = event_id
    and (
      event.cfi_user_id = (select auth.uid())
      or event.assigned_instructor_user_id = (select auth.uid())
      or (
        event.student_user_id = (select auth.uid())
        and private.has_cfi_schedule_access(event.cfi_user_id, event.student_user_id)
      )
    )
));

create or replace function private.touch_training_guide_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger touch_training_subject
before update on public.training_subjects
for each row execute function private.touch_training_guide_row();
create trigger touch_training_subject_reference
before update on public.training_subject_references
for each row execute function private.touch_training_guide_row();
create trigger touch_organization_training_guide
before update on public.organization_training_guides
for each row execute function private.touch_training_guide_row();
create trigger touch_instructor_training_guide
before update on public.instructor_training_guides
for each row execute function private.touch_training_guide_row();
create trigger touch_training_subject_note
before update on public.training_subject_notes
for each row execute function private.touch_training_guide_row();
create trigger touch_student_training_subject_note
before update on public.student_training_subject_notes
for each row execute function private.touch_training_guide_row();

revoke all on function private.touch_training_guide_row() from public, anon, authenticated;

create or replace function public.save_training_subject(
  p_subject jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  subject_id uuid := nullif(p_subject->>'id', '')::uuid;
begin
  if caller is null or not private.is_platform_admin(caller) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;
  if nullif(btrim(p_subject->>'title'), '') is null
    or nullif(btrim(p_subject->>'stable_key'), '') is null
    or nullif(btrim(p_subject->>'source_url'), '') is null then
    raise exception 'Subject key, title, and FAA source are required.' using errcode = '22023';
  end if;

  if subject_id is null then
    insert into public.training_subjects (
      stable_key, certificate_code, area_code, area_title, task_code, title,
      acs_document, acs_version, effective_date, source_url, components, study_guide,
      standards, status, sort_order, created_by, updated_by
    ) values (
      lower(btrim(p_subject->>'stable_key')), upper(btrim(p_subject->>'certificate_code')),
      btrim(p_subject->>'area_code'), btrim(p_subject->>'area_title'), btrim(p_subject->>'task_code'),
      btrim(p_subject->>'title'), btrim(p_subject->>'acs_document'), btrim(p_subject->>'acs_version'),
      nullif(p_subject->>'effective_date', '')::date, btrim(p_subject->>'source_url'),
      coalesce(p_subject->'components', '[]'::jsonb),
      coalesce(p_subject->'study_guide', '{"what":"","why":"","how":[],"proficiency":""}'::jsonb),
      coalesce(p_subject->'standards', '{"knowledge":[],"risk_management":[],"skills":[]}'::jsonb),
      coalesce(nullif(p_subject->>'status', ''), 'draft'),
      coalesce((p_subject->>'sort_order')::integer, 0), caller, caller
    ) returning id into subject_id;
  else
    update public.training_subjects set
      stable_key = lower(btrim(p_subject->>'stable_key')),
      certificate_code = upper(btrim(p_subject->>'certificate_code')),
      area_code = btrim(p_subject->>'area_code'),
      area_title = btrim(p_subject->>'area_title'),
      task_code = btrim(p_subject->>'task_code'),
      title = btrim(p_subject->>'title'),
      acs_document = btrim(p_subject->>'acs_document'),
      acs_version = btrim(p_subject->>'acs_version'),
      effective_date = nullif(p_subject->>'effective_date', '')::date,
      source_url = btrim(p_subject->>'source_url'),
      components = coalesce(p_subject->'components', '[]'::jsonb),
      study_guide = coalesce(p_subject->'study_guide', '{"what":"","why":"","how":[],"proficiency":""}'::jsonb),
      standards = coalesce(p_subject->'standards', '{"knowledge":[],"risk_management":[],"skills":[]}'::jsonb),
      status = coalesce(nullif(p_subject->>'status', ''), 'draft'),
      sort_order = coalesce((p_subject->>'sort_order')::integer, 0),
      updated_by = caller
    where id = subject_id;
    if not found then raise exception 'Training subject not found.' using errcode = 'P0002'; end if;
  end if;
  return subject_id;
end;
$$;

revoke all on function public.save_training_subject(jsonb) from public, anon;
grant execute on function public.save_training_subject(jsonb) to authenticated;

create or replace function public.replace_training_subject_references(
  p_subject_id uuid,
  p_references jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reference_row jsonb;
begin
  if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_references, '[]'::jsonb)) <> 'array' then
    raise exception 'References must be an array.' using errcode = '22023';
  end if;
  delete from public.training_subject_references where subject_id = p_subject_id;
  for reference_row in select value from jsonb_array_elements(coalesce(p_references, '[]'::jsonb)) loop
    insert into public.training_subject_references (
      subject_id, title, document_number, chapter, page_label, source_url, sort_order, verified_at
    ) values (
      p_subject_id, btrim(reference_row->>'title'), coalesce(btrim(reference_row->>'document_number'), ''),
      coalesce(btrim(reference_row->>'chapter'), ''), coalesce(btrim(reference_row->>'page_label'), ''),
      btrim(reference_row->>'source_url'), coalesce((reference_row->>'sort_order')::integer, 0),
      nullif(reference_row->>'verified_at', '')::date
    );
  end loop;
end;
$$;

revoke all on function public.replace_training_subject_references(uuid, jsonb) from public, anon;
grant execute on function public.replace_training_subject_references(uuid, jsonb) to authenticated;

create or replace function public.list_my_instructor_training_guides(
  p_organization_id uuid,
  p_subject_id uuid
)
returns table (
  id uuid,
  organization_id uuid,
  instructor_user_id uuid,
  instructor_name text,
  subject_id uuid,
  explanation text,
  key_points text[],
  resources jsonb,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members student
    where student.organization_id = p_organization_id
      and student.user_id = auth.uid()
      and student.teaching_role = 'student'
  ) then
    raise exception 'Organization student access is required.' using errcode = '42501';
  end if;

  return query
  select selected.id, selected.organization_id, selected.instructor_user_id,
    selected.instructor_name, selected.subject_id, selected.explanation,
    selected.key_points, selected.resources, selected.updated_at
  from (
    select distinct on (guide.instructor_user_id)
      guide.id, guide.organization_id, guide.instructor_user_id,
      coalesce(nullif(profile.display_name, ''), 'Instructor')::text as instructor_name,
      guide.subject_id, guide.explanation, guide.key_points, guide.resources,
      guide.updated_at
    from public.instructor_training_guides guide
    left join public.profiles profile on profile.id = guide.instructor_user_id
    where (guide.organization_id = p_organization_id or guide.organization_id is null)
      and guide.subject_id = p_subject_id
      and (
        exists (
          select 1 from public.cfi_schedule_student_grants access
          where access.cfi_user_id = guide.instructor_user_id
            and access.student_user_id = auth.uid()
            and access.access_enabled
        )
        or exists (
          select 1 from public.cfi_schedule_events event
          where event.student_user_id = auth.uid()
            and event.assigned_instructor_user_id = guide.instructor_user_id
            and event.status = 'scheduled'
            and event.end_at >= timezone('utc', now())
        )
      )
    order by guide.instructor_user_id,
      (guide.organization_id = p_organization_id) desc,
      guide.updated_at desc
  ) selected
  order by selected.instructor_name, selected.updated_at desc;
end;
$$;

revoke all on function public.list_my_instructor_training_guides(uuid, uuid) from public, anon;
grant execute on function public.list_my_instructor_training_guides(uuid, uuid) to authenticated;

create or replace function public.list_training_subject_notes(
  p_organization_id uuid,
  p_subject_id uuid
)
returns table (
  id uuid,
  component_key text,
  body text,
  status text,
  author_user_id uuid,
  author_name text,
  is_mine boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    private.is_organization_member(p_organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Organization membership is required.' using errcode = '42501';
  end if;
  return query
  select note.id, note.component_key, note.body, note.status, note.author_user_id,
    coalesce(
      nullif(split_part(profile.display_name, ' ', 1), '')
        || case when position(' ' in coalesce(profile.display_name, '')) > 0
          then ' ' || left(regexp_replace(profile.display_name, '^.*[[:space:]]+', ''), 1) || '.' else '' end,
      'Student'
    )::text,
    note.author_user_id = auth.uid(), note.created_at, note.updated_at
  from public.training_subject_notes note
  left join public.profiles profile on profile.id = note.author_user_id
  where note.organization_id = p_organization_id
    and note.subject_id = p_subject_id
    and (
      note.status = 'active'
      or note.author_user_id = auth.uid()
      or private.can_manage_organization(p_organization_id, auth.uid())
      or private.is_platform_admin(auth.uid())
    )
  order by note.created_at desc;
end;
$$;

create or replace function public.create_training_subject_note(
  p_organization_id uuid,
  p_subject_id uuid,
  p_component_key text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  note_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = auth.uid()
      and member.teaching_role = 'student'
  ) then
    raise exception 'Organization student access is required.' using errcode = '42501';
  end if;
  if nullif(btrim(p_body), '') is null or char_length(btrim(p_body)) > 2000 then
    raise exception 'Write a note between 1 and 2000 characters.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.training_subject_notes
    where author_user_id = auth.uid() and created_at > timezone('utc', now()) - interval '30 seconds'
  ) then
    raise exception 'Please wait before posting another note.' using errcode = 'P0001';
  end if;
  insert into public.training_subject_notes (
    organization_id, subject_id, author_user_id, component_key, body
  ) values (
    p_organization_id, p_subject_id, auth.uid(), nullif(btrim(p_component_key), ''), btrim(p_body)
  ) returning id into note_id;
  return note_id;
end;
$$;

create or replace function public.update_training_subject_note(
  p_note_id uuid,
  p_component_key text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_body), '') is null or char_length(btrim(p_body)) > 2000 then
    raise exception 'Write a note between 1 and 2000 characters.' using errcode = '22023';
  end if;
  update public.training_subject_notes set
    component_key = nullif(btrim(p_component_key), ''), body = btrim(p_body), status = 'active',
    report_reason = null, moderated_by = null, moderated_at = null
  where id = p_note_id and author_user_id = auth.uid() and status <> 'hidden';
  if not found then raise exception 'You can only edit your own visible note.' using errcode = '42501'; end if;
end;
$$;

create or replace function public.delete_training_subject_note(p_note_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.training_subject_notes where id = p_note_id and author_user_id = auth.uid();
  if not found then raise exception 'You can only delete your own note.' using errcode = '42501'; end if;
end;
$$;

create or replace function public.report_training_subject_note(p_note_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  note public.training_subject_notes%rowtype;
begin
  select * into note from public.training_subject_notes where id = p_note_id;
  if note.id is null or auth.uid() is null
    or not private.is_organization_member(note.organization_id, auth.uid())
    or note.author_user_id = auth.uid() then
    raise exception 'This note cannot be reported.' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null or char_length(btrim(p_reason)) > 500 then
    raise exception 'Add a report reason of 500 characters or fewer.' using errcode = '22023';
  end if;
  update public.training_subject_notes set status = 'reported', report_reason = btrim(p_reason)
  where id = p_note_id and status <> 'hidden';
end;
$$;

create or replace function public.moderate_training_subject_note(p_note_id uuid, p_hide boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  note public.training_subject_notes%rowtype;
begin
  select * into note from public.training_subject_notes where id = p_note_id;
  if note.id is null or auth.uid() is null or not (
    private.can_manage_organization(note.organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Organization manager access is required.' using errcode = '42501';
  end if;
  update public.training_subject_notes set
    status = case when p_hide then 'hidden' else 'active' end,
    moderated_by = auth.uid(), moderated_at = timezone('utc', now()),
    report_reason = case when p_hide then report_reason else null end
  where id = p_note_id;
end;
$$;

revoke all on function public.list_training_subject_notes(uuid, uuid) from public, anon;
revoke all on function public.create_training_subject_note(uuid, uuid, text, text) from public, anon;
revoke all on function public.update_training_subject_note(uuid, text, text) from public, anon;
revoke all on function public.delete_training_subject_note(uuid) from public, anon;
revoke all on function public.report_training_subject_note(uuid, text) from public, anon;
revoke all on function public.moderate_training_subject_note(uuid, boolean) from public, anon;
grant execute on function public.list_training_subject_notes(uuid, uuid) to authenticated;
grant execute on function public.create_training_subject_note(uuid, uuid, text, text) to authenticated;
grant execute on function public.update_training_subject_note(uuid, text, text) to authenticated;
grant execute on function public.delete_training_subject_note(uuid) to authenticated;
grant execute on function public.report_training_subject_note(uuid, text) to authenticated;
grant execute on function public.moderate_training_subject_note(uuid, boolean) to authenticated;

create or replace function private.training_subject_snapshot(p_subject_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', subject.id,
    'stable_key', subject.stable_key,
    'certificate_code', subject.certificate_code,
    'area_code', subject.area_code,
    'area_title', subject.area_title,
    'task_code', subject.task_code,
    'title', subject.title,
    'acs_document', subject.acs_document,
    'acs_version', subject.acs_version,
    'effective_date', subject.effective_date,
    'source_url', subject.source_url,
    'components', subject.components,
    'study_guide', subject.study_guide,
    'standards', subject.standards,
    'references', coalesce((
      select jsonb_agg(to_jsonb(reference) - 'subject_id' order by reference.sort_order, reference.title)
      from public.training_subject_references reference
      where reference.subject_id = subject.id
    ), '[]'::jsonb)
  )
  from public.training_subjects subject
  where subject.id = p_subject_id and subject.status = 'published';
$$;

revoke all on function private.training_subject_snapshot(uuid) from public, anon, authenticated;

create or replace function public.publish_cfi_schedule_draft_v3(
  p_expected_revision bigint,
  p_batch_id uuid,
  p_changes jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  next_revision bigint;
  change_row jsonb;
  subject_row jsonb;
  v_event_id uuid;
  v_subject_id uuid;
  v_organization_id uuid;
  v_assigned_instructor_id uuid;
  v_student_account_id uuid;
  v_saved_student_id uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  subject_snapshot jsonb;
  organization_snapshot jsonb;
  instructor_snapshot jsonb;
  is_account_event boolean;
begin
  if caller is null then raise exception 'You must be signed in.' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_changes, '[]'::jsonb)) <> 'array' then
    raise exception 'Schedule changes must be an array.' using errcode = '22023';
  end if;

  next_revision := public.publish_cfi_schedule_draft_v2(p_expected_revision, p_batch_id, p_changes);

  for change_row in select value from jsonb_array_elements(p_changes) loop
    v_event_id := nullif(change_row->>'id', '')::uuid;
    delete from private.training_guide_student_assignments assignment
    where assignment.event_id = v_event_id;
    select exists(
      select 1 from public.cfi_schedule_events event
      where event.id = v_event_id and event.cfi_user_id = caller
    ) into is_account_event;

    if is_account_event then
      delete from public.cfi_schedule_event_subjects where cfi_schedule_event_subjects.event_id = v_event_id;
      select assigned_instructor_user_id, student_user_id, start_at, end_at
      into v_assigned_instructor_id, v_student_account_id, v_start_at, v_end_at
      from public.cfi_schedule_events where id = v_event_id;
      v_saved_student_id := null;
    else
      delete from private.cfi_person_event_subjects where cfi_person_event_subjects.event_id = v_event_id;
      select assigned_instructor_user_id, student_user_id, start_at, end_at
      into v_assigned_instructor_id, v_saved_student_id, v_start_at, v_end_at
      from private.cfi_person_events where id = v_event_id and cfi_user_id = caller;
      if not found then continue; end if;
      v_student_account_id := private.cfi_person_account(caller, v_saved_student_id);
    end if;

    if coalesce(change_row->>'status', 'scheduled') <> 'scheduled' then continue; end if;
    if jsonb_typeof(coalesce(change_row->'training_subjects', '[]'::jsonb)) <> 'array' then
      raise exception 'Training subjects must be an array.' using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(change_row->'training_subjects', '[]'::jsonb)) > 30 then
      raise exception 'A lesson can include at most 30 training subjects.' using errcode = '22023';
    end if;

    for subject_row in select value from jsonb_array_elements(coalesce(change_row->'training_subjects', '[]'::jsonb)) loop
      v_subject_id := nullif(subject_row->>'subject_id', '')::uuid;
      v_organization_id := nullif(subject_row->>'organization_id', '')::uuid;
      subject_snapshot := private.training_subject_snapshot(v_subject_id);
      if subject_snapshot is null then
        raise exception 'Choose a published training subject.' using errcode = '22023';
      end if;
      if v_organization_id is not null then
        if not private.is_organization_instructor(v_organization_id, caller)
          or not private.is_organization_instructor(v_organization_id, v_assigned_instructor_id) then
          raise exception 'The selected Training Guide organization is unavailable to the assigned instructors.' using errcode = '42501';
        end if;
        if v_student_account_id is null or not exists (
          select 1 from public.organization_members student
          where student.organization_id = v_organization_id
            and student.user_id = v_student_account_id
            and student.teaching_role = 'student'
        ) then
          raise exception 'The scheduled student must be a current student in the selected Training Guide organization.' using errcode = '42501';
        end if;
      end if;

      select jsonb_build_object(
        'organization_id', guide.organization_id,
        'guidance', guide.guidance,
        'resources', guide.resources,
        'updated_at', guide.updated_at
      ) into organization_snapshot
      from public.organization_training_guides guide
      where guide.organization_id = v_organization_id and guide.subject_id = v_subject_id and guide.enabled;

      select jsonb_build_object(
        'instructor_user_id', guide.instructor_user_id,
        'instructor_name', coalesce(nullif(profile.display_name, ''), 'Instructor'),
        'explanation', guide.explanation,
        'key_points', guide.key_points,
        'resources', guide.resources,
        'updated_at', guide.updated_at
      ) into instructor_snapshot
      from public.instructor_training_guides guide
      left join public.profiles profile on profile.id = guide.instructor_user_id
      where guide.instructor_user_id = v_assigned_instructor_id
        and guide.subject_id = v_subject_id
        and guide.organization_id is not distinct from v_organization_id;

      if is_account_event then
        insert into public.cfi_schedule_event_subjects (
          event_id, subject_id, organization_id, position, subject_snapshot,
          organization_guide_snapshot, instructor_guide_snapshot, personal_note, created_by
        ) values (
          v_event_id, v_subject_id, v_organization_id, coalesce((subject_row->>'position')::integer, 0),
          subject_snapshot, organization_snapshot, instructor_snapshot,
          left(coalesce(subject_row->>'personal_note', ''), 4000), caller
        );
      else
        insert into private.cfi_person_event_subjects (
          event_id, subject_id, organization_id, position, subject_snapshot,
          organization_guide_snapshot, instructor_guide_snapshot, personal_note, created_by
        ) values (
          v_event_id, v_subject_id, v_organization_id, coalesce((subject_row->>'position')::integer, 0),
          subject_snapshot, organization_snapshot, instructor_snapshot,
          left(coalesce(subject_row->>'personal_note', ''), 4000), caller
        );
      end if;

      if v_student_account_id is not null then
        insert into private.training_guide_student_assignments (
          event_id, student_user_id, subject_id, organization_id,
          cfi_user_id, start_at, end_at
        ) values (
          v_event_id, v_student_account_id, v_subject_id, v_organization_id,
          caller, v_start_at, v_end_at
        );
      end if;
    end loop;
  end loop;
  return next_revision;
end;
$$;

revoke all on function public.publish_cfi_schedule_draft_v3(bigint, uuid, jsonb) from public, anon;
grant execute on function public.publish_cfi_schedule_draft_v3(bigint, uuid, jsonb) to authenticated;

create or replace function public.list_my_schedule_training_subjects(
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_cfi_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target_cfi uuid := coalesce(p_cfi_id, caller);
begin
  if caller is null then raise exception 'You must be signed in.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(item order by item->>'event_id', (item->>'position')::integer)
    from (
      select jsonb_build_object(
        'event_id', link.event_id, 'subject_id', link.subject_id,
        'organization_id', link.organization_id, 'position', link.position,
        'subject_snapshot', link.subject_snapshot,
        'organization_guide_snapshot', link.organization_guide_snapshot,
        'instructor_guide_snapshot', link.instructor_guide_snapshot,
        'personal_note', link.personal_note
      ) item
      from public.cfi_schedule_event_subjects link
      join public.cfi_schedule_events event on event.id = link.event_id
      where event.cfi_user_id = target_cfi
        and event.start_at < p_range_end and event.end_at > p_range_start
        and (
          caller = event.cfi_user_id
          or caller = event.assigned_instructor_user_id
          or (caller = event.student_user_id and private.has_cfi_schedule_access(event.cfi_user_id, event.student_user_id))
        )
      union all
      select jsonb_build_object(
        'event_id', link.event_id, 'subject_id', link.subject_id,
        'organization_id', link.organization_id, 'position', link.position,
        'subject_snapshot', link.subject_snapshot,
        'organization_guide_snapshot', link.organization_guide_snapshot,
        'instructor_guide_snapshot', link.instructor_guide_snapshot,
        'personal_note', link.personal_note
      ) item
      from private.cfi_person_event_subjects link
      join private.cfi_person_events event on event.id = link.event_id
      where event.cfi_user_id = target_cfi
        and event.start_at < p_range_end and event.end_at > p_range_start
        and (
          caller = event.cfi_user_id
          or caller = event.assigned_instructor_user_id
          or caller = private.cfi_person_account(event.cfi_user_id, event.student_user_id)
        )
    ) visible
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_schedule_training_subjects(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.list_my_schedule_training_subjects(timestamptz, timestamptz, uuid) to authenticated;

create or replace function public.list_my_training_guide_subjects(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if p_organization_id is null
    or not private.is_organization_student(p_organization_id, caller) then
    raise exception 'Student organization access is required.' using errcode = '42501';
  end if;

  return coalesce((
    with access_summary as (
      select subject_id,
        min(start_at) filter (where end_at > timezone('utc', now())) as next_scheduled_at,
        max(end_at) filter (where end_at <= timezone('utc', now())) as last_flown_at
      from private.training_guide_student_assignments
      where student_user_id = caller
        and (organization_id = p_organization_id or organization_id is null)
      group by subject_id
    )
    select jsonb_agg(
      jsonb_build_object(
        'subject', private.training_subject_snapshot(subject.id),
        'access_state', case
          when access.next_scheduled_at is not null then 'scheduled'
          else 'completed'
        end,
        'next_scheduled_at', access.next_scheduled_at,
        'last_flown_at', access.last_flown_at
      ) order by subject.certificate_code, subject.area_code, subject.sort_order, subject.title
    )
    from access_summary access
    join public.training_subjects subject on subject.id = access.subject_id
    where subject.status = 'published'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_training_guide_subjects(uuid) from public, anon;
grant execute on function public.list_my_training_guide_subjects(uuid) to authenticated;

insert into public.training_subjects (
  stable_key, certificate_code, area_code, area_title, task_code, title,
  acs_document, acs_version, effective_date, source_url, components, study_guide, standards,
  status, sort_order
) values (
  'pvt.pa-v-b', 'PVT', 'V', 'Performance and Ground Reference Maneuvers', 'PA.V.B',
  'Ground Reference Maneuvers', 'FAA-S-ACS-6C', '6C', date '2024-05-31',
  'https://www.faa.gov/training_testing/testing/acs/private_airplane_acs_6.pdf',
  '[{"key":"rectangular-course","title":"Rectangular Course"},{"key":"turns-around-a-point","title":"Turns Around a Point"},{"key":"s-turns","title":"S-Turns"}]'::jsonb,
  '{
    "what":"Ground reference maneuvers use a visible reference on the surface to practice flying a precise ground track while wind changes the airplane''s groundspeed and drift.",
    "why":"They build wind awareness, coordinated control, division of attention, and the ground-track judgment used in the airport traffic pattern.",
    "how":[
      "Review the three maneuver shapes and identify how wind direction changes the required correction.",
      "Choose a suitable practice area and reference while accounting for traffic, terrain, obstacles, wires, and emergency options.",
      "Plan the entry, then vary heading and bank as groundspeed changes to hold the intended track.",
      "Keep the airplane coordinated while dividing attention between the reference, flight instruments, and traffic.",
      "After each attempt, identify where the ground track drifted and which correction should change on the next attempt."
    ],
    "proficiency":"Demonstrate every listed PA.V.B skill while managing the listed risks. Use the ACS skill items below as the objective completion standard."
  }'::jsonb,
  '{
    "knowledge":[
      {"code":"PA.V.B.K1","text":"Purpose of ground reference maneuvers and the principles used to perform them."},
      {"code":"PA.V.B.K2","text":"Effects of wind, groundspeed, and wind correction on the selected ground track."},
      {"code":"PA.V.B.K3","text":"Effects of bank angle and groundspeed on turn rate and radius."},
      {"code":"PA.V.B.K4","text":"Relationship between the rectangular course and an airport traffic pattern."}
    ],
    "risk_management":[
      {"code":"PA.V.B.R1","text":"Collision hazards, terrain, obstacles, and wires."},
      {"code":"PA.V.B.R2","text":"Distractions and division of attention while maneuvering."},
      {"code":"PA.V.B.R3","text":"Low-altitude maneuvering, including stall and spin risk."},
      {"code":"PA.V.B.R4","text":"Selection of a suitable ground reference and practice area."},
      {"code":"PA.V.B.R5","text":"Wind conditions and their effect on safe maneuver completion."}
    ],
    "skills":[
      {"code":"PA.V.B.S1","text":"Clear the area before beginning the maneuver."},
      {"code":"PA.V.B.S2","text":"Select a suitable ground reference."},
      {"code":"PA.V.B.S3","text":"Enter the selected maneuver at the specified altitude and relationship to the reference."},
      {"code":"PA.V.B.S4","text":"Apply adequate wind-drift correction to maintain the selected ground track."},
      {"code":"PA.V.B.S5","text":"Maintain the appropriate turn direction and reversal points."},
      {"code":"PA.V.B.S6","text":"Divide attention and maintain coordinated airplane control."},
      {"code":"PA.V.B.S7","text":"Maintain altitude within 100 feet and airspeed within 10 knots."}
    ]
  }'::jsonb,
  'published', 50020
)
on conflict (stable_key) do nothing;

insert into public.training_subject_references (
  subject_id, title, document_number, chapter, page_label, source_url, sort_order, verified_at
)
select subject.id, reference.title, 'FAA-H-8083-3C', 'Chapter 7', reference.page_label,
  'https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/airplane_handbook/08_afh_ch7.pdf',
  reference.sort_order, date '2026-10-18'
from public.training_subjects subject
cross join (values
  ('Rectangular Course', '7-5–7-7', 10),
  ('Turns Around a Point', '7-7–7-8', 20),
  ('S-Turns', '7-8–7-10', 30)
) as reference(title, page_label, sort_order)
where subject.stable_key = 'pvt.pa-v-b'
  and not exists (
    select 1 from public.training_subject_references existing
    where existing.subject_id = subject.id and existing.title = reference.title
  );
