-- Keep every dated Schedule instance for one consistent 30-day window.
-- The cleanup is intentionally atomic: lessons/blocks/time off and their
-- date-specific availability rows, date markers, and expired week overrides
-- are removed together in the same transaction.
-- Recurring weekly availability, access grants, teaching rules, revisions,
-- and availability review confirmations do not expire because they remain
-- active configuration rather than historical instances.

create extension if not exists pg_cron with schema pg_catalog;

alter table private.cfi_schedule_publications
  add column if not exists created_at timestamptz not null default now();

create index if not exists cfi_schedule_publications_created_idx
  on private.cfi_schedule_publications (created_at);

create or replace function private.cleanup_cfi_schedule_history(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cutoff_time timestamptz := p_now - interval '30 days';
  cutoff_date date := (p_now at time zone 'UTC')::date - 30;
  deleted_events integer := 0;
  deleted_person_events integer := 0;
  deleted_blocks integer := 0;
  deleted_time_off integer := 0;
  deleted_date_slots integer := 0;
  deleted_person_date_slots integer := 0;
  deleted_override_dates integer := 0;
  deleted_person_override_dates integer := 0;
  deleted_week_overrides integer := 0;
  deleted_person_week_overrides integer := 0;
  deleted_publications integer := 0;
begin
  delete from public.cfi_schedule_events where end_at < cutoff_time;
  get diagnostics deleted_events = row_count;

  delete from private.cfi_person_events where end_at < cutoff_time;
  get diagnostics deleted_person_events = row_count;

  delete from public.cfi_schedule_unavailable_blocks where end_at < cutoff_time;
  get diagnostics deleted_blocks = row_count;

  delete from public.cfi_schedule_time_off where end_at < cutoff_time;
  get diagnostics deleted_time_off = row_count;

  delete from public.cfi_schedule_availability_slots
  where scope = 'date' and availability_date < cutoff_date;
  get diagnostics deleted_date_slots = row_count;

  delete from private.cfi_person_availability_slots
  where scope = 'date' and availability_date < cutoff_date;
  get diagnostics deleted_person_date_slots = row_count;

  delete from public.cfi_schedule_availability_override_dates
  where availability_date < cutoff_date;
  get diagnostics deleted_override_dates = row_count;

  delete from private.cfi_person_availability_override_dates
  where availability_date < cutoff_date;
  get diagnostics deleted_person_override_dates = row_count;

  delete from public.cfi_schedule_week_overrides
  where week_start + 6 < cutoff_date;
  get diagnostics deleted_week_overrides = row_count;

  delete from private.cfi_person_week_overrides
  where week_start + 6 < cutoff_date;
  get diagnostics deleted_person_week_overrides = row_count;

  delete from private.cfi_schedule_publications where created_at < cutoff_time;
  get diagnostics deleted_publications = row_count;

  return jsonb_build_object(
    'cutoff_time', cutoff_time,
    'events', deleted_events,
    'person_events', deleted_person_events,
    'blocks', deleted_blocks,
    'time_off', deleted_time_off,
    'date_slots', deleted_date_slots,
    'person_date_slots', deleted_person_date_slots,
    'override_dates', deleted_override_dates,
    'person_override_dates', deleted_person_override_dates,
    'week_overrides', deleted_week_overrides,
    'person_week_overrides', deleted_person_week_overrides,
    'publications', deleted_publications
  );
end;
$$;

revoke all on function private.cleanup_cfi_schedule_history(timestamptz)
  from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'cleanup-cfi-schedule-history';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'cleanup-cfi-schedule-history',
    '23 4 * * *',
    'select private.cleanup_cfi_schedule_history();'
  );
end;
$$;
