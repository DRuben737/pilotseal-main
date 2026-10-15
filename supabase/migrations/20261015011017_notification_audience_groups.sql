-- Publishing capability can inspect only its authorized audience and role groups.
create function public.get_notification_publication_audience_groups(p_organization_id uuid default null)
returns table(user_id uuid, display_name text, group_keys text[])
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (case when p_organization_id is null then private.is_platform_admin(auth.uid())
    else private.has_organization_permission(p_organization_id,'notifications',auth.uid()) end) then
    raise exception 'Publishing permission required' using errcode = '42501';
  end if;
  return query
    select p.id, coalesce(nullif(p.display_name,''),'Member'),
      case when p_organization_id is null then
        array[case when p.role = 'admin' then 'administrators' else 'members' end]::text[]
      else
        array[case when m.teaching_role = 'instructor' then 'instructors'
          when m.teaching_role = 'student' then 'students' else 'unassigned' end]::text[]
        || case when m.role in ('owner','organization_admin') then array['administrators']::text[] else '{}'::text[] end
      end
    from public.profiles p
    left join public.organization_members m on m.user_id=p.id and m.organization_id=p_organization_id
    where p_organization_id is null or m.user_id is not null
    order by p.display_name,p.id;
end;
$$;
revoke all on function public.get_notification_publication_audience_groups(uuid) from public,anon;
grant execute on function public.get_notification_publication_audience_groups(uuid) to authenticated;
