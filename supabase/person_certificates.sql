create table if not exists public.saved_person_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references public.saved_people(id) on delete cascade,
  certificate_type text not null check (
    certificate_type in ('pilot', 'flight_instructor', 'ground_instructor')
  ),
  certificate_number text,
  ratings text[] not null default '{}',
  issue_date date,
  last_event_date date,
  event_type text,
  is_default_for_endorsements boolean not null default false,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.saved_person_certificates enable row level security;

create policy "saved_person_certificates_select_own"
on public.saved_person_certificates
for select
using (auth.uid() = user_id);

create policy "saved_person_certificates_insert_own"
on public.saved_person_certificates
for insert
with check (auth.uid() = user_id);

create policy "saved_person_certificates_update_own"
on public.saved_person_certificates
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "saved_person_certificates_delete_own"
on public.saved_person_certificates
for delete
using (auth.uid() = user_id);

create index if not exists saved_person_certificates_person_idx
on public.saved_person_certificates (user_id, person_id);

create index if not exists saved_person_certificates_type_idx
on public.saved_person_certificates (user_id, certificate_type);

create unique index if not exists saved_person_certificates_one_default_instructor
on public.saved_person_certificates (user_id)
where certificate_type = 'flight_instructor' and is_default_for_endorsements = true;
