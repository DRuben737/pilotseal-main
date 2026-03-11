alter table public.notifications enable row level security;

create policy "notifications_select_active"
on public.notifications
for select
using (is_active = true);

create policy "notifications_insert_admin"
on public.notifications
for insert
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);
