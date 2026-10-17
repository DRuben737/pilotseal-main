alter table public.cfi_schedule_teaching_rules
  alter column start_minute set default 0,
  alter column latest_start_minute set default 1439,
  alter column end_minute set default 1440,
  alter column max_daily_span_min set default 1440,
  alter column max_daily_teaching_min set default 1440,
  alter column weekdays set default array[1,2,3,4,5,6,7]::smallint[];

alter table public.cfi_schedule_teaching_rules
  drop constraint teaching_window_valid,
  drop constraint teaching_span_valid,
  drop constraint teaching_total_valid,
  add constraint teaching_window_valid check (
    start_minute between 0 and 1439
    and end_minute between 1 and 1440
    and end_minute > start_minute
    and latest_start_minute between start_minute and end_minute - 1
  ),
  add constraint teaching_span_valid check (max_daily_span_min between 1 and 1440),
  add constraint teaching_total_valid check (max_daily_teaching_min between 1 and 1440);
