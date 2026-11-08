-- TCO training records completed by an instructor and printable by either party.

create table public.training_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  instructor_user_id uuid not null references auth.users(id) on delete restrict,
  student_person_id uuid not null,
  student_user_id uuid references auth.users(id) on delete set null,
  course_id uuid not null references public.training_courses(id) on delete restrict,
  course_module_id uuid not null references public.training_course_modules(id) on delete restrict,
  student_name text not null,
  instructor_name text not null,
  course_title text not null,
  course_revision text not null default '',
  stage_number smallint not null check (stage_number > 0),
  module_number smallint not null check (module_number > 0),
  module_type text not null,
  lesson_date date not null,
  aircraft_type text not null default '',
  aircraft_tail_number text not null default '',
  category_sel numeric(5,1) not null default 0 check (category_sel between 0 and 999.9),
  category_mel numeric(5,1) not null default 0 check (category_mel between 0 and 999.9),
  time_dual numeric(5,1) not null default 0 check (time_dual between 0 and 999.9),
  time_pic numeric(5,1) not null default 0 check (time_pic between 0 and 999.9),
  time_solo numeric(5,1) not null default 0 check (time_solo between 0 and 999.9),
  condition_day numeric(5,1) not null default 0 check (condition_day between 0 and 999.9),
  condition_night numeric(5,1) not null default 0 check (condition_night between 0 and 999.9),
  condition_xc numeric(5,1) not null default 0 check (condition_xc between 0 and 999.9),
  condition_actual numeric(5,1) not null default 0 check (condition_actual between 0 and 999.9),
  condition_simulated numeric(5,1) not null default 0 check (condition_simulated between 0 and 999.9),
  approaches smallint not null default 0 check (approaches between 0 and 99),
  landings_day smallint not null default 0 check (landings_day between 0 and 99),
  landings_night smallint not null default 0 check (landings_night between 0 and 99),
  route_from text not null default '',
  route_to text not null default '',
  flight_duration numeric(5,1) not null default 0 check (flight_duration between 0 and 999.9),
  remarks text not null default '',
  scores jsonb not null default '[]'::jsonb check (jsonb_typeof(scores) = 'array'),
  final_status text check (final_status in ('completed', 'incomplete', 'unsatisfactory')),
  record_status text not null default 'draft' check (record_status in ('draft', 'completed')),
  passed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (char_length(student_name) between 1 and 200),
  check (char_length(instructor_name) between 1 and 200),
  check (char_length(aircraft_type) <= 80),
  check (char_length(aircraft_tail_number) <= 20),
  check (char_length(route_from) <= 20),
  check (char_length(route_to) <= 20),
  check (char_length(remarks) <= 4000)
);

create index training_records_instructor_idx
  on public.training_records (instructor_user_id, lesson_date desc);
create index training_records_student_idx
  on public.training_records (student_user_id, lesson_date desc)
  where student_user_id is not null;
create index training_records_person_course_idx
  on public.training_records (student_person_id, course_id, lesson_date, module_number);
create index training_records_organization_idx
  on public.training_records (organization_id, lesson_date desc);

alter table public.training_records enable row level security;
revoke all on table public.training_records from public, anon, authenticated;
grant all on table public.training_records to service_role;

create or replace function public.list_my_training_records()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then '[]'::jsonb
    else coalesce(jsonb_agg(to_jsonb(record_row) order by record_row.lesson_date desc, record_row.created_at desc), '[]'::jsonb)
  end
  from public.training_records record_row
  where record_row.created_by_user_id = auth.uid()
     or record_row.instructor_user_id = auth.uid()
     or record_row.student_user_id = auth.uid();
$$;

revoke all on function public.list_my_training_records() from public, anon;
grant execute on function public.list_my_training_records() to authenticated;

create or replace function public.list_training_record_instructors(p_organization_id uuid)
returns table (user_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    private.is_organization_instructor(p_organization_id, auth.uid())
    or private.is_organization_manager(p_organization_id, auth.uid())
  ) then
    raise exception 'You do not have permission to view instructors.' using errcode = '42501';
  end if;
  return query
  select member.user_id,
    coalesce(nullif(btrim(profile.display_name), ''), split_part(profile.email, '@', 1), 'Instructor')::text
  from public.organization_members member
  join public.profiles profile on profile.id = member.user_id
  where member.organization_id = p_organization_id
    and member.teaching_role = 'instructor'
  order by 2;
end;
$$;

revoke all on function public.list_training_record_instructors(uuid) from public, anon;
grant execute on function public.list_training_record_instructors(uuid) to authenticated;

