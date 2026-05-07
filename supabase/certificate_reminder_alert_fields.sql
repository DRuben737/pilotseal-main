alter table if exists public.saved_person_certificates
  add column if not exists last_alerted_due_date date,
  add column if not exists alert_sent_at timestamptz;

alter table if exists public.profiles
  add column if not exists last_medical_alerted_due_date date,
  add column if not exists medical_alert_sent_at timestamptz;

create index if not exists saved_person_certificates_reminder_idx
on public.saved_person_certificates (certificate_type, last_event_date)
where certificate_type in ('flight_instructor', 'ground_instructor')
  and last_event_date is not null;

drop index if exists public.saved_person_certificates_one_default_instructor;

create unique index if not exists saved_person_certificates_one_default_instructor
on public.saved_person_certificates (user_id)
where certificate_type in ('flight_instructor', 'ground_instructor')
  and is_default_for_endorsements = true;
