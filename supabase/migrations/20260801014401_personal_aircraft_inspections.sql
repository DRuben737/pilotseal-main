create table if not exists public.personal_aircraft_inspections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  aircraft_id uuid not null references public.aircraft(id) on delete cascade,
  name text not null,
  basis text not null default 'calendar',
  date_precision text not null default 'day',
  due_date date,
  due_meter numeric,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint personal_aircraft_inspections_name_check
    check (char_length(btrim(name)) between 2 and 120),
  constraint personal_aircraft_inspections_basis_check
    check (basis in ('calendar', 'hobbs', 'tach', 'whichever_first')),
  constraint personal_aircraft_inspections_date_precision_check
    check (date_precision in ('day', 'month')),
  constraint personal_aircraft_inspections_due_meter_check
    check (due_meter is null or due_meter >= 0),
  constraint personal_aircraft_inspections_due_value_check
    check (
      (basis = 'calendar' and due_date is not null) or
      (basis in ('hobbs', 'tach') and due_meter is not null) or
      (basis = 'whichever_first' and due_date is not null and due_meter is not null)
    )
);

create unique index if not exists personal_aircraft_inspections_user_aircraft_name_idx
  on public.personal_aircraft_inspections (user_id, aircraft_id, lower(btrim(name)));

create index if not exists personal_aircraft_inspections_aircraft_idx
  on public.personal_aircraft_inspections (aircraft_id, user_id);

drop trigger if exists personal_aircraft_inspections_set_updated_at
  on public.personal_aircraft_inspections;
create trigger personal_aircraft_inspections_set_updated_at
before update on public.personal_aircraft_inspections
for each row execute function public.set_aircraft_updated_at();

alter table public.personal_aircraft_inspections enable row level security;

drop policy if exists personal_aircraft_inspections_select_owner
  on public.personal_aircraft_inspections;
create policy personal_aircraft_inspections_select_owner
on public.personal_aircraft_inspections for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists personal_aircraft_inspections_insert_owner
  on public.personal_aircraft_inspections;
create policy personal_aircraft_inspections_insert_owner
on public.personal_aircraft_inspections for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.saved_aircraft saved
    where saved.user_id = (select auth.uid())
      and saved.aircraft_id = personal_aircraft_inspections.aircraft_id
  )
);

drop policy if exists personal_aircraft_inspections_update_owner
  on public.personal_aircraft_inspections;
create policy personal_aircraft_inspections_update_owner
on public.personal_aircraft_inspections for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.saved_aircraft saved
    where saved.user_id = (select auth.uid())
      and saved.aircraft_id = personal_aircraft_inspections.aircraft_id
  )
);

drop policy if exists personal_aircraft_inspections_delete_owner
  on public.personal_aircraft_inspections;
create policy personal_aircraft_inspections_delete_owner
on public.personal_aircraft_inspections for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.personal_aircraft_inspections from public, anon, authenticated;
grant select, insert, update, delete on table public.personal_aircraft_inspections to authenticated;
grant all on table public.personal_aircraft_inspections to service_role;

create or replace function public.save_personal_aircraft_inspections(
  p_aircraft_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Inspection items must be an array.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.saved_aircraft saved
    where saved.user_id = auth.uid()
      and saved.aircraft_id = p_aircraft_id
  ) then
    raise exception 'Aircraft is not saved to this account.' using errcode = '42501';
  end if;

  delete from public.personal_aircraft_inspections
  where user_id = auth.uid() and aircraft_id = p_aircraft_id;

  insert into public.personal_aircraft_inspections (
    user_id, aircraft_id, name, basis, date_precision, due_date, due_meter, notes
  )
  select
    auth.uid(),
    p_aircraft_id,
    btrim(item.name),
    item.basis,
    coalesce(item.date_precision, 'day'),
    item.due_date,
    item.due_meter,
    nullif(btrim(coalesce(item.notes, '')), '')
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(
    name text,
    basis text,
    date_precision text,
    due_date date,
    due_meter numeric,
    notes text
  );
end;
$$;

revoke all on function public.save_personal_aircraft_inspections(uuid, jsonb)
  from public, anon;
grant execute on function public.save_personal_aircraft_inspections(uuid, jsonb)
  to authenticated, service_role;

create or replace function private.delete_personal_aircraft_inspections_with_saved_aircraft()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.personal_aircraft_inspections
  where user_id = old.user_id and aircraft_id = old.aircraft_id;
  return old;
end;
$$;

drop trigger if exists saved_aircraft_delete_personal_inspections on public.saved_aircraft;
create trigger saved_aircraft_delete_personal_inspections
before delete on public.saved_aircraft
for each row execute function private.delete_personal_aircraft_inspections_with_saved_aircraft();
