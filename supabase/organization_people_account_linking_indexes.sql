-- Cover the nullable account link used by roster reconciliation and member removal.
create index if not exists organization_people_user_id_idx
  on public.organization_people (user_id)
  where user_id is not null;
