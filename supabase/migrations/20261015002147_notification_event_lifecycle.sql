-- Attach stable business identities to existing producers without changing their APIs.
create function private.prepare_notification_event_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.event_key is null and new.dedupe_key is not null then
    new.event_key := case
      when new.kind = 'schedule' and new.dedupe_key like 'cfi-schedule-event:%'
        then split_part(new.dedupe_key,':',1) || ':' || split_part(new.dedupe_key,':',2)
      when new.kind = 'reminder' and new.dedupe_key ~ '^(certificate|medical|aircraft):'
        then regexp_replace(new.dedupe_key,':[^:]+$','')
      else new.dedupe_key end;
  end if;
  return new;
end;
$$;
revoke all on function private.prepare_notification_event_identity() from public, anon, authenticated;
create trigger prepare_notification_event_identity before insert or update on public.notifications
  for each row execute function private.prepare_notification_event_identity();

-- Only the underlying profile-reminder resolver can establish completion here;
-- displaying or opening a message never counts as completing the task.
create function private.complete_resolved_profile_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.is_active and not new.is_active and new.kind = 'reminder'
    and new.dedupe_key like 'profile-completion:%' and new.recipient_user_id is not null
    and new.withdrawn_at is null then
    insert into public.notification_delivery_states(notification_id,user_id,completed_at)
    values(new.id,new.recipient_user_id,now())
    on conflict(notification_id,user_id) do update set completed_at=excluded.completed_at;
  end if;
  return new;
end;
$$;
revoke all on function private.complete_resolved_profile_notification() from public, anon, authenticated;
create trigger complete_resolved_profile_notification after update on public.notifications
  for each row execute function private.complete_resolved_profile_notification();
