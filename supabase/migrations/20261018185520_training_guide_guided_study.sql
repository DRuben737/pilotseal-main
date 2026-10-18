-- Training Guide guided study foundation.
-- A published schedule assignment grants permanent subject and instructor-module
-- access. Schedule edits may continue replacing event links, but never revoke the
-- durable access recorded here.

alter table public.instructor_training_guides
  add column steps jsonb not null default '[]'::jsonb;

alter table public.instructor_training_guides
  add constraint instructor_training_guides_steps_array
  check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 50);

alter table public.student_training_subject_notes
  add column step_id text;

alter table public.student_training_subject_notes
  add constraint student_training_subject_notes_step_id_length
  check (step_id is null or char_length(step_id) between 1 and 120);

-- Preserve existing instructor content as one editable guided-study step.
update public.instructor_training_guides
set steps = jsonb_build_array(jsonb_build_object(
  'id', 'legacy-overview',
  'title', 'Instructor preparation',
  'prepare', explanation,
  'method', '',
  'focus_questions', to_jsonb(key_points),
  'expected_result', '',
  'component_keys', '[]'::jsonb,
  'resources', resources
))
where steps = '[]'::jsonb
  and (nullif(btrim(explanation), '') is not null
    or cardinality(key_points) > 0
    or jsonb_array_length(resources) > 0);

create table private.training_guide_subject_access (
  student_user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.training_subjects(id) on delete restrict,
  first_assigned_at timestamptz not null default timezone('utc', now()),
  last_assigned_at timestamptz not null default timezone('utc', now()),
  primary key (student_user_id, subject_id)
);

create table private.training_guide_instructor_access (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.training_subjects(id) on delete restrict,
  instructor_user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  guide_snapshot jsonb not null default '{}'::jsonb,
  first_assigned_at timestamptz not null default timezone('utc', now()),
  last_assigned_at timestamptz not null default timezone('utc', now()),
  check (jsonb_typeof(guide_snapshot) = 'object')
);

create unique index training_guide_instructor_access_scope_idx
  on private.training_guide_instructor_access (
    student_user_id,
    subject_id,
    instructor_user_id,
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index training_guide_instructor_access_student_idx
  on private.training_guide_instructor_access
  (student_user_id, subject_id, last_assigned_at desc);

create table private.training_guide_student_progress (
  student_user_id uuid not null references auth.users(id) on delete cascade,
  module_access_id uuid not null references private.training_guide_instructor_access(id) on delete cascade,
  current_step_id text,
  completed_step_ids text[] not null default '{}'::text[],
  last_opened_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (student_user_id, module_access_id),
  check (current_step_id is null or char_length(current_step_id) between 1 and 120),
  check (coalesce(array_length(completed_step_ids, 1), 0) <= 50)
);

revoke all on table private.training_guide_subject_access
  from public, anon, authenticated;
revoke all on table private.training_guide_instructor_access
  from public, anon, authenticated;
revoke all on table private.training_guide_student_progress
  from public, anon, authenticated;

create or replace function private.training_guide_snapshot_for_instructor(
  p_instructor_user_id uuid,
  p_subject_id uuid,
  p_organization_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'id', guide.id,
      'organization_id', guide.organization_id,
      'instructor_user_id', guide.instructor_user_id,
      'explanation', guide.explanation,
      'key_points', to_jsonb(guide.key_points),
      'resources', guide.resources,
      'steps', guide.steps,
      'updated_at', guide.updated_at
    )
    from public.instructor_training_guides guide
    where guide.instructor_user_id = p_instructor_user_id
      and guide.subject_id = p_subject_id
      and guide.organization_id is not distinct from p_organization_id
    order by guide.updated_at desc
    limit 1
  ), jsonb_build_object(
    'organization_id', p_organization_id,
    'instructor_user_id', p_instructor_user_id,
    'explanation', '',
    'key_points', '[]'::jsonb,
    'resources', '[]'::jsonb,
    'steps', '[]'::jsonb
  ));
$$;

