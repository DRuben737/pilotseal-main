set lock_timeout = '5s';
set statement_timeout = '2min';

-- Flight Brief snapshots are intentionally short-lived planning artifacts.
-- Preserve the independent aircraft meter history while allowing its source
-- brief to expire, and remove relationship rows with the expired brief.
alter table public.aircraft_meter_readings
  drop constraint if exists aircraft_meter_readings_flight_brief_id_fkey;
alter table public.aircraft_meter_readings
  add constraint aircraft_meter_readings_flight_brief_id_fkey
  foreign key (flight_brief_id) references public.flight_briefs(id) on delete set null;

alter table public.flight_briefs
  drop constraint if exists flight_briefs_supersedes_id_fkey;
alter table public.flight_briefs
  add constraint flight_briefs_supersedes_id_fkey
  foreign key (supersedes_id) references public.flight_briefs(id) on delete set null;

alter table public.flight_brief_organization_shares
  drop constraint if exists flight_brief_organization_shares_source_brief_id_fkey;
alter table public.flight_brief_organization_shares
  add constraint flight_brief_organization_shares_source_brief_id_fkey
  foreign key (source_brief_id) references public.flight_briefs(id) on delete cascade;

alter table public.flight_brief_organization_shares
  drop constraint if exists flight_brief_organization_shares_shared_brief_id_fkey;
alter table public.flight_brief_organization_shares
  add constraint flight_brief_organization_shares_shared_brief_id_fkey
  foreign key (shared_brief_id) references public.flight_briefs(id) on delete cascade;

create or replace function private.purge_expired_flight_briefs(
  p_before timestamptz default now() - interval '7 days'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.flight_briefs
  where created_at < p_before;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.purge_expired_flight_briefs(timestamptz)
  from public, anon, authenticated;

-- Never expose an expired brief through direct Data API access, even between
-- scheduled cleanup runs.
drop policy if exists flight_briefs_select_authorized on public.flight_briefs;
create policy flight_briefs_select_authorized
on public.flight_briefs for select to authenticated
using (
  created_at >= now() - interval '7 days'
  and (
    created_by = (select auth.uid())
    or (
      student_user_id = (select auth.uid())
      and status in ('finalized', 'superseded')
    )
    or private.can_view_flight_brief_through_organization(id, (select auth.uid()))
  )
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
  where brief.created_at >= now() - interval '7 days'
    and (
      brief.student_user_id is distinct from auth.uid()
      or brief.status in ('finalized', 'superseded')
    )
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
    and brief.created_at >= now() - interval '7 days'
    and not exists (
      select 1
      from public.flight_brief_organization_shares share
      where share.shared_brief_id = brief.id
    )
  order by brief.created_at desc;
end;
$$;

-- Purge existing expired rows when the migration lands, then keep enforcing
-- the retention window hourly. A named job makes the migration idempotent.
select private.purge_expired_flight_briefs();

create extension if not exists pg_cron;
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'purge-expired-flight-briefs';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'purge-expired-flight-briefs',
    '15 * * * *',
    'select private.purge_expired_flight_briefs();'
  );
end;
$$;

notify pgrst, 'reload schema';
