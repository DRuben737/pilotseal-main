alter table public.saved_aircraft
  add column if not exists hundred_hour_due_hours numeric,
  add column if not exists annual_due_date date,
  add column if not exists static_due_date date,
  add column if not exists transponder_due_date date,
  add column if not exists elt_due_date date;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'saved_aircraft'
      and column_name = 'adsb_due_date'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'saved_aircraft'
      and column_name = 'elt_due_date'
  ) then
    alter table public.saved_aircraft rename column adsb_due_date to elt_due_date;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'saved_aircraft'
      and column_name = 'adsb_due_date'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'saved_aircraft'
      and column_name = 'elt_due_date'
  ) then
    update public.saved_aircraft
    set elt_due_date = coalesce(elt_due_date, adsb_due_date)
    where elt_due_date is null and adsb_due_date is not null;

    alter table public.saved_aircraft drop column adsb_due_date;
  end if;
end;
$$;

create or replace function public.set_aircraft_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists aircraft_set_updated_at on public.aircraft;
create trigger aircraft_set_updated_at
before update on public.aircraft
for each row
execute function public.set_aircraft_updated_at();
