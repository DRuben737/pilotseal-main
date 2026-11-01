create table public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_key uuid not null,
  platform text not null default 'web' check (platform in ('web','ios','android','desktop')),
  permission text not null default 'default' check (permission in ('default','granted','denied','unsupported')),
  is_installed boolean not null default false,
  push_subscription jsonb,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_key)
);

create index notification_devices_push_idx
  on public.notification_devices (user_id, enabled)
  where push_subscription is not null;

alter table public.notification_devices enable row level security;
create policy notification_devices_own_read on public.notification_devices
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.notification_devices from public, anon;
grant select on public.notification_devices to authenticated;
grant all on public.notification_devices to service_role;

create table public.notification_channel_deliveries (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.notification_devices(id) on delete cascade,
  channel text not null check (channel in ('in_app','web_push')),
  claimed_at timestamptz,
  delivered_at timestamptz,
  displayed_at timestamptz,
  dismissed_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (notification_id, device_id, channel)
);

create index notification_channel_deliveries_user_idx
  on public.notification_channel_deliveries (user_id, device_id, channel, notification_id);

alter table public.notification_channel_deliveries enable row level security;
create policy notification_channel_deliveries_own_read on public.notification_channel_deliveries
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.notification_channel_deliveries from public, anon;
grant select on public.notification_channel_deliveries to authenticated;
grant all on public.notification_channel_deliveries to service_role;

create function public.register_notification_device(
  p_device_key uuid,
  p_platform text,
  p_permission text,
  p_is_installed boolean,
  p_push_subscription jsonb default null,
  p_enabled boolean default true
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  result_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_platform not in ('web','ios','android','desktop') then raise exception 'Invalid platform'; end if;
  if p_permission not in ('default','granted','denied','unsupported') then raise exception 'Invalid permission'; end if;
  if p_push_subscription is not null and (
    jsonb_typeof(p_push_subscription) <> 'object'
    or coalesce(p_push_subscription->>'endpoint','') = ''
    or jsonb_typeof(p_push_subscription->'keys') <> 'object'
  ) then raise exception 'Invalid push subscription'; end if;

  insert into public.notification_devices(user_id,device_key,platform,permission,is_installed,push_subscription,enabled,last_seen_at,updated_at)
  values(current_user_id,p_device_key,p_platform,p_permission,p_is_installed,p_push_subscription,p_enabled,now(),now())
  on conflict (user_id,device_key) do update set
    platform=excluded.platform,permission=excluded.permission,is_installed=excluded.is_installed,
    push_subscription=excluded.push_subscription,enabled=excluded.enabled,last_seen_at=now(),updated_at=now()
  returning id into result_id;
  return result_id;
end;
$$;

create function public.reserve_notification_channel_deliveries(
  p_notification_ids uuid[], p_device_key uuid
) returns setof uuid
language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  current_device_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select id into current_device_id from public.notification_devices
    where user_id=current_user_id and device_key=p_device_key and enabled=true;
  if current_device_id is null then return; end if;

  return query
  with eligible as (
    select n.id from public.notifications n
    where n.id = any(p_notification_ids[1:100])
      and n.status='sent' and coalesce(n.is_active,true) and n.withdrawn_at is null
      and (n.scheduled_at is null or n.scheduled_at <= now())
      and (n.expires_at is null or n.expires_at > now())
      and (n.recipient_user_id=current_user_id or (n.recipient_user_id is null and n.organization_id is null))
      and n.priority <> 'low'
  ), inserted as (
    insert into public.notification_channel_deliveries(notification_id,user_id,device_id,channel,claimed_at,updated_at)
    select e.id,current_user_id,current_device_id,'in_app',now(),now() from eligible e
    on conflict (notification_id,device_id,channel) do update set
      claimed_at=case when public.notification_channel_deliveries.displayed_at is null
        and public.notification_channel_deliveries.dismissed_at is null then now()
        else public.notification_channel_deliveries.claimed_at end,
      updated_at=now()
    returning notification_id,displayed_at,dismissed_at
  ) select notification_id from inserted where displayed_at is null and dismissed_at is null;
end;
$$;

create function public.update_notification_channel_delivery(
  p_notification_ids uuid[], p_device_key uuid, p_state text
) returns void
language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); current_device_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_state not in ('displayed','dismissed') then raise exception 'Invalid delivery state'; end if;
  select id into current_device_id from public.notification_devices where user_id=current_user_id and device_key=p_device_key;
  if current_device_id is null then raise exception 'Unknown device'; end if;
  insert into public.notification_channel_deliveries(notification_id,user_id,device_id,channel,displayed_at,dismissed_at,updated_at)
  select n.id,current_user_id,current_device_id,'in_app',
    case when p_state='displayed' then now() end,
    case when p_state='dismissed' then now() end,now()
  from public.notifications n where n.id=any(p_notification_ids[1:100])
  on conflict (notification_id,device_id,channel) do update set
    displayed_at=case when p_state='displayed' then coalesce(public.notification_channel_deliveries.displayed_at,now()) else public.notification_channel_deliveries.displayed_at end,
    dismissed_at=case when p_state='dismissed' then now() else public.notification_channel_deliveries.dismissed_at end,
    updated_at=now();
