-- Personal teaching rules apply to automatic scheduling only. Existing lessons
-- remain in place and the UI warns about a conflict with a changed rule.
create table public.cfi_schedule_teaching_rules (
  cfi_user_id uuid primary key references auth.users(id) on delete cascade,
  start_minute smallint not null default 420,
  latest_start_minute smallint not null default 960,
  end_minute smallint not null default 1440,
  max_daily_span_min smallint not null default 480,
  max_daily_teaching_min smallint not null default 480,
  weekdays smallint[] not null default array[1,2,3,4,5]::smallint[],
  updated_at timestamptz not null default now(),
  constraint teaching_window_valid check (start_minute >= 0 and latest_start_minute between start_minute and 1439 and end_minute <= 1440 and end_minute - start_minute >= 120 and end_minute > latest_start_minute),
  constraint teaching_span_valid check (max_daily_span_min between 120 and 480),
  constraint teaching_total_valid check (max_daily_teaching_min between 30 and 480),
  constraint teaching_weekdays_valid check (array_length(weekdays, 1) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
);

create table public.cfi_schedule_time_off (
  id uuid primary key default gen_random_uuid(),
  cfi_user_id uuid not null references auth.users(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint time_off_range_valid check (end_at > start_at),
  constraint time_off_note_length check (length(note) <= 300)
);
create index cfi_schedule_time_off_range_idx on public.cfi_schedule_time_off (cfi_user_id, start_at, end_at);

alter table public.cfi_schedule_teaching_rules enable row level security;
alter table public.cfi_schedule_time_off enable row level security;
create policy teaching_rules_select_own on public.cfi_schedule_teaching_rules for select to authenticated using ((select auth.uid()) = cfi_user_id);
create policy teaching_rules_insert_own on public.cfi_schedule_teaching_rules for insert to authenticated with check ((select auth.uid()) = cfi_user_id);
create policy teaching_rules_update_own on public.cfi_schedule_teaching_rules for update to authenticated using ((select auth.uid()) = cfi_user_id) with check ((select auth.uid()) = cfi_user_id);
create policy time_off_select_own on public.cfi_schedule_time_off for select to authenticated using ((select auth.uid()) = cfi_user_id);
create policy time_off_insert_own on public.cfi_schedule_time_off for insert to authenticated with check ((select auth.uid()) = cfi_user_id);
create policy time_off_update_own on public.cfi_schedule_time_off for update to authenticated using ((select auth.uid()) = cfi_user_id) with check ((select auth.uid()) = cfi_user_id);
create policy time_off_delete_own on public.cfi_schedule_time_off for delete to authenticated using ((select auth.uid()) = cfi_user_id);

revoke all on public.cfi_schedule_teaching_rules, public.cfi_schedule_time_off from public, anon, authenticated;
grant select, insert, update on public.cfi_schedule_teaching_rules to authenticated;
grant select, insert, update, delete on public.cfi_schedule_time_off to authenticated;
grant all on public.cfi_schedule_teaching_rules, public.cfi_schedule_time_off to service_role;

create trigger teaching_rules_revision before insert or update or delete on public.cfi_schedule_teaching_rules
for each row execute function private.touch_cfi_schedule_revision();
create trigger time_off_revision before insert or update or delete on public.cfi_schedule_time_off
for each row execute function private.touch_cfi_schedule_revision();
