-- Student identity consent, temporal organization membership, and training-record scope.

create table if not exists public.organization_membership_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default timezone('utc', now()),
  left_at timestamptz,
  joined_by uuid references auth.users(id) on delete set null,
  ended_by uuid references auth.users(id) on delete set null,
  join_source text not null default 'organization' check (join_source in ('organization', 'claim', 'rejoin', 'migration')),
  end_reason text check (end_reason is null or end_reason in ('self_left', 'removed', 'account_deleted')),
  end_note text,
  created_at timestamptz not null default timezone('utc', now()),
  check (left_at is null or left_at >= joined_at)
);

create unique index if not exists organization_membership_periods_active_idx
  on public.organization_membership_periods (organization_id, user_id)
  where left_at is null;
create index if not exists organization_membership_periods_user_history_idx
  on public.organization_membership_periods (user_id, organization_id, joined_at desc);
create index if not exists organization_membership_periods_org_history_idx
  on public.organization_membership_periods (organization_id, joined_at desc, left_at);

insert into public.organization_membership_periods (
  organization_id, user_id, joined_at, joined_by, join_source
)
select member.organization_id, member.user_id, member.created_at, member.added_by, 'migration'
from public.organization_members as member
where not exists (
  select 1
  from public.organization_membership_periods as period
  where period.organization_id = member.organization_id
    and period.user_id = member.user_id
    and period.left_at is null
);

create or replace function private.sync_organization_membership_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.organization_membership_periods (
      organization_id, user_id, joined_at, joined_by, join_source
    ) values (
      new.organization_id,
      new.user_id,
      coalesce(new.created_at, timezone('utc', now())),
      new.added_by,
      case when exists (
        select 1 from public.organization_membership_periods history
        where history.organization_id = new.organization_id
          and history.user_id = new.user_id
      ) then 'rejoin' else 'organization' end
    )
    on conflict (organization_id, user_id) where left_at is null do nothing;
    return new;
  end if;

  update public.organization_membership_periods
  set left_at = timezone('utc', now()),
      ended_by = coalesce(nullif(current_setting('pilotseal.membership_ended_by', true), '')::uuid, auth.uid()),
      end_reason = coalesce(nullif(current_setting('pilotseal.membership_end_reason', true), ''), 'removed'),
      end_note = nullif(current_setting('pilotseal.membership_end_note', true), '')
  where organization_id = old.organization_id
    and user_id = old.user_id
    and left_at is null;
  return old;
end;
$$;

drop trigger if exists sync_organization_membership_period_insert on public.organization_members;
create trigger sync_organization_membership_period_insert
after insert on public.organization_members
for each row execute function private.sync_organization_membership_period();

drop trigger if exists sync_organization_membership_period_delete on public.organization_members;
create trigger sync_organization_membership_period_delete
before delete on public.organization_members
for each row execute function private.sync_organization_membership_period();

