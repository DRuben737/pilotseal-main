-- Preserve the latest revision receipts when a publication is withdrawn.
alter table public.notifications add column publication_revision integer not null default 1;
create or replace function public.save_notification_publication(
  p_organization_id uuid, p_title text, p_message text, p_priority text,
  p_status text, p_scheduled_at timestamptz default null, p_expires_at timestamptz default null,
  p_action_url text default null, p_requires_acknowledgement boolean default false,
  p_audience_user_ids uuid[] default null, p_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  publication public.notification_publications%rowtype;
  target_ids uuid[];
  source_name text;
  next_id uuid;
begin
  if auth.uid() is null or not (case when p_organization_id is null then private.is_platform_admin(auth.uid())
    else private.has_organization_permission(p_organization_id,'notifications',auth.uid()) end) then
    raise exception 'Publishing permission required' using errcode = '42501';
  end if;
  if nullif(btrim(p_title),'') is null or nullif(btrim(p_message),'') is null
    or p_priority is null or p_priority not in ('low','normal','high','critical')
    or p_status is null or p_status not in ('draft','scheduled','sent') then raise exception 'Invalid publication'; end if;
  if p_status = 'scheduled' and (p_scheduled_at is null or p_scheduled_at <= now()) then raise exception 'Choose a future publication time'; end if;
  if p_expires_at is not null and p_expires_at <= greatest(now(),coalesce(p_scheduled_at,now())) then raise exception 'Expiry must follow publication'; end if;
  if nullif(p_action_url,'') is not null and (left(p_action_url,1) <> '/' or left(p_action_url,2) = '//' or p_action_url ~ '[[:space:]\\]' or p_action_url ~* '%(2f|5c|0[0-9a-f]|1[0-9a-f])') then raise exception 'Use a relative site link'; end if;
  select array_agg(a.user_id) into target_ids from public.get_notification_publication_audience(p_organization_id) a
    where p_audience_user_ids is null or a.user_id = any(p_audience_user_ids);
  if p_audience_user_ids is not null and (cardinality(p_audience_user_ids) = 0 or exists(
    select 1 from unnest(p_audience_user_ids) x where x is null or not (x = any(coalesce(target_ids,'{}'::uuid[])))
  )) then raise exception 'Audience contains unavailable members'; end if;
  if p_id is not null then
    select * into publication from public.notification_publications where id = p_id for update;
    if not found or publication.organization_id is distinct from p_organization_id then raise exception 'Publication not found' using errcode = '42501'; end if;
    if publication.status in ('sent','scheduled') and p_status = 'draft' then raise exception 'Withdraw a published message before changing it to draft'; end if;
    update public.notification_publications set title = btrim(p_title), message = btrim(p_message), priority = p_priority,
      status = p_status, scheduled_at = p_scheduled_at, expires_at = p_expires_at, action_url = nullif(p_action_url,''),
      requires_acknowledgement = p_requires_acknowledgement, audience_user_ids = p_audience_user_ids,
      revision = revision + 1, updated_at = now() where id = p_id returning id into next_id;
    update public.notifications set withdrawn_at = now(), is_active = false where publication_id = p_id and withdrawn_at is null;
  else
    insert into public.notification_publications(organization_id,created_by,title,message,priority,status,scheduled_at,expires_at,action_url,requires_acknowledgement,audience_user_ids)
    values(p_organization_id,auth.uid(),btrim(p_title),btrim(p_message),p_priority,p_status,p_scheduled_at,p_expires_at,nullif(p_action_url,''),p_requires_acknowledgement,p_audience_user_ids) returning id into next_id;
  end if;
  if p_status <> 'draft' then
    select case when p_organization_id is null then 'PilotSeal' else (select name from public.organizations where id = p_organization_id) end into source_name;
    insert into public.notifications(title,message,content,priority,status,is_active,scheduled_at,created_by,kind,recipient_user_id,organization_id,source_label,action_url,expires_at,event_key,requires_acknowledgement,publication_id,publication_revision)
    select btrim(p_title),btrim(p_message),btrim(p_message),p_priority,'sent',true,
      (case when p_status = 'scheduled' then p_scheduled_at else now() end) at time zone 'UTC',auth.uid(),
      case when p_organization_id is null then 'system' else 'organization' end,
      target,p_organization_id,source_name,nullif(p_action_url,''),p_expires_at,next_id::text,p_requires_acknowledgement,next_id,(select revision from public.notification_publications where id=next_id)
    from unnest(coalesce(target_ids,'{}'::uuid[])) target;
  end if;
  return next_id;
end;
$$;

create or replace function public.get_notification_publication_report(p_id uuid)
returns table(user_id uuid,display_name text,displayed_at timestamptz,read_at timestamptz,acknowledged_at timestamptz,completed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare publication public.notification_publications%rowtype;
begin
  select * into publication from public.notification_publications where id = p_id;
  if not found or auth.uid() is null or not (case when publication.organization_id is null then private.is_platform_admin(auth.uid())
    else private.has_organization_permission(publication.organization_id,'notifications',auth.uid()) end) then
    raise exception 'Publishing permission required' using errcode = '42501'; end if;
  return query select n.recipient_user_id,coalesce(p.display_name,'Member'),s.displayed_at,r.read_at::timestamptz,s.acknowledged_at,s.completed_at
    from public.notifications n join public.profiles p on p.id = n.recipient_user_id
    left join public.notification_delivery_states s on s.notification_id = n.id and s.user_id = n.recipient_user_id
    left join public.notification_reads r on r.notification_id = n.id and r.user_id = n.recipient_user_id
    where n.publication_id = p_id and n.publication_revision = publication.revision order by p.display_name;
end;
$$;