revoke all on function private.training_guide_snapshot_for_instructor(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function private.grant_training_guide_access(
  p_student_user_id uuid,
  p_subject_id uuid,
  p_instructor_user_id uuid,
  p_organization_id uuid,
  p_assigned_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_student_user_id is null or p_subject_id is null or p_instructor_user_id is null then
    return;
  end if;

  insert into private.training_guide_subject_access (
    student_user_id, subject_id, first_assigned_at, last_assigned_at
  ) values (
    p_student_user_id, p_subject_id, p_assigned_at, p_assigned_at
  )
  on conflict (student_user_id, subject_id) do update
  set last_assigned_at = greatest(
    private.training_guide_subject_access.last_assigned_at,
    excluded.last_assigned_at
  );

  insert into private.training_guide_instructor_access (
    student_user_id, subject_id, instructor_user_id, organization_id,
    guide_snapshot, first_assigned_at, last_assigned_at
  ) values (
    p_student_user_id,
    p_subject_id,
    p_instructor_user_id,
    p_organization_id,
    private.training_guide_snapshot_for_instructor(
      p_instructor_user_id, p_subject_id, p_organization_id
    ),
    p_assigned_at,
    p_assigned_at
  )
  on conflict (
    student_user_id,
    subject_id,
    instructor_user_id,
    (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))
  ) do update
  set guide_snapshot = excluded.guide_snapshot,
      last_assigned_at = greatest(
        private.training_guide_instructor_access.last_assigned_at,
        excluded.last_assigned_at
      );
end;
$$;

revoke all on function private.grant_training_guide_access(uuid, uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;

create or replace function private.grant_account_event_training_guide_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lesson public.cfi_schedule_events%rowtype;
begin
  select * into lesson
  from public.cfi_schedule_events
  where id = new.event_id;

  perform private.grant_training_guide_access(
    lesson.student_user_id,
    new.subject_id,
    coalesce(lesson.assigned_instructor_user_id, lesson.cfi_user_id),
    new.organization_id,
    coalesce(lesson.start_at, timezone('utc', now()))
  );
  return new;
end;
$$;

create trigger grant_account_event_training_guide_access
after insert on public.cfi_schedule_event_subjects
for each row execute function private.grant_account_event_training_guide_access();

create or replace function private.grant_person_event_training_guide_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lesson private.cfi_person_events%rowtype;
  student_account_id uuid;
begin
  select * into lesson
  from private.cfi_person_events
  where id = new.event_id;
  student_account_id := private.cfi_person_account(
    lesson.cfi_user_id, lesson.student_user_id
  );

  perform private.grant_training_guide_access(
    student_account_id,
    new.subject_id,
    coalesce(lesson.assigned_instructor_user_id, lesson.cfi_user_id),
    new.organization_id,
    coalesce(lesson.start_at, timezone('utc', now()))
  );
  return new;
end;
$$;

create trigger grant_person_event_training_guide_access
after insert on private.cfi_person_event_subjects
for each row execute function private.grant_person_event_training_guide_access();

-- Backfill every assignment still available at migration time. Historical rows
-- removed by the former cancellation behavior cannot be reconstructed.
select private.grant_training_guide_access(
  event.student_user_id,
  link.subject_id,
  coalesce(event.assigned_instructor_user_id, event.cfi_user_id),
  link.organization_id,
  event.start_at
)
from public.cfi_schedule_event_subjects link
join public.cfi_schedule_events event on event.id = link.event_id;

select private.grant_training_guide_access(
  private.cfi_person_account(event.cfi_user_id, event.student_user_id),
  link.subject_id,
  coalesce(event.assigned_instructor_user_id, event.cfi_user_id),
  link.organization_id,
  event.start_at
)
from private.cfi_person_event_subjects link
join private.cfi_person_events event on event.id = link.event_id;

create or replace function public.list_my_training_guide_subjects(
  p_organization_id uuid default null
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

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'subject', private.training_subject_snapshot(subject.id),
        'instructor_modules', coalesce((
          select jsonb_agg(jsonb_build_object(
            'access_id', module.id,
            'instructor_user_id', module.instructor_user_id,
            'instructor_name', coalesce(nullif(profile.display_name, ''), 'Instructor'),
            'organization_id', module.organization_id,
            'last_assigned_at', module.last_assigned_at
          ) order by module.last_assigned_at desc)
          from private.training_guide_instructor_access module
          left join public.profiles profile on profile.id = module.instructor_user_id
          where module.student_user_id = caller
            and module.subject_id = access.subject_id
        ), '[]'::jsonb)
      )
      order by subject.certificate_code, subject.area_code, subject.sort_order, subject.title
    )
    from private.training_guide_subject_access access
    join public.training_subjects subject on subject.id = access.subject_id
    where access.student_user_id = caller
      and subject.status = 'published'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_training_guide_subjects(uuid) from public, anon;
grant execute on function public.list_my_training_guide_subjects(uuid) to authenticated;

create or replace function public.get_my_training_guide_subject(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  result jsonb;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from private.training_guide_subject_access access
    where access.student_user_id = caller and access.subject_id = p_subject_id
  ) then
    raise exception 'This training subject has not been assigned to you.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'subject', private.training_subject_snapshot(subject.id),
    'instructor_modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'access_id', module.id,
        'instructor_user_id', module.instructor_user_id,
        'instructor_name', coalesce(nullif(profile.display_name, ''), 'Instructor'),
        'organization_id', module.organization_id,
        'last_assigned_at', module.last_assigned_at,
        'guide', coalesce(live.guide, module.guide_snapshot),
        'progress', jsonb_build_object(
          'current_step_id', progress.current_step_id,
          'completed_step_ids', coalesce(to_jsonb(progress.completed_step_ids), '[]'::jsonb),
          'last_opened_at', progress.last_opened_at,
          'updated_at', progress.updated_at
        )
      ) order by module.last_assigned_at desc)
      from private.training_guide_instructor_access module
      left join public.profiles profile on profile.id = module.instructor_user_id
      left join private.training_guide_student_progress progress
        on progress.student_user_id = caller and progress.module_access_id = module.id
      left join lateral (
        select jsonb_build_object(
          'id', guide.id,
          'organization_id', guide.organization_id,
          'instructor_user_id', guide.instructor_user_id,
          'explanation', guide.explanation,
          'key_points', to_jsonb(guide.key_points),
          'resources', guide.resources,
          'steps', guide.steps,
          'updated_at', guide.updated_at
        ) guide
        from public.instructor_training_guides guide
        where guide.instructor_user_id = module.instructor_user_id
          and guide.subject_id = module.subject_id
          and guide.organization_id is not distinct from module.organization_id
        order by guide.updated_at desc
        limit 1
      ) live on true
      where module.student_user_id = caller
        and module.subject_id = p_subject_id
    ), '[]'::jsonb)
  ) into result
  from public.training_subjects subject
  where subject.id = p_subject_id and subject.status = 'published';

  if result is null then
    raise exception 'This training subject is unavailable.' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke all on function public.get_my_training_guide_subject(uuid) from public, anon;
