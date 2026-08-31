-- One real person is represented by one logical identity:
--   * an unregistered person is keyed by the instructor-owned saved_people row;
--   * a registered person is keyed by profiles.id and profiles.self_person_id;
--   * an accepted saved_person_account_link is a legacy/private alias, not a
--     second selectable person.

create or replace function private.is_placeholder_person_name(
  p_name text,
  p_email text default null,
  p_account_nickname text default null
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(coalesce(p_name, '')), '') is null
    or lower(btrim(p_name)) = lower(btrim(coalesce(p_email, '')))
    or lower(btrim(p_name)) = lower(btrim(coalesce(p_account_nickname, '')))
    or lower(btrim(p_name)) in ('my profile', 'linked account', 'linked student', 'member')
    or btrim(p_name) ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$';
$$;

revoke all on function private.is_placeholder_person_name(text, text, text)
  from public, anon, authenticated;

-- A profile may reference only its own unique self person. Existing accounts
-- are allowed to have no self person until a real formal name is supplied.
create unique index if not exists saved_people_one_self_per_user_idx
  on public.saved_people (user_id)
  where role = 'self';

create or replace function private.validate_profile_self_person_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.self_person_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.saved_people person
    where person.id = new.self_person_id
      and person.user_id = new.id
      and person.role = 'self'
  ) then
    raise exception 'A profile self person must be the account owner''s self record.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_profile_self_person_reference on public.profiles;
create trigger validate_profile_self_person_reference
before insert or update of self_person_id on public.profiles
for each row execute function private.validate_profile_self_person_reference();

create or replace function private.protect_referenced_self_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.profiles profile
    where profile.self_person_id = old.id
      and (profile.id <> new.user_id or new.role <> 'self')
  ) then
    raise exception 'A referenced self person cannot be reassigned or changed to another role.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_referenced_self_person on public.saved_people;
create trigger protect_referenced_self_person
before update of user_id, role on public.saved_people
for each row execute function private.protect_referenced_self_person();

revoke all on function private.validate_profile_self_person_reference()
  from public, anon, authenticated;
revoke all on function private.protect_referenced_self_person()
  from public, anon, authenticated;

