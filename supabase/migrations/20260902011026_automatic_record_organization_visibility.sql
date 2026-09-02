-- Records exist once. Organization visibility is derived and frozen separately
-- for every organization in which the relevant people were valid members.

create table private.endorsement_record_organization_access (
  record_id uuid not null references public.endorsement_records(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  instructor_membership_period_id uuid references public.organization_membership_periods(id) on delete restrict,
  student_membership_period_id uuid references public.organization_membership_periods(id) on delete restrict,
  access_source text not null check (access_source in (
    'automatic_creation', 'identity_link', 'automatic_backfill',
    'legacy_scope', 'legacy_review'
  )),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (record_id, organization_id)
);

create index endorsement_record_org_access_organization_idx
  on private.endorsement_record_organization_access (organization_id, record_id);
create index endorsement_record_org_access_instructor_period_idx
  on private.endorsement_record_organization_access (instructor_membership_period_id)
  where instructor_membership_period_id is not null;
create index endorsement_record_org_access_student_period_idx
  on private.endorsement_record_organization_access (student_membership_period_id)
  where student_membership_period_id is not null;

alter table private.endorsement_record_organization_access enable row level security;
revoke all on private.endorsement_record_organization_access from public, anon, authenticated;

create table private.flight_brief_organization_access (
  brief_id uuid not null references public.flight_briefs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  creator_membership_period_id uuid references public.organization_membership_periods(id) on delete restrict,
  student_membership_period_id uuid references public.organization_membership_periods(id) on delete restrict,
  access_source text not null check (access_source in (
    'automatic_write', 'automatic_backfill', 'legacy_scope', 'legacy_share'
  )),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (brief_id, organization_id)
);

create index flight_brief_org_access_organization_idx
  on private.flight_brief_organization_access (organization_id, brief_id);
create index flight_brief_org_access_creator_period_idx
  on private.flight_brief_organization_access (creator_membership_period_id)
  where creator_membership_period_id is not null;
create index flight_brief_org_access_student_period_idx
  on private.flight_brief_organization_access (student_membership_period_id)
  where student_membership_period_id is not null;

alter table private.flight_brief_organization_access enable row level security;
revoke all on private.flight_brief_organization_access from public, anon, authenticated;

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

  if not found
    or v_record.student_user_id is null
    or v_record.scope_status = 'pending_review' then
    return 0;
  end if;

  -- Lock every qualifying membership in a deterministic order so a concurrent
  -- leave cannot land between validation and access creation.
  perform instructor_member.organization_id
  from public.organization_members instructor_member
  join public.organization_members student_member
    on student_member.organization_id = instructor_member.organization_id
   and student_member.user_id = v_record.student_user_id
   and student_member.teaching_role = 'student'
  join public.organization_membership_periods instructor_period
    on instructor_period.organization_id = instructor_member.organization_id
   and instructor_period.user_id = instructor_member.user_id
   and instructor_period.joined_at <= v_record.created_at
   and (instructor_period.left_at is null or instructor_period.left_at >= v_record.created_at)
  join public.organization_membership_periods student_period
    on student_period.organization_id = student_member.organization_id
   and student_period.user_id = student_member.user_id
   and student_period.joined_at <= v_record.created_at
   and (student_period.left_at is null or student_period.left_at >= v_record.created_at)
  where instructor_member.user_id = v_record.user_id
    and instructor_member.teaching_role = 'instructor'
  order by instructor_member.organization_id, instructor_period.id, student_period.id
  for share of instructor_member, student_member, instructor_period, student_period;

  insert into private.endorsement_record_organization_access (
    record_id, organization_id, instructor_membership_period_id,
    student_membership_period_id, access_source
  )
  select distinct on (instructor_member.organization_id)
    v_record.id, instructor_member.organization_id, instructor_period.id,
    student_period.id, v_source
  from public.organization_members instructor_member
  join public.organization_members student_member
    on student_member.organization_id = instructor_member.organization_id
   and student_member.user_id = v_record.student_user_id
   and student_member.teaching_role = 'student'
  join public.organization_membership_periods instructor_period
    on instructor_period.organization_id = instructor_member.organization_id
   and instructor_period.user_id = instructor_member.user_id
   and instructor_period.joined_at <= v_record.created_at
   and (instructor_period.left_at is null or instructor_period.left_at >= v_record.created_at)
  join public.organization_membership_periods student_period
    on student_period.organization_id = student_member.organization_id
   and student_period.user_id = student_member.user_id
   and student_period.joined_at <= v_record.created_at
   and (student_period.left_at is null or student_period.left_at >= v_record.created_at)
  where instructor_member.user_id = v_record.user_id
    and instructor_member.teaching_role = 'instructor'
  order by instructor_member.organization_id,
    instructor_period.joined_at desc, student_period.joined_at desc
  on conflict (record_id, organization_id) do nothing;

  select count(*)::integer into v_count
  from private.endorsement_record_organization_access access
  where access.record_id = v_record.id;

  if v_count > 0 and v_record.scope_status = 'personal' then
    update public.endorsement_records
    set scope_status = 'confirmed', updated_at = timezone('utc', now())
    where id = v_record.id;
  end if;

  return v_count;
end;
$$;

revoke all on function private.sync_endorsement_record_organization_access(uuid, text)
  from public, anon, authenticated;

create or replace function private.sync_endorsement_record_access_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_endorsement_record_organization_access(
    new.id,
    case when tg_op = 'INSERT' then 'automatic_creation' else 'identity_link' end
  );
  return new;
end;
$$;

revoke all on function private.sync_endorsement_record_access_trigger()
  from public, anon, authenticated;

drop trigger if exists sync_endorsement_record_organization_access
  on public.endorsement_records;
create trigger sync_endorsement_record_organization_access
after insert or update of student_user_id on public.endorsement_records
for each row execute function private.sync_endorsement_record_access_trigger();

-- Preserve explicit historical organization records, including reviewer-attested
-- records whose original membership-period IDs are unavailable.
insert into private.endorsement_record_organization_access (
  record_id, organization_id, instructor_membership_period_id,
  student_membership_period_id, access_source
)
select record.id, record.organization_id,
  record.instructor_membership_period_id, record.student_membership_period_id,
  'legacy_scope'
from public.endorsement_records record
where record.organization_id is not null
  and record.scope_status = 'confirmed'
on conflict (record_id, organization_id) do nothing;

-- Reconcile existing linked records only where both current member rows exist
-- and recorded periods prove that both memberships covered the record time.
insert into private.endorsement_record_organization_access (
  record_id, organization_id, instructor_membership_period_id,
  student_membership_period_id, access_source
)
select distinct on (record.id, instructor_member.organization_id)
  record.id, instructor_member.organization_id,
  instructor_period.id, student_period.id, 'automatic_backfill'
from public.endorsement_records record
join public.organization_members instructor_member
  on instructor_member.user_id = record.user_id
 and instructor_member.teaching_role = 'instructor'
join public.organization_members student_member
  on student_member.organization_id = instructor_member.organization_id
 and student_member.user_id = record.student_user_id
 and student_member.teaching_role = 'student'
join public.organization_membership_periods instructor_period
  on instructor_period.organization_id = instructor_member.organization_id
 and instructor_period.user_id = instructor_member.user_id
 and instructor_period.joined_at <= record.created_at
 and (instructor_period.left_at is null or instructor_period.left_at >= record.created_at)
join public.organization_membership_periods student_period
  on student_period.organization_id = student_member.organization_id
 and student_period.user_id = student_member.user_id
 and student_period.joined_at <= record.created_at
 and (student_period.left_at is null or student_period.left_at >= record.created_at)
where record.student_user_id is not null
  and record.scope_status <> 'pending_review'
order by record.id, instructor_member.organization_id,
  instructor_period.joined_at desc, student_period.joined_at desc
on conflict (record_id, organization_id) do nothing;

update public.endorsement_records record
set scope_status = 'confirmed', updated_at = timezone('utc', now())
where record.scope_status = 'personal'
  and exists (
    select 1
    from private.endorsement_record_organization_access access
    where access.record_id = record.id
  );

create or replace function private.endorsement_shared_with_organization(
  p_record_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.endorsement_record_organization_access access
    where access.record_id = p_record_id
      and access.organization_id = p_organization_id
  )
$$;

create or replace function private.endorsement_is_organization_shared(p_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.endorsement_record_organization_access access
    where access.record_id = p_record_id
  )
$$;

create or replace function private.can_view_endorsement_through_organization(
  p_record_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.endorsement_record_organization_access access
    join public.endorsement_records record on record.id = access.record_id
    where access.record_id = p_record_id
      and (
        private.can_manage_organization(access.organization_id, p_user_id)
        or (
          record.user_id = p_user_id
          and private.is_organization_instructor(access.organization_id, p_user_id)
        )
      )
  )
$$;

revoke all on function private.endorsement_shared_with_organization(uuid, uuid)
  from public, anon;
revoke all on function private.endorsement_is_organization_shared(uuid)
  from public, anon;
revoke all on function private.can_view_endorsement_through_organization(uuid, uuid)
  from public, anon;
grant execute on function private.endorsement_shared_with_organization(uuid, uuid)
  to authenticated;
grant execute on function private.endorsement_is_organization_shared(uuid)
  to authenticated;
grant execute on function private.can_view_endorsement_through_organization(uuid, uuid)
  to authenticated;

drop policy if exists endorsement_records_select_authorized
  on public.endorsement_records;
create policy endorsement_records_select_authorized
on public.endorsement_records for select to authenticated
using (
  user_id = (select auth.uid())
  or student_user_id = (select auth.uid())
  or private.can_view_endorsement_through_organization(id, (select auth.uid()))
  or (scope_status = 'pending_review' and (select private.is_platform_admin()))
);

drop policy if exists endorsement_records_update_personal_own
  on public.endorsement_records;
create policy endorsement_records_update_personal_own
on public.endorsement_records for update to authenticated
using (
  user_id = (select auth.uid())
  and scope_status = 'personal'
  and not private.endorsement_is_organization_shared(id)
)
with check (
  user_id = (select auth.uid())
  and scope_status = 'personal'
  and not private.endorsement_is_organization_shared(id)
);

drop policy if exists endorsement_records_delete_personal_own
  on public.endorsement_records;
create policy endorsement_records_delete_personal_own
on public.endorsement_records for delete to authenticated
using (
  user_id = (select auth.uid())
  and scope_status = 'personal'
  and not private.endorsement_is_organization_shared(id)
);

do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists endorsement_records_files_select_authorized on storage.objects';
    execute $policy$
      create policy endorsement_records_files_select_authorized
      on storage.objects for select to authenticated
      using (
        bucket_id = 'endorsement-records'
        and exists (
          select 1
          from public.endorsement_records record
          where record.storage_path = name
            and (
              record.user_id = (select auth.uid())
              or record.student_user_id = (select auth.uid())
              or private.can_view_endorsement_through_organization(record.id, (select auth.uid()))
              or (record.scope_status = 'pending_review' and (select private.is_platform_admin()))
            )
        )
      )
    $policy$;

    execute 'drop policy if exists endorsement_records_files_delete_personal on storage.objects';
    execute $policy$
      create policy endorsement_records_files_delete_personal
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'endorsement-records'
        and (select auth.uid())::text = (storage.foldername(name))[1]
        and (
          not exists (
            select 1 from public.endorsement_records record
            where record.storage_path = name
          )
          or exists (
            select 1 from public.endorsement_records record
            where record.storage_path = name
              and record.user_id = (select auth.uid())
              and record.scope_status = 'personal'
              and not private.endorsement_is_organization_shared(record.id)
          )
        )
      )
    $policy$;
  end if;
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
  end if;

  if v_student_name is null then
    raise exception 'A student name is required.' using errcode = '22023';
  end if;

  if p_supersedes_record_id is not null then
    perform 1
    from public.endorsement_records record
    where record.id = p_supersedes_record_id
      and record.user_id = auth.uid()
    for update;
    if not found then
      raise exception 'The original endorsement record was not found.'
        using errcode = 'P0002';
    end if;
  end if;

  -- p_organization_id is retained only for rolling deployment compatibility.
  -- The server derives all organization access; the client cannot choose it.
  if p_organization_id is not null then
    null;
  end if;

  insert into public.endorsement_records (
    id, user_id, organization_id, student_id, student_user_id,
    instructor_membership_period_id, student_membership_period_id, scope_status,
    supersedes_record_id, student_name, student_cert_number, instructor_name,
    instructor_cert_number, endorsement_date, template_titles, storage_path,
    file_size_bytes
  ) values (
    p_id, auth.uid(), null, v_saved_student_id, v_student_user_id,
    null, null, 'personal', p_supersedes_record_id,
    v_student_name, v_student_cert_number, btrim(p_instructor_name),
    nullif(btrim(p_instructor_cert_number), ''), p_endorsement_date,
    coalesce(p_template_titles, '{}'::text[]), p_storage_path,
    p_file_size_bytes
  );

  select * into v_result
  from public.endorsement_records
  where id = p_id;
  return v_result;
