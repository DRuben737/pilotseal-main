-- Organization managers can review every Part 141 TCO record owned by their organization.

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
     or not private.is_organization_manager(p_organization_id, auth.uid()) then
    raise exception 'Only an organization Owner or Admin can view all training records.'
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
  'Lists every Part 141 TCO training record for one organization for its Owner or Admin.';
