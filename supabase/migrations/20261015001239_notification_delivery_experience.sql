-- Presentation state is separate from reading and business completion.
alter table public.notifications
  add column expires_at timestamptz,
  add column event_key text,
  add column requires_acknowledgement boolean not null default false,
  add column withdrawn_at timestamptz;

alter table public.notification_preferences
  add column delivery_modes jsonb not null default '{"organization":"instant","system":"instant","schedule":"instant","reminder":"inbox"}'::jsonb,
  add constraint notification_delivery_modes_valid check (
    jsonb_typeof(delivery_modes) = 'object'
    and delivery_modes ?& array['organization','system','schedule','reminder']
    and delivery_modes->>'organization' in ('instant','inbox','off')
    and delivery_modes->>'system' in ('instant','inbox','off')
    and delivery_modes->>'schedule' in ('instant','inbox','off')
    and delivery_modes->>'reminder' in ('instant','inbox','off')
  );

create table public.notification_delivery_states (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  displayed_at timestamptz,
  dismissed_at timestamptz,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  primary key (notification_id, user_id)
);
create index notification_delivery_states_user_idx on public.notification_delivery_states(user_id, displayed_at desc);
alter table public.notification_delivery_states enable row level security;
revoke all on public.notification_delivery_states from public, anon, authenticated;
grant select, insert, update on public.notification_delivery_states to authenticated;
grant all on public.notification_delivery_states to service_role;
create policy delivery_states_own_read on public.notification_delivery_states
  for select to authenticated using (user_id = (select auth.uid()));
create policy delivery_states_own_insert on public.notification_delivery_states
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.notifications n where n.id = notification_id
      and n.status = 'sent' and n.is_active and n.withdrawn_at is null
      and (n.scheduled_at is null or n.scheduled_at <= now())
      and (n.expires_at is null or n.expires_at > now())
    )
  );
create policy delivery_states_own_update on public.notification_delivery_states
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.notifications n where n.id = notification_id
  ));

-- Invoker preserves notification RLS; conflict handling makes competing tabs/devices
-- claim the same message at most once without granting clients other users' state.
create function public.claim_notification_delivery(p_notification_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare claimed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.notification_delivery_states(notification_id, user_id, displayed_at)
  values (p_notification_id, auth.uid(), now())
  on conflict (notification_id, user_id) do nothing;
  get diagnostics claimed = row_count;
  return claimed = 1;
end;
$$;
revoke all on function public.claim_notification_delivery(uuid) from public, anon;
grant execute on function public.claim_notification_delivery(uuid) to authenticated;
alter publication supabase_realtime add table public.notification_delivery_states;

-- Reserve a group briefly, then record presentation only after it is rendered.
alter table public.notification_delivery_states
  add column claim_token uuid,
  add column claim_until timestamptz;

create function public.reserve_notification_deliveries(p_notification_ids uuid[], p_token uuid)
returns uuid[] language plpgsql security invoker set search_path = '' as $$
declare
  reserved uuid[] := '{}';
  candidate public.notifications%rowtype;
  modes jsonb;
  changed integer;
  first_source text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_token is null or cardinality(p_notification_ids) > 100 then raise exception 'Invalid delivery group'; end if;
  -- All sessions of this recipient share the same lock and frequency limit.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 42));
  if exists(select 1 from public.notification_delivery_states where user_id = auth.uid()
    and (displayed_at > now() - interval '60 seconds' or claim_until > now())) then return reserved; end if;
  select delivery_modes into modes from public.notification_preferences where user_id = auth.uid();
  modes := coalesce(modes, '{"organization":"instant","system":"instant","schedule":"instant","reminder":"inbox"}'::jsonb);
  for candidate in select * from public.notifications where id = any(p_notification_ids)
    and status = 'sent' and is_active and withdrawn_at is null
    and (expires_at is null or expires_at > now()) and (scheduled_at is null or scheduled_at <= now())
    order by created_at desc
  loop
    if modes->>candidate.kind <> 'instant' then continue; end if;
    if exists(select 1 from public.notification_reads where user_id = auth.uid() and notification_id = candidate.id)
      or exists(select 1 from public.notification_inbox_deletions where user_id = auth.uid() and notification_id = candidate.id) then continue; end if;
    if first_source is null then first_source := candidate.kind || ':' || coalesce(candidate.organization_id::text, 'personal'); end if;
    if first_source <> candidate.kind || ':' || coalesce(candidate.organization_id::text, 'personal') then continue; end if;
    insert into public.notification_delivery_states(notification_id, user_id, claim_token, claim_until)
      values(candidate.id, auth.uid(), p_token, now() + interval '15 seconds')
      on conflict (notification_id, user_id) do update set claim_token = excluded.claim_token, claim_until = excluded.claim_until
      where notification_delivery_states.displayed_at is null and notification_delivery_states.dismissed_at is null
        and (notification_delivery_states.claim_until is null or notification_delivery_states.claim_until <= now());
    get diagnostics changed = row_count;
    if changed > 0 then reserved := array_append(reserved, candidate.id); end if;
  end loop;
  return reserved;