end;
$$;

revoke all on function public.create_endorsement_record(
  uuid, uuid, uuid, text, text, text, text, text, text[], text, integer, uuid
) from public, anon;
grant execute on function public.create_endorsement_record(
  uuid, uuid, uuid, text, text, text, text, text, text[], text, integer, uuid
) to authenticated;

create or replace function public.list_organization_endorsement_records(
  p_organization_id uuid
)
returns setof public.endorsement_records
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_manager boolean;
  v_instructor boolean;
begin
  v_manager := private.can_manage_organization(p_organization_id, auth.uid());
  v_instructor := private.is_organization_instructor(p_organization_id, auth.uid());
  if auth.uid() is null or not (v_manager or v_instructor) then
    raise exception 'Organization instructor or administrator access is required.'
      using errcode = '42501';
  end if;

  return query
  select record.*
  from public.endorsement_records record
  join private.endorsement_record_organization_access access
    on access.record_id = record.id
   and access.organization_id = p_organization_id
  where v_manager or record.user_id = auth.uid()
  order by record.created_at desc;
end;
$$;

revoke all on function public.list_organization_endorsement_records(uuid)
  from public, anon;
grant execute on function public.list_organization_endorsement_records(uuid)
  to authenticated;

create or replace function public.review_legacy_endorsement_scope_v2(
  p_record_id uuid,
  p_decision text,
  p_note text,
  p_confirm_historical_evidence boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.endorsement_records;
  v_student_user_id uuid;
  v_student_period uuid;
  v_instructor_period uuid;
  v_is_org_student boolean;
  v_evidence_kind text := 'not_applicable';
begin
  if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;
  if p_decision not in ('personal', 'confirmed', 'defer') then
    raise exception 'Decision must be personal, confirmed, or defer.' using errcode = '22023';
  end if;
  if p_decision = 'personal' and nullif(btrim(p_note), '') is null then
    raise exception 'A review note is required when moving a record to Personal.' using errcode = '22023';
  end if;

  select * into v_record
  from public.endorsement_records
  where id = p_record_id and scope_status = 'pending_review'
  for update;
  if not found then
    raise exception 'Pending legacy record not found.' using errcode = 'P0002';
  end if;

  if p_decision = 'confirmed' then
    if v_record.organization_id is null then
      raise exception 'Legacy organization evidence requires an organization.' using errcode = '22023';
    end if;

    select link.linked_user_id into v_student_user_id
    from public.saved_person_account_links link
    where link.saved_person_id = v_record.student_id
      and link.owner_user_id = v_record.user_id;
    if v_student_user_id is null then
      raise exception 'Link this saved student to their verified platform account first.' using errcode = '42501';
    end if;

    select (
      exists (
        select 1 from public.organization_members member
        where member.organization_id = v_record.organization_id
          and member.user_id = v_student_user_id
          and member.teaching_role = 'student'
      ) or exists (
        select 1 from public.organization_people person
        where person.organization_id = v_record.organization_id
          and person.user_id = v_student_user_id
          and person.teaching_role = 'student'
          and person.status in ('linked', 'left')
      )
    ) into v_is_org_student;
    if not coalesce(v_is_org_student, false) then
      raise exception 'The linked account must be a current or historical student member of this organization.' using errcode = '42501';
    end if;

    select id into v_student_period
    from public.organization_membership_periods
    where organization_id = v_record.organization_id
      and user_id = v_student_user_id
      and joined_at <= v_record.created_at
      and (left_at is null or left_at >= v_record.created_at)
    order by joined_at desc limit 1;
    select id into v_instructor_period
    from public.organization_membership_periods
    where organization_id = v_record.organization_id
      and user_id = v_record.user_id
      and joined_at <= v_record.created_at
      and (left_at is null or left_at >= v_record.created_at)
    order by joined_at desc limit 1;

    if v_student_period is null or v_instructor_period is null then
      if not p_confirm_historical_evidence then
        raise exception 'Confirm historical membership evidence to continue.' using errcode = '42501';
      end if;
      v_evidence_kind := 'reviewer_attestation';
    else
      v_evidence_kind := 'membership_periods';
    end if;

    update public.endorsement_records
    set student_user_id = v_student_user_id,
        student_membership_period_id = v_student_period,
        instructor_membership_period_id = v_instructor_period,
        scope_status = 'confirmed',
        legacy_reviewed_by = auth.uid(),
        legacy_reviewed_at = timezone('utc', now()),
        legacy_review_note = nullif(btrim(p_note), '')
    where id = p_record_id;

    insert into private.endorsement_record_organization_access (
      record_id, organization_id, instructor_membership_period_id,
      student_membership_period_id, access_source
    ) values (
      p_record_id, v_record.organization_id, v_instructor_period,
      v_student_period, 'legacy_review'
    )
    on conflict (record_id, organization_id) do update
    set instructor_membership_period_id = excluded.instructor_membership_period_id,
        student_membership_period_id = excluded.student_membership_period_id,
        access_source = excluded.access_source;
  elsif p_decision = 'personal' then
    delete from private.endorsement_record_organization_access
    where record_id = p_record_id;
    update public.endorsement_records
    set organization_id = null,
        instructor_membership_period_id = null,
        student_membership_period_id = null,
        scope_status = 'personal',
        legacy_reviewed_by = auth.uid(),
        legacy_reviewed_at = timezone('utc', now()),
        legacy_review_note = btrim(p_note)
    where id = p_record_id;
  end if;

  insert into public.legacy_endorsement_review_audit (
    record_id, reviewer_user_id, decision, student_user_id, evidence_kind, note
  ) values (
    p_record_id, auth.uid(), p_decision,
    case when p_decision = 'confirmed' then v_student_user_id else null end,
    v_evidence_kind, nullif(btrim(p_note), '')
  );
end;
$$;

revoke all on function public.review_legacy_endorsement_scope_v2(uuid, text, text, boolean)
  from public, anon;
grant execute on function public.review_legacy_endorsement_scope_v2(uuid, text, text, boolean)
  to authenticated;

drop trigger if exists notify_organization_endorsement_created
  on public.endorsement_records;

create or replace function private.notify_endorsement_organization_access_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.endorsement_records;
  v_organization_name text;
begin
  select * into v_record from public.endorsement_records where id = new.record_id;
  if v_record.student_user_id is null
    or v_record.student_user_id = v_record.user_id then
    return new;
  end if;
  select name into v_organization_name
  from public.organizations where id = new.organization_id;

  perform private.create_user_notification(
    v_record.student_user_id,
    'New endorsement record',
    v_record.instructor_name || ' created an endorsement record for you in ' || v_organization_name || '.',
    'organization', 'high', new.organization_id, v_organization_name,
    '/dashboard/records',
    'endorsement-record:' || new.record_id::text || ':organization:' || new.organization_id::text,
    v_record.user_id
  );
  return new;
end;
$$;

revoke all on function private.notify_endorsement_organization_access_created()
  from public, anon, authenticated;

drop trigger if exists notify_endorsement_organization_access_created
  on private.endorsement_record_organization_access;
create trigger notify_endorsement_organization_access_created
after insert on private.endorsement_record_organization_access
for each row execute function private.notify_endorsement_organization_access_created();

create or replace function private.sync_flight_brief_organization_access(
  p_brief_id uuid,
  p_access_source text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brief public.flight_briefs;
  v_effective_at timestamptz;
  v_count integer := 0;
  v_source text := case
    when p_access_source in ('automatic_write', 'automatic_backfill') then p_access_source
    else 'automatic_write'
  end;
begin
  select * into v_brief
  from public.flight_briefs
  where id = p_brief_id
  for update;
  if not found then return 0; end if;

  -- Draft access is provisional and follows the currently selected student.
  -- Finalized/superseded access is historical evidence and is never removed
  -- merely because a later status update happens after somebody leaves.
  if v_brief.status = 'draft' then
    delete from private.flight_brief_organization_access
    where brief_id = v_brief.id;
  end if;

  if v_brief.student_user_id is null then return 0; end if;
  v_effective_at := coalesce(v_brief.finalized_at, v_brief.updated_at, v_brief.created_at, timezone('utc', now()));

  perform creator_member.organization_id
  from public.organization_members creator_member
  join public.organization_members student_member
    on student_member.organization_id = creator_member.organization_id
   and student_member.user_id = v_brief.student_user_id
   and student_member.teaching_role = 'student'
  join public.organization_membership_periods creator_period
    on creator_period.organization_id = creator_member.organization_id
   and creator_period.user_id = creator_member.user_id
   and creator_period.joined_at <= v_effective_at
   and (creator_period.left_at is null or creator_period.left_at >= v_effective_at)
  join public.organization_membership_periods student_period
    on student_period.organization_id = student_member.organization_id
   and student_period.user_id = student_member.user_id
   and student_period.joined_at <= v_effective_at
   and (student_period.left_at is null or student_period.left_at >= v_effective_at)
  where creator_member.user_id = v_brief.created_by
    and (
      creator_member.teaching_role = 'instructor'
      or (
        v_brief.created_by = v_brief.student_user_id
        and creator_member.teaching_role = 'student'
      )
    )
  order by creator_member.organization_id, creator_period.id, student_period.id
  for share of creator_member, student_member, creator_period, student_period;

  insert into private.flight_brief_organization_access (
    brief_id, organization_id, creator_membership_period_id,
    student_membership_period_id, access_source
  )
  select distinct on (creator_member.organization_id)
    v_brief.id, creator_member.organization_id,
    creator_period.id, student_period.id, v_source
  from public.organization_members creator_member
  join public.organization_members student_member
    on student_member.organization_id = creator_member.organization_id
   and student_member.user_id = v_brief.student_user_id
   and student_member.teaching_role = 'student'
  join public.organization_membership_periods creator_period
    on creator_period.organization_id = creator_member.organization_id
   and creator_period.user_id = creator_member.user_id
   and creator_period.joined_at <= v_effective_at
   and (creator_period.left_at is null or creator_period.left_at >= v_effective_at)
  join public.organization_membership_periods student_period
    on student_period.organization_id = student_member.organization_id
   and student_period.user_id = student_member.user_id
   and student_period.joined_at <= v_effective_at
   and (student_period.left_at is null or student_period.left_at >= v_effective_at)
  where creator_member.user_id = v_brief.created_by
    and (
      creator_member.teaching_role = 'instructor'
      or (
        v_brief.created_by = v_brief.student_user_id
        and creator_member.teaching_role = 'student'
      )
    )
  order by creator_member.organization_id,
    creator_period.joined_at desc, student_period.joined_at desc
  on conflict (brief_id, organization_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.sync_flight_brief_organization_access(uuid, text)
  from public, anon, authenticated;

create or replace function private.sync_flight_brief_access_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    old.student_user_id is distinct from new.student_user_id
    or (old.status = 'draft' and new.status <> 'draft')
  ) then
    delete from private.flight_brief_organization_access
    where brief_id = new.id;
  end if;

  perform private.sync_flight_brief_organization_access(new.id, 'automatic_write');
  return new;
end;
$$;

revoke all on function private.sync_flight_brief_access_trigger()
  from public, anon, authenticated;

drop trigger if exists sync_flight_brief_organization_access
  on public.flight_briefs;
create trigger sync_flight_brief_organization_access
after insert or update of student_user_id, status on public.flight_briefs
for each row execute function private.sync_flight_brief_access_trigger();

-- Keep one logical record for old explicit shares: attach access to the Personal
-- source and leave the legacy copied row only as an audit artifact.
insert into private.flight_brief_organization_access (
  brief_id, organization_id, creator_membership_period_id,
  student_membership_period_id, access_source
)
select share.source_brief_id, share.organization_id,
  shared.instructor_membership_period_id, shared.student_membership_period_id,
  'legacy_share'
from public.flight_brief_organization_shares share
join public.flight_briefs shared on shared.id = share.shared_brief_id
on conflict (brief_id, organization_id) do nothing;

insert into private.flight_brief_organization_access (
  brief_id, organization_id, creator_membership_period_id,
  student_membership_period_id, access_source
)
select brief.id, brief.organization_id,
  brief.instructor_membership_period_id, brief.student_membership_period_id,
  'legacy_scope'
from public.flight_briefs brief
where brief.organization_id is not null
  and not exists (
    select 1 from public.flight_brief_organization_shares share
    where share.shared_brief_id = brief.id
  )
on conflict (brief_id, organization_id) do nothing;

insert into private.flight_brief_organization_access (
  brief_id, organization_id, creator_membership_period_id,
  student_membership_period_id, access_source
)
select distinct on (brief.id, creator_member.organization_id)
  brief.id, creator_member.organization_id,
  creator_period.id, student_period.id, 'automatic_backfill'
from public.flight_briefs brief
join public.organization_members creator_member
  on creator_member.user_id = brief.created_by
join public.organization_members student_member
  on student_member.organization_id = creator_member.organization_id
 and student_member.user_id = brief.student_user_id
 and student_member.teaching_role = 'student'
join public.organization_membership_periods creator_period
  on creator_period.organization_id = creator_member.organization_id
 and creator_period.user_id = creator_member.user_id
 and creator_period.joined_at <= coalesce(brief.finalized_at, brief.created_at)
 and (creator_period.left_at is null or creator_period.left_at >= coalesce(brief.finalized_at, brief.created_at))
join public.organization_membership_periods student_period
  on student_period.organization_id = student_member.organization_id
 and student_period.user_id = student_member.user_id
 and student_period.joined_at <= coalesce(brief.finalized_at, brief.created_at)
 and (student_period.left_at is null or student_period.left_at >= coalesce(brief.finalized_at, brief.created_at))
where brief.student_user_id is not null
  and brief.status in ('finalized', 'superseded')
  and (
    creator_member.teaching_role = 'instructor'
    or (
      brief.created_by = brief.student_user_id
      and creator_member.teaching_role = 'student'
    )
  )
  and not exists (
    select 1 from public.flight_brief_organization_shares share
    where share.shared_brief_id = brief.id
  )
order by brief.id, creator_member.organization_id,
  creator_period.joined_at desc, student_period.joined_at desc
on conflict (brief_id, organization_id) do nothing;

create or replace function private.flight_brief_shared_with_organization(
  p_brief_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.flight_brief_organization_access access
    where access.brief_id = p_brief_id
      and access.organization_id = p_organization_id
  )
$$;

create or replace function private.can_view_flight_brief_through_organization(
  p_brief_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.flight_brief_organization_access access
    join public.flight_briefs brief on brief.id = access.brief_id
    where access.brief_id = p_brief_id
      and (
        brief.student_user_id is distinct from p_user_id
        or brief.status in ('finalized', 'superseded')
      )
      and (
        private.can_manage_organization(access.organization_id, p_user_id)
        or private.is_organization_instructor(access.organization_id, p_user_id)
      )
  )
$$;

revoke all on function private.flight_brief_shared_with_organization(uuid, uuid)
  from public, anon;
revoke all on function private.can_view_flight_brief_through_organization(uuid, uuid)
  from public, anon;
grant execute on function private.flight_brief_shared_with_organization(uuid, uuid)
  to authenticated;
grant execute on function private.can_view_flight_brief_through_organization(uuid, uuid)
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
  or private.can_view_flight_brief_through_organization(id, (select auth.uid()))
);

create or replace function public.list_organization_flight_briefs(
  p_organization_id uuid
)
returns setof public.flight_briefs
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    private.can_manage_organization(p_organization_id, auth.uid())
    or private.is_organization_instructor(p_organization_id, auth.uid())
  ) then
    raise exception 'Organization instructor or administrator access is required.'
      using errcode = '42501';
  end if;

  return query
  select brief.*
  from public.flight_briefs brief
  join private.flight_brief_organization_access access
    on access.brief_id = brief.id
   and access.organization_id = p_organization_id
  where brief.student_user_id is distinct from auth.uid()
     or brief.status in ('finalized', 'superseded')
  order by brief.flight_date desc nulls last, brief.created_at desc;
end;
$$;

create or replace function public.list_my_flight_briefs()
returns setof public.flight_briefs
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
  select brief.*
  from public.flight_briefs brief
  where brief.created_by = auth.uid()
    and not exists (
      select 1
      from public.flight_brief_organization_shares share
      where share.shared_brief_id = brief.id
    )
  order by brief.created_at desc;
end;
$$;

revoke all on function public.list_organization_flight_briefs(uuid)
  from public, anon;
revoke all on function public.list_my_flight_briefs()
  from public, anon;
grant execute on function public.list_organization_flight_briefs(uuid)
  to authenticated;
grant execute on function public.list_my_flight_briefs()
  to authenticated;

-- Manual routing and record-copy APIs conflict with automatic derived access.
revoke all on function public.share_personal_flight_brief_with_organization(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.copy_flight_brief_to_personal(uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
