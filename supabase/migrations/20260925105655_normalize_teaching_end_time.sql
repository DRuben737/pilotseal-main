-- The UI formerly exposed both "latest start" and "latest end". Schedule now
-- has one end-of-day boundary, so preserve the value instructors selected as
-- their cutoff and keep latest_start_minute as an internal compatibility field.
create table private.cfi_schedule_teaching_rules_legacy_20260925 (
  cfi_user_id uuid primary key,
  start_minute smallint not null,
  latest_start_minute smallint not null,
  end_minute smallint not null,
  backed_up_at timestamptz not null default now()
);

revoke all on private.cfi_schedule_teaching_rules_legacy_20260925 from public, anon, authenticated;
grant all on private.cfi_schedule_teaching_rules_legacy_20260925 to service_role;

insert into private.cfi_schedule_teaching_rules_legacy_20260925
  (cfi_user_id, start_minute, latest_start_minute, end_minute)
select cfi_user_id, start_minute, latest_start_minute, end_minute
from public.cfi_schedule_teaching_rules;

alter table public.cfi_schedule_teaching_rules
  drop constraint teaching_window_valid;

update public.cfi_schedule_teaching_rules
set end_minute = greatest(start_minute + 120, latest_start_minute),
    latest_start_minute = greatest(start_minute + 119, latest_start_minute - 1),
    updated_at = now();

alter table public.cfi_schedule_teaching_rules
  alter column latest_start_minute set default 959,
  alter column end_minute set default 960,
  add constraint teaching_window_valid check (
    start_minute >= 0
    and end_minute between start_minute + 120 and 1440
    and latest_start_minute = end_minute - 1
  );
