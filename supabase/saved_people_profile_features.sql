alter table if exists public.saved_people
  add column if not exists is_default boolean not null default false,
  add column if not exists alert_sent boolean not null default false;

drop policy if exists "saved_people_update_own" on public.saved_people;

create policy "saved_people_update_own"
on public.saved_people
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create unique index if not exists saved_people_one_default_cfi_per_user
on public.saved_people (user_id)
where role = 'cfi' and is_default = true;
