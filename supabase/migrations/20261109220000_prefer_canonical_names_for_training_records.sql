-- A profile's self person is the canonical formal identity. Organization and
-- profile display names can both be nicknames, so use them only as fallbacks.

create or replace function private.training_record_official_name(
  p_organization_id uuid,
  p_user_id uuid,
  p_person_id uuid,
  p_fallback text
)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select nullif(btrim(person.display_name), '')
      from public.profiles profile
      join public.saved_people person
        on person.id = profile.self_person_id
       and person.user_id = profile.id
       and person.role = 'self'
      where profile.id = p_user_id
      limit 1
    ),
    (
      select nullif(btrim(person.display_name), '')
      from public.saved_people person
      where person.id = p_person_id
      limit 1
    ),
    (
      select nullif(btrim(person.organization_display_name), '')
      from public.organization_people person
      where person.organization_id = p_organization_id
        and person.user_id = p_user_id
        and person.status <> 'archived'
      order by person.linked_at desc nulls last, person.created_at desc
      limit 1
    ),
    nullif(btrim(p_fallback), ''),
    'Unknown'
  );
$$;

revoke all on function private.training_record_official_name(uuid, uuid, uuid, text)
  from public, anon, authenticated;
