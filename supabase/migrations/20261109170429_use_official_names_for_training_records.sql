-- Training records are legal training documents. Resolve names from the
-- organization/canonical person records, never from an account nickname.

create or replace function private.training_record_official_name(
  p_organization_id uuid,
  p_user_id uuid,
  p_person_id uuid,
  p_fallback text
)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select nullif(btrim(person.organization_display_name), '')
      from public.organization_people person
      where person.organization_id = p_organization_id
        and person.user_id = p_user_id
        and person.status <> 'archived'
      order by person.linked_at desc nulls last, person.created_at desc
      limit 1
    ),
    (
      select nullif(btrim(person.display_name), '')
      from public.saved_people person
      where person.id = p_person_id
      limit 1
    ),
    (
      select nullif(btrim(person.display_name), '')
      from public.profiles profile
      join public.saved_people person
        on person.id = profile.self_person_id
       and person.user_id = profile.id
       and person.role = 'self'
      where profile.id = p_user_id
      limit 1
    ),
    nullif(btrim(p_fallback), ''),
    'Unknown'
  );
$$;

revoke all on function private.training_record_official_name(uuid, uuid, uuid, text)
  from public, anon, authenticated;

create or replace function private.set_training_record_official_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.student_name := private.training_record_official_name(
    new.organization_id,
    new.student_user_id,
    new.student_person_id,
    new.student_name
  );
  new.instructor_name := private.training_record_official_name(
    new.organization_id,
    new.instructor_user_id,
    null,
    new.instructor_name
  );
  return new;
end;
$$;

revoke all on function private.set_training_record_official_names()
  from public, anon, authenticated;

drop trigger if exists set_training_record_official_names
  on public.training_records;
create trigger set_training_record_official_names
before insert or update of
  organization_id,
  instructor_user_id,
  student_person_id,
  student_user_id,
  student_name,
  instructor_name
on public.training_records
for each row execute function private.set_training_record_official_names();

create or replace function public.list_my_training_records()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then '[]'::jsonb
    else coalesce(
      jsonb_agg(
        to_jsonb(record_row) || jsonb_build_object(
          'student_name', private.training_record_official_name(
            record_row.organization_id,
            record_row.student_user_id,
            record_row.student_person_id,
            record_row.student_name
          ),
          'instructor_name', private.training_record_official_name(
            record_row.organization_id,
            record_row.instructor_user_id,
            null,
            record_row.instructor_name
          )
        )
        order by record_row.lesson_date desc, record_row.created_at desc
      ),
      '[]'::jsonb
    )
  end
  from public.training_records record_row
  where record_row.created_by_user_id = auth.uid()
     or record_row.instructor_user_id = auth.uid()
     or record_row.student_user_id = auth.uid();
$$;

revoke all on function public.list_my_training_records() from public, anon;
grant execute on function public.list_my_training_records() to authenticated;

create or replace function public.list_training_record_instructors(
  p_organization_id uuid
)
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
    raise exception 'You do not have permission to view instructors.'
      using errcode = '42501';
  end if;

  return query
  select
    member.user_id,
    private.training_record_official_name(
      p_organization_id,
      member.user_id,
      null,
      coalesce(nullif(split_part(profile.email, '@', 1), ''), 'Instructor')
    )::text
  from public.organization_members member
  join public.profiles profile on profile.id = member.user_id
  where member.organization_id = p_organization_id
    and member.teaching_role = 'instructor'
  order by 2;
end;
$$;

revoke all on function public.list_training_record_instructors(uuid)
  from public, anon;
grant execute on function public.list_training_record_instructors(uuid)
  to authenticated;

create or replace function public.list_organization_training_records(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null
     or not private.has_organization_permission(
       p_organization_id,
       'endorsements',
       auth.uid()
     ) then
    raise exception 'Training record organization access is required.'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(record_row) || jsonb_build_object(
        'student_name', private.training_record_official_name(
          record_row.organization_id,
          record_row.student_user_id,
          record_row.student_person_id,
          record_row.student_name
        ),
        'instructor_name', private.training_record_official_name(
          record_row.organization_id,
          record_row.instructor_user_id,
          null,
          record_row.instructor_name
        )
      )
      order by record_row.lesson_date desc, record_row.created_at desc
    ),
    '[]'::jsonb
  )
  into result
  from public.training_records record_row
  where record_row.organization_id = p_organization_id;

  return result;
end;
$$;

revoke all on function public.list_organization_training_records(uuid)
  from public, anon;
grant execute on function public.list_organization_training_records(uuid)
  to authenticated, service_role;
