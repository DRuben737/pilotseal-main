-- Match Training Records organization visibility to the existing Endorsements
-- permission boundary. This includes organization managers and platform admins
-- while continuing to reject ordinary organization members.

create or replace function public.list_organization_training_records(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null
     or not private.has_organization_permission(
       p_organization_id,
       'endorsements',
       auth.uid()
     ) then
    raise exception 'Training record organization access is required.'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(record_row)
      order by record_row.lesson_date desc, record_row.created_at desc
    ),
    '[]'::jsonb
  )
  into result
  from public.training_records record_row
  where record_row.organization_id = p_organization_id;

  return result;
end;
$$;

revoke all on function public.list_organization_training_records(uuid)
  from public, anon;
grant execute on function public.list_organization_training_records(uuid)
  to authenticated, service_role;

comment on function public.list_organization_training_records(uuid) is
  'Lists organization Part 141 TCO records for users with endorsement-equivalent organization access.';
