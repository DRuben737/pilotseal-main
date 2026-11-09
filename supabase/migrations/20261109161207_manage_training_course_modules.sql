-- Platform-admin maintenance for shared USATS Part 141 course modules.

create or replace function public.list_platform_training_courses()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
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
    ) order by course.title
  ), '[]'::jsonb)
  into result
  from public.training_courses course
  where course.status <> 'retired';

  return result;
end;
$$;

revoke all on function public.list_platform_training_courses() from public, anon;
grant execute on function public.list_platform_training_courses() to authenticated;

create or replace function public.update_training_course_module(
  p_module_id uuid,
  p_stage_number integer,
  p_module_number integer,
  p_module_type text,
  p_duration_label text,
  p_duration_hours numeric,
  p_lesson_objective text,
  p_study_material text,
  p_completion_standards text,
  p_source_page integer,
  p_line_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  line_item jsonb;
  line_item_id uuid;
  line_item_ids uuid[] := '{}'::uuid[];
  line_item_position integer;
  line_item_score integer;
  line_item_text text;
begin
  if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;

  if p_module_id is null or not exists (
    select 1 from public.training_course_modules module where module.id = p_module_id
  ) then
    raise exception 'Training course module not found.' using errcode = 'P0002';
  end if;

  if p_stage_number < 1 or p_module_number < 1 then
    raise exception 'Stage and module numbers must be greater than zero.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_module_type, '')) = ''
    or btrim(coalesce(p_duration_label, '')) = ''
    or btrim(coalesce(p_lesson_objective, '')) = ''
  then
    raise exception 'Module type, duration, and lesson objective are required.' using errcode = '22023';
  end if;
  if p_duration_hours is not null and p_duration_hours <= 0 then
    raise exception 'Duration hours must be greater than zero.' using errcode = '22023';
  end if;
  if p_source_page < 1 then
    raise exception 'Source page must be greater than zero.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_line_items, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_line_items, '[]'::jsonb)) > 100
  then
    raise exception 'Line items must be an array with no more than 100 entries.' using errcode = '22023';
  end if;

  update public.training_course_modules
  set stage_number = p_stage_number,
      module_number = p_module_number,
      module_type = btrim(p_module_type),
      duration_label = btrim(p_duration_label),
      duration_hours = p_duration_hours,
      lesson_objective = btrim(p_lesson_objective),
      study_material = coalesce(p_study_material, ''),
      completion_standards = coalesce(p_completion_standards, ''),
      source_page = p_source_page,
      updated_at = timezone('utc', now())
  where id = p_module_id;

  update public.training_module_line_items
  set position = position + 1000
  where module_id = p_module_id;

  for line_item, line_item_position in
    select value, ordinality::integer
    from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) with ordinality
  loop
    line_item_text := btrim(coalesce(line_item->>'text', ''));
    if char_length(line_item_text) not between 1 and 300 then
      raise exception 'Each line item must contain between 1 and 300 characters.' using errcode = '22023';
    end if;

    line_item_score := case
      when line_item->'minimum_score' is null or jsonb_typeof(line_item->'minimum_score') = 'null' then null
      else (line_item->>'minimum_score')::integer
    end;
    if line_item_score is not null and line_item_score not between 1 and 5 then
      raise exception 'Minimum scores must be between 1 and 5.' using errcode = '22023';
    end if;

    if nullif(btrim(coalesce(line_item->>'id', '')), '') is not null then
      line_item_id := (line_item->>'id')::uuid;
      if not exists (
        select 1
        from public.training_module_line_items existing
        where existing.id = line_item_id and existing.module_id = p_module_id
      ) then
        raise exception 'A line item does not belong to this module.' using errcode = '22023';
      end if;

      update public.training_module_line_items
      set position = line_item_position,
          item_text = line_item_text,
          minimum_score = line_item_score,
          updated_at = timezone('utc', now())
      where id = line_item_id;
    else
      insert into public.training_module_line_items (
        module_id,
        position,
        item_text,
        minimum_score
      ) values (
        p_module_id,
        line_item_position,
        line_item_text,
        line_item_score
      ) returning id into line_item_id;
    end if;

    line_item_ids := array_append(line_item_ids, line_item_id);
  end loop;

  delete from public.training_module_line_items item
  where item.module_id = p_module_id
    and not (item.id = any(line_item_ids));
end;
$$;

revoke all on function public.update_training_course_module(
  uuid, integer, integer, text, text, numeric, text, text, text, integer, jsonb
) from public, anon;
grant execute on function public.update_training_course_module(
  uuid, integer, integer, text, text, numeric, text, text, text, integer, jsonb
) to authenticated;
