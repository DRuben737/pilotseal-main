create table if not exists public.saved_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('cfi', 'student')),
  display_name text not null,
  cert_number text,
  cert_exp_date text,
  is_default boolean not null default false,
  alert_sent boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.saved_people enable row level security;

create policy "saved_people_select_own"
on public.saved_people
for select
using (auth.uid() = user_id);

create policy "saved_people_insert_own"
on public.saved_people
for insert
with check (auth.uid() = user_id);

create policy "saved_people_delete_own"
on public.saved_people
for delete
using (auth.uid() = user_id);

create policy "saved_people_update_own"
on public.saved_people
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create unique index if not exists saved_people_one_default_cfi_per_user
on public.saved_people (user_id)
where role = 'cfi' and is_default = true;