create or replace function private.active_membership_period_id(
  p_organization_id uuid,
  p_user_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select period.id
  from public.organization_membership_periods as period
  where period.organization_id = p_organization_id
    and period.user_id = p_user_id
    and period.left_at is null
  order by period.joined_at desc
  limit 1;
$$;

create or replace function public.leave_organization(p_organization_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.organization_members;
  v_organization_name text;
  v_manager record;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select * into v_member
  from public.organization_members
  where organization_id = p_organization_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'You are not a member of this organization.' using errcode = 'P0002';
  end if;
  if v_member.role = 'owner' then
    raise exception 'Transfer organization ownership before leaving.' using errcode = '42501';
  end if;

  perform set_config('pilotseal.membership_ended_by', auth.uid()::text, true);
  perform set_config('pilotseal.membership_end_reason', 'self_left', true);
  perform set_config('pilotseal.membership_end_note', coalesce(nullif(btrim(p_reason), ''), 'Member self-service exit'), true);
  delete from public.organization_members
  where organization_id = p_organization_id and user_id = auth.uid();

  update public.organization_people
  set status = 'left', updated_at = timezone('utc', now())
  where organization_id = p_organization_id and user_id = auth.uid() and status = 'linked';

  select name into v_organization_name from public.organizations where id = p_organization_id;
  for v_manager in
    select user_id from public.organization_members
    where organization_id = p_organization_id and role in ('owner', 'organization_admin')
  loop
    perform private.create_user_notification(
      v_manager.user_id,
      'Organization member left',
      'A member left ' || coalesce(v_organization_name, 'the organization') || '.',
      'organization', 'normal', p_organization_id, v_organization_name,
      '/dashboard/organization/people',
      'organization-member:' || p_organization_id::text || ':' || auth.uid()::text || ':left',
      auth.uid()
    );
  end loop;
end;
$$;

-- Registered users may be re-added after leaving; restore their roster row to linked.
create or replace function private.restore_organization_person_on_rejoin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.organization_people
  set status = 'linked', linked_at = coalesce(linked_at, timezone('utc', now())), updated_at = timezone('utc', now())
  where organization_id = new.organization_id and user_id = new.user_id and status = 'left';
  return new;
end;
$$;

drop trigger if exists restore_organization_person_on_rejoin on public.organization_members;
create trigger restore_organization_person_on_rejoin
after insert on public.organization_members
for each row execute function private.restore_organization_person_on_rejoin();

alter table public.organization_people drop constraint if exists organization_people_status_check;
alter table public.organization_people add constraint organization_people_status_check
  check (status in ('pending', 'linked', 'left', 'archived'));
alter table public.organization_people drop constraint if exists organization_people_link_state_check;
alter table public.organization_people add constraint organization_people_link_state_check check (
  (status in ('linked', 'left') and user_id is not null and linked_at is not null)
  or (status in ('pending', 'archived') and user_id is null)
);

create or replace function private.sync_organization_person_from_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_display_name text;
begin
  if tg_op = 'DELETE' then
    if current_setting('pilotseal.membership_end_reason', true) = 'self_left' then
      update public.organization_people
      set status = 'left', updated_at = timezone('utc', now())
      where organization_id = old.organization_id and user_id = old.user_id;
    else
      update public.organization_people
      set user_id = null, status = 'archived', linked_at = null, updated_at = timezone('utc', now())
      where organization_id = old.organization_id and user_id = old.user_id;
    end if;
    return old;
  end if;

  select auth_users.email, profiles.display_name into v_email, v_display_name
  from auth.users as auth_users
  left join public.profiles as profiles on profiles.id = auth_users.id
  where auth_users.id = new.user_id;
  if v_email is null then return new; end if;

  insert into public.organization_people (
    organization_id, email, organization_display_name, teaching_role,
    user_id, status, added_by, linked_at
  ) values (
    new.organization_id, v_email, nullif(btrim(coalesce(v_display_name, '')), ''),
    new.teaching_role, new.user_id, 'linked', new.added_by, timezone('utc', now())
  )
  on conflict (organization_id, normalized_email) do update
  set user_id = excluded.user_id, status = 'linked',
      linked_at = coalesce(public.organization_people.linked_at, excluded.linked_at),
      teaching_role = excluded.teaching_role,
      organization_display_name = coalesce(nullif(btrim(public.organization_people.organization_display_name), ''), excluded.organization_display_name),
      updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.add_organization_member_by_email(
  p_organization_id uuid,
  p_email text
)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person public.organization_people;
  v_member public.organization_members;
begin
  if auth.uid() is null or not (
    private.can_manage_organization(p_organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Only organization Owners and Admins can add members.' using errcode = '42501';
  end if;

  select * into v_person from public.organization_people
  where organization_id = p_organization_id
    and normalized_email = lower(btrim(p_email))
    and status = 'left'
  for update;

  if found then
    update public.organization_people
    set status = 'linked', linked_at = timezone('utc', now()), updated_at = timezone('utc', now())
    where id = v_person.id returning * into v_person;
    insert into public.organization_members (organization_id, user_id, role, teaching_role, added_by)
    values (p_organization_id, v_person.user_id, 'member', v_person.teaching_role, auth.uid())
    returning * into v_member;
    return v_member;
  end if;

  v_person := public.add_organization_person(p_organization_id, p_email, null, null, null, null);
  if v_person.user_id is null then
    raise exception 'No verified registered account matches that email. Add this person from the updated organization roster instead.' using errcode = 'P0002';
  end if;
  select * into v_member from public.organization_members
  where organization_id = p_organization_id and user_id = v_person.user_id;
  return v_member;
end;
$$;

alter table public.organization_membership_periods enable row level security;
drop policy if exists organization_membership_periods_select_authorized on public.organization_membership_periods;
create policy organization_membership_periods_select_authorized
on public.organization_membership_periods for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.can_manage_organization(organization_id))
  or (select private.is_platform_admin())
);
revoke all on public.organization_membership_periods from public, anon, authenticated;
grant select on public.organization_membership_periods to authenticated;

revoke all on function private.sync_organization_membership_period() from public, anon, authenticated;
revoke all on function private.active_membership_period_id(uuid, uuid) from public, anon, authenticated;
revoke all on function private.restore_organization_person_on_rejoin() from public, anon, authenticated;
revoke all on function public.leave_organization(uuid, text) from public, anon;
grant execute on function public.leave_organization(uuid, text) to authenticated;

-- Consent-based links between a private saved-person row and a verified account.
create table if not exists public.saved_person_account_link_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  saved_person_id uuid not null references public.saved_people(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  requested_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz,
  cancelled_at timestamptz,
  unique (owner_user_id, saved_person_id, target_user_id)
);
create unique index if not exists saved_person_link_requests_one_pending_person_idx
  on public.saved_person_account_link_requests (saved_person_id)
  where status = 'pending';
create index if not exists saved_person_link_requests_target_idx
  on public.saved_person_account_link_requests (target_user_id, status, requested_at desc);

alter table public.saved_person_account_link_requests enable row level security;
drop policy if exists saved_person_link_requests_select_participant on public.saved_person_account_link_requests;
create policy saved_person_link_requests_select_participant
on public.saved_person_account_link_requests for select to authenticated
using (owner_user_id = (select auth.uid()) or target_user_id = (select auth.uid()));
revoke all on public.saved_person_account_link_requests from public, anon, authenticated;
grant select on public.saved_person_account_link_requests to authenticated;

create or replace function public.request_saved_person_account_link(
  p_saved_person_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_user_id uuid;
  v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in.' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.saved_people
    where id = p_saved_person_id and user_id = auth.uid() and role = 'student'
  ) then
    raise exception 'Saved student not found.' using errcode = 'P0002';
  end if;
  select id into v_target_user_id
  from auth.users
  where lower(btrim(email)) = lower(btrim(p_email)) and email_confirmed_at is not null
  limit 1;
  if v_target_user_id is null then
    raise exception 'No verified account matches that email.' using errcode = 'P0002';
  end if;
  if v_target_user_id = auth.uid() then
    raise exception 'A saved person cannot be linked to your own account.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.saved_person_account_links
    where owner_user_id = auth.uid() and linked_user_id = v_target_user_id
  ) then
    raise exception 'That account is already linked to one of your saved people.' using errcode = '23505';
  end if;

  insert into public.saved_person_account_link_requests (
    owner_user_id, saved_person_id, target_user_id, status, requested_at, responded_at, cancelled_at
  ) values (
    auth.uid(), p_saved_person_id, v_target_user_id, 'pending', timezone('utc', now()), null, null
  )
  on conflict (owner_user_id, saved_person_id, target_user_id) do update
    set status = 'pending', requested_at = timezone('utc', now()), responded_at = null, cancelled_at = null
  returning id into v_request_id;

  perform private.create_user_notification(
    v_target_user_id, 'Student record link request',
    'An instructor asked you to confirm a saved student record.',
    'system', 'normal', null, 'Account link request',
    '/dashboard/saved-people', 'saved-person-link-request:' || v_request_id::text, auth.uid()
  );
  return v_request_id;
end;
$$;

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
begin
  if auth.uid() is null then raise exception 'You must be signed in.' using errcode = '42501'; end if;
  select * into v_request from public.saved_person_account_link_requests
  where id = p_request_id for update;
  if not found or v_request.target_user_id <> auth.uid() or v_request.status <> 'pending' then
    raise exception 'Link request is no longer available.' using errcode = 'P0002';
  end if;
  if p_accept then
    insert into public.saved_person_account_links (owner_user_id, saved_person_id, linked_user_id)
    values (v_request.owner_user_id, v_request.saved_person_id, v_request.target_user_id);
    update public.saved_person_account_link_requests
    set status = 'accepted', responded_at = timezone('utc', now()) where id = p_request_id;
  else
    update public.saved_person_account_link_requests
    set status = 'rejected', responded_at = timezone('utc', now()) where id = p_request_id;
  end if;
end;
$$;

create or replace function public.cancel_saved_person_account_link_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in.' using errcode = '42501'; end if;
  update public.saved_person_account_link_requests
  set status = 'cancelled', cancelled_at = timezone('utc', now())
  where id = p_request_id and owner_user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Pending link request not found.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.list_my_saved_person_link_requests()
returns table (
  request_id uuid,
  direction text,
  saved_person_id uuid,
  saved_person_name text,
  other_party_name text,
  status text,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select request.id,
    case when request.owner_user_id = auth.uid() then 'outgoing' else 'incoming' end,
    request.saved_person_id,
    person.display_name,
    coalesce(profile.display_name, auth_user.email)::text,
    request.status,
    request.requested_at
  from public.saved_person_account_link_requests request
  join public.saved_people person on person.id = request.saved_person_id
  join auth.users auth_user on auth_user.id = case
    when request.owner_user_id = auth.uid() then request.target_user_id else request.owner_user_id end
  left join public.profiles profile on profile.id = auth_user.id
  where auth.uid() is not null
    and (request.owner_user_id = auth.uid() or request.target_user_id = auth.uid())
  order by request.requested_at desc;
$$;

-- Retire the direct-link API while keeping its signature unavailable to old clients.
revoke all on function public.link_saved_person_account(uuid, text) from public, anon, authenticated;
revoke all on function public.request_saved_person_account_link(uuid, text) from public, anon;
revoke all on function public.respond_saved_person_account_link_request(uuid, boolean) from public, anon;
revoke all on function public.cancel_saved_person_account_link_request(uuid) from public, anon;
revoke all on function public.list_my_saved_person_link_requests() from public, anon;
grant execute on function public.request_saved_person_account_link(uuid, text) to authenticated;
grant execute on function public.respond_saved_person_account_link_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_saved_person_account_link_request(uuid) to authenticated;
grant execute on function public.list_my_saved_person_link_requests() to authenticated;

alter table public.saved_person_account_link_requests
  add column if not exists unlinked_at timestamptz,
  add column if not exists unlinked_by uuid references auth.users(id) on delete set null;
alter table public.saved_person_account_link_requests
  drop constraint if exists saved_person_account_link_requests_status_check;
alter table public.saved_person_account_link_requests
  add constraint saved_person_account_link_requests_status_check
  check (status in ('pending', 'accepted', 'rejected', 'cancelled', 'unlinked'));

create or replace function public.unlink_saved_person_account(p_saved_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in.' using errcode = '42501'; end if;
  perform 1 from public.saved_person_account_links
  where saved_person_id = p_saved_person_id
    and (owner_user_id = auth.uid() or linked_user_id = auth.uid())
  for update;
  if not found then raise exception 'Linked saved person not found.' using errcode = 'P0002'; end if;

  delete from public.saved_person_account_links where saved_person_id = p_saved_person_id;
  update public.saved_person_account_link_requests
  set status = 'unlinked', unlinked_at = timezone('utc', now()), unlinked_by = auth.uid()
  where id = (
    select id from public.saved_person_account_link_requests
    where saved_person_id = p_saved_person_id and status = 'accepted'
    order by responded_at desc nulls last limit 1
  );
end;
$$;
revoke all on function public.unlink_saved_person_account(uuid) from public, anon;
grant execute on function public.unlink_saved_person_account(uuid) to authenticated;

-- Endorsements carry stable account identity and immutable organization-sharing evidence.
alter table public.endorsement_records
  add column if not exists student_user_id uuid references auth.users(id) on delete set null,
  add column if not exists instructor_membership_period_id uuid references public.organization_membership_periods(id) on delete restrict,
  add column if not exists student_membership_period_id uuid references public.organization_membership_periods(id) on delete restrict,
  add column if not exists scope_status text,
  add column if not exists supersedes_record_id uuid references public.endorsement_records(id) on delete restrict,
  add column if not exists legacy_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists legacy_reviewed_at timestamptz,
  add column if not exists legacy_review_note text;

update public.endorsement_records
set scope_status = case when organization_id is null then 'personal' else 'pending_review' end
where scope_status is null;
alter table public.endorsement_records alter column scope_status set default 'personal';
alter table public.endorsement_records alter column scope_status set not null;
alter table public.endorsement_records drop constraint if exists endorsement_records_scope_status_check;
alter table public.endorsement_records add constraint endorsement_records_scope_status_check
  check (scope_status in ('personal', 'confirmed', 'pending_review'));
create index if not exists endorsement_records_student_user_idx
  on public.endorsement_records (student_user_id, created_at desc) where student_user_id is not null;
create index if not exists endorsement_records_scope_idx
  on public.endorsement_records (organization_id, scope_status, created_at desc) where organization_id is not null;

drop trigger if exists prepare_endorsement_record on public.endorsement_records;
drop function if exists private.prepare_endorsement_record();

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
  v_student_user_id uuid;
  v_instructor_period_id uuid;
  v_student_period_id uuid;
  v_previous public.endorsement_records;
  v_result public.endorsement_records;
begin
  if auth.uid() is null then raise exception 'You must be signed in.' using errcode = '42501'; end if;
  if p_id is null or nullif(btrim(p_student_name), '') is null
    or nullif(btrim(p_instructor_name), '') is null or nullif(btrim(p_storage_path), '') is null then
    raise exception 'Student, instructor, record ID, and PDF path are required.' using errcode = '22023';
  end if;
  if split_part(p_storage_path, '/', 1) <> auth.uid()::text then
    raise exception 'The PDF path must belong to the signed-in user.' using errcode = '42501';
  end if;

  if p_student_id is not null then
    select coalesce(link.linked_user_id, profile.id) into v_student_user_id
    from public.saved_people person
    left join public.saved_person_account_links link
      on link.saved_person_id = person.id and link.owner_user_id = auth.uid()
    left join public.profiles profile on profile.self_person_id = person.id
    where person.id = p_student_id
      and (person.user_id = auth.uid() or profile.id is not null)
    limit 1;
  end if;

  if p_organization_id is not null then
    select period.id into v_instructor_period_id
    from public.organization_members member
    join public.organization_membership_periods period
      on period.organization_id = member.organization_id
     and period.user_id = member.user_id and period.left_at is null
    where member.organization_id = p_organization_id
      and member.user_id = auth.uid() and member.teaching_role = 'instructor'
    for share of member, period;
    if v_instructor_period_id is null then
      raise exception 'Only a current organization instructor can share this record.' using errcode = '42501';
    end if;
    if v_student_user_id is null then
      raise exception 'The student must have a confirmed registered account.' using errcode = '22023';
    end if;
    select period.id into v_student_period_id
    from public.organization_members member
    join public.organization_membership_periods period
      on period.organization_id = member.organization_id
     and period.user_id = member.user_id and period.left_at is null
    where member.organization_id = p_organization_id
      and member.user_id = v_student_user_id and member.teaching_role = 'student'
    for share of member, period;
    if v_student_period_id is null then
      raise exception 'The registered student is not a current student member of this organization.' using errcode = '42501';
    end if;
  end if;

  if p_supersedes_record_id is not null then
    select * into v_previous from public.endorsement_records
    where id = p_supersedes_record_id and user_id = auth.uid() for update;
    if not found then raise exception 'The original endorsement record was not found.' using errcode = 'P0002'; end if;
    if v_previous.organization_id is not null and (
      p_organization_id is distinct from v_previous.organization_id
      or v_instructor_period_id is null or v_student_period_id is null
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
    instructor_cert_number, endorsement_date, template_titles, storage_path, file_size_bytes
  ) values (
    p_id, auth.uid(), p_organization_id, p_student_id, v_student_user_id,
    v_instructor_period_id, v_student_period_id,
    case when p_organization_id is null then 'personal' else 'confirmed' end,
    p_supersedes_record_id, btrim(p_student_name), nullif(btrim(p_student_cert_number), ''),
    btrim(p_instructor_name), nullif(btrim(p_instructor_cert_number), ''),
    p_endorsement_date, coalesce(p_template_titles, '{}'::text[]), p_storage_path, p_file_size_bytes
  ) returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.review_legacy_endorsement_scope(
  p_record_id uuid,
  p_decision text,
  p_student_user_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.endorsement_records;
  v_student_period uuid;
  v_instructor_period uuid;
begin
  if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;
  if p_decision not in ('personal', 'confirmed', 'defer') then
    raise exception 'Decision must be personal, confirmed, or defer.' using errcode = '22023';
  end if;
  if p_decision <> 'defer' and nullif(btrim(p_note), '') is null then
    raise exception 'A review note is required.' using errcode = '22023';
  end if;
  select * into v_record from public.endorsement_records
  where id = p_record_id and scope_status = 'pending_review' for update;
  if not found then raise exception 'Pending legacy record not found.' using errcode = 'P0002'; end if;
  if p_decision = 'defer' then return; end if;
  if p_decision = 'confirmed' then
    if p_student_user_id is null then raise exception 'A verified student account is required.' using errcode = '22023'; end if;
    select id into v_student_period from public.organization_membership_periods
    where organization_id = v_record.organization_id and user_id = p_student_user_id
      and joined_at <= v_record.created_at and (left_at is null or left_at >= v_record.created_at)
    order by joined_at desc limit 1;
    select id into v_instructor_period from public.organization_membership_periods
    where organization_id = v_record.organization_id and user_id = v_record.user_id
      and joined_at <= v_record.created_at and (left_at is null or left_at >= v_record.created_at)
    order by joined_at desc limit 1;
    if v_student_period is null or v_instructor_period is null then
      raise exception 'Both student and instructor need membership evidence at the original record time.' using errcode = '42501';
    end if;
    update public.endorsement_records
    set student_user_id = p_student_user_id,
        student_membership_period_id = v_student_period,
        instructor_membership_period_id = v_instructor_period,
        scope_status = 'confirmed', legacy_reviewed_by = auth.uid(),
        legacy_reviewed_at = timezone('utc', now()), legacy_review_note = btrim(p_note)
    where id = p_record_id;
  else
    update public.endorsement_records
    set organization_id = null, instructor_membership_period_id = null,
        student_membership_period_id = null, scope_status = 'personal',
        legacy_reviewed_by = auth.uid(), legacy_reviewed_at = timezone('utc', now()),
        legacy_review_note = btrim(p_note)
    where id = p_record_id;
  end if;
end;
$$;

drop policy if exists endorsement_records_select_authorized on public.endorsement_records;
create policy endorsement_records_select_authorized
on public.endorsement_records for select to authenticated
using (
  user_id = (select auth.uid())
  or student_user_id = (select auth.uid())
  or (scope_status = 'confirmed' and organization_id is not null and (select private.can_manage_organization(organization_id)))
  or (scope_status = 'pending_review' and (select private.is_platform_admin()))
);
drop policy if exists endorsement_records_insert_own on public.endorsement_records;
drop policy if exists endorsement_records_update_own on public.endorsement_records;
create policy endorsement_records_update_personal_own
on public.endorsement_records for update to authenticated
using (user_id = (select auth.uid()) and scope_status = 'personal' and organization_id is null)
with check (user_id = (select auth.uid()) and scope_status = 'personal' and organization_id is null);
drop policy if exists endorsement_records_delete_own on public.endorsement_records;
create policy endorsement_records_delete_personal_own
on public.endorsement_records for delete to authenticated
using (user_id = (select auth.uid()) and scope_status = 'personal' and organization_id is null);

revoke all on public.endorsement_records from public, anon, authenticated;
grant select, update, delete on public.endorsement_records to authenticated;
revoke all on function public.create_endorsement_record(uuid, uuid, uuid, text, text, text, text, text, text[], text, integer, uuid) from public, anon;
revoke all on function public.review_legacy_endorsement_scope(uuid, text, uuid, text) from public, anon;
grant execute on function public.create_endorsement_record(uuid, uuid, uuid, text, text, text, text, text, text[], text, integer, uuid) to authenticated;
grant execute on function public.review_legacy_endorsement_scope(uuid, text, uuid, text) to authenticated;

do $$
declare
  v_policy record;
begin
  if to_regclass('storage.objects') is not null then
    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and cmd in ('DELETE', 'UPDATE')
        and coalesce(qual, '') ilike '%endorsement-records%'
    loop
      execute format('drop policy if exists %I on storage.objects', v_policy.policyname);
    end loop;
    execute 'drop policy if exists endorsement_records_files_select_authorized on storage.objects';
    execute 'drop policy if exists endorsement_records_files_delete_personal on storage.objects';
    execute $policy$
      create policy endorsement_records_files_select_authorized
      on storage.objects for select to authenticated
      using (
        bucket_id = 'endorsement-records'
        and exists (
          select 1 from public.endorsement_records record
          where record.storage_path = name
            and (
              record.user_id = (select auth.uid())
              or record.student_user_id = (select auth.uid())
              or (record.scope_status = 'confirmed' and record.organization_id is not null
                and (select private.can_manage_organization(record.organization_id)))
              or (record.scope_status = 'pending_review' and (select private.is_platform_admin()))
            )
        )
      )
    $policy$;
    execute $policy$
      create policy endorsement_records_files_delete_personal
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'endorsement-records'
        and (select auth.uid())::text = (storage.foldername(name))[1]
        and (
          not exists (select 1 from public.endorsement_records record where record.storage_path = name)
          or exists (
            select 1 from public.endorsement_records record
            where record.storage_path = name
              and record.user_id = (select auth.uid())
              and record.organization_id is null
              and record.scope_status = 'personal'
          )
        )
      )
    $policy$;
  end if;
end
$$;

-- Flight briefs preserve the membership period in which organization sharing occurred.
alter table public.flight_briefs
  add column if not exists membership_period_id uuid references public.organization_membership_periods(id) on delete restrict;

create or replace function private.prepare_flight_brief_membership_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is null then
    new.membership_period_id := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.membership_period_id is not null then
    new.membership_period_id := old.membership_period_id;
    return new;
  end if;
  new.membership_period_id := private.active_membership_period_id(new.organization_id, new.created_by);
  if new.membership_period_id is null then
    raise exception 'Current organization membership is required for an organization flight brief.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_flight_brief_membership_period on public.flight_briefs;
create trigger prepare_flight_brief_membership_period
before insert or update of organization_id on public.flight_briefs
for each row execute function private.prepare_flight_brief_membership_period();

update public.flight_briefs brief
set membership_period_id = (
  select membership.id
  from public.organization_membership_periods membership
  where membership.organization_id = brief.organization_id
    and membership.user_id = brief.created_by
    and membership.joined_at <= brief.created_at
    and (membership.left_at is null or membership.left_at >= brief.created_at)
  order by membership.joined_at desc limit 1
)
where brief.organization_id is not null and brief.membership_period_id is null;

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
  if auth.uid() is null then raise exception 'You must be signed in.' using errcode = '42501'; end if;
  select * into source_record from public.flight_briefs
  where id = p_brief_id and created_by = auth.uid() and organization_id is not null;
  if not found then raise exception 'Organization flight brief not found.' using errcode = 'P0002'; end if;
  insert into public.flight_briefs (
    created_by, organization_id, aircraft_id, aircraft_tail_number,
    student_name, instructor_name, flight_date, etd, eta, ete, flight_rules, route,
    status, revision_number, supersedes_id, brief_data, mx_snapshot,
    weather_snapshot, notam_snapshot, wb_snapshot
  ) values (
    auth.uid(), null, null, source_record.aircraft_tail_number,
    source_record.student_name, source_record.instructor_name, source_record.flight_date,
    source_record.etd, source_record.eta, source_record.ete, source_record.flight_rules, source_record.route,
    'draft', 1, null, source_record.brief_data, '{}'::jsonb,
    source_record.weather_snapshot, source_record.notam_snapshot, source_record.wb_snapshot
  ) returning id into new_id;
  return new_id;
end;
$$;

drop policy if exists flight_briefs_select_authorized on public.flight_briefs;
create policy flight_briefs_select_authorized
on public.flight_briefs for select to authenticated
using (
  created_by = (select auth.uid())
  or (
    status in ('finalized', 'superseded')
    and organization_id is not null
    and membership_period_id is not null
    and (
      (select private.is_organization_manager(organization_id))
      or (select private.is_organization_instructor(organization_id))
    )
  )
);

revoke all on function private.prepare_flight_brief_membership_period() from public, anon, authenticated;
revoke all on function public.copy_flight_brief_to_personal(uuid) from public, anon;
grant execute on function public.copy_flight_brief_to_personal(uuid) to authenticated;