grant execute on function public.get_my_training_guide_subject(uuid) to authenticated;

create or replace function public.save_my_training_guide_progress(
  p_module_access_id uuid,
  p_current_step_id text,
  p_completed_step_ids text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  module private.training_guide_instructor_access%rowtype;
  guide_doc jsonb;
  valid_step_ids text[];
  completed_ids text[] := coalesce(p_completed_step_ids, '{}'::text[]);
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  select * into module
  from private.training_guide_instructor_access access
  where access.id = p_module_access_id and access.student_user_id = caller;
  if module.id is null then
    raise exception 'This instructor guide is unavailable.' using errcode = '42501';
  end if;

  guide_doc := private.training_guide_snapshot_for_instructor(
    module.instructor_user_id, module.subject_id, module.organization_id
  );
  if coalesce(jsonb_array_length(guide_doc->'steps'), 0) = 0 then
    guide_doc := module.guide_snapshot;
  end if;

  select coalesce(array_agg(step->>'id'), '{}'::text[])
  into valid_step_ids
  from jsonb_array_elements(coalesce(guide_doc->'steps', '[]'::jsonb)) step
  where nullif(step->>'id', '') is not null;

  if p_current_step_id is not null and not (p_current_step_id = any(valid_step_ids)) then
    raise exception 'Choose a valid current study step.' using errcode = '22023';
  end if;
  if cardinality(completed_ids) > 50
    or exists (
      select 1 from unnest(completed_ids) completed_id
      where not (completed_id = any(valid_step_ids))
    ) then
    raise exception 'Completed study steps are invalid.' using errcode = '22023';
  end if;

  insert into private.training_guide_student_progress (
    student_user_id, module_access_id, current_step_id,
    completed_step_ids, last_opened_at, updated_at
  ) values (
    caller, module.id, p_current_step_id,
    array(select distinct item from unnest(completed_ids) item),
    timezone('utc', now()), timezone('utc', now())
  )
  on conflict (student_user_id, module_access_id) do update
  set current_step_id = excluded.current_step_id,
      completed_step_ids = excluded.completed_step_ids,
      last_opened_at = excluded.last_opened_at,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.save_my_training_guide_progress(uuid, text, text[])
  from public, anon;
grant execute on function public.save_my_training_guide_progress(uuid, text, text[])
  to authenticated;
