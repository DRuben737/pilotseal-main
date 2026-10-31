create table public.cfi_schedule_event_course_modules (
  event_id uuid not null references public.cfi_schedule_events(id) on delete cascade,
  course_module_id uuid not null references public.training_course_modules(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  position integer not null default 0 check (position between 0 and 30),
  module_snapshot jsonb not null,
  personal_note text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (event_id, course_module_id),
  check (jsonb_typeof(module_snapshot) = 'object'),
  check (char_length(personal_note) <= 4000)
);

create index cfi_schedule_event_course_modules_module_idx
  on public.cfi_schedule_event_course_modules (course_module_id);
create index cfi_schedule_event_course_modules_organization_idx
  on public.cfi_schedule_event_course_modules (organization_id);

create table private.cfi_person_event_course_modules (
  event_id uuid not null references private.cfi_person_events(id) on delete cascade,
  course_module_id uuid not null references public.training_course_modules(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  position integer not null default 0 check (position between 0 and 30),
  module_snapshot jsonb not null,
  personal_note text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (event_id, course_module_id),
  check (jsonb_typeof(module_snapshot) = 'object'),
  check (char_length(personal_note) <= 4000)
);

create index cfi_person_event_course_modules_module_idx
  on private.cfi_person_event_course_modules (course_module_id);
create index cfi_person_event_course_modules_organization_idx
  on private.cfi_person_event_course_modules (organization_id);

alter table public.cfi_schedule_event_course_modules enable row level security;
alter table private.cfi_person_event_course_modules enable row level security;

revoke all on table public.cfi_schedule_event_course_modules from public, anon, authenticated;
revoke all on table private.cfi_person_event_course_modules from public, anon, authenticated;
grant select on table public.cfi_schedule_event_course_modules to authenticated;
grant all on table public.cfi_schedule_event_course_modules to service_role;
grant all on table private.cfi_person_event_course_modules to service_role;

create policy cfi_schedule_event_course_modules_read_participant
on public.cfi_schedule_event_course_modules for select to authenticated
using (exists (
  select 1
  from public.cfi_schedule_events event
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

create or replace function private.training_course_module_snapshot(
  p_course_module_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'course', jsonb_build_object(
      'id', course.id,
      'stable_key', course.stable_key,
      'provider_name', course.provider_name,
      'title', course.title,
      'revision_label', course.revision_label,
      'source_file_name', course.source_file_name
    ),
    'module', jsonb_build_object(
      'id', module.id,
      'stage_number', module.stage_number,
      'module_number', module.module_number,
      'module_type', module.module_type,
      'duration_label', module.duration_label,
      'duration_hours', module.duration_hours,
      'lesson_objective', module.lesson_objective,
      'study_material', module.study_material,
      'completion_standards', module.completion_standards,
      'source_page', module.source_page,
      'line_items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'position', item.position,
            'text', item.item_text,
            'minimum_score', item.minimum_score
          ) order by item.position
        )
        from public.training_module_line_items item
        where item.module_id = module.id
      ), '[]'::jsonb)
    )
  )
  from public.training_course_modules module
  join public.training_courses course on course.id = module.course_id
  where module.id = p_course_module_id
    and course.status = 'published';
$$;

revoke all on function private.training_course_module_snapshot(uuid)
from public, anon, authenticated;

create or replace function public.list_my_schedule_training_courses()
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
    select jsonb_agg(course_item order by course_item->>'organization_name', course_item->>'title')
    from (
      select jsonb_build_object(
        'organization_id', assignment.organization_id,
        'organization_name', organization.name,
        'id', course.id,
        'stable_key', course.stable_key,
        'provider_name', course.provider_name,
        'title', course.title,
        'revision_label', course.revision_label,
        'source_file_name', course.source_file_name,
        'modules', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', module.id,
              'stage_number', module.stage_number,
              'module_number', module.module_number,
              'module_type', module.module_type,
              'duration_label', module.duration_label,
              'duration_hours', module.duration_hours,
              'lesson_objective', module.lesson_objective,
              'study_material', module.study_material,
              'completion_standards', module.completion_standards,
              'source_page', module.source_page,
              'line_items', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'id', item.id,
                    'position', item.position,
                    'text', item.item_text,
                    'minimum_score', item.minimum_score
                  ) order by item.position
                )
                from public.training_module_line_items item
                where item.module_id = module.id
              ), '[]'::jsonb)
            ) order by module.stage_number, module.module_number
          )
          from public.training_course_modules module
          where module.course_id = course.id
        ), '[]'::jsonb)
      ) course_item
      from public.organization_training_courses assignment
      join public.training_courses course on course.id = assignment.course_id
      join public.organizations organization on organization.id = assignment.organization_id
      where assignment.enabled
        and course.status = 'published'
        and private.is_organization_instructor(assignment.organization_id, caller)
    ) visible_courses
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_schedule_training_courses()
from public, anon;
grant execute on function public.list_my_schedule_training_courses()
to authenticated;