end;
$$;

revoke all on function public.register_notification_device(uuid,text,text,boolean,jsonb,boolean),
  public.reserve_notification_channel_deliveries(uuid[],uuid),
  public.update_notification_channel_delivery(uuid[],uuid,text) from public,anon;
grant execute on function public.register_notification_device(uuid,text,text,boolean,jsonb,boolean),
  public.reserve_notification_channel_deliveries(uuid[],uuid),
  public.update_notification_channel_delivery(uuid[],uuid,text) to authenticated;

-- Critical messages always require an explicit receipt confirmation.
create function private.enforce_critical_notification_acknowledgement()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.priority='critical' then new.requires_acknowledgement := true; end if;
  return new;
end;
$$;
drop trigger if exists notifications_enforce_critical_ack on public.notifications;
create trigger notifications_enforce_critical_ack before insert or update of priority,requires_acknowledgement
  on public.notifications for each row execute function private.enforce_critical_notification_acknowledgement();
update public.notifications set requires_acknowledgement=true
  where priority='critical' and requires_acknowledgement is distinct from true;

-- The endpoint is environment configuration, not application data. It is set after
-- deployment and can be nulled instantly to stop dispatch without affecting inbox delivery.
create table private.notification_push_config (
  singleton boolean primary key default true check (singleton),
  endpoint text,
  updated_at timestamptz not null default now()
);
insert into private.notification_push_config(singleton) values(true) on conflict do nothing;

create function private.dispatch_due_notification_pushes()
returns void language plpgsql security definer set search_path = '' as $$
declare dispatch_endpoint text;
begin
  select endpoint into dispatch_endpoint from private.notification_push_config where singleton;
  if dispatch_endpoint is null or dispatch_endpoint = '' then return; end if;
  perform net.http_post(
    url := dispatch_endpoint,
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('source','database')
  );
end;
$$;

create function private.queue_notification_push_dispatch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='sent' and coalesce(new.is_active,true) and new.withdrawn_at is null
    and new.priority in ('normal','high','critical') then
    perform private.dispatch_due_notification_pushes();
  end if;
  return new;
end;
$$;
drop trigger if exists notifications_dispatch_web_push on public.notifications;
create trigger notifications_dispatch_web_push after insert or update of status,is_active,withdrawn_at,scheduled_at
  on public.notifications for each row execute function private.queue_notification_push_dispatch();

