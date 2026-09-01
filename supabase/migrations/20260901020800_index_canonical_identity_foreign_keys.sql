-- Cover identity and membership foreign keys used by Flight Brief visibility
-- checks and canonical profile lookups. These indexes are additive only.
create index if not exists profiles_self_person_idx
  on public.profiles (self_person_id)
  where self_person_id is not null;

create index if not exists flight_briefs_student_saved_person_idx
  on public.flight_briefs (student_saved_person_id)
  where student_saved_person_id is not null;

create index if not exists flight_briefs_membership_period_idx
  on public.flight_briefs (membership_period_id)
  where membership_period_id is not null;

create index if not exists flight_briefs_instructor_membership_period_idx
  on public.flight_briefs (instructor_membership_period_id)
  where instructor_membership_period_id is not null;

create index if not exists flight_briefs_student_membership_period_idx
  on public.flight_briefs (student_membership_period_id)
  where student_membership_period_id is not null;

create index if not exists flight_briefs_supersedes_idx
  on public.flight_briefs (supersedes_id)
  where supersedes_id is not null;
