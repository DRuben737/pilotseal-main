create table if not exists public.dashboard_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  quick_action_ids text[] not null default array[
    'new_endorsement',
    'flight_brief',
    'weight_balance',
    'records',
    'people'
  ]::text[],
  updated_at timestamptz not null default now()
);

alter table public.dashboard_preferences enable row level security;

create policy dashboard_preferences_own_select
on public.dashboard_preferences for select to authenticated
using (user_id = (select auth.uid()));

create policy dashboard_preferences_own_insert
on public.dashboard_preferences for insert to authenticated
with check (user_id = (select auth.uid()));

create policy dashboard_preferences_own_update
on public.dashboard_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy dashboard_preferences_own_delete
on public.dashboard_preferences for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.dashboard_preferences from public, anon, authenticated;
grant select, insert, update, delete on table public.dashboard_preferences to authenticated;
grant select, insert, update, delete on table public.dashboard_preferences to service_role;
