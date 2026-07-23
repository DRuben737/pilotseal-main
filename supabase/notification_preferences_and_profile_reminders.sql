create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  personal_reminders_enabled boolean not null default true,
  organization_messages_enabled boolean not null default true,
  platform_notices_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_own_select on public.notification_preferences;
drop policy if exists notification_preferences_own_insert on public.notification_preferences;
drop policy if exists notification_preferences_own_update on public.notification_preferences;

create policy notification_preferences_own_select
on public.notification_preferences for select to authenticated
using (user_id = (select auth.uid()));

create policy notification_preferences_own_insert
on public.notification_preferences for insert to authenticated
with check (user_id = (select auth.uid()));

create policy notification_preferences_own_update
on public.notification_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on table public.notification_preferences from anon, authenticated;
grant select, insert, update on table public.notification_preferences to authenticated;
grant select, insert, update, delete on table public.notification_preferences to service_role;

create or replace function private.enforce_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  preferences public.notification_preferences%rowtype;
begin
  if new.recipient_user_id is null
    or new.priority = 'critical'
    or not coalesce(new.is_active, true)
  then
    return new;
  end if;

  select preference.*
  into preferences
  from public.notification_preferences as preference
  where preference.user_id = new.recipient_user_id;

  if not found then
    return new;
  end if;

  if new.kind = 'reminder' and not preferences.personal_reminders_enabled then
    return null;
  end if;

  if new.kind = 'organization' and not preferences.organization_messages_enabled then
    return null;
  end if;

  if new.kind = 'system' and not preferences.platform_notices_enabled then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_notification_preferences on public.notifications;
create trigger enforce_notification_preferences
before insert or update on public.notifications
for each row execute function private.enforce_notification_preferences();

revoke all on function private.enforce_notification_preferences() from public, anon, authenticated;

create or replace function private.create_user_notification(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_kind text default 'organization',
  p_priority text default 'normal',
  p_organization_id uuid default null,
  p_source_label text default null,
  p_action_url text default '/dashboard/notifications',
  p_dedupe_key text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_id uuid;
begin
  if p_user_id is null then return null; end if;

  insert into public.notifications (
    title, message, content, priority, status, is_active, scheduled_at,
    created_by, kind, recipient_user_id, organization_id, source_label,
    action_url, dedupe_key
  ) values (
    btrim(p_title), btrim(p_message), btrim(p_message), p_priority, 'sent', true, now(),
    p_created_by, p_kind, p_user_id, p_organization_id, nullif(btrim(p_source_label), ''),
    p_action_url, p_dedupe_key
  )
  on conflict (recipient_user_id, dedupe_key) do update
    set message = excluded.message,
        content = excluded.content,
        priority = excluded.priority,
        status = 'sent',
        is_active = true,
        scheduled_at = now(),
        source_label = excluded.source_label,
        action_url = excluded.action_url
  returning id into notification_id;

  return notification_id;
end;
$$;

revoke all on function private.create_user_notification(uuid, text, text, text, text, uuid, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.refresh_my_profile_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  profile_record record;
  has_weight boolean := false;
  is_organization_instructor boolean := false;
  has_instructor_certificate boolean := false;
  active_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select profile.id, profile.display_name, profile.self_person_id
  into profile_record
  from public.profiles as profile
  where profile.id = current_user_id;

  if not found then
    return 0;
  end if;

  if nullif(btrim(profile_record.display_name), '') is null then
    perform private.create_user_notification(
      current_user_id,
      'Add your display name',
      'Add a display name when convenient so your PilotSeal records are easier to identify.',
      'reminder', 'normal', null, 'Profile', '/dashboard/account-settings',
      'profile-completion:display-name', current_user_id
    );
    active_count := active_count + 1;
  else
    update public.notifications
    set is_active = false
    where recipient_user_id = current_user_id
      and dedupe_key = 'profile-completion:display-name';
  end if;

  if profile_record.self_person_id is not null then
    select exists (
      select 1
      from public.saved_people as person
      where person.id = profile_record.self_person_id
        and person.user_id = current_user_id
        and person."weight_Ibs" is not null
        and person."weight_Ibs" > 0
    ) into has_weight;
  end if;

  if not has_weight then
    perform private.create_user_notification(
      current_user_id,
      'Optional: add your weight',
      'Your saved weight can prefill Weight & Balance in Flight Brief. Add it whenever you want from Account Settings.',
      'reminder', 'low', null, 'Profile', '/dashboard/account-settings',
      'profile-completion:weight', current_user_id
    );
    active_count := active_count + 1;
  else
    update public.notifications
    set is_active = false
    where recipient_user_id = current_user_id
      and dedupe_key = 'profile-completion:weight';
  end if;

  select exists (
    select 1
    from public.organization_members as member
    where member.user_id = current_user_id
      and member.teaching_role = 'instructor'
  ) into is_organization_instructor;

  if is_organization_instructor and profile_record.self_person_id is not null then
    select exists (
      select 1
      from public.saved_person_certificates as certificate
      where certificate.user_id = current_user_id
        and certificate.person_id = profile_record.self_person_id
        and certificate.certificate_type in ('flight_instructor', 'ground_instructor')
    ) into has_instructor_certificate;
  end if;

  if is_organization_instructor and not has_instructor_certificate then
    perform private.create_user_notification(
      current_user_id,
      'Add your instructor certificate',
      'Your organization role is Instructor. Adding your instructor certificate lets endorsement records prefill the correct details.',
      'reminder', 'normal', null, 'Profile', '/dashboard/account-settings?onboarding=certificates',
      'profile-completion:instructor-certificate', current_user_id
    );
    active_count := active_count + 1;
  else
    update public.notifications
    set is_active = false
    where recipient_user_id = current_user_id
      and dedupe_key = 'profile-completion:instructor-certificate';
  end if;

  return active_count;
end;
$$;

revoke all on function public.refresh_my_profile_reminders() from public, anon, authenticated;
grant execute on function public.refresh_my_profile_reminders() to authenticated;
grant execute on function public.refresh_my_profile_reminders() to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_preferences'
  ) then
    alter publication supabase_realtime add table public.notification_preferences;
  end if;
end
$$;
