alter table if exists public.flights
  add column if not exists distance_km double precision,
  add column if not exists heading double precision,
  add column if not exists phase text,
  add column if not exists sequence integer,
  add column if not exists last_seen timestamptz,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

create index if not exists flights_type_updated_at_idx
  on public.flights (type, updated_at desc);

create index if not exists flights_last_seen_idx
  on public.flights (last_seen desc);

create index if not exists flights_callsign_idx
  on public.flights (callsign);