create or replace function public.publish_cfi_schedule_draft_v4(
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
  module_row jsonb;
  v_event_id uuid;
  v_course_module_id uuid;
  v_organization_id uuid;
  v_assigned_instructor_id uuid;
  v_student_account_id uuid;
  v_saved_student_id uuid;
  module_snapshot jsonb;
  is_account_event boolean;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_changes, '[]'::jsonb)) <> 'array' then
    raise exception 'Schedule changes must be an array.' using errcode = '22023';
  end if;

  next_revision := public.publish_cfi_schedule_draft_v3(
    p_expected_revision,
    p_batch_id,
    p_changes
  );

  for change_row in
    select value from jsonb_array_elements(p_changes)
  loop
    v_event_id := nullif(change_row->>'id', '')::uuid;
    delete from public.cfi_schedule_event_course_modules
    where event_id = v_event_id;
    delete from private.cfi_person_event_course_modules
    where event_id = v_event_id;

    select exists(
      select 1
      from public.cfi_schedule_events event
      where event.id = v_event_id and event.cfi_user_id = caller
    ) into is_account_event;

    if is_account_event then
      select assigned_instructor_user_id, student_user_id
      into v_assigned_instructor_id, v_student_account_id
      from public.cfi_schedule_events
      where id = v_event_id;
      v_saved_student_id := null;
    else
      select assigned_instructor_user_id, student_user_id
      into v_assigned_instructor_id, v_saved_student_id
      from private.cfi_person_events
      where id = v_event_id and cfi_user_id = caller;
      if not found then continue; end if;
      v_student_account_id := private.cfi_person_account(caller, v_saved_student_id);
    end if;

    if coalesce(change_row->>'status', 'scheduled') <> 'scheduled' then continue; end if;
    if jsonb_typeof(coalesce(change_row->'training_course_modules', '[]'::jsonb)) <> 'array' then
      raise exception 'Training course modules must be an array.' using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(change_row->'training_course_modules', '[]'::jsonb)) > 30 then
      raise exception 'A lesson can include at most 30 training course modules.' using errcode = '22023';
    end if;

    for module_row in
      select value
      from jsonb_array_elements(coalesce(change_row->'training_course_modules', '[]'::jsonb))
    loop
      v_course_module_id := nullif(module_row->>'course_module_id', '')::uuid;
      v_organization_id := nullif(module_row->>'organization_id', '')::uuid;
      if v_course_module_id is null or v_organization_id is null then
        raise exception 'Choose an organization training course module.' using errcode = '22023';
      end if;

      module_snapshot := private.training_course_module_snapshot(v_course_module_id);
      if module_snapshot is null or not exists (
        select 1
        from public.training_course_modules module
        join public.training_courses course on course.id = module.course_id
        join public.organization_training_courses assignment
          on assignment.course_id = course.id
         and assignment.organization_id = v_organization_id
        where module.id = v_course_module_id
          and course.status = 'published'
          and assignment.enabled
      ) then
        raise exception 'Choose an assigned training course module.' using errcode = '22023';
      end if;

      if not private.is_organization_instructor(v_organization_id, caller)
        or not private.is_organization_instructor(v_organization_id, v_assigned_instructor_id) then
        raise exception 'The selected Training Guide organization is unavailable to the assigned instructors.' using errcode = '42501';
      end if;
      if v_student_account_id is null
        or not private.is_organization_student(v_organization_id, v_student_account_id) then
        raise exception 'The scheduled student must be a current student in the selected Training Guide organization.' using errcode = '42501';
      end if;

      if is_account_event then
        insert into public.cfi_schedule_event_course_modules (
          event_id,
          course_module_id,
          organization_id,
          position,
          module_snapshot,
          personal_note,
          created_by
        ) values (
          v_event_id,
          v_course_module_id,
          v_organization_id,
          coalesce((module_row->>'position')::integer, 0),
          module_snapshot,
          left(coalesce(module_row->>'personal_note', ''), 4000),
          caller
        );
      else
        insert into private.cfi_person_event_course_modules (
          event_id,
          course_module_id,
          organization_id,
          position,
          module_snapshot,
          personal_note,
          created_by
        ) values (
          v_event_id,
          v_course_module_id,
          v_organization_id,
          coalesce((module_row->>'position')::integer, 0),
          module_snapshot,
          left(coalesce(module_row->>'personal_note', ''), 4000),
          caller
        );
      end if;
    end loop;
  end loop;

  return next_revision;
end;
$$;

revoke all on function public.publish_cfi_schedule_draft_v4(bigint, uuid, jsonb)
from public, anon;
grant execute on function public.publish_cfi_schedule_draft_v4(bigint, uuid, jsonb)
to authenticated;

create or replace function public.list_my_schedule_training_course_modules(
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
  if caller is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(item order by item->>'event_id', (item->>'position')::integer)
    from (
      select jsonb_build_object(
        'event_id', link.event_id,
        'course_module_id', link.course_module_id,
        'organization_id', link.organization_id,
        'position', link.position,
        'module_snapshot', link.module_snapshot,
        'personal_note', link.personal_note
      ) item
      from public.cfi_schedule_event_course_modules link
      join public.cfi_schedule_events event on event.id = link.event_id
      where event.cfi_user_id = target_cfi
        and event.start_at < p_range_end
        and event.end_at > p_range_start
        and (
          caller = event.cfi_user_id
          or caller = event.assigned_instructor_user_id
          or (
            caller = event.student_user_id
            and private.has_cfi_schedule_access(event.cfi_user_id, event.student_user_id)
          )
        )
      union all
      select jsonb_build_object(
        'event_id', link.event_id,
        'course_module_id', link.course_module_id,
        'organization_id', link.organization_id,
        'position', link.position,
        'module_snapshot', link.module_snapshot,
        'personal_note', link.personal_note
      ) item
      from private.cfi_person_event_course_modules link
      join private.cfi_person_events event on event.id = link.event_id
      where event.cfi_user_id = target_cfi
        and event.start_at < p_range_end
        and event.end_at > p_range_start
        and (
          caller = event.cfi_user_id
          or caller = event.assigned_instructor_user_id
          or caller = private.cfi_person_account(event.cfi_user_id, event.student_user_id)
        )
    ) visible
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_schedule_training_course_modules(
  timestamptz,
  timestamptz,
  uuid
) from public, anon;
grant execute on function public.list_my_schedule_training_course_modules(
  timestamptz,
  timestamptz,
  uuid
) to authenticated;