create function public.claim_due_notification_web_pushes(p_limit integer default 100)
returns table(
  notification_id uuid, user_id uuid, device_id uuid, endpoint text, p256dh text, auth_secret text,
  title text, message text, priority text, action_url text, source_label text
)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  return query
  with candidates as (
    select n.id notification_id,d.user_id,d.id device_id,
      d.push_subscription->>'endpoint' endpoint,
      d.push_subscription->'keys'->>'p256dh' p256dh,
      d.push_subscription->'keys'->>'auth' auth_secret,
      n.title,n.message,n.priority,n.action_url,n.source_label
    from public.notifications n
    join public.notification_devices d on d.enabled and d.permission='granted' and d.push_subscription is not null
      and (n.recipient_user_id=d.user_id or (n.recipient_user_id is null and n.organization_id is null))
    left join public.notification_preferences p on p.user_id=d.user_id
    left join public.notification_channel_deliveries cd on cd.notification_id=n.id and cd.device_id=d.id and cd.channel='web_push'
    where n.status='sent' and coalesce(n.is_active,true) and n.withdrawn_at is null
      and n.priority in ('normal','high','critical')
      and (n.scheduled_at is null or n.scheduled_at <= now())
      and (n.expires_at is null or n.expires_at > now())
      and cd.notification_id is null
      and (n.priority='critical' or (
        coalesce(p.delivery_modes->>n.kind,'instant')='instant'
        and case n.kind when 'reminder' then coalesce(p.personal_reminders_enabled,true)
          when 'organization' then coalesce(p.organization_messages_enabled,true)
          when 'schedule' then coalesce(p.schedule_notifications_enabled,true)
          else coalesce(p.platform_notices_enabled,true) end
      ))
    order by case n.priority when 'critical' then 0 when 'high' then 1 else 2 end,n.created_at
    limit greatest(1,least(coalesce(p_limit,100),500))
    for update of n skip locked
  ), claimed as (
    insert into public.notification_channel_deliveries(notification_id,user_id,device_id,channel,claimed_at,updated_at)
    select c.notification_id,c.user_id,c.device_id,'web_push',now(),now() from candidates c
    on conflict do nothing returning
      public.notification_channel_deliveries.notification_id,
      public.notification_channel_deliveries.user_id,
      public.notification_channel_deliveries.device_id
  )
  select c.notification_id,c.user_id,c.device_id,c.endpoint,c.p256dh,c.auth_secret,c.title,c.message,c.priority,c.action_url,c.source_label
  from candidates c join claimed x on x.notification_id=c.notification_id and x.user_id=c.user_id and x.device_id=c.device_id;
end;
$$;

create function public.finish_notification_web_push(
  p_notification_id uuid,p_device_id uuid,p_delivered boolean,p_failure_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.notification_channel_deliveries set
    delivered_at=case when p_delivered then now() else delivered_at end,
    failed_at=case when p_delivered then null else now() end,
    failure_reason=case when p_delivered then null else left(coalesce(p_failure_reason,'Push failed'),300) end,
    updated_at=now()
  where notification_id=p_notification_id and device_id=p_device_id and channel='web_push';
  if not p_delivered and coalesce(p_failure_reason,'') like '410:%' then
    update public.notification_devices set push_subscription=null,permission='default',updated_at=now()
      where id=p_device_id;
  end if;
end;
$$;

revoke all on function public.claim_due_notification_web_pushes(integer),
  public.finish_notification_web_push(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_due_notification_web_pushes(integer),
  public.finish_notification_web_push(uuid,uuid,boolean,text) to service_role;

do $$ begin
  perform cron.unschedule('pilotseal-notification-web-push');
exception when others then null; end $$;
select cron.schedule('pilotseal-notification-web-push','* * * * *',
  'select private.dispatch_due_notification_pushes()');

-- Preserve the existing user-level displayed receipt for publication reports
-- while device-level records independently control interruption on each device.
create function private.sync_notification_global_display()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.channel='in_app' and new.displayed_at is not null
    and (tg_op='INSERT' or old.displayed_at is null) then
    insert into public.notification_delivery_states(notification_id,user_id,displayed_at)
    values(new.notification_id,new.user_id,new.displayed_at)
    on conflict (notification_id,user_id) do update set
      displayed_at=coalesce(public.notification_delivery_states.displayed_at,excluded.displayed_at);
  end if;
  return new;
end;
$$;

create trigger notification_channel_sync_global_display
after insert or update of displayed_at on public.notification_channel_deliveries
for each row execute function private.sync_notification_global_display();