drop function if exists public.list_my_student_candidates();
create function public.list_my_student_candidates()
returns table (
  identity_key text,
  record_person_id uuid,
  saved_person_id uuid,
  student_user_id uuid,
  canonical_person_id uuid,
  formal_name text,
  account_nickname text,
  effective_certificate_number text,
  certificate_source text,
  certificate_conflict boolean,
  identity_status text,
  organization_ids uuid[],
  organization_names text[],
  endorsement_ready boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return query
  with actor_organizations as (
    select membership.organization_id, organization.name
    from public.organization_members membership
    join public.organizations organization on organization.id = membership.organization_id
    where membership.user_id = auth.uid()
      and (
        membership.teaching_role = 'instructor'
        or membership.role in ('owner', 'organization_admin')
      )
  ),
  personal_sources as (
    select
      case when account_link.linked_user_id is null
        then 'saved:' || person.id::text
        else 'user:' || account_link.linked_user_id::text
      end as identity_key,
      person.id as saved_person_id,
      account_link.linked_user_id as student_user_id,
      null::uuid as organization_id,
      null::text as organization_name
    from public.saved_people person
    left join public.saved_person_account_links account_link
      on account_link.saved_person_id = person.id
     and account_link.owner_user_id = auth.uid()
    where person.user_id = auth.uid()
      and person.role = 'student'
  ),
  self_sources as (
    select
      'user:' || profile.id::text as identity_key,
      profile.self_person_id as saved_person_id,
      profile.id as student_user_id,
      student_membership.organization_id,
      organization.name as organization_name
    from public.profiles profile
    left join public.organization_members student_membership
      on student_membership.user_id = profile.id
     and student_membership.teaching_role = 'student'
    left join public.organizations organization
      on organization.id = student_membership.organization_id
    where profile.id = auth.uid()
      and profile.self_person_id is not null
  ),
  organization_sources as (
    select
      'user:' || student_member.user_id::text as identity_key,
      account_link.saved_person_id,
      student_member.user_id as student_user_id,
      student_member.organization_id,
      actor_organization.name as organization_name
    from actor_organizations actor_organization
    join public.organization_members student_member
      on student_member.organization_id = actor_organization.organization_id
     and student_member.teaching_role = 'student'
    left join public.saved_person_account_links account_link
      on account_link.owner_user_id = auth.uid()
     and account_link.linked_user_id = student_member.user_id
  ),
  all_sources as (
    select * from personal_sources
    union all
    select * from self_sources
    union all
    select * from organization_sources
  ),
  grouped as (
    select
      source.identity_key,
      (array_agg(source.saved_person_id order by source.saved_person_id)
        filter (where source.saved_person_id is not null))[1] as saved_person_id,
      (array_agg(source.student_user_id order by source.student_user_id)
        filter (where source.student_user_id is not null))[1] as student_user_id,
      coalesce(
        array_agg(distinct source.organization_id order by source.organization_id)
          filter (where source.organization_id is not null),
        '{}'::uuid[]
      ) as organization_ids
    from all_sources source
    group by source.identity_key
  )
  select
    grouped.identity_key,
    coalesce(grouped.saved_person_id, canonical_person.id, grouped.student_user_id),
    grouped.saved_person_id,
    grouped.student_user_id,
    canonical_person.id,
    case
      when grouped.student_user_id is null then nullif(btrim(saved_person.display_name), '')
      when not private.is_placeholder_person_name(
        canonical_person.display_name, account_profile.email, account_profile.display_name
      ) then btrim(canonical_person.display_name)
      when not private.is_placeholder_person_name(
        saved_person.display_name, account_profile.email, null
      ) then btrim(saved_person.display_name)
      else null
    end::text as formal_name,
    case when grouped.student_user_id is null then null else
      nullif(btrim(account_profile.display_name), '')
    end::text as account_nickname,
    case
      when grouped.student_user_id is null then
        coalesce(saved_certificate.certificate_number, nullif(btrim(saved_person.cert_number), ''))
      when coalesce(canonical_certificate.number_count, 0) = 1
        then canonical_certificate.certificate_number
      when coalesce(canonical_certificate.number_count, 0) = 0
        then coalesce(saved_certificate.certificate_number, nullif(btrim(saved_person.cert_number), ''))
      else null
    end::text as effective_certificate_number,
    case
      when grouped.student_user_id is null
        and coalesce(saved_certificate.certificate_number, nullif(btrim(saved_person.cert_number), '')) is not null
        then 'saved_people'
      when grouped.student_user_id is null then 'missing'
      when coalesce(canonical_certificate.number_count, 0) > 1 then 'conflict'
      when coalesce(canonical_certificate.number_count, 0) = 1 then 'canonical_profile'
      when coalesce(saved_certificate.certificate_number, nullif(btrim(saved_person.cert_number), '')) is not null
        then 'saved_people'
      else 'missing'
    end::text as certificate_source,
    (coalesce(canonical_certificate.number_count, 0) > 1) as certificate_conflict,
    case
      when grouped.student_user_id is null then 'unregistered'
      when saved_person.role = 'self' and grouped.student_user_id = auth.uid() then 'self'
      when grouped.saved_person_id is not null then 'linked'
      else 'organization_member'
    end::text as identity_status,
    grouped.organization_ids,
    coalesce((
      select array_agg(organization.name order by organization.id)
      from public.organizations organization
      where organization.id = any(grouped.organization_ids)
    ), '{}'::text[]) as organization_names,
    (
      case
        when grouped.student_user_id is null then nullif(btrim(saved_person.display_name), '') is not null
        when not private.is_placeholder_person_name(
          canonical_person.display_name, account_profile.email, account_profile.display_name
        ) then true
        when not private.is_placeholder_person_name(
          saved_person.display_name, account_profile.email, null
        ) then true
        else false
      end
      and coalesce(canonical_certificate.number_count, 0) <= 1
    ) as endorsement_ready
  from grouped
  left join public.saved_people saved_person
    on saved_person.id = grouped.saved_person_id
   and saved_person.user_id = auth.uid()
  left join public.profiles account_profile on account_profile.id = grouped.student_user_id
  left join public.saved_people canonical_person
    on canonical_person.id = account_profile.self_person_id
   and canonical_person.user_id = grouped.student_user_id
   and canonical_person.role = 'self'
  left join lateral (
    select nullif(btrim(certificate.certificate_number), '')::text as certificate_number
    from public.saved_person_certificates certificate
    where certificate.user_id = auth.uid()
      and certificate.person_id = grouped.saved_person_id
      and certificate.certificate_type = 'pilot'
      and nullif(btrim(certificate.certificate_number), '') is not null
    order by certificate.updated_at desc nulls last, certificate.created_at desc
    limit 1
  ) saved_certificate on true
  left join lateral (
    select
      count(distinct lower(btrim(certificate.certificate_number))) filter (
        where nullif(btrim(certificate.certificate_number), '') is not null
      )::integer as number_count,
      min(btrim(certificate.certificate_number)) filter (
        where nullif(btrim(certificate.certificate_number), '') is not null
      )::text as certificate_number
    from public.saved_person_certificates certificate
    where certificate.user_id = grouped.student_user_id
      and certificate.person_id = canonical_person.id
      and certificate.certificate_type = 'pilot'
  ) canonical_certificate on true
  order by formal_name nulls last, grouped.identity_key;
end;
$$;

revoke all on function public.list_my_student_candidates() from public, anon;
grant execute on function public.list_my_student_candidates() to authenticated;

-- Compatibility APIs now project the same canonical candidate rows instead of
-- maintaining independent name and identity rules.
drop function if exists public.list_organization_students(uuid);
create function public.list_organization_students(p_organization_id uuid)
returns table (
  student_user_id uuid,
  person_id uuid,
  saved_person_id uuid,
  formal_name text,
  account_nickname text,
  effective_certificate_number text,
  certificate_source text,
  endorsement_ready boolean,
  certificate_conflict boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    private.is_organization_instructor(p_organization_id, auth.uid())
    or private.can_manage_organization(p_organization_id, auth.uid())
  ) then
    raise exception 'Only organization instructors and administrators can view organization students.'
      using errcode = '42501';
  end if;

  return query
  select candidate.student_user_id, candidate.canonical_person_id,
    candidate.saved_person_id, candidate.formal_name,
    candidate.account_nickname, candidate.effective_certificate_number,
    candidate.certificate_source, candidate.endorsement_ready,
    candidate.certificate_conflict
  from public.list_my_student_candidates() candidate
  where p_organization_id = any(candidate.organization_ids)
  order by candidate.formal_name nulls last, candidate.identity_key;
end;
$$;

revoke all on function public.list_organization_students(uuid) from public, anon;
grant execute on function public.list_organization_students(uuid) to authenticated;

create or replace function public.list_my_endorsement_people()
returns table (
  saved_person_id uuid,
  linked_user_id uuid,
  formal_name text,
  account_nickname text,
  saved_certificate_number text,
  effective_certificate_number text,
  certificate_source text,
  endorsement_ready boolean,
  certificate_conflict boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return query
  select candidate.saved_person_id, candidate.student_user_id,
    candidate.formal_name, candidate.account_nickname,
    coalesce(owner_certificate.certificate_number, nullif(btrim(person.cert_number), ''))::text,
    candidate.effective_certificate_number, candidate.certificate_source,
    candidate.endorsement_ready, candidate.certificate_conflict
  from public.list_my_student_candidates() candidate
  join public.saved_people person
    on person.id = candidate.saved_person_id
   and person.user_id = auth.uid()
   and person.role = 'student'
  left join lateral (
    select nullif(btrim(certificate.certificate_number), '')::text as certificate_number
    from public.saved_person_certificates certificate
    where certificate.user_id = auth.uid()
      and certificate.person_id = person.id
      and certificate.certificate_type = 'pilot'
    order by certificate.updated_at desc nulls last, certificate.created_at desc
    limit 1
  ) owner_certificate on true
  order by candidate.formal_name nulls last, person.created_at;
end;
$$;

revoke all on function public.list_my_endorsement_people() from public, anon;
grant execute on function public.list_my_endorsement_people() to authenticated;

create or replace function public.list_my_linked_person_certificates()
returns table (
  id uuid,
  user_id uuid,
  person_id uuid,
  linked_user_id uuid,
  linked_display_name text,
  certificate_type text,
  certificate_number text,
  ratings text[],
  issue_date date,
  last_event_date date,
  event_type text,
  certificate_level text,
  additional_privileges jsonb,
  is_default_for_endorsements boolean,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return query
  select certificate.id, certificate.user_id, candidate.saved_person_id,
    candidate.student_user_id, candidate.formal_name,
    certificate.certificate_type, certificate.certificate_number,
    certificate.ratings, certificate.issue_date, certificate.last_event_date,
    certificate.event_type, certificate.certificate_level,
    certificate.additional_privileges, false, certificate.notes,
    certificate.created_at, certificate.updated_at
  from public.list_my_student_candidates() candidate
  join public.saved_person_certificates certificate
    on certificate.user_id = candidate.student_user_id
   and certificate.person_id = candidate.canonical_person_id
  where candidate.saved_person_id is not null
    and candidate.student_user_id is not null
  order by candidate.saved_person_id, certificate.created_at desc;
end;
$$;

revoke all on function public.list_my_linked_person_certificates() from public, anon;
grant execute on function public.list_my_linked_person_certificates() to authenticated;

-- Accepting a link repairs email/nickname placeholder self names and copies a
-- missing pilot certificate into the account-owned canonical profile. Valid,
-- conflicting account data is never silently overwritten.
create or replace function public.respond_saved_person_account_link_request(
  p_request_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.saved_person_account_link_requests;
  v_source_person public.saved_people;
  v_self_person_id uuid;
  v_profile_nickname text;
  v_profile_email text;
  v_source_certificate public.saved_person_certificates;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select * into v_request
  from public.saved_person_account_link_requests
  where id = p_request_id
  for update;
  if not found
    or v_request.target_user_id <> auth.uid()
    or v_request.status <> 'pending' then
    raise exception 'Link request is no longer available.' using errcode = 'P0002';
  end if;

  if not p_accept then
    update public.saved_person_account_link_requests
    set status = 'rejected', responded_at = timezone('utc', now())
    where id = p_request_id;
    return;
  end if;

  select * into v_source_person
  from public.saved_people
  where id = v_request.saved_person_id
    and user_id = v_request.owner_user_id
    and role = 'student';
  if not found then
    raise exception 'Saved student not found.' using errcode = 'P0002';
  end if;

  insert into public.saved_person_account_links (
    owner_user_id, saved_person_id, linked_user_id
  ) values (
    v_request.owner_user_id, v_request.saved_person_id, v_request.target_user_id
  );

  select profile.self_person_id, profile.display_name, profile.email
  into v_self_person_id, v_profile_nickname, v_profile_email
  from public.profiles profile
  where profile.id = v_request.target_user_id
  for update;

  if v_self_person_id is null then
    insert into public.saved_people (user_id, role, display_name, cert_number)
    values (
      v_request.target_user_id, 'self',
      v_source_person.display_name, v_source_person.cert_number
    )
    returning id into v_self_person_id;
    update public.profiles
    set self_person_id = v_self_person_id
    where id = v_request.target_user_id;
  elsif exists (
    select 1
    from public.saved_people person
    where person.id = v_self_person_id
      and private.is_placeholder_person_name(
        person.display_name, v_profile_email, v_profile_nickname
      )
  ) then
    update public.saved_people
    set display_name = v_source_person.display_name
    where id = v_self_person_id;
  end if;

  if not exists (
    select 1
    from public.saved_person_certificates certificate
    where certificate.user_id = v_request.target_user_id
      and certificate.person_id = v_self_person_id
      and certificate.certificate_type = 'pilot'
  ) then
    select * into v_source_certificate
    from public.saved_person_certificates certificate
    where certificate.user_id = v_request.owner_user_id
      and certificate.person_id = v_request.saved_person_id
      and certificate.certificate_type = 'pilot'
    order by certificate.updated_at desc nulls last, certificate.created_at desc
    limit 1;

    if found then
      insert into public.saved_person_certificates (
        user_id, person_id, certificate_type, certificate_number, ratings,
        issue_date, last_event_date, event_type, certificate_level,
        additional_privileges, notes
      ) values (
        v_request.target_user_id, v_self_person_id, 'pilot',
        v_source_certificate.certificate_number, v_source_certificate.ratings,
        v_source_certificate.issue_date, v_source_certificate.last_event_date,
        v_source_certificate.event_type, v_source_certificate.certificate_level,
        v_source_certificate.additional_privileges, v_source_certificate.notes
      );
    elsif nullif(btrim(coalesce(v_source_person.cert_number, '')), '') is not null then
      insert into public.saved_person_certificates (
        user_id, person_id, certificate_type, certificate_number
      ) values (
        v_request.target_user_id, v_self_person_id, 'pilot', v_source_person.cert_number
      );
    end if;
  end if;

  insert into public.student_profile_change_log (
    student_user_id, actor_user_id, change_kind, previous_value, next_value
  ) values (
    v_request.target_user_id, v_request.owner_user_id, 'link_merge',
    '{}'::jsonb,
    jsonb_build_object(
      'saved_person_id', v_request.saved_person_id,
      'formal_name', v_source_person.display_name
    )
  );

  update public.endorsement_records
  set student_user_id = v_request.target_user_id,
      updated_at = timezone('utc', now())
  where user_id = v_request.owner_user_id
    and student_id = v_request.saved_person_id
    and student_user_id is null;

  update public.saved_person_account_link_requests
  set status = 'accepted', responded_at = timezone('utc', now())
  where id = p_request_id;
end;
$$;

revoke all on function public.respond_saved_person_account_link_request(uuid, boolean)
  from public, anon;
grant execute on function public.respond_saved_person_account_link_request(uuid, boolean)
  to authenticated;

create or replace function public.delete_managed_student_certificate(
  p_student_user_id uuid,
  p_certificate_id uuid,
  p_organization_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_certificate public.saved_person_certificates;
begin
  if not private.can_edit_student_profile(
    auth.uid(), p_student_user_id, p_organization_id
  ) then
    raise exception 'You do not have permission to edit this student profile.'
      using errcode = '42501';
  end if;

  select certificate.* into v_certificate
  from public.saved_person_certificates certificate
  where certificate.id = p_certificate_id
    and certificate.user_id = p_student_user_id
    and certificate.person_id = private.student_self_person_id(p_student_user_id)
    and certificate.certificate_type = 'pilot'
  for update;
  if not found then
    raise exception 'Pilot certificate not found.' using errcode = 'P0002';
  end if;

  delete from public.saved_person_certificates
  where id = p_certificate_id;

  insert into public.student_profile_change_log (
    student_user_id, actor_user_id, organization_id,
    change_kind, previous_value, next_value
  ) values (
    p_student_user_id, auth.uid(), p_organization_id,
    'pilot_certificate', to_jsonb(v_certificate),
    jsonb_build_object('deleted', true)
  );
end;
$$;

revoke all on function public.delete_managed_student_certificate(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.delete_managed_student_certificate(uuid, uuid, uuid)
  to authenticated;

-- Organization scope is an explicit caller decision. The server resolves the
-- selected logical person, canonical name, certificate, and membership periods
-- in the same transaction that creates the immutable record.
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
  p_supersedes_record_id uuid default null
)
returns public.endorsement_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_saved_student_id uuid;
  v_student_user_id uuid;
  v_student_name text := nullif(btrim(p_student_name), '');
  v_student_cert_number text := nullif(btrim(p_student_cert_number), '');
  v_instructor_period_id uuid;
  v_student_period_id uuid;
  v_previous public.endorsement_records;
  v_result public.endorsement_records;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if p_id is null
    or nullif(btrim(p_instructor_name), '') is null
    or nullif(btrim(p_storage_path), '') is null then
    raise exception 'Student, instructor, record ID, and PDF path are required.'
      using errcode = '22023';
  end if;
  if split_part(p_storage_path, '/', 1) <> auth.uid()::text then
    raise exception 'The PDF path must belong to the signed-in user.'
      using errcode = '42501';
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
      raise exception 'Complete the student formal profile and resolve certificate conflicts before issuing this endorsement.'
        using errcode = '22023';
    end if;

    v_saved_student_id := v_candidate.saved_person_id;
    v_student_user_id := v_candidate.student_user_id;
    if v_student_name is distinct from v_candidate.formal_name
      or v_student_cert_number is distinct from v_candidate.effective_certificate_number then
      raise exception 'The formal student profile changed. Reselect the student before printing.'
        using errcode = '40001';
    end if;
    v_student_name := v_candidate.formal_name;
    v_student_cert_number := v_candidate.effective_certificate_number;
  elsif p_organization_id is not null then
    raise exception 'An organization endorsement requires a selected registered student.'
      using errcode = '22023';
  end if;

  if v_student_name is null then
    raise exception 'A student name is required.' using errcode = '22023';
  end if;

  if p_organization_id is not null then
    if not (p_organization_id = any(v_candidate.organization_ids)) then
      raise exception 'The selected student is not a current student in this organization.'
        using errcode = '42501';
    end if;

    select period.id into v_instructor_period_id
    from public.organization_members member
    join public.organization_membership_periods period
      on period.organization_id = member.organization_id
     and period.user_id = member.user_id
     and period.left_at is null
    where member.organization_id = p_organization_id
      and member.user_id = auth.uid()
      and member.teaching_role = 'instructor'
    for share of member, period;
    if v_instructor_period_id is null then
      raise exception 'Only a current organization instructor can share this record.'
        using errcode = '42501';
    end if;

    if v_student_user_id is null then
      raise exception 'The student must have a confirmed registered account.'
        using errcode = '22023';
    end if;
    select period.id into v_student_period_id
    from public.organization_members member
    join public.organization_membership_periods period
      on period.organization_id = member.organization_id
     and period.user_id = member.user_id
     and period.left_at is null
    where member.organization_id = p_organization_id
      and member.user_id = v_student_user_id
      and member.teaching_role = 'student'
    for share of member, period;
    if v_student_period_id is null then
      raise exception 'The registered student is not a current student member of this organization.'
        using errcode = '42501';
    end if;
  end if;

  if p_supersedes_record_id is not null then
    select * into v_previous
    from public.endorsement_records
    where id = p_supersedes_record_id
      and user_id = auth.uid()
    for update;
    if not found then
      raise exception 'The original endorsement record was not found.'
        using errcode = 'P0002';
    end if;
    if v_previous.organization_id is not null and (
      p_organization_id is distinct from v_previous.organization_id
      or v_instructor_period_id is null
      or v_student_period_id is null
    ) then
      p_organization_id := null;
      v_instructor_period_id := null;
      v_student_period_id := null;
    end if;
  end if;

  insert into public.endorsement_records (
    id, user_id, organization_id, student_id, student_user_id,
    instructor_membership_period_id, student_membership_period_id, scope_status,
    supersedes_record_id, student_name, student_cert_number, instructor_name,
    instructor_cert_number, endorsement_date, template_titles, storage_path,
    file_size_bytes
  ) values (
    p_id, auth.uid(), p_organization_id, v_saved_student_id, v_student_user_id,
    v_instructor_period_id, v_student_period_id,
    case when p_organization_id is null then 'personal' else 'confirmed' end,
    p_supersedes_record_id, v_student_name, v_student_cert_number,
    btrim(p_instructor_name), nullif(btrim(p_instructor_cert_number), ''),
    p_endorsement_date, coalesce(p_template_titles, '{}'::text[]),
    p_storage_path, p_file_size_bytes
  ) returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.create_endorsement_record(
  uuid, uuid, uuid, text, text, text, text, text, text[], text, integer, uuid
) from public, anon;
grant execute on function public.create_endorsement_record(
  uuid, uuid, uuid, text, text, text, text, text, text[], text, integer, uuid
) to authenticated;

-- Flight Briefs store the selected logical student and both membership periods;
-- a name snapshot alone is not sufficient for organization visibility.
alter table public.flight_briefs
  add column if not exists student_saved_person_id uuid
    references public.saved_people(id) on delete set null,
  add column if not exists student_user_id uuid
    references public.profiles(id) on delete set null,
  add column if not exists instructor_membership_period_id uuid
    references public.organization_membership_periods(id) on delete restrict,
  add column if not exists student_membership_period_id uuid
    references public.organization_membership_periods(id) on delete restrict;

create index if not exists flight_briefs_student_user_idx
  on public.flight_briefs (student_user_id, created_at desc)
  where student_user_id is not null;
create index if not exists flight_briefs_organization_student_idx
  on public.flight_briefs (organization_id, student_user_id, created_at desc)
  where organization_id is not null;

create or replace function private.prepare_flight_brief_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  if auth.uid() is null or new.created_by <> auth.uid() then
    raise exception 'A Flight Brief must belong to the signed-in user.'
      using errcode = '42501';
  end if;

  if new.student_saved_person_id is not null or new.student_user_id is not null then
    select candidate.* into v_candidate
    from public.list_my_student_candidates() candidate
    where candidate.saved_person_id = new.student_saved_person_id
       or candidate.student_user_id = new.student_user_id
       or candidate.record_person_id = new.student_saved_person_id
    order by (candidate.saved_person_id = new.student_saved_person_id) desc
    limit 1;
    if not found then
      raise exception 'The selected student identity is no longer available.'
        using errcode = 'P0002';
    end if;
    if not v_candidate.endorsement_ready then
      raise exception 'Complete the student formal profile before saving this Flight Brief.'
        using errcode = '22023';
    end if;
    new.student_saved_person_id := v_candidate.saved_person_id;
    new.student_user_id := v_candidate.student_user_id;
    new.student_name := v_candidate.formal_name;
  end if;

  if new.organization_id is null then
    new.membership_period_id := null;
    new.instructor_membership_period_id := null;
    new.student_membership_period_id := null;
    return new;
  end if;

  if new.student_user_id is null then
    raise exception 'An organization Flight Brief requires a registered student.'
      using errcode = '22023';
  end if;
  if not found or not (new.organization_id = any(v_candidate.organization_ids)) then
    raise exception 'The selected person is not a current student in this organization.'
      using errcode = '42501';
  end if;

  select period.id into new.instructor_membership_period_id
  from public.organization_members membership
  join public.organization_membership_periods period
    on period.organization_id = membership.organization_id
   and period.user_id = membership.user_id
   and period.left_at is null
  where membership.organization_id = new.organization_id
    and membership.user_id = new.created_by
    and (
      membership.teaching_role = 'instructor'
      or (
        membership.teaching_role = 'student'
        and new.created_by = new.student_user_id
      )
    )
  for share of membership, period;
  if new.instructor_membership_period_id is null then
    raise exception 'A current instructor or the selected student can save this organization Flight Brief.'
      using errcode = '42501';
  end if;

  select period.id into new.student_membership_period_id
  from public.organization_members membership
  join public.organization_membership_periods period
    on period.organization_id = membership.organization_id
   and period.user_id = membership.user_id
   and period.left_at is null
  where membership.organization_id = new.organization_id
    and membership.user_id = new.student_user_id
    and membership.teaching_role = 'student'
  for share of membership, period;
  if new.student_membership_period_id is null then
    raise exception 'The registered student is not a current student member of this organization.'
      using errcode = '42501';
  end if;

  new.membership_period_id := new.instructor_membership_period_id;
  return new;
end;
$$;

drop trigger if exists prepare_flight_brief_membership_period on public.flight_briefs;
drop trigger if exists prepare_flight_brief_identity on public.flight_briefs;
create trigger prepare_flight_brief_identity
before insert or update of organization_id, student_saved_person_id,
  student_user_id, student_name
on public.flight_briefs
for each row execute function private.prepare_flight_brief_identity();

revoke all on function private.prepare_flight_brief_identity()
  from public, anon, authenticated;

create or replace function public.create_and_finalize_flight_brief(
  p_input jsonb,
  p_meter_type text default null,
  p_meter_value numeric default null,
  p_observed_at timestamptz default null,
  p_planned_meter_increase numeric default null
)
returns public.flight_briefs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_input jsonb := coalesce(p_input, '{}'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_input) <> 'object' then
    raise exception 'Flight brief input must be an object.' using errcode = '22023';
  end if;

  insert into public.flight_briefs (
    created_by, organization_id, student_saved_person_id, student_user_id,
    aircraft_id, aircraft_tail_number, student_name, instructor_name,
    flight_date, etd, eta, ete, flight_rules, route, status, brief_data,
    weather_snapshot, notam_snapshot, wb_snapshot
  ) values (
    auth.uid(), nullif(v_input->>'organization_id', '')::uuid,
    nullif(v_input->>'student_saved_person_id', '')::uuid,
    nullif(v_input->>'student_user_id', '')::uuid,
    nullif(v_input->>'aircraft_id', '')::uuid,
    coalesce(v_input->>'aircraft_tail_number', ''),
    coalesce(v_input->>'student_name', ''),
    coalesce(v_input->>'instructor_name', ''),
    nullif(v_input->>'flight_date', '')::date,
    nullif(v_input->>'etd', ''), nullif(v_input->>'eta', ''),
    nullif(v_input->>'ete', '')::numeric, nullif(v_input->>'flight_rules', ''),
    nullif(v_input->>'route', ''), 'draft',
    coalesce(v_input->'brief_data', '{}'::jsonb),
    coalesce(v_input->'weather_snapshot', '{}'::jsonb),
    coalesce(v_input->'notam_snapshot', '{}'::jsonb),
    coalesce(v_input->'wb_snapshot', '{}'::jsonb)
  ) returning id into v_id;

  return public.finalize_flight_brief(
    v_id, p_meter_type, p_meter_value, p_observed_at,
    p_planned_meter_increase
  );
end;
$$;

revoke all on function public.create_and_finalize_flight_brief(
  jsonb, text, numeric, timestamptz, numeric
) from public, anon;
grant execute on function public.create_and_finalize_flight_brief(
  jsonb, text, numeric, timestamptz, numeric
) to authenticated;

create or replace function public.copy_flight_brief_to_personal(p_brief_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_record public.flight_briefs;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  select * into source_record
  from public.flight_briefs
  where id = p_brief_id
    and created_by = auth.uid()
    and organization_id is not null;
  if not found then
    raise exception 'Organization Flight Brief not found.' using errcode = 'P0002';
  end if;

  insert into public.flight_briefs (
    created_by, organization_id, student_saved_person_id, student_user_id,
    aircraft_id, aircraft_tail_number, student_name, instructor_name,
    flight_date, etd, eta, ete, flight_rules, route, status, revision_number,
    supersedes_id, brief_data, mx_snapshot, weather_snapshot, notam_snapshot,
    wb_snapshot
  ) values (
    auth.uid(), null, source_record.student_saved_person_id,
    source_record.student_user_id, null, source_record.aircraft_tail_number,
    source_record.student_name, source_record.instructor_name,
    source_record.flight_date, source_record.etd, source_record.eta,
    source_record.ete, source_record.flight_rules, source_record.route,
    'draft', 1, null, source_record.brief_data, '{}'::jsonb,
    source_record.weather_snapshot, source_record.notam_snapshot,
    source_record.wb_snapshot
  ) returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.copy_flight_brief_to_personal(uuid) from public, anon;
grant execute on function public.copy_flight_brief_to_personal(uuid) to authenticated;

create or replace function public.create_flight_brief_revision(p_brief_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_record public.flight_briefs;
  new_id uuid;
begin
  select * into source_record
  from public.flight_briefs
  where id = p_brief_id;
  if not found
    or source_record.created_by <> auth.uid()
    or source_record.status not in ('finalized', 'superseded') then
    raise exception 'Only your finalized Flight Brief can be revised.'
      using errcode = '42501';
  end if;

  insert into public.flight_briefs (
    created_by, organization_id, student_saved_person_id, student_user_id,
    aircraft_id, aircraft_tail_number, student_name, instructor_name,
    flight_date, etd, eta, ete, flight_rules, route, revision_number,
    supersedes_id, brief_data, weather_snapshot, notam_snapshot, wb_snapshot
  ) values (
    auth.uid(), source_record.organization_id,
    source_record.student_saved_person_id, source_record.student_user_id,
    source_record.aircraft_id, source_record.aircraft_tail_number,
    source_record.student_name, source_record.instructor_name,
    source_record.flight_date, source_record.etd, source_record.eta,
    source_record.ete, source_record.flight_rules, source_record.route,
    source_record.revision_number + 1, source_record.id,
    source_record.brief_data, source_record.weather_snapshot,
    source_record.notam_snapshot, source_record.wb_snapshot
  ) returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.create_flight_brief_revision(uuid) from public, anon;
grant execute on function public.create_flight_brief_revision(uuid) to authenticated;

create or replace function public.share_personal_flight_brief_with_organization(
  p_brief_id uuid,
  p_organization_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.flight_briefs;
  v_shared_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  select * into v_source
  from public.flight_briefs
  where id = p_brief_id
    and created_by = auth.uid()
    and organization_id is null
    and status in ('finalized', 'superseded')
  for share;
  if not found then
    raise exception 'Finalized Personal Flight Brief not found.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.flight_brief_organization_shares
    where source_brief_id = p_brief_id
      and organization_id = p_organization_id
  ) then
    raise exception 'This Flight Brief has already been shared with that organization.'
      using errcode = '23505';
  end if;

  insert into public.flight_briefs (
    created_by, organization_id, student_saved_person_id, student_user_id,
    aircraft_id, aircraft_tail_number, student_name, instructor_name,
    flight_date, etd, eta, ete, flight_rules, route, status, revision_number,
    supersedes_id, brief_data, mx_snapshot, weather_snapshot, notam_snapshot,
    wb_snapshot, finalized_at
  ) values (
    auth.uid(), p_organization_id, v_source.student_saved_person_id,
    v_source.student_user_id, v_source.aircraft_id,
    v_source.aircraft_tail_number, v_source.student_name,
    v_source.instructor_name, v_source.flight_date, v_source.etd,
    v_source.eta, v_source.ete, v_source.flight_rules, v_source.route,
    v_source.status, v_source.revision_number, null, v_source.brief_data,
    v_source.mx_snapshot, v_source.weather_snapshot,
    v_source.notam_snapshot, v_source.wb_snapshot, v_source.finalized_at
  ) returning id into v_shared_id;

  insert into public.flight_brief_organization_shares (
    source_brief_id, organization_id, shared_brief_id, shared_by
  ) values (p_brief_id, p_organization_id, v_shared_id, auth.uid());
  return v_shared_id;
end;
$$;

revoke all on function public.share_personal_flight_brief_with_organization(uuid, uuid)
  from public, anon;
grant execute on function public.share_personal_flight_brief_with_organization(uuid, uuid)
  to authenticated;

drop policy if exists flight_briefs_select_authorized on public.flight_briefs;
create policy flight_briefs_select_authorized
on public.flight_briefs for select to authenticated
using (
  created_by = (select auth.uid())
  or (
    student_user_id = (select auth.uid())
    and status in ('finalized', 'superseded')
  )
  or (
    status in ('finalized', 'superseded')
    and organization_id is not null
    and instructor_membership_period_id is not null
    and student_membership_period_id is not null
    and (
      (select private.can_manage_organization(organization_id))
      or (select private.is_organization_instructor(organization_id))
    )
  )
);