create or replace function public.save_my_training_record(p_record jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  v_id uuid;
  v_organization_id uuid;
  v_course_id uuid;
  v_module_id uuid;
  v_student_person_id uuid;
  v_instructor_user_id uuid;
  v_final_status text;
  v_student record;
  v_course record;
  v_module record;
  v_instructor_name text;
  v_scores jsonb;
  v_complete boolean;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_record, '{}'::jsonb)) <> 'object' then
    raise exception 'Training record must be an object.' using errcode = '22023';
  end if;

  v_id := nullif(p_record->>'id', '')::uuid;
  v_organization_id := nullif(p_record->>'organization_id', '')::uuid;
  v_course_id := nullif(p_record->>'course_id', '')::uuid;
  v_module_id := nullif(p_record->>'course_module_id', '')::uuid;
  v_student_person_id := nullif(p_record->>'student_person_id', '')::uuid;
  v_instructor_user_id := nullif(p_record->>'instructor_user_id', '')::uuid;
  v_final_status := nullif(p_record->>'final_status', '');

  if v_organization_id is null or v_course_id is null or v_module_id is null
     or v_student_person_id is null or v_instructor_user_id is null then
    raise exception 'Organization, course, module, student, and instructor are required.' using errcode = '22023';
  end if;
  if not (
    private.is_organization_instructor(v_organization_id, caller)
    or private.is_organization_manager(v_organization_id, caller)
  ) then
    raise exception 'Only an organization instructor or manager may save this record.' using errcode = '42501';
  end if;
  if not private.is_organization_instructor(v_organization_id, v_instructor_user_id) then
    raise exception 'The selected instructor is not assigned to this organization.' using errcode = '42501';
  end if;
  if v_final_status is not null and v_final_status not in ('completed', 'incomplete', 'unsatisfactory') then
    raise exception 'Final status is invalid.' using errcode = '22023';
  end if;

  select candidate.* into v_student
  from public.list_organization_students(v_organization_id) candidate
  where candidate.person_id = v_student_person_id
     or candidate.saved_person_id = v_student_person_id
     or candidate.student_user_id = v_student_person_id
  limit 1;
  if not found then
    raise exception 'The selected student is not active in this organization.' using errcode = '42501';
  end if;

  select course.* into v_course
  from public.training_courses course
  join public.organization_training_courses assignment
    on assignment.course_id = course.id
   and assignment.organization_id = v_organization_id
   and assignment.enabled
  where course.id = v_course_id
    and course.status = 'published'
    and lower(course.provider_name) like '%u.s. aviation training solutions%';
  if not found then
    raise exception 'The selected course is not assigned to this organization.' using errcode = '42501';
  end if;

  select module.* into v_module
  from public.training_course_modules module
  where module.id = v_module_id
    and module.course_id = v_course_id;
  if not found then
    raise exception 'The selected module does not belong to this course.' using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(profile.display_name), ''), nullif(split_part(profile.email, '@', 1), ''), 'Instructor')
  into v_instructor_name
  from public.profiles profile
  where profile.id = v_instructor_user_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'line_item_id', item.id,
      'position', item.position,
      'text', item.item_text,
      'minimum_score', item.minimum_score,
      'score', case
        when jsonb_typeof(submitted.value->'score') = 'number'
          and (submitted.value->>'score')::integer between 1 and 5
        then (submitted.value->>'score')::integer
        else null
      end,
      'note', left(coalesce(submitted.value->>'note', ''), 500)
    ) order by item.position
  ), '[]'::jsonb)
  into v_scores
  from public.training_module_line_items item
  left join lateral (
    select score_item.value
    from jsonb_array_elements(coalesce(p_record->'scores', '[]'::jsonb)) score_item(value)
    where score_item.value->>'line_item_id' = item.id::text
    limit 1
  ) submitted on true
  where item.module_id = v_module_id;

  select count(*) > 0 and bool_and((score->>'score') is not null)
  into v_complete
  from jsonb_array_elements(v_scores) score;

  if v_final_status in ('completed', 'unsatisfactory') and not v_complete then
    raise exception 'Every TCO item must be scored for this final status.' using errcode = '22023';
  end if;

  if v_id is not null and not exists (
    select 1 from public.training_records existing
    where existing.id = v_id
      and (
        existing.created_by_user_id = caller
        or existing.instructor_user_id = caller
        or private.is_organization_manager(existing.organization_id, caller)
      )
  ) then
    raise exception 'Training record not found.' using errcode = '42501';
  end if;

  insert into public.training_records (
    id, organization_id, created_by_user_id, instructor_user_id, student_person_id, student_user_id,
    course_id, course_module_id, student_name, instructor_name, course_title,
    course_revision, stage_number, module_number, module_type, lesson_date,
    aircraft_type, aircraft_tail_number, category_sel, category_mel,
    time_dual, time_pic, time_solo, condition_day, condition_night, condition_xc,
    condition_actual, condition_simulated, approaches, landings_day, landings_night,
    route_from, route_to, flight_duration, remarks, scores, final_status,
    record_status, passed, updated_at
  ) values (
    coalesce(v_id, gen_random_uuid()), v_organization_id, caller, v_instructor_user_id, v_student_person_id,
    v_student.student_user_id, v_course_id, v_module_id,
    coalesce(nullif(btrim(v_student.formal_name), ''), nullif(btrim(v_student.account_nickname), ''), 'Student'),
    coalesce(v_instructor_name, 'Instructor'), v_course.title, v_course.revision_label,
    v_module.stage_number, v_module.module_number, v_module.module_type,
    coalesce(nullif(p_record->>'lesson_date', '')::date, current_date),
    case
      when v_module.module_type ~* '(ground|oral)' then 'Ground'
      else left(btrim(coalesce(p_record->>'aircraft_type', '')), 80)
    end,
    case
      when v_module.module_type ~* '(ground|oral)' then 'CLASSROOM'
      else upper(left(btrim(coalesce(p_record->>'aircraft_tail_number', '')), 20))
    end,
    greatest(0, coalesce(nullif(p_record->>'category_sel', '')::numeric, 0)),
    greatest(0, coalesce(nullif(p_record->>'category_mel', '')::numeric, 0)),
    greatest(0, coalesce(nullif(p_record->>'time_dual', '')::numeric, 0)),
    greatest(0, coalesce(nullif(p_record->>'time_pic', '')::numeric, 0)),
    greatest(0, coalesce(nullif(p_record->>'time_solo', '')::numeric, 0)),
    greatest(0, coalesce(nullif(p_record->>'condition_day', '')::numeric, 0)),
    greatest(0, coalesce(nullif(p_record->>'condition_night', '')::numeric, 0)),
    greatest(0, coalesce(nullif(p_record->>'condition_xc', '')::numeric, 0)),
    greatest(0, coalesce(nullif(p_record->>'condition_actual', '')::numeric, 0)),
    greatest(0, coalesce(nullif(p_record->>'condition_simulated', '')::numeric, 0)),
    greatest(0, coalesce(nullif(p_record->>'approaches', '')::smallint, 0)),
    greatest(0, coalesce(nullif(p_record->>'landings_day', '')::smallint, 0)),
    greatest(0, coalesce(nullif(p_record->>'landings_night', '')::smallint, 0)),
    upper(left(btrim(coalesce(p_record->>'route_from', '')), 20)),
    upper(left(btrim(coalesce(p_record->>'route_to', '')), 20)),
    greatest(0, coalesce(nullif(p_record->>'flight_duration', '')::numeric, 0)),
    left(btrim(coalesce(p_record->>'remarks', '')), 4000),
    v_scores, v_final_status,
    case when v_final_status is not null then 'completed' else 'draft' end,
    (v_complete and v_final_status = 'completed'),
    timezone('utc', now())
  )
  on conflict (id) do update set
    organization_id = excluded.organization_id,
    instructor_user_id = excluded.instructor_user_id,
    student_person_id = excluded.student_person_id,
    student_user_id = excluded.student_user_id,
    course_id = excluded.course_id,
    course_module_id = excluded.course_module_id,
    student_name = excluded.student_name,
    instructor_name = excluded.instructor_name,
    course_title = excluded.course_title,
    course_revision = excluded.course_revision,
    stage_number = excluded.stage_number,
    module_number = excluded.module_number,
    module_type = excluded.module_type,
    lesson_date = excluded.lesson_date,
    aircraft_type = excluded.aircraft_type,
    aircraft_tail_number = excluded.aircraft_tail_number,
    category_sel = excluded.category_sel,
    category_mel = excluded.category_mel,
    time_dual = excluded.time_dual,
    time_pic = excluded.time_pic,
    time_solo = excluded.time_solo,
    condition_day = excluded.condition_day,
    condition_night = excluded.condition_night,
    condition_xc = excluded.condition_xc,
    condition_actual = excluded.condition_actual,
    condition_simulated = excluded.condition_simulated,
    approaches = excluded.approaches,
    landings_day = excluded.landings_day,
    landings_night = excluded.landings_night,
    route_from = excluded.route_from,
    route_to = excluded.route_to,
    flight_duration = excluded.flight_duration,
    remarks = excluded.remarks,
    scores = excluded.scores,
    final_status = excluded.final_status,
    record_status = excluded.record_status,
    passed = excluded.passed,
    updated_at = excluded.updated_at
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.save_my_training_record(jsonb) from public, anon;
grant execute on function public.save_my_training_record(jsonb) to authenticated;

create or replace function public.delete_my_training_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  delete from public.training_records
  where id = p_record_id
    and (
      created_by_user_id = auth.uid()
      or instructor_user_id = auth.uid()
      or private.is_organization_manager(organization_id, auth.uid())
    );
  if not found then
    raise exception 'Training record not found.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.delete_my_training_record(uuid) from public, anon;
grant execute on function public.delete_my_training_record(uuid) to authenticated;
