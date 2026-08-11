create table if not exists public.notification_inbox_deletions (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists notification_inbox_deletions_user_id_idx
  on public.notification_inbox_deletions (user_id, deleted_at desc);

alter table public.notification_inbox_deletions enable row level security;

create policy notification_inbox_deletions_own_select
on public.notification_inbox_deletions for select to authenticated
using (user_id = (select auth.uid()));

create policy notification_inbox_deletions_own_insert
on public.notification_inbox_deletions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.notifications notification
    where notification.id = notification_id
  )
);

create policy notification_inbox_deletions_own_update
on public.notification_inbox_deletions for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy notification_inbox_deletions_own_delete
on public.notification_inbox_deletions for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.notification_inbox_deletions from public, anon, authenticated;
grant select, insert, update, delete on table public.notification_inbox_deletions to authenticated;
grant select, insert, update, delete on table public.notification_inbox_deletions to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_inbox_deletions'
  ) then
    alter publication supabase_realtime add table public.notification_inbox_deletions;
  end if;
end
$$;
