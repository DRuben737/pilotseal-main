-- Organization visibility follows the issuing instructor's immutable membership
-- periods. Student membership is deliberately not part of the access decision.

alter table public.endorsement_records
  add column if not exists generator_payload jsonb;

create or replace function private.sync_endorsement_record_organization_access(
  p_record_id uuid,
  p_access_source text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.endorsement_records;
  v_count integer := 0;
  v_source text := case
    when p_access_source in ('automatic_creation', 'identity_link') then p_access_source
    else 'automatic_creation'
  end;
begin
  select * into v_record
  from public.endorsement_records
  where id = p_record_id
  for update;

  if not found then
    return 0;
  end if;

  perform period.id
  from public.organization_membership_periods period
  where period.user_id = v_record.user_id
    and period.joined_at <= v_record.created_at
    and (period.left_at is null or period.left_at >= v_record.created_at)
  order by period.organization_id, period.id
  for share of period;

  insert into private.endorsement_record_organization_access (
    record_id, organization_id, instructor_membership_period_id,
    student_membership_period_id, access_source
  )
  select distinct on (period.organization_id)
    v_record.id,
    period.organization_id,
    period.id,
    null,
    v_source
  from public.organization_membership_periods period
  where period.user_id = v_record.user_id
    and period.joined_at <= v_record.created_at
    and (period.left_at is null or period.left_at >= v_record.created_at)
  order by period.organization_id, period.joined_at desc, period.id
  on conflict (record_id, organization_id) do update
    set instructor_membership_period_id = excluded.instructor_membership_period_id,
        student_membership_period_id = null,
        access_source = excluded.access_source;

  delete from private.endorsement_record_organization_access access
  where access.record_id = v_record.id
    and access.access_source <> 'legacy_review'
    and not exists (
      select 1
      from public.organization_membership_periods period
      where period.id = access.instructor_membership_period_id
        and period.user_id = v_record.user_id
        and period.organization_id = access.organization_id
        and period.joined_at <= v_record.created_at
        and (period.left_at is null or period.left_at >= v_record.created_at)
    );

  select count(*)::integer into v_count
  from private.endorsement_record_organization_access access
  where access.record_id = v_record.id;

  if v_count > 0 and v_record.scope_status <> 'confirmed' then
    update public.endorsement_records
    set scope_status = 'confirmed', updated_at = timezone('utc', now())
    where id = v_record.id;
  elsif v_count = 0
    and v_record.scope_status = 'confirmed'
    and v_record.legacy_reviewed_at is null then
    update public.endorsement_records
    set scope_status = 'personal', updated_at = timezone('utc', now())
    where id = v_record.id;
  end if;

  return v_count;
end;
$$;

revoke all on function private.sync_endorsement_record_organization_access(uuid, text)
  from public, anon, authenticated;

-- Rebuild every derived organization mapping from immutable issue time and the
-- instructor's membership history. The access table is derived data.
delete from private.endorsement_record_organization_access
where access_source <> 'legacy_review';

do $$
declare
  endorsement_record record;
begin
  for endorsement_record in
    select id from public.endorsement_records order by id
  loop
    perform private.sync_endorsement_record_organization_access(
      endorsement_record.id,
      'automatic_creation'
    );
  end loop;
end
$$;

create or replace function public.create_endorsement_record(
  p_id uuid,
  p_organization_id uuid,
  p_student_id uuid,
  p_student_name text,
  p_student_cert_number text,
  p_instructor_name text,
  p_instructor_cert_number text,
  p_endorsement_date text,
  p_template_titles text[],
  p_storage_path text,
  p_file_size_bytes integer,
  p_supersedes_record_id uuid,
  p_generator_payload jsonb
)
returns public.endorsement_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.endorsement_records;
begin
  v_result := public.create_endorsement_record(
    p_id,
    p_organization_id,
    p_student_id,
    p_student_name,
    p_student_cert_number,
    p_instructor_name,
    p_instructor_cert_number,
    p_endorsement_date,
    p_template_titles,
    p_storage_path,
    p_file_size_bytes,
    p_supersedes_record_id
  );

  update public.endorsement_records
  set generator_payload = coalesce(p_generator_payload, '{}'::jsonb),
      updated_at = timezone('utc', now())
  where id = p_id
    and user_id = auth.uid()
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.create_endorsement_record(
  uuid, uuid, uuid, text, text, text, text, text, text[], text, integer, uuid, jsonb
) from public, anon;
grant execute on function public.create_endorsement_record(
  uuid, uuid, uuid, text, text, text, text, text, text[], text, integer, uuid, jsonb
) to authenticated;

create or replace function public.replace_endorsement_record(
  p_record_id uuid,
  p_student_id uuid,
  p_student_name text,
  p_student_cert_number text,
  p_instructor_name text,
  p_instructor_cert_number text,
  p_endorsement_date text,
  p_template_titles text[],
  p_storage_path text,
  p_file_size_bytes integer,
  p_generator_payload jsonb
)
returns public.endorsement_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.endorsement_records;
  v_candidate record;
  v_saved_student_id uuid;
  v_student_user_id uuid;
  v_student_name text := nullif(btrim(p_student_name), '');
  v_student_cert_number text := nullif(btrim(p_student_cert_number), '');
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select * into v_record
  from public.endorsement_records record
  where record.id = p_record_id
    and record.user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Only the issuing instructor can replace this endorsement.'
      using errcode = '42501';
  end if;
  if nullif(btrim(p_instructor_name), '') is null
    or nullif(btrim(p_endorsement_date), '') is null
    or coalesce(array_length(p_template_titles, 1), 0) = 0
    or nullif(btrim(p_storage_path), '') is null then
    raise exception 'Instructor, date, templates, and replacement PDF are required.'
      using errcode = '22023';
  end if;
  if split_part(p_storage_path, '/', 1) <> auth.uid()::text then
    raise exception 'The replacement PDF path must belong to the issuing instructor.'
      using errcode = '42501';
  end if;
  if p_storage_path = v_record.storage_path then
    raise exception 'Upload the replacement PDF to a new temporary path first.'
      using errcode = '22023';
  end if;

  if p_student_id is not null then
    select candidate.* into v_candidate
    from public.list_my_student_candidates() candidate
    where candidate.record_person_id = p_student_id
       or candidate.saved_person_id = p_student_id
       or candidate.canonical_person_id = p_student_id
       or candidate.student_user_id = p_student_id
    order by (candidate.record_person_id = p_student_id) desc
    limit 1;

    if not found then
      raise exception 'The selected student identity is no longer available.'
        using errcode = 'P0002';
    end if;
    if not v_candidate.endorsement_ready then
      raise exception 'Complete the student formal profile and resolve certificate conflicts before replacing this endorsement.'
        using errcode = '22023';
    end if;

    v_saved_student_id := v_candidate.saved_person_id;
    v_student_user_id := v_candidate.student_user_id;
    if v_student_name is distinct from v_candidate.formal_name
      or v_student_cert_number is distinct from v_candidate.effective_certificate_number then
      raise exception 'The formal student profile changed. Reselect the student before replacing the endorsement.'
        using errcode = '40001';
    end if;
    v_student_name := v_candidate.formal_name;
    v_student_cert_number := v_candidate.effective_certificate_number;
  end if;

  if v_student_name is null then
    raise exception 'A student name is required.' using errcode = '22023';
  end if;

  update public.endorsement_records
  set student_id = v_saved_student_id,
      student_user_id = v_student_user_id,
      student_name = v_student_name,
      student_cert_number = v_student_cert_number,
      instructor_name = btrim(p_instructor_name),
      instructor_cert_number = nullif(btrim(p_instructor_cert_number), ''),
      endorsement_date = btrim(p_endorsement_date),
      template_titles = p_template_titles,
      storage_path = p_storage_path,
      file_size_bytes = p_file_size_bytes,
      generator_payload = coalesce(p_generator_payload, '{}'::jsonb),
      updated_at = timezone('utc', now())
  where id = p_record_id
  returning * into v_record;

  return v_record;
end;
$$;

revoke all on function public.replace_endorsement_record(
  uuid, uuid, text, text, text, text, text, text[], text, integer, jsonb
) from public, anon;
grant execute on function public.replace_endorsement_record(
  uuid, uuid, text, text, text, text, text, text[], text, integer, jsonb
) to authenticated;