end;
$$;

create function public.confirm_notification_deliveries(p_token uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.notification_delivery_states set displayed_at = now(), claim_until = null
  where user_id = auth.uid() and claim_token = p_token and claim_until > now() and displayed_at is null;
$$;
revoke all on function public.reserve_notification_deliveries(uuid[], uuid) from public, anon;
revoke all on function public.confirm_notification_deliveries(uuid) from public, anon;
grant execute on function public.reserve_notification_deliveries(uuid[], uuid), public.confirm_notification_deliveries(uuid) to authenticated;

create table public.notification_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  message text not null,
  priority text not null check (priority in ('low','normal','high','critical')),
  status text not null check (status in ('draft','scheduled','sent','withdrawn')),
  scheduled_at timestamptz,
  expires_at timestamptz,
  action_url text,
  requires_acknowledgement boolean not null default false,
  audience_user_ids uuid[],
  revision integer not null default 1
);
alter table public.notifications add column publication_id uuid references public.notification_publications(id);
create index notifications_publication_idx on public.notifications(publication_id);
alter table public.notification_publications enable row level security;
revoke all on public.notification_publications from public, anon, authenticated;
grant select on public.notification_publications to authenticated;
grant all on public.notification_publications to service_role;
create function private.can_manage_notification_publication(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and case when p_organization_id is null then private.is_platform_admin(auth.uid())
    else private.has_organization_permission(p_organization_id,'notifications',auth.uid()) end;
$$;
revoke all on function private.can_manage_notification_publication(uuid) from public, anon;
grant execute on function private.can_manage_notification_publication(uuid) to authenticated;
create policy publications_manage_read on public.notification_publications for select to authenticated
  using (private.can_manage_notification_publication(organization_id));

create function public.get_notification_publication_audience(p_organization_id uuid default null)
returns table(user_id uuid, display_name text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (case when p_organization_id is null then private.is_platform_admin(auth.uid())
    else private.has_organization_permission(p_organization_id,'notifications',auth.uid()) end) then
    raise exception 'Publishing permission required' using errcode = '42501';
  end if;
  return query select p.id, coalesce(nullif(p.display_name,''),'Member') from public.profiles p
    where p_organization_id is null or exists(select 1 from public.organization_members m where m.organization_id = p_organization_id and m.user_id = p.id)
    order by p.display_name, p.id;
end;
$$;

create function public.save_notification_publication(
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
    select 1 from unnest(p_audience_user_ids) x where not (x = any(coalesce(target_ids,'{}'::uuid[])))
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
    insert into public.notifications(title,message,content,priority,status,is_active,scheduled_at,created_by,kind,recipient_user_id,organization_id,source_label,action_url,expires_at,event_key,requires_acknowledgement,publication_id)
    select btrim(p_title),btrim(p_message),btrim(p_message),p_priority,'sent',true,
      (case when p_status = 'scheduled' then p_scheduled_at else now() end) at time zone 'UTC',auth.uid(),
      case when p_organization_id is null then 'system' else 'organization' end,
      target,p_organization_id,source_name,nullif(p_action_url,''),p_expires_at,next_id::text,p_requires_acknowledgement,next_id
    from unnest(coalesce(target_ids,'{}'::uuid[])) target;
  end if;
  return next_id;
end;
$$;

create function public.withdraw_notification_publication(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare publication public.notification_publications%rowtype;
begin
  select * into publication from public.notification_publications where id = p_id for update;
  if not found or auth.uid() is null or not (case when publication.organization_id is null then private.is_platform_admin(auth.uid())
    else private.has_organization_permission(publication.organization_id,'notifications',auth.uid()) end) then
    raise exception 'Publishing permission required' using errcode = '42501'; end if;
  update public.notification_publications set status = 'withdrawn',updated_at = now() where id = p_id;
  update public.notifications set withdrawn_at = now(),is_active = false where publication_id = p_id;
end;
$$;

create function public.get_notification_publication_report(p_id uuid)
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
    where n.publication_id = p_id and n.withdrawn_at is null order by p.display_name;
end;
$$;
revoke all on function public.get_notification_publication_audience(uuid), public.save_notification_publication(uuid,text,text,text,text,timestamptz,timestamptz,text,boolean,uuid[],uuid), public.withdraw_notification_publication(uuid), public.get_notification_publication_report(uuid) from public, anon;
grant execute on function public.get_notification_publication_audience(uuid), public.save_notification_publication(uuid,text,text,text,text,timestamptz,timestamptz,text,boolean,uuid[],uuid), public.withdraw_notification_publication(uuid), public.get_notification_publication_report(uuid) to authenticated;
