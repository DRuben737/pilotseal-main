-- Once a student accepts an identity link, previously issued endorsements for
-- that instructor-owned saved-person entry must follow the stable account
-- identity too. Never replace an identity that was already recorded.
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
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select * into v_request
  from public.saved_person_account_link_requests
  where id = p_request_id
  for update;

  if not found or v_request.target_user_id <> auth.uid() or v_request.status <> 'pending' then
    raise exception 'Link request is no longer available.' using errcode = 'P0002';
  end if;

  if p_accept then
    insert into public.saved_person_account_links (owner_user_id, saved_person_id, linked_user_id)
    values (v_request.owner_user_id, v_request.saved_person_id, v_request.target_user_id);

    update public.endorsement_records
    set student_user_id = v_request.target_user_id,
        updated_at = timezone('utc', now())
    where user_id = v_request.owner_user_id
      and student_id = v_request.saved_person_id
      and student_user_id is null;

    update public.saved_person_account_link_requests
    set status = 'accepted', responded_at = timezone('utc', now())
    where id = p_request_id;
  else
    update public.saved_person_account_link_requests
    set status = 'rejected', responded_at = timezone('utc', now())
    where id = p_request_id;
  end if;
end;
$$;

revoke all on function public.respond_saved_person_account_link_request(uuid, boolean)
  from public, anon;
grant execute on function public.respond_saved_person_account_link_request(uuid, boolean)
  to authenticated;

-- Repair links accepted before the transactional history binding above. This
-- only fills missing identities and does not change record scope, organization
-- visibility, membership evidence, or an existing student identity.
create table if not exists private.endorsement_identity_backfill_audit (
  record_id uuid primary key references public.endorsement_records(id) on delete restrict,
  linked_user_id uuid not null references auth.users(id) on delete restrict,
  migration_name text not null,
  applied_at timestamptz not null default timezone('utc', now())
);

revoke all on private.endorsement_identity_backfill_audit from public, anon, authenticated;

with repaired as (
  update public.endorsement_records as record
  set student_user_id = link.linked_user_id,
      updated_at = timezone('utc', now())
  from public.saved_person_account_links as link
  where record.user_id = link.owner_user_id
    and record.student_id = link.saved_person_id
    and record.student_user_id is null
  returning record.id, link.linked_user_id
)
insert into private.endorsement_identity_backfill_audit (
  record_id, linked_user_id, migration_name
)
select id, linked_user_id, '20260827173930_link_historical_endorsements_on_account_acceptance'
from repaired
on conflict (record_id) do nothing;
