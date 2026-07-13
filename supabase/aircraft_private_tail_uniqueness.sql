-- Private aircraft should be unique per owner, not globally by tail number.
-- Shared aircraft remain globally unique by tail number.

delete from public.aircraft aircraft_row
where aircraft_row.visibility = 'private'
  and not exists (
    select 1
    from public.saved_aircraft saved_row
    where saved_row.aircraft_id = aircraft_row.id
  );

alter table public.aircraft
  drop constraint if exists aircraft_tail_number_unique;

drop index if exists public.aircraft_tail_number_unique;

create unique index if not exists aircraft_tail_number_shared_unique_idx
on public.aircraft (upper(tail_number))
where visibility = 'shared';

create unique index if not exists aircraft_tail_number_private_owner_unique_idx
on public.aircraft (owner_user_id, upper(tail_number))
where visibility = 'private'
  and owner_user_id is not null;
