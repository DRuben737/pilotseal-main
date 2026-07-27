


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_manage_aircraft_mx"("p_aircraft_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.aircraft
    where aircraft.id = p_aircraft_id
      and (
        (
          aircraft.visibility = 'organization'
          and aircraft.organization_id is not null
          and private.is_organization_manager(aircraft.organization_id, p_user_id)
        )
        or exists (
          select 1
          from public.aircraft_organization_assignments as assignments
          where assignments.aircraft_id = aircraft.id
            and private.is_organization_manager(assignments.organization_id, p_user_id)
        )
      )
  );
$$;


ALTER FUNCTION "private"."can_manage_aircraft_mx"("p_aircraft_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_manage_organization"("p_organization_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select private.is_platform_admin(p_user_id)
    or coalesce(private.organization_role(p_organization_id, p_user_id), '') in ('owner', 'organization_admin');
$$;


ALTER FUNCTION "private"."can_manage_organization"("p_organization_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_read_organization_report"("p_report_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.organization_reports report
    left join public.aircraft_discrepancy_reports discrepancy
      on discrepancy.report_id = report.id
    left join public.organization_people instructor
      on instructor.id = discrepancy.instructor_person_id
    left join public.asr_reports asr on asr.report_id = report.id
    where report.id = p_report_id
      and (
        report.submitted_by = p_user_id
        or (
          report.status <> 'draft'
          and (
            private.can_manage_organization(report.organization_id, p_user_id)
            or instructor.user_id = p_user_id
            or (
              report.report_type = 'asr'
              and (
                private.has_report_reviewer_capability(
                  report.organization_id, 'safety_reviewer', p_user_id
                )
                or (
                  asr.training_review_required
                  and private.has_report_reviewer_capability(
                    report.organization_id, 'training_reviewer', p_user_id
                  )
                )
                or (
                  asr.maintenance_review_required
                  and private.has_report_reviewer_capability(
                    report.organization_id, 'maintenance_reviewer', p_user_id
                  )
                )
              )
            )
          )
        )
      )
  );
$$;


ALTER FUNCTION "private"."can_read_organization_report"("p_report_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_use_aircraft_in_organization"("p_aircraft_id" "uuid", "p_organization_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select private.is_organization_member(p_organization_id, p_user_id)
    and exists (
      select 1
      from public.aircraft
      where aircraft.id = p_aircraft_id
        and (
          (
            aircraft.visibility = 'organization'
            and aircraft.organization_id = p_organization_id
          )
          or exists (
            select 1
            from public.aircraft_organization_assignments as assignments
            where assignments.aircraft_id = aircraft.id
              and assignments.organization_id = p_organization_id
          )
        )
    );
$$;


ALTER FUNCTION "private"."can_use_aircraft_in_organization"("p_aircraft_id" "uuid", "p_organization_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."create_signup_organization"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  organization_name text;
  new_organization_id uuid;
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', 'personal') <> 'company' then
    return new;
  end if;

  organization_name := trim(coalesce(new.raw_user_meta_data ->> 'company_name', ''));
  if char_length(organization_name) < 2 or char_length(organization_name) > 120 then
    raise exception 'Company name must be between 2 and 120 characters.';
  end if;

  insert into public.organizations (name, created_by)
  values (organization_name, new.id)
  returning id into new_organization_id;

  insert into public.organization_members (organization_id, user_id, role, added_by)
  values (new_organization_id, new.id, 'owner', new.id);

  return new;
end;
$$;


ALTER FUNCTION "private"."create_signup_organization"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."create_user_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_kind" "text" DEFAULT 'organization'::"text", "p_priority" "text" DEFAULT 'normal'::"text", "p_organization_id" "uuid" DEFAULT NULL::"uuid", "p_source_label" "text" DEFAULT NULL::"text", "p_action_url" "text" DEFAULT '/dashboard/notifications'::"text", "p_dedupe_key" "text" DEFAULT NULL::"text", "p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."create_user_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_kind" "text", "p_priority" "text", "p_organization_id" "uuid", "p_source_label" "text", "p_action_url" "text", "p_dedupe_key" "text", "p_created_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_notification_preferences"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."enforce_notification_preferences"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."ensure_aircraft_grounding_note"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  discrepancy_reason text;
begin
  if new.operational_status = 'grounded'
    and char_length(btrim(coalesce(new.operational_status_note, ''))) < 3
  then
    select 'Discrepancy report: ' || left(btrim(discrepancy.description), 500)
      into discrepancy_reason
      from public.aircraft_discrepancy_reports as discrepancy
      join public.organization_reports as report
        on report.id = discrepancy.report_id
      where discrepancy.aircraft_id = new.aircraft_id
        and discrepancy.is_aircraft_down is true
      order by report.created_at desc
      limit 1;

    new.operational_status_note := coalesce(
      discrepancy_reason,
      'Grounded by an organization report or maintenance action.'
    );
  elsif new.operational_status = 'available' then
    new.operational_status_note := null;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."ensure_aircraft_grounding_note"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."has_report_reviewer_capability"("p_organization_id" "uuid", "p_capability" "text", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.organization_report_reviewer_assignments assignment
    where assignment.organization_id = p_organization_id
      and assignment.user_id = p_user_id
      and assignment.capability = p_capability
  );
$$;


ALTER FUNCTION "private"."has_report_reviewer_capability"("p_organization_id" "uuid", "p_capability" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_organization_instructor"("p_organization_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = p_organization_id
      and user_id = p_user_id
      and teaching_role = 'instructor'
  );
$$;


ALTER FUNCTION "private"."is_organization_instructor"("p_organization_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_organization_manager"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.organization_members
    where user_id = auth.uid()
      and role in ('owner', 'organization_admin')
  );
$$;


ALTER FUNCTION "private"."is_organization_manager"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_organization_manager"("p_organization_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = p_organization_id
      and user_id = p_user_id
      and role in ('owner', 'organization_admin')
  );
$$;


ALTER FUNCTION "private"."is_organization_manager"("p_organization_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = p_organization_id
      and organization_members.user_id = p_user_id
  );
$$;


ALTER FUNCTION "private"."is_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_platform_admin"("p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = p_user_id
      and profiles.role = 'admin'
  );
$$;


ALTER FUNCTION "private"."is_platform_admin"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notify_endorsement_template_request_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  organization_name text;
  template_name text;
  admin_record record;
begin
  select name into organization_name from public.organizations where id = new.organization_id;
  template_name := coalesce(new.proposed_data->>'title', 'Endorsement template');

  if tg_op = 'INSERT' then
    perform private.create_user_notification(
      new.submitted_by,
      'Endorsement template change submitted',
      template_name || ' was submitted for platform review.',
      'organization', 'normal', new.organization_id, organization_name,
      '/dashboard/organization', 'endorsement-template-request:' || new.id::text || ':submitted', new.submitted_by
    );

    for admin_record in select id from public.profiles where role = 'admin' loop
      perform private.create_user_notification(
        admin_record.id,
        'Endorsement template review requested',
        organization_name || ' submitted a change for ' || template_name || '.',
        'system', 'high', null, organization_name,
        '/dashboard/admin/endorsements', 'endorsement-template-request:' || new.id::text || ':admin', new.submitted_by
      );
    end loop;
    return new;
  end if;

  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform private.create_user_notification(
      new.submitted_by,
      case when new.status = 'approved'
        then 'Endorsement template change approved'
        else 'Endorsement template change rejected'
      end,
      template_name || case when new.status = 'approved'
        then ' was approved and is now effective.'
        else ' was rejected.'
      end || case when nullif(btrim(new.review_note), '') is null then '' else ' Review note: ' || btrim(new.review_note) end,
      'organization', case when new.status = 'approved' then 'normal' else 'high' end,
      new.organization_id, organization_name, '/dashboard/organization',
      'endorsement-template-request:' || new.id::text || ':' || new.status, new.reviewed_by
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."notify_endorsement_template_request_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notify_organization_aircraft_maintenance_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  aircraft_record record;
  organization_record record;
  member_record record;
  maintenance_detail text;
begin
  if tg_op = 'UPDATE' and
    new.hundred_hour_due_hours is not distinct from old.hundred_hour_due_hours and
    new.annual_due_date is not distinct from old.annual_due_date and
    new.static_due_date is not distinct from old.static_due_date and
    new.transponder_due_date is not distinct from old.transponder_due_date and
    new.elt_due_date is not distinct from old.elt_due_date then
    return new;
  end if;

  select aircraft.tail_number, aircraft.organization_id
  into aircraft_record
  from public.aircraft
  where aircraft.id = new.aircraft_id;

  maintenance_detail := concat_ws(' · ',
    case when new.hundred_hour_due_hours is not null then '100-hour at ' || new.hundred_hour_due_hours::text end,
    case when new.annual_due_date is not null then 'Annual ' || new.annual_due_date::text end,
    case when new.static_due_date is not null then 'Static ' || new.static_due_date::text end,
    case when new.transponder_due_date is not null then 'Transponder ' || new.transponder_due_date::text end,
    case when new.elt_due_date is not null then 'ELT ' || new.elt_due_date::text end
  );

  for organization_record in
    select organizations.id, organizations.name
    from public.organizations
    where organizations.id = aircraft_record.organization_id
    union
    select organizations.id, organizations.name
    from public.aircraft_organization_assignments as assignments
    join public.organizations on organizations.id = assignments.organization_id
    where assignments.aircraft_id = new.aircraft_id
  loop
    for member_record in
      select user_id
      from public.organization_members
      where organization_id = organization_record.id
    loop
      perform private.create_user_notification(
        member_record.user_id,
        'Aircraft maintenance updated',
        aircraft_record.tail_number || ': ' || coalesce(nullif(maintenance_detail, ''), 'No due dates recorded.'),
        'organization', 'normal', organization_record.id, organization_record.name,
        '/dashboard/my-aircraft',
        'aircraft-maintenance:' || new.aircraft_id::text || ':' || organization_record.id::text || ':' || extract(epoch from new.updated_at)::bigint::text,
        new.updated_by
      );
    end loop;
  end loop;
  return new;
end;
$$;


ALTER FUNCTION "private"."notify_organization_aircraft_maintenance_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notify_organization_endorsement_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  student_user_id uuid;
  organization_name text;
begin
  if new.organization_id is null or new.student_id is null then return new; end if;
  select profile.id into student_user_id
  from public.profiles profile
  where profile.self_person_id = new.student_id
  limit 1;
  if student_user_id is null or student_user_id = new.user_id then return new; end if;
  select name into organization_name from public.organizations where id = new.organization_id;

  perform private.create_user_notification(
    student_user_id,
    'New endorsement record',
    new.instructor_name || ' created an endorsement record for you in ' || organization_name || '.',
    'organization', 'high', new.organization_id, organization_name,
    '/dashboard/records', 'endorsement-record:' || new.id::text || ':created', new.user_id
  );
  return new;
end;
$$;


ALTER FUNCTION "private"."notify_organization_endorsement_created"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notify_organization_membership_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  organization_name text;
  detail text;
begin
  select name into organization_name
  from public.organizations
  where id = coalesce(new.organization_id, old.organization_id);

  if tg_op = 'INSERT' then
    perform private.create_user_notification(
      new.user_id,
      'Added to organization',
      'You were added to ' || organization_name || ' as ' || replace(new.role, '_', ' ') || '.',
      'organization', 'normal', new.organization_id, organization_name,
      '/dashboard/organization',
      'organization-member:' || new.organization_id::text || ':added:' || new.user_id::text,
      coalesce(new.added_by, auth.uid())
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.create_user_notification(
      old.user_id,
      'Removed from organization',
      'Your membership in ' || organization_name || ' was removed. Your PilotSeal account and personal records were not changed.',
      'organization', 'high', old.organization_id, organization_name,
      '/dashboard',
      'organization-member:' || old.organization_id::text || ':removed:' || old.user_id::text || ':' || extract(epoch from now())::bigint::text,
      auth.uid()
    );
    return old;
  end if;

  detail := '';
  if new.role is distinct from old.role then
    detail := 'Organization role changed to ' || replace(new.role, '_', ' ') || '.';
  end if;
  if new.teaching_role is distinct from old.teaching_role then
    detail := concat_ws(' ', detail, case
      when new.teaching_role is null then 'Instructor/student role was removed.'
      else 'Instructor/student role changed to ' || new.teaching_role || '.'
    end);
  end if;

  if detail <> '' then
    perform private.create_user_notification(
      new.user_id,
      'Organization role updated',
      detail,
      'organization', 'normal', new.organization_id, organization_name,
      '/dashboard/organization',
      'organization-member:' || new.organization_id::text || ':updated:' || new.user_id::text || ':' || extract(epoch from new.updated_at)::bigint::text,
      auth.uid()
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."notify_organization_membership_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."organization_report_actor_name"("p_organization_id" "uuid", "p_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(
    (
      select nullif(btrim(person.organization_display_name), '')
      from public.organization_people person
      where person.organization_id = p_organization_id
        and person.user_id = p_user_id
        and person.status = 'linked'
      limit 1
    ),
    (select nullif(btrim(profile.display_name), '') from public.profiles profile where profile.id = p_user_id),
    (select auth_user.email::text from auth.users auth_user where auth_user.id = p_user_id),
    'Organization member'
  );
$$;


ALTER FUNCTION "private"."organization_report_actor_name"("p_organization_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."organization_role"("p_organization_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select organization_members.role
  from public.organization_members
  where organization_members.organization_id = p_organization_id
    and organization_members.user_id = p_user_id;
$$;


ALTER FUNCTION "private"."organization_role"("p_organization_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."prepare_endorsement_record"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.organization_id := old.organization_id;
    new.storage_path := old.storage_path;
    new.updated_at := timezone('utc', now());
    return new;
  end if;

  if new.user_id <> auth.uid() then
    raise exception 'Endorsement records can only be created for the signed-in user.' using errcode = '42501';
  end if;

  if new.organization_id is null then
    select organization_id into new.organization_id
    from public.organization_members
    where user_id = auth.uid()
    order by created_at, organization_id
    limit 1;
  elsif not private.is_organization_member(new.organization_id, auth.uid()) then
    raise exception 'You are not a member of this organization.' using errcode = '42501';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."prepare_endorsement_record"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."prevent_owner_account_deletion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if exists (
    select 1 from public.organization_members
    where user_id = old.id and role = 'owner'
  ) then
    raise exception 'Transfer organization ownership before deleting this account.' using errcode = '23503';
  end if;
  return old;
end;
$$;


ALTER FUNCTION "private"."prevent_owner_account_deletion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."seed_new_organization_asr_options"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.seed_organization_asr_options(new.id);
  return new;
end;
$$;


ALTER FUNCTION "private"."seed_new_organization_asr_options"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."seed_organization_asr_options"("p_organization_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.organization_asr_options (
    organization_id, category, value, sort_order
  )
  select p_organization_id, defaults.category, defaults.value, defaults.sort_order
  from (values
    ('occurrence_type', 'Mechanical', 10),
    ('occurrence_type', 'Training', 20),
    ('occurrence_type', 'Weather', 30),
    ('occurrence_type', 'A/C Documents', 40),
    ('occurrence_type', 'Air Prox', 50),
    ('occurrence_type', 'Precautionary Landing', 60),
    ('nature_of_flight', 'Training', 10),
    ('nature_of_flight', 'MX Check', 20),
    ('nature_of_flight', 'PAX', 30),
    ('nature_of_flight', 'Ferry', 40),
    ('nature_of_flight', 'Other', 50),
    ('phase_of_flight', 'Parked', 10),
    ('phase_of_flight', 'Start', 20),
    ('phase_of_flight', 'Taxi', 30),
    ('phase_of_flight', 'Hover', 40),
    ('phase_of_flight', 'Take-off', 50),
    ('phase_of_flight', 'Climb', 60),
    ('phase_of_flight', 'Cruise', 70),
    ('phase_of_flight', 'Descent', 80),
    ('phase_of_flight', 'Approach', 90),
    ('phase_of_flight', 'Landing', 100),
    ('phase_of_flight', 'Shutdown', 110),
    ('phase_of_flight', 'Maneuver Practice', 120),
    ('phase_of_flight', 'Other', 130),
    ('maneuver', 'NA', 10),
    ('maneuver', 'Straight and Level', 20),
    ('maneuver', 'Take-Off', 30),
    ('maneuver', 'Landing', 40),
    ('maneuver', 'Pattern/Circuit', 50),
    ('maneuver', 'Quick Stop', 60),
    ('maneuver', 'Slope', 70),
    ('maneuver', 'Hovering', 80),
    ('maneuver', 'Confined Area', 90),
    ('maneuver', 'Pinnacle', 100),
    ('maneuver', 'Autorotation', 110),
    ('maneuver', 'Advanced Autorotation', 120),
    ('maneuver', 'Instrument Procedures', 130),
    ('training_area', 'Alpha', 10),
    ('training_area', 'Foxtrot', 20),
    ('training_area', 'Airport', 30),
    ('training_area', 'Airport Spot', 40),
    ('program', 'FAA', 10),
    ('program', 'EASA', 20),
    ('program', 'MTP', 30),
    ('program', 'MX', 40),
    ('day_night', 'Day', 10),
    ('day_night', 'Evening Twilight', 20),
    ('day_night', 'Night', 30),
    ('flight_conditions', 'VMC', 10),
    ('flight_conditions', 'IMC', 20),
    ('precipitation', 'Rain', 10),
    ('precipitation', 'Snow', 20),
    ('precipitation', 'Sleet', 30),
    ('precipitation', 'Hail', 40),
    ('intensity', 'Light', 10),
    ('intensity', 'Moderate', 20),
    ('intensity', 'Severe', 30),
    ('external_agency', 'FAA', 10),
    ('external_agency', 'NTSB', 20),
    ('external_agency', 'EASA', 30),
    ('external_agency', 'Manufacturer', 40),
    ('external_agency', 'Wildlife Strike Rpt', 50)
  ) as defaults(category, value, sort_order)
  on conflict (organization_id, category, value) do nothing;
end;
$$;


ALTER FUNCTION "private"."seed_organization_asr_options"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_organization_person_from_member"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_email text;
  v_display_name text;
begin
  if tg_op = 'DELETE' then
    update public.organization_people
    set user_id = null,
        status = 'archived',
        linked_at = null,
        updated_at = timezone('utc', now())
    where organization_id = old.organization_id
      and user_id = old.user_id;
    return old;
  end if;

  select auth_users.email, profiles.display_name
  into v_email, v_display_name
  from auth.users as auth_users
  left join public.profiles as profiles on profiles.id = auth_users.id
  where auth_users.id = new.user_id;

  if v_email is null then
    return new;
  end if;

  insert into public.organization_people (
    organization_id,
    email,
    organization_display_name,
    teaching_role,
    user_id,
    status,
    added_by,
    linked_at
  ) values (
    new.organization_id,
    v_email,
    nullif(btrim(coalesce(v_display_name, '')), ''),
    new.teaching_role,
    new.user_id,
    'linked',
    new.added_by,
    timezone('utc', now())
  )
  on conflict (organization_id, normalized_email) do update
  set user_id = excluded.user_id,
      status = 'linked',
      linked_at = coalesce(public.organization_people.linked_at, excluded.linked_at),
      teaching_role = excluded.teaching_role,
      organization_display_name = coalesce(
        nullif(btrim(public.organization_people.organization_display_name), ''),
        excluded.organization_display_name
      ),
      updated_at = timezone('utc', now());

  return new;
end;
$$;


ALTER FUNCTION "private"."sync_organization_person_from_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."validate_aircraft_discrepancy_report_input"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_description_length integer := char_length(btrim(new.description));
begin
  if v_description_length < 3 or v_description_length > 5000 then
    raise exception 'Describe what happened using between 3 and 5000 characters.'
      using errcode = '22023';
  end if;

  if new.report_date > current_date then
    raise exception 'The report date cannot be in the future.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."validate_aircraft_discrepancy_report_input"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."validate_aircraft_inspection_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  definition_org uuid;
  definition_basis text;
  definition_model uuid;
  aircraft_org uuid;
  aircraft_model uuid;
begin
  select organization_id, basis, model_id
    into definition_org, definition_basis, definition_model
  from public.organization_inspection_definitions
  where id = new.definition_id;

  select organization_id, model_id
    into aircraft_org, aircraft_model
  from public.aircraft
  where id = new.aircraft_id and visibility = 'organization';

  if definition_org is null or aircraft_org is null or definition_org <> aircraft_org then
    raise exception 'Inspection and aircraft must belong to the same organization.' using errcode = '23514';
  end if;
  if definition_model is not null and definition_model <> aircraft_model then
    raise exception 'This inspection does not apply to the selected aircraft model.' using errcode = '23514';
  end if;
  if definition_basis = 'calendar' and new.due_date is null then
    raise exception 'A calendar inspection requires a due date.' using errcode = '23514';
  end if;
  if definition_basis in ('hobbs', 'tach') and new.due_meter is null then
    raise exception 'A meter inspection requires a due reading.' using errcode = '23514';
  end if;
  if definition_basis = 'whichever_first' and (new.due_date is null or new.due_meter is null) then
    raise exception 'A whichever-first inspection requires both a date and a meter reading.' using errcode = '23514';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."validate_aircraft_inspection_assignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."validate_aircraft_model_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  model_organization_id uuid;
begin
  select organization_id
  into model_organization_id
  from public.aircraft_models
  where id = new.model_id;

  if not found then
    raise exception 'Aircraft model not found.' using errcode = '23503';
  end if;

  if new.visibility = 'organization' then
    if new.organization_id is null then
      raise exception 'Organization aircraft must belong to an organization.' using errcode = '23514';
    end if;
    if model_organization_id is not null and model_organization_id <> new.organization_id then
      raise exception 'Aircraft model belongs to a different organization.' using errcode = '23514';
    end if;
  elsif model_organization_id is not null then
    raise exception 'Organization aircraft models cannot be used outside their organization.' using errcode = '23514';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."validate_aircraft_model_scope"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "added_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "teaching_role" "text",
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'organization_admin'::"text", 'member'::"text"]))),
    CONSTRAINT "organization_members_teaching_role_check" CHECK ((("teaching_role" IS NULL) OR ("teaching_role" = ANY (ARRAY['instructor'::"text", 'student'::"text"]))))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_organization_member_by_email"("p_organization_id" "uuid", "p_email" "text") RETURNS "public"."organization_members"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_person public.organization_people;
  v_member public.organization_members;
begin
  if auth.uid() is null or not (
    private.can_manage_organization(p_organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Only organization Owners and Admins can add members.'
      using errcode = '42501';
  end if;

  v_person := public.add_organization_person(
    p_organization_id,
    p_email,
    null,
    null,
    null,
    null
  );
  if v_person.user_id is null then
    raise exception 'No verified registered account matches that email. Add this person from the updated organization roster instead.'
      using errcode = 'P0002';
  end if;
  select * into v_member
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = v_person.user_id;
  return v_member;
end;
$$;


ALTER FUNCTION "public"."add_organization_member_by_email"("p_organization_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_people" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "normalized_email" "text" GENERATED ALWAYS AS ("lower"("btrim"("email"))) STORED,
    "organization_display_name" "text",
    "teaching_role" "text",
    "internal_id" "text",
    "notes" "text",
    "user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "added_by" "uuid",
    "linked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "organization_people_email_check" CHECK ((("char_length"("btrim"("email")) >= 3) AND ("char_length"("btrim"("email")) <= 320))),
    CONSTRAINT "organization_people_link_state_check" CHECK (((("status" = 'linked'::"text") AND ("user_id" IS NOT NULL) AND ("linked_at" IS NOT NULL)) OR (("status" = ANY (ARRAY['pending'::"text", 'archived'::"text"])) AND ("user_id" IS NULL)))),
    CONSTRAINT "organization_people_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'linked'::"text", 'archived'::"text"]))),
    CONSTRAINT "organization_people_teaching_role_check" CHECK ((("teaching_role" IS NULL) OR ("teaching_role" = ANY (ARRAY['instructor'::"text", 'student'::"text"]))))
);


ALTER TABLE "public"."organization_people" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_organization_person"("p_organization_id" "uuid", "p_email" "text", "p_display_name" "text" DEFAULT NULL::"text", "p_teaching_role" "text" DEFAULT NULL::"text", "p_internal_id" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "public"."organization_people"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_teaching_role text := nullif(btrim(coalesce(p_teaching_role, '')), '');
  v_target_user_id uuid;
  v_person public.organization_people;
begin
  if auth.uid() is null or not (
    private.can_manage_organization(p_organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Only organization Owners and Admins can add people.' using errcode = '42501';
  end if;
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if v_teaching_role is not null and v_teaching_role not in ('instructor', 'student') then
    raise exception 'Teaching role must be Instructor, Student, or empty.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_internal_id, '')) > 120 or char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Internal ID or notes are too long.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pilotseal.organization_person:' || p_organization_id::text || ':' || v_email, 0)
  );

  if exists (
    select 1 from public.organization_people
    where organization_id = p_organization_id
      and normalized_email = v_email
      and status <> 'archived'
  ) then
    raise exception 'This email is already on the organization roster.' using errcode = '23505';
  end if;

  select auth_users.id into v_target_user_id
  from auth.users as auth_users
  where lower(btrim(coalesce(auth_users.email, ''))) = v_email
    and auth_users.email_confirmed_at is not null
  order by auth_users.created_at
  limit 1;

  insert into public.organization_people (
    organization_id,
    email,
    organization_display_name,
    teaching_role,
    internal_id,
    notes,
    user_id,
    status,
    added_by,
    linked_at
  ) values (
    p_organization_id,
    v_email,
    v_display_name,
    v_teaching_role,
    nullif(btrim(coalesce(p_internal_id, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_target_user_id,
    case when v_target_user_id is null then 'pending' else 'linked' end,
    auth.uid(),
    case when v_target_user_id is null then null else timezone('utc', now()) end
  )
  on conflict (organization_id, normalized_email) do update
  set email = excluded.email,
      organization_display_name = excluded.organization_display_name,
      teaching_role = excluded.teaching_role,
      internal_id = excluded.internal_id,
      notes = excluded.notes,
      user_id = excluded.user_id,
      status = excluded.status,
      added_by = excluded.added_by,
      linked_at = excluded.linked_at,
      updated_at = timezone('utc', now())
  returning * into v_person;

  if v_target_user_id is not null then
    insert into public.organization_members (
      organization_id,
      user_id,
      role,
      teaching_role,
      added_by
    ) values (
      p_organization_id,
      v_target_user_id,
      'member',
      v_teaching_role,
      auth.uid()
    )
    on conflict (organization_id, user_id) do update
    set teaching_role = coalesce(
          public.organization_members.teaching_role,
          excluded.teaching_role
        ),
        updated_at = timezone('utc', now());
  end if;

  select * into v_person
  from public.organization_people
  where id = v_person.id;
  return v_person;
end;
$_$;


ALTER FUNCTION "public"."add_organization_person"("p_organization_id" "uuid", "p_email" "text", "p_display_name" "text", "p_teaching_role" "text", "p_internal_id" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_aircraft_update_request"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_request public.aircraft_update_requests%rowtype;
begin
  if not exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  ) then
    raise exception 'Admin only';
  end if;

  select *
  into v_request
  from public.aircraft_update_requests
  where id = p_request_id
    and status = 'pending'
  limit 1;

  if not found then
    raise exception 'Pending request not found';
  end if;

  update public.aircraft
  set empty_weight = v_request.proposed_empty_weight,
      empty_arm = v_request.proposed_empty_arm,
      empty_lat_arm = v_request.proposed_empty_lat_arm,
      updated_by = auth.uid(),
      updated_at = now()
  where id = v_request.aircraft_id;

  update public.aircraft_update_requests
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_request_id;
end;
$$;


ALTER FUNCTION "public"."approve_aircraft_update_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_pending_organization_person"("p_person_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_person public.organization_people;
begin
  select * into v_person
  from public.organization_people
  where id = p_person_id
  for update;
  if not found then
    raise exception 'Organization person not found.' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not (
    private.can_manage_organization(v_person.organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Only organization Owners and Admins can remove pending people.' using errcode = '42501';
  end if;
  if v_person.status <> 'pending' or v_person.user_id is not null then
    raise exception 'Linked people must be removed through member management.' using errcode = '22023';
  end if;
  update public.organization_people
  set status = 'archived', updated_at = timezone('utc', now())
  where id = p_person_id;
end;
$$;


ALTER FUNCTION "public"."archive_pending_organization_person"("p_person_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."attach_aircraft_by_tail"("p_user_id" "uuid", "p_model_id" "uuid", "p_tail_number" "text", "p_empty_weight" numeric, "p_empty_arm" numeric, "p_empty_lat_arm" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_aircraft public.aircraft%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if auth.uid() <> p_user_id then
    raise exception 'Cannot attach aircraft for another user';
  end if;

  select *
  into v_aircraft
  from public.aircraft
  where upper(tail_number) = upper(trim(p_tail_number))
  limit 1;

  if found then
    if coalesce(v_aircraft.model_id::text, '') <> coalesce(p_model_id::text, '')
       or coalesce(v_aircraft.empty_weight, 0) <> coalesce(p_empty_weight, 0)
       or coalesce(v_aircraft.empty_arm, 0) <> coalesce(p_empty_arm, 0)
       or coalesce(v_aircraft.empty_lat_arm, 0) <> coalesce(p_empty_lat_arm, 0) then
      return jsonb_build_object(
        'kind', 'conflict',
        'aircraft_id', v_aircraft.id,
        'tail_number', v_aircraft.tail_number,
        'current_empty_weight', v_aircraft.empty_weight,
        'current_empty_arm', v_aircraft.empty_arm,
        'current_empty_lat_arm', v_aircraft.empty_lat_arm
      );
    end if;

    insert into public.saved_aircraft (user_id, aircraft_id)
    values (p_user_id, v_aircraft.id)
    on conflict (user_id, aircraft_id) do nothing;

    return jsonb_build_object(
      'kind', 'attached',
      'aircraft_id', v_aircraft.id
    );
  end if;

  insert into public.aircraft (
    model_id,
    tail_number,
    name,
    empty_weight,
    empty_arm,
    empty_lat_arm,
    created_by,
    updated_by,
    updated_at
  )
  values (
    p_model_id,
    upper(trim(p_tail_number)),
    upper(trim(p_tail_number)),
    p_empty_weight,
    p_empty_arm,
    p_empty_lat_arm,
    auth.uid(),
    auth.uid(),
    now()
  )
  returning *
  into v_aircraft;

  insert into public.saved_aircraft (user_id, aircraft_id)
  values (p_user_id, v_aircraft.id)
  on conflict (user_id, aircraft_id) do nothing;

  return jsonb_build_object(
    'kind', 'created',
    'aircraft_id', v_aircraft.id
  );
end;
$$;


ALTER FUNCTION "public"."attach_aircraft_by_tail"("p_user_id" "uuid", "p_model_id" "uuid", "p_tail_number" "text", "p_empty_weight" numeric, "p_empty_arm" numeric, "p_empty_lat_arm" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_update_platform_aircraft_organizations"("p_aircraft_ids" "uuid"[], "p_organization_ids" "uuid"[], "p_mode" "text") RETURNS TABLE("aircraft_id" "uuid", "before_count" integer, "changed_count" integer, "after_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_aircraft public.aircraft%rowtype;
  v_aircraft_id uuid;
  v_organization_id uuid;
  v_organization_name text;
  v_aircraft_count integer;
  v_organization_count integer;
  v_changed integer;
  v_pair_changed integer;
  v_before integer;
  v_after integer;
begin
  if v_actor_id is null or not private.is_platform_admin(v_actor_id) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;
  if p_mode not in ('add', 'remove') then
    raise exception 'Bulk assignment mode must be add or remove.' using errcode = '22023';
  end if;
  if p_aircraft_ids is null or cardinality(p_aircraft_ids) = 0 then
    raise exception 'Select at least one aircraft.' using errcode = '22023';
  end if;
  if cardinality(p_aircraft_ids) > 200 then
    raise exception 'A maximum of 200 aircraft may be updated at once.' using errcode = '22023';
  end if;
  if p_organization_ids is null or cardinality(p_organization_ids) = 0 then
    raise exception 'Select at least one organization.' using errcode = '22023';
  end if;
  if array_position(p_aircraft_ids, null) is not null
    or array_position(p_organization_ids, null) is not null then
    raise exception 'Aircraft and organization IDs cannot be empty.' using errcode = '22023';
  end if;

  select count(distinct requested_id) into v_aircraft_count
  from unnest(p_aircraft_ids) requested(requested_id);
  if v_aircraft_count <> cardinality(p_aircraft_ids) then
    raise exception 'Duplicate aircraft IDs are not allowed.' using errcode = '22023';
  end if;

  select count(distinct requested_id) into v_organization_count
  from unnest(p_organization_ids) requested(requested_id);
  if v_organization_count <> cardinality(p_organization_ids) then
    raise exception 'Duplicate organization IDs are not allowed.' using errcode = '22023';
  end if;
  if (
    select count(*) from public.organizations
    where id = any(p_organization_ids)
  ) <> v_organization_count then
    raise exception 'One or more selected organizations no longer exist.' using errcode = '23503';
  end if;

  v_aircraft_count := 0;
  for v_aircraft in
    select aircraft.*
    from public.aircraft
    where aircraft.id = any(p_aircraft_ids)
    order by aircraft.id
    for update
  loop
    v_aircraft_count := v_aircraft_count + 1;
    if v_aircraft.visibility <> 'private'
      or v_aircraft.organization_id is not null
      or v_aircraft.owner_user_id is distinct from v_actor_id then
      raise exception 'Every selected aircraft must be a private aircraft owned by your account.'
        using errcode = '42501';
    end if;
  end loop;
  if v_aircraft_count <> cardinality(p_aircraft_ids) then
    raise exception 'One or more selected aircraft no longer exist.' using errcode = 'P0002';
  end if;

  foreach v_aircraft_id in array p_aircraft_ids loop
    select count(*) into v_before
    from public.aircraft_organization_assignments
    where public.aircraft_organization_assignments.aircraft_id = v_aircraft_id;
    v_changed := 0;

    foreach v_organization_id in array p_organization_ids loop
      select name into v_organization_name
      from public.organizations
      where id = v_organization_id;

      if p_mode = 'add' then
        insert into public.aircraft_organization_assignments (
          aircraft_id, organization_id, assigned_by
        ) values (
          v_aircraft_id, v_organization_id, v_actor_id
        ) on conflict on constraint aircraft_organization_assignments_pkey do nothing;
        get diagnostics v_pair_changed = row_count;
      else
        delete from public.aircraft_organization_assignments
        where public.aircraft_organization_assignments.aircraft_id = v_aircraft_id
          and public.aircraft_organization_assignments.organization_id = v_organization_id;
        get diagnostics v_pair_changed = row_count;
      end if;

      if v_pair_changed = 1 then
        insert into public.aircraft_organization_assignment_audit_logs (
          aircraft_id,
          aircraft_tail_number,
          organization_id,
          organization_name,
          actor_user_id,
          action
        )
        select
          aircraft.id,
          aircraft.tail_number,
          v_organization_id,
          v_organization_name,
          v_actor_id,
          case when p_mode = 'add' then 'assigned' else 'unassigned' end
        from public.aircraft
        where aircraft.id = v_aircraft_id;
        v_changed := v_changed + 1;
      end if;
    end loop;

    select count(*) into v_after
    from public.aircraft_organization_assignments
    where public.aircraft_organization_assignments.aircraft_id = v_aircraft_id;

    aircraft_id := v_aircraft_id;
    before_count := v_before;
    changed_count := v_changed;
    after_count := v_after;
    return next;
  end loop;
end;
$$;


ALTER FUNCTION "public"."bulk_update_platform_aircraft_organizations"("p_aircraft_ids" "uuid"[], "p_organization_ids" "uuid"[], "p_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_medical_expiry"("birth_date" "date", "exam_date" "date", "class" integer) RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  age int;
  expiry date;
begin
  age := date_part('year', age(exam_date, birth_date));

  if class = 1 then
    if age < 40 then
      expiry := exam_date + interval '12 months';
    else
      expiry := exam_date + interval '6 months';
    end if;

  elsif class = 2 then
    expiry := exam_date + interval '12 months';

  elsif class = 3 then
    if age < 40 then
      expiry := exam_date + interval '60 months';
    else
      expiry := exam_date + interval '24 months';
    end if;

  else
    return null;
  end if;

  return expiry::date;
end;
$$;


ALTER FUNCTION "public"."calculate_medical_expiry"("birth_date" "date", "exam_date" "date", "class" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_organization_person"("p_person_id" "uuid") RETURNS "public"."organization_members"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_email text;
  v_person public.organization_people;
  v_member public.organization_members;
  v_organization_name text;
  v_manager record;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  select lower(btrim(auth_users.email)) into v_email
  from auth.users as auth_users
  where auth_users.id = auth.uid()
    and auth_users.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'Verify your email before linking an organization.' using errcode = '42501';
  end if;

  select * into v_person
  from public.organization_people
  where id = p_person_id
  for update;
  if not found or v_person.status <> 'pending' or v_person.user_id is not null then
    raise exception 'This organization link is no longer available.' using errcode = 'P0002';
  end if;
  if v_person.normalized_email <> v_email then
    raise exception 'This organization link belongs to a different verified email.' using errcode = '42501';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    teaching_role,
    added_by
  ) values (
    v_person.organization_id,
    auth.uid(),
    'member',
    v_person.teaching_role,
    v_person.added_by
  )
  on conflict (organization_id, user_id) do update
  set teaching_role = coalesce(
        public.organization_members.teaching_role,
        excluded.teaching_role
      ),
      updated_at = timezone('utc', now())
  returning * into v_member;

  update public.organization_people
  set user_id = auth.uid(),
      status = 'linked',
      linked_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_person.id;

  select name into v_organization_name
  from public.organizations
  where id = v_person.organization_id;

  for v_manager in
    select user_id
    from public.organization_members
    where organization_id = v_person.organization_id
      and role in ('owner', 'organization_admin')
      and user_id <> auth.uid()
  loop
    perform private.create_user_notification(
      v_manager.user_id,
      'Organization person linked',
      coalesce(v_person.organization_display_name, v_person.email) || ' linked a PilotSeal account to ' || v_organization_name || '.',
      'organization', 'normal', v_person.organization_id, v_organization_name,
      '/dashboard/organization',
      'organization-person:' || v_person.id::text || ':linked',
      auth.uid()
    );
  end loop;
  return v_member;
end;
$$;


ALTER FUNCTION "public"."claim_organization_person"("p_person_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_route_sessions"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  delete from public.route_sessions
  where expires_at < now();
$$;


ALTER FUNCTION "public"."cleanup_route_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_asr_report"("p_report_id" "uuid", "p_safety_comments" "text", "p_hazard_log_reference" "text", "p_internal_investigation_reference" "text", "p_title" "text", "p_external_notifications" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_report public.organization_reports;
  v_asr public.asr_reports;
  v_actor_name text;
  v_organization_name text;
  v_notification jsonb;
  v_index integer := 0;
begin
  select * into v_report from public.organization_reports
  where id = p_report_id for update;
  select * into v_asr from public.asr_reports
  where report_id = p_report_id for update;
  if v_report.id is null or v_asr.report_id is null
    or v_report.status <> 'in_review' then
    raise exception 'ASR is not ready for closure.' using errcode = '22023';
  end if;
  if not private.has_report_reviewer_capability(
    v_report.organization_id, 'safety_reviewer', auth.uid()
  ) then
    raise exception 'Safety reviewer capability is required.' using errcode = '42501';
  end if;
  if v_asr.risk_score is null then
    raise exception 'Event risk rating is required before closure.' using errcode = '22023';
  end if;
  if v_asr.training_review_required and v_asr.training_signed_at is null then
    raise exception 'Requested Head of Training review is incomplete.' using errcode = '22023';
  end if;
  if v_asr.maintenance_review_required and v_asr.maintenance_signed_at is null then
    raise exception 'Requested Maintenance review is incomplete.' using errcode = '22023';
  end if;
  if nullif(btrim(p_safety_comments), '') is null
    or nullif(btrim(p_title), '') is null then
    raise exception 'Safety comments and title are required.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_external_notifications, '[]'::jsonb)) <> 'array' then
    raise exception 'External notifications must be an array.' using errcode = '22023';
  end if;

  v_actor_name := private.organization_report_actor_name(
    v_report.organization_id, auth.uid()
  );
  update public.asr_reports
  set safety_comments = btrim(p_safety_comments),
      hazard_log_reference = nullif(btrim(p_hazard_log_reference), ''),
      internal_investigation_reference = nullif(btrim(p_internal_investigation_reference), ''),
      safety_signed_by = auth.uid(),
      safety_signed_name = v_actor_name,
      safety_signed_title = btrim(p_title),
      safety_signed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where report_id = p_report_id;

  delete from public.asr_external_notifications where report_id = p_report_id;
  for v_notification in
    select value from jsonb_array_elements(coalesce(p_external_notifications, '[]'::jsonb))
  loop
    if nullif(btrim(v_notification->>'agency'), '') is null then
      raise exception 'Agency is required for every external notification.'
        using errcode = '22023';
    end if;
    insert into public.asr_external_notifications (
      report_id, agency, notified_on, contact_information, sort_order
    ) values (
      p_report_id,
      btrim(v_notification->>'agency'),
      nullif(v_notification->>'notified_on', '')::date,
      nullif(btrim(v_notification->>'contact_information'), ''),
      v_index
    );
    v_index := v_index + 1;
  end loop;

  update public.organization_reports
  set status = 'closed',
      closed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_report_id;
  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name
  ) values (
    p_report_id, 'safety_review_completed', auth.uid(), v_actor_name
  ), (
    p_report_id, 'closed', auth.uid(), v_actor_name
  );

  if v_report.submitted_by <> auth.uid() then
    select organization.name into v_organization_name
    from public.organizations organization where organization.id = v_report.organization_id;
    perform private.create_user_notification(
      v_report.submitted_by,
      'ASR closed',
      coalesce(v_report.reference_number, 'ASR') || ' was reviewed and closed.',
      'organization', 'normal', v_report.organization_id, v_organization_name,
      '/dashboard/reports?type=asr&reportId=' || p_report_id::text,
      'asr:' || p_report_id::text || ':closed',
      auth.uid()
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."close_asr_report"("p_report_id" "uuid", "p_safety_comments" "text", "p_hazard_log_reference" "text", "p_internal_investigation_reference" "text", "p_title" "text", "p_external_notifications" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_asr_maintenance_review"("p_report_id" "uuid", "p_comments" "text", "p_title" "text", "p_maintenance_action" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_report public.organization_reports;
  v_asr public.asr_reports;
  v_actor_name text;
begin
  select * into v_report from public.organization_reports where id = p_report_id;
  select * into v_asr from public.asr_reports where report_id = p_report_id for update;
  if v_report.id is null or not v_asr.maintenance_review_required
    or v_report.status <> 'in_review' then
    raise exception 'Maintenance review is not requested for this ASR.' using errcode = '22023';
  end if;
  if not private.has_report_reviewer_capability(
    v_report.organization_id, 'maintenance_reviewer', auth.uid()
  ) then
    raise exception 'Maintenance reviewer capability is required.' using errcode = '42501';
  end if;
  if nullif(btrim(p_comments), '') is null or nullif(btrim(p_title), '') is null then
    raise exception 'Maintenance comments and title are required.' using errcode = '22023';
  end if;
  v_actor_name := private.organization_report_actor_name(
    v_report.organization_id, auth.uid()
  );
  update public.asr_reports
  set maintenance_comments = btrim(p_comments),
      maintenance_action = coalesce(p_maintenance_action, '{}'::jsonb),
      maintenance_signed_by = auth.uid(),
      maintenance_signed_name = v_actor_name,
      maintenance_signed_title = btrim(p_title),
      maintenance_signed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where report_id = p_report_id;
  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name
  ) values (
    p_report_id, 'maintenance_review_completed', auth.uid(), v_actor_name
  );
end;
$$;


ALTER FUNCTION "public"."complete_asr_maintenance_review"("p_report_id" "uuid", "p_comments" "text", "p_title" "text", "p_maintenance_action" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_asr_training_review"("p_report_id" "uuid", "p_comments" "text", "p_title" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_report public.organization_reports;
  v_asr public.asr_reports;
  v_actor_name text;
begin
  select * into v_report from public.organization_reports where id = p_report_id;
  select * into v_asr from public.asr_reports where report_id = p_report_id for update;
  if v_report.id is null or not v_asr.training_review_required
    or v_report.status <> 'in_review' then
    raise exception 'Training review is not requested for this ASR.' using errcode = '22023';
  end if;
  if not private.has_report_reviewer_capability(
    v_report.organization_id, 'training_reviewer', auth.uid()
  ) then
    raise exception 'Training reviewer capability is required.' using errcode = '42501';
  end if;
  if nullif(btrim(p_comments), '') is null or nullif(btrim(p_title), '') is null then
    raise exception 'Training comments and title are required.' using errcode = '22023';
  end if;
  v_actor_name := private.organization_report_actor_name(
    v_report.organization_id, auth.uid()
  );
  update public.asr_reports
  set training_comments = btrim(p_comments),
      training_signed_by = auth.uid(),
      training_signed_name = v_actor_name,
      training_signed_title = btrim(p_title),
      training_signed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where report_id = p_report_id;
  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name
  ) values (
    p_report_id, 'training_review_completed', auth.uid(), v_actor_name
  );
end;
$$;


ALTER FUNCTION "public"."complete_asr_training_review"("p_report_id" "uuid", "p_comments" "text", "p_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."configure_asr_review"("p_report_id" "uuid", "p_risk_score" integer, "p_training_required" boolean, "p_maintenance_required" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_report public.organization_reports;
  v_asr public.asr_reports;
  v_actor_name text;
  v_organization_name text;
  v_reviewer record;
begin
  select * into v_report from public.organization_reports
  where id = p_report_id for update;
  select * into v_asr from public.asr_reports
  where report_id = p_report_id for update;
  if v_report.id is null or v_asr.report_id is null
    or v_report.status not in ('submitted', 'in_review') then
    raise exception 'ASR is not available for review.' using errcode = '22023';
  end if;
  if not private.has_report_reviewer_capability(
    v_report.organization_id, 'safety_reviewer', auth.uid()
  ) then
    raise exception 'Safety reviewer capability is required.' using errcode = '42501';
  end if;
  if p_risk_score is null
    or p_risk_score not in (1,2,3,4,5,6,8,9,10,12,15,16,20,25) then
    raise exception 'Invalid ASR risk score.' using errcode = '22023';
  end if;

  v_actor_name := private.organization_report_actor_name(
    v_report.organization_id, auth.uid()
  );
  update public.asr_reports
  set risk_score = p_risk_score,
      risk_rated_by = auth.uid(),
      risk_rated_name = v_actor_name,
      risk_rated_at = timezone('utc', now()),
      training_review_required = p_training_required,
      maintenance_review_required = p_maintenance_required,
      updated_at = timezone('utc', now())
  where report_id = p_report_id;
  update public.organization_reports
  set status = 'in_review', updated_at = timezone('utc', now())
  where id = p_report_id;

  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name, details
  ) values (
    p_report_id, 'review_requested', auth.uid(), v_actor_name,
    jsonb_build_object(
      'risk_score', p_risk_score,
      'risk_band', case
        when p_risk_score <= 6 then 'low'
        when p_risk_score <= 12 then 'medium'
        else 'high'
      end,
      'training_required', p_training_required,
      'maintenance_required', p_maintenance_required
    )
  );

  select organization.name into v_organization_name
  from public.organizations organization where organization.id = v_report.organization_id;
  for v_reviewer in
    select assignment.user_id, assignment.capability
    from public.organization_report_reviewer_assignments assignment
    where assignment.organization_id = v_report.organization_id
      and (
        (p_training_required and assignment.capability = 'training_reviewer')
        or (p_maintenance_required and assignment.capability = 'maintenance_reviewer')
      )
  loop
    perform private.create_user_notification(
      v_reviewer.user_id,
      'ASR review requested',
      coalesce(v_report.reference_number, 'ASR') || ': '
        || case when v_reviewer.capability = 'training_reviewer'
          then 'Head of Training review'
          else 'Maintenance review'
        end || ' is requested.',
      'organization', 'high', v_report.organization_id, v_organization_name,
      '/dashboard/reports?type=asr&reportId=' || p_report_id::text,
      'asr:' || p_report_id::text || ':review:' || v_reviewer.capability
        || ':' || v_reviewer.user_id::text,
      auth.uid()
    );
  end loop;
end;
$$;


ALTER FUNCTION "public"."configure_asr_review"("p_report_id" "uuid", "p_risk_score" integer, "p_training_required" boolean, "p_maintenance_required" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_aircraft_maintenance" (
    "aircraft_id" "uuid" NOT NULL,
    "hundred_hour_due_hours" numeric,
    "annual_due_date" "date",
    "static_due_date" "date",
    "transponder_due_date" "date",
    "elt_due_date" "date",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "current_meter_type" "text",
    "current_meter_value" numeric,
    "meter_observed_at" timestamp with time zone,
    "meter_source" "text",
    "adsb_due_date" "date",
    "registration_due_date" "date",
    "operational_status" "text" DEFAULT 'available'::"text" NOT NULL,
    "meter_source_brief_id" "uuid",
    "operational_status_note" "text",
    CONSTRAINT "organization_aircraft_maintenance_grounded_note_check" CHECK ((("operational_status" <> 'grounded'::"text") OR ("char_length"("btrim"(COALESCE("operational_status_note", ''::"text"))) >= 3))),
    CONSTRAINT "organization_aircraft_maintenance_meter_type_check" CHECK ((("current_meter_type" IS NULL) OR ("current_meter_type" = ANY (ARRAY['hobbs'::"text", 'tach'::"text"])))),
    CONSTRAINT "organization_aircraft_maintenance_meter_value_check" CHECK ((("current_meter_value" IS NULL) OR ("current_meter_value" >= (0)::numeric))),
    CONSTRAINT "organization_aircraft_maintenance_status_check" CHECK (("operational_status" = ANY (ARRAY['available'::"text", 'away'::"text", 'in_maintenance'::"text", 'grounded'::"text"])))
);


ALTER TABLE "public"."organization_aircraft_maintenance" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."correct_aircraft_meter"("p_aircraft_id" "uuid", "p_meter_type" "text", "p_meter_value" numeric, "p_observed_at" timestamp with time zone, "p_reason" "text") RETURNS "public"."organization_aircraft_maintenance"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  organization_id_value uuid;
  previous_value numeric;
  result public.organization_aircraft_maintenance;
begin
  if not private.can_manage_aircraft_mx(p_aircraft_id, auth.uid()) then
    raise exception 'Only an authorized organization Owner or Admin can correct meter readings.' using errcode = '42501';
  end if;
  select coalesce(
    aircraft.organization_id,
    (
      select assignments.organization_id
      from public.aircraft_organization_assignments as assignments
      where assignments.aircraft_id = aircraft.id
        and private.is_organization_manager(assignments.organization_id, auth.uid())
      order by assignments.created_at
      limit 1
    )
  ) into organization_id_value
  from public.aircraft
  where aircraft.id = p_aircraft_id;
  if p_meter_type not in ('hobbs', 'tach') or p_meter_value < 0 or p_observed_at is null or char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Meter type, non-negative reading, observation time, and reason are required.' using errcode = '22023';
  end if;
  insert into public.organization_aircraft_maintenance (aircraft_id)
    values (p_aircraft_id) on conflict (aircraft_id) do nothing;
  select current_meter_value into previous_value
    from public.organization_aircraft_maintenance where aircraft_id = p_aircraft_id for update;
  insert into public.aircraft_meter_readings (
    aircraft_id, organization_id, meter_type, previous_value, meter_value,
    observed_at, submitted_by, source, correction_reason
  ) values (
    p_aircraft_id, organization_id_value, p_meter_type, previous_value, p_meter_value,
    p_observed_at, auth.uid(), 'admin', trim(p_reason)
  );
  update public.organization_aircraft_maintenance
  set current_meter_type = p_meter_type,
      current_meter_value = p_meter_value,
      meter_observed_at = p_observed_at,
      meter_source = 'admin',
      meter_source_brief_id = null,
      updated_by = auth.uid(),
      updated_at = timezone('utc', now())
  where aircraft_id = p_aircraft_id returning * into result;
  return result;
end;
$$;


ALTER FUNCTION "public"."correct_aircraft_meter"("p_aircraft_id" "uuid", "p_meter_type" "text", "p_meter_value" numeric, "p_observed_at" timestamp with time zone, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_asr_revision"("p_report_id" "uuid", "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_source public.organization_reports;
  v_source_asr public.asr_reports;
  v_new_report_id uuid;
  v_actor_name text;
begin
  select * into v_source from public.organization_reports
  where id = p_report_id for update;
  select * into v_source_asr from public.asr_reports
  where report_id = p_report_id;
  if v_source.id is null or v_source_asr.report_id is null
    or v_source.status not in ('submitted', 'in_review', 'closed') then
    raise exception 'Only a submitted ASR can be revised.' using errcode = '22023';
  end if;
  if v_source.submitted_by <> auth.uid()
    and not private.can_manage_organization(v_source.organization_id, auth.uid()) then
    raise exception 'You cannot revise this ASR.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A revision reason is required.' using errcode = '22023';
  end if;
  v_actor_name := private.organization_report_actor_name(
    v_source.organization_id, auth.uid()
  );

  insert into public.organization_reports (
    organization_id, report_type, status, submitted_by, submitted_by_name,
    client_request_id, supersedes_report_id, revision_number
  ) values (
    v_source.organization_id, 'asr', 'draft', auth.uid(), v_actor_name,
    gen_random_uuid(), p_report_id, v_source.revision_number + 1
  ) returning id into v_new_report_id;
  insert into public.asr_reports (
    report_id, source_discrepancy_report_id, aircraft_id,
    aircraft_tail_number, aircraft_type, occurrence_date,
    occurrence_local_time, type_of_occurrence, description,
    report_data, reporter_title
  ) values (
    v_new_report_id, v_source_asr.source_discrepancy_report_id,
    v_source_asr.aircraft_id, v_source_asr.aircraft_tail_number,
    v_source_asr.aircraft_type, v_source_asr.occurrence_date,
    v_source_asr.occurrence_local_time, v_source_asr.type_of_occurrence,
    v_source_asr.description, v_source_asr.report_data,
    v_source_asr.reporter_title
  );
  update public.organization_reports
  set status = 'superseded', updated_at = timezone('utc', now())
  where id = p_report_id;
  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name, details
  ) values (
    p_report_id, 'revision_created', auth.uid(), v_actor_name,
    jsonb_build_object('new_report_id', v_new_report_id, 'reason', btrim(p_reason))
  );
  return v_new_report_id;
end;
$$;


ALTER FUNCTION "public"."create_asr_revision"("p_report_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_flight_brief_revision"("p_brief_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  source_record public.flight_briefs;
  new_id uuid;
begin
  select * into source_record from public.flight_briefs where id = p_brief_id;
  if not found or source_record.created_by <> auth.uid() or source_record.status not in ('finalized', 'superseded') then
    raise exception 'Only your finalized flight brief can be revised.' using errcode = '42501';
  end if;
  insert into public.flight_briefs (
    created_by, organization_id, aircraft_id, aircraft_tail_number,
    student_name, instructor_name, flight_date, etd, eta, ete, flight_rules, route,
    revision_number, supersedes_id, brief_data, weather_snapshot, notam_snapshot, wb_snapshot
  ) values (
    auth.uid(), source_record.organization_id, source_record.aircraft_id, source_record.aircraft_tail_number,
    source_record.student_name, source_record.instructor_name, source_record.flight_date,
    source_record.etd, source_record.eta, source_record.ete, source_record.flight_rules, source_record.route,
    source_record.revision_number + 1, source_record.id, source_record.brief_data,
    source_record.weather_snapshot, source_record.notam_snapshot, source_record.wb_snapshot
  ) returning id into new_id;
  return new_id;
end;
$$;


ALTER FUNCTION "public"."create_flight_brief_revision"("p_brief_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_organization_for_registered_user"("p_name" "text", "p_owner_email" "text", "p_reason" "text") RETURNS TABLE("id" "uuid", "name" "text", "created_at" timestamp with time zone, "owner_user_id" "uuid", "owner_email" "text", "owner_display_name" "text", "member_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_email text;
  v_owner public.profiles%rowtype;
  v_organization public.organizations%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  v_normalized_email text := lower(trim(coalesce(p_owner_email, '')));
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if v_actor_id is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pilotseal.platform_organization_create:' || lower(v_name) || ':' || v_normalized_email,
      0
    )
  );

  if not private.is_platform_admin(v_actor_id) then
    raise exception 'Platform administrator access is required.'
      using errcode = '42501';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Organization name must be between 2 and 120 characters.'
      using errcode = '22023';
  end if;

  if v_normalized_email = '' then
    raise exception 'Enter the registered Owner email.' using errcode = '22023';
  end if;

  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'Reason must be between 3 and 500 characters.'
      using errcode = '22023';
  end if;

  select profiles.*
  into v_owner
  from public.profiles as profiles
  where lower(trim(coalesce(profiles.email, ''))) = v_normalized_email
  order by profiles.created_at
  limit 1
  for update;

  if not found then
    raise exception 'No registered account matches that email.'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.organizations as organizations
    join public.organization_members as members
      on members.organization_id = organizations.id
     and members.user_id = v_owner.id
     and members.role = 'owner'
    where lower(trim(organizations.name)) = lower(v_name)
  ) then
    raise exception 'This user already owns an organization with that name.'
      using errcode = '23505';
  end if;

  select profiles.email
  into v_actor_email
  from public.profiles as profiles
  where profiles.id = v_actor_id;

  insert into public.organizations (name, created_by)
  values (v_name, v_actor_id)
  returning * into v_organization;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    added_by
  ) values (
    v_organization.id,
    v_owner.id,
    'owner',
    v_actor_id
  );

  insert into public.platform_organization_audit_logs (
    organization_id,
    organization_name,
    actor_user_id,
    actor_email,
    owner_user_id,
    owner_email,
    action,
    reason
  ) values (
    v_organization.id,
    v_organization.name,
    v_actor_id,
    v_actor_email,
    v_owner.id,
    coalesce(v_owner.email, v_normalized_email),
    'created',
    v_reason
  );

  return query
  select
    v_organization.id,
    v_organization.name,
    v_organization.created_at,
    v_owner.id,
    v_owner.email,
    v_owner.display_name,
    1::bigint;
end;
$$;


ALTER FUNCTION "public"."create_organization_for_registered_user"("p_name" "text", "p_owner_email" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_organization_notification"("p_organization_id" "uuid", "p_title" "text", "p_message" "text", "p_priority" "text" DEFAULT 'normal'::"text", "p_action_url" "text" DEFAULT '/dashboard/organization'::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  inserted_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = auth.uid()
      and member.role in ('owner', 'organization_admin')
  ) then
    raise exception 'Only organization owners and administrators can send organization messages';
  end if;

  if nullif(btrim(p_title), '') is null or nullif(btrim(p_message), '') is null then
    raise exception 'Title and message are required';
  end if;

  if p_priority not in ('low', 'normal', 'high', 'critical') then
    raise exception 'Invalid notification priority';
  end if;

  insert into public.notifications (
    title,
    message,
    content,
    priority,
    status,
    is_active,
    scheduled_at,
    created_by,
    kind,
    recipient_user_id,
    organization_id,
    source_label,
    action_url
  )
  select
    btrim(p_title),
    btrim(p_message),
    btrim(p_message),
    p_priority,
    'sent',
    true,
    now(),
    auth.uid(),
    'organization',
    member.user_id,
    p_organization_id,
    organization.name,
    nullif(btrim(p_action_url), '')
  from public.organization_members member
  join public.organizations organization on organization.id = member.organization_id
  where member.organization_id = p_organization_id;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;


ALTER FUNCTION "public"."create_organization_notification"("p_organization_id" "uuid", "p_title" "text", "p_message" "text", "p_priority" "text", "p_action_url" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."flight_briefs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "organization_id" "uuid",
    "aircraft_id" "uuid",
    "aircraft_tail_number" "text" DEFAULT ''::"text" NOT NULL,
    "student_name" "text" DEFAULT ''::"text" NOT NULL,
    "instructor_name" "text" DEFAULT ''::"text" NOT NULL,
    "flight_date" "date",
    "etd" "text",
    "eta" "text",
    "ete" numeric,
    "flight_rules" "text",
    "route" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "revision_number" integer DEFAULT 1 NOT NULL,
    "supersedes_id" "uuid",
    "brief_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "mx_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "weather_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notam_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "wb_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "finalized_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "flight_briefs_brief_data_check" CHECK (("jsonb_typeof"("brief_data") = 'object'::"text")),
    CONSTRAINT "flight_briefs_mx_snapshot_check" CHECK (("jsonb_typeof"("mx_snapshot") = 'object'::"text")),
    CONSTRAINT "flight_briefs_notam_snapshot_check" CHECK (("jsonb_typeof"("notam_snapshot") = 'object'::"text")),
    CONSTRAINT "flight_briefs_revision_number_check" CHECK (("revision_number" > 0)),
    CONSTRAINT "flight_briefs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'finalized'::"text", 'superseded'::"text"]))),
    CONSTRAINT "flight_briefs_wb_snapshot_check" CHECK (("jsonb_typeof"("wb_snapshot") = 'object'::"text")),
    CONSTRAINT "flight_briefs_weather_snapshot_check" CHECK (("jsonb_typeof"("weather_snapshot") = 'object'::"text"))
);


ALTER TABLE "public"."flight_briefs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_flight_brief"("p_brief_id" "uuid", "p_meter_type" "text" DEFAULT NULL::"text", "p_meter_value" numeric DEFAULT NULL::numeric, "p_observed_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_planned_meter_increase" numeric DEFAULT NULL::numeric) RETURNS "public"."flight_briefs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target public.flight_briefs;
  aircraft_row public.aircraft;
  maintenance_row public.organization_aircraft_maintenance;
  result public.flight_briefs;
  custom_items jsonb := '[]'::jsonb;
  status_label text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into target from public.flight_briefs where id = p_brief_id for update;
  if not found or target.created_by <> auth.uid() then
    raise exception 'Flight brief not found.' using errcode = 'P0002';
  end if;
  if target.status = 'finalized' then
    return target;
  end if;
  if target.status <> 'draft' then
    raise exception 'Only a draft flight brief can be finalized.' using errcode = '22023';
  end if;

  if target.organization_id is not null then
    if not private.is_organization_member(target.organization_id, auth.uid()) then
      raise exception 'You are no longer a member of this organization.' using errcode = '42501';
    end if;
    if target.aircraft_id is null then
      raise exception 'An organization flight brief requires an organization aircraft.' using errcode = '23502';
    end if;
    if not private.can_use_aircraft_in_organization(
      target.aircraft_id,
      target.organization_id,
      auth.uid()
    ) then
      raise exception 'The selected aircraft is not available in this organization.' using errcode = '42501';
    end if;
    select * into aircraft_row from public.aircraft where id = target.aircraft_id;
    if p_meter_type not in ('hobbs', 'tach') or p_meter_value is null or p_observed_at is null then
      raise exception 'Meter type, reading, and observation time are required.' using errcode = '22023';
    end if;
    if p_meter_value < 0 or (p_planned_meter_increase is not null and p_planned_meter_increase < 0) then
      raise exception 'Meter values cannot be negative.' using errcode = '22023';
    end if;

    insert into public.organization_aircraft_maintenance (aircraft_id)
      values (target.aircraft_id)
      on conflict (aircraft_id) do nothing;
    select * into maintenance_row from public.organization_aircraft_maintenance
      where aircraft_id = target.aircraft_id for update;

    if maintenance_row.operational_status <> 'available' then
      status_label := case maintenance_row.operational_status
        when 'grounded' then 'grounded'
        when 'in_maintenance' then 'in maintenance'
        when 'away' then 'away or unavailable'
        else 'unavailable'
      end;
      raise exception 'This aircraft cannot be dispatched because it is %. %',
        status_label,
        case
          when nullif(btrim(coalesce(maintenance_row.operational_status_note, '')), '') is null
            then 'Choose another aircraft or ask an organization admin to return it to service.'
          else btrim(maintenance_row.operational_status_note)
        end
        using errcode = '55000';
    end if;

    if maintenance_row.current_meter_value is not null and p_meter_value < maintenance_row.current_meter_value then
      raise exception 'The meter reading is lower than the current MX value (%).', maintenance_row.current_meter_value
        using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', assignments.id,
      'name', definitions.name,
      'basis', definitions.basis,
      'due_date', assignments.due_date,
      'due_meter', assignments.due_meter,
      'warning_days', definitions.warning_days,
      'warning_hours', definitions.warning_hours,
      'notes', coalesce(assignments.notes, definitions.notes)
    ) order by definitions.name), '[]'::jsonb)
    into custom_items
    from public.aircraft_inspection_assignments assignments
    join public.organization_inspection_definitions definitions on definitions.id = assignments.definition_id
    where assignments.aircraft_id = target.aircraft_id
      and definitions.organization_id = target.organization_id
      and assignments.is_active and definitions.is_active;

    insert into public.aircraft_meter_readings (
      aircraft_id, organization_id, meter_type, previous_value, meter_value,
      observed_at, submitted_by, source, flight_brief_id
    ) values (
      target.aircraft_id, target.organization_id, p_meter_type,
      maintenance_row.current_meter_value, p_meter_value,
      p_observed_at, auth.uid(), 'preflight', target.id
    ) on conflict (flight_brief_id) where flight_brief_id is not null do nothing;

    update public.organization_aircraft_maintenance
    set current_meter_type = p_meter_type,
        current_meter_value = p_meter_value,
        meter_observed_at = p_observed_at,
        meter_source = 'preflight',
        meter_source_brief_id = target.id,
        updated_by = auth.uid(),
        updated_at = timezone('utc', now())
    where aircraft_id = target.aircraft_id;

    target.mx_snapshot := jsonb_build_object(
      'aircraft_id', target.aircraft_id,
      'tail_number', aircraft_row.tail_number,
      'meter_type', p_meter_type,
      'meter_value', p_meter_value,
      'observed_at', p_observed_at,
      'planned_meter_increase', p_planned_meter_increase,
      'projected_return_meter', case when p_planned_meter_increase is null then null else p_meter_value + p_planned_meter_increase end,
      'hundred_hour_due_hours', maintenance_row.hundred_hour_due_hours,
      'annual_due_date', maintenance_row.annual_due_date,
      'static_due_date', maintenance_row.static_due_date,
      'transponder_due_date', maintenance_row.transponder_due_date,
      'elt_due_date', maintenance_row.elt_due_date,
      'adsb_due_date', maintenance_row.adsb_due_date,
      'registration_due_date', maintenance_row.registration_due_date,
      'operational_status', maintenance_row.operational_status,
      'operational_status_note', maintenance_row.operational_status_note,
      'maintenance_updated_at', maintenance_row.updated_at,
      'custom_inspections', custom_items
    );
    target.wb_snapshot := coalesce(target.wb_snapshot, '{}'::jsonb) || jsonb_build_object(
      'aircraft_empty_weight', aircraft_row.empty_weight,
      'aircraft_empty_arm', aircraft_row.empty_arm,
      'aircraft_empty_lat_arm', aircraft_row.empty_lat_arm,
      'aircraft_updated_at', aircraft_row.updated_at
    );
  end if;

  update public.flight_briefs
  set status = 'finalized',
      mx_snapshot = target.mx_snapshot,
      wb_snapshot = target.wb_snapshot,
      finalized_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = target.id
  returning * into result;

  if result.supersedes_id is not null then
    update public.flight_briefs
      set status = 'superseded', updated_at = timezone('utc', now())
      where id = result.supersedes_id
        and created_by = auth.uid()
        and status = 'finalized';
  end if;
  return result;
end;
$$;


ALTER FUNCTION "public"."finalize_flight_brief"("p_brief_id" "uuid", "p_meter_type" "text", "p_meter_value" numeric, "p_observed_at" timestamp with time zone, "p_planned_meter_increase" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_organizations"() RETURNS TABLE("id" "uuid", "name" "text", "member_role" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    organizations.id,
    organizations.name,
    organization_members.role as member_role,
    organizations.created_at
  from public.organization_members
  join public.organizations
    on organizations.id = organization_members.organization_id
  where auth.uid() is not null
    and organization_members.user_id = auth.uid()
  order by organizations.name;
$$;


ALTER FUNCTION "public"."get_my_organizations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user');
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_aircraft_assignment_audit"("p_organization_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 100) RETURNS TABLE("id" "uuid", "aircraft_id" "uuid", "aircraft_tail_number" "text", "organization_id" "uuid", "organization_name" "text", "actor_user_id" "uuid", "action" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 500 then
    raise exception 'Limit must be between 1 and 500.' using errcode = '22023';
  end if;
  if not private.is_platform_admin(auth.uid()) then
    if p_organization_id is null
      or not private.can_manage_organization(p_organization_id, auth.uid()) then
      raise exception 'Organization manager access is required.' using errcode = '42501';
    end if;
  end if;

  return query
  select logs.id, logs.aircraft_id, logs.aircraft_tail_number,
    logs.organization_id, logs.organization_name, logs.actor_user_id,
    logs.action, logs.created_at
  from public.aircraft_organization_assignment_audit_logs logs
  where p_organization_id is null or logs.organization_id = p_organization_id
  order by logs.created_at desc
  limit p_limit;
end;
$$;


ALTER FUNCTION "public"."list_aircraft_assignment_audit"("p_organization_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_my_available_organizations"() RETURNS TABLE("person_id" "uuid", "organization_id" "uuid", "organization_name" "text", "organization_display_name" "text", "teaching_role" "text", "internal_id" "text", "added_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  select lower(btrim(auth_users.email)) into v_email
  from auth.users as auth_users
  where auth_users.id = auth.uid()
    and auth_users.email_confirmed_at is not null;
  if v_email is null then
    return;
  end if;

  return query
  select
    people.id,
    people.organization_id,
    organizations.name,
    people.organization_display_name,
    people.teaching_role,
    people.internal_id,
    people.created_at
  from public.organization_people as people
  join public.organizations on organizations.id = people.organization_id
  where people.normalized_email = v_email
    and people.status = 'pending'
    and people.user_id is null
    and not exists (
      select 1 from public.organization_members as members
      where members.organization_id = people.organization_id
        and members.user_id = auth.uid()
    )
  order by lower(organizations.name), people.created_at;
end;
$$;


ALTER FUNCTION "public"."list_my_available_organizations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_organization_aircraft"("p_organization_id" "uuid") RETURNS TABLE("id" "uuid", "model_id" "uuid", "name" "text", "tail_number" "text", "updated_at" timestamp with time zone, "owner_user_id" "uuid", "organization_id" "uuid", "visibility" "text", "empty_weight" numeric, "empty_arm" numeric, "empty_lat_arm" numeric, "organization_access" "text")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null or (
    not private.is_platform_admin(auth.uid())
    and not private.is_organization_member(p_organization_id, auth.uid())
  ) then
    raise exception 'Organization membership is required.' using errcode = '42501';
  end if;

  return query
  select
    aircraft.id,
    aircraft.model_id,
    aircraft.name,
    aircraft.tail_number,
    aircraft.updated_at,
    aircraft.owner_user_id,
    aircraft.organization_id,
    aircraft.visibility,
    aircraft.empty_weight,
    aircraft.empty_arm,
    aircraft.empty_lat_arm,
    case
      when aircraft.organization_id = p_organization_id then 'owned'
      else 'assigned'
    end
  from public.aircraft
  where (
    aircraft.visibility = 'organization'
    and aircraft.organization_id = p_organization_id
  ) or exists (
    select 1
    from public.aircraft_organization_assignments as assignments
    where assignments.aircraft_id = aircraft.id
      and assignments.organization_id = p_organization_id
  )
  order by aircraft.tail_number;
end;
$$;


ALTER FUNCTION "public"."list_organization_aircraft"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_organization_members"("p_organization_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "display_name" "text", "member_role" "text", "teaching_role" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null or not private.can_manage_organization(p_organization_id, auth.uid()) then
    raise exception 'You do not have permission to view this organization''s members.' using errcode = '42501';
  end if;
  return query
  select
    members.user_id,
    auth_users.email::text,
    coalesce(nullif(btrim(people.organization_display_name), ''), profiles.display_name)::text,
    members.role,
    members.teaching_role,
    members.created_at
  from public.organization_members as members
  join auth.users as auth_users on auth_users.id = members.user_id
  left join public.profiles as profiles on profiles.id = members.user_id
  left join public.organization_people as people
    on people.organization_id = members.organization_id
   and people.user_id = members.user_id
   and people.status = 'linked'
  where members.organization_id = p_organization_id
  order by
    case members.role when 'owner' then 0 when 'organization_admin' then 1 else 2 end,
    lower(coalesce(people.organization_display_name, profiles.display_name, auth_users.email));
end;
$$;


ALTER FUNCTION "public"."list_organization_members"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_organization_people"("p_organization_id" "uuid") RETURNS TABLE("id" "uuid", "organization_id" "uuid", "email" "text", "organization_display_name" "text", "profile_display_name" "text", "teaching_role" "text", "internal_id" "text", "notes" "text", "user_id" "uuid", "status" "text", "member_role" "text", "created_at" timestamp with time zone, "linked_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null or not (
    private.can_manage_organization(p_organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'You do not have permission to view this organization roster.' using errcode = '42501';
  end if;

  return query
  select
    people.id,
    people.organization_id,
    people.email,
    people.organization_display_name,
    profiles.display_name,
    people.teaching_role,
    people.internal_id,
    people.notes,
    people.user_id,
    people.status,
    members.role,
    people.created_at,
    people.linked_at
  from public.organization_people as people
  left join public.profiles as profiles on profiles.id = people.user_id
  left join public.organization_members as members
    on members.organization_id = people.organization_id
   and members.user_id = people.user_id
  where people.organization_id = p_organization_id
    and people.status <> 'archived'
  order by
    case people.status when 'pending' then 0 else 1 end,
    lower(coalesce(people.organization_display_name, profiles.display_name, people.email));
end;
$$;


ALTER FUNCTION "public"."list_organization_people"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_organization_report_people"("p_organization_id" "uuid") RETURNS TABLE("person_id" "uuid", "user_id" "uuid", "display_name" "text", "teaching_role" "text", "status" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null
    or not private.is_organization_member(p_organization_id, auth.uid()) then
    raise exception 'Organization membership is required.' using errcode = '42501';
  end if;

  return query
  select
    person.id,
    person.user_id,
    coalesce(
      nullif(btrim(person.organization_display_name), ''),
      nullif(btrim(profile.display_name), ''),
      'Organization person'
    )::text,
    person.teaching_role,
    person.status
  from public.organization_people person
  left join public.profiles profile on profile.id = person.user_id
  where person.organization_id = p_organization_id
    and person.status in ('pending', 'linked')
  order by lower(coalesce(person.organization_display_name, profile.display_name, 'Organization person'));
end;
$$;


ALTER FUNCTION "public"."list_organization_report_people"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_organization_students"("p_organization_id" "uuid") RETURNS TABLE("student_user_id" "uuid", "person_id" "uuid", "display_name" "text", "certificate_number" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null or not (
    private.is_organization_instructor(p_organization_id, auth.uid())
    or private.can_manage_organization(p_organization_id, auth.uid())
  ) then
    raise exception 'Only organization instructors and administrators can view organization students.' using errcode = '42501';
  end if;
  return query
  select
    members.user_id,
    self_person.id,
    coalesce(
      nullif(btrim(organization_person.organization_display_name), ''),
      nullif(btrim(self_person.display_name), ''),
      nullif(btrim(profiles.display_name), ''),
      'Student'
    )::text,
    coalesce(pilot_certificate.certificate_number, self_person.cert_number)::text
  from public.organization_members as members
  left join public.organization_people as organization_person
    on organization_person.organization_id = members.organization_id
   and organization_person.user_id = members.user_id
   and organization_person.status = 'linked'
  left join public.profiles as profiles on profiles.id = members.user_id
  left join public.saved_people as self_person
    on self_person.id = profiles.self_person_id and self_person.user_id = members.user_id
  left join lateral (
    select certificates.certificate_number
    from public.saved_person_certificates as certificates
    where certificates.user_id = members.user_id
      and certificates.person_id = self_person.id
      and certificates.certificate_type = 'pilot'
    order by certificates.updated_at desc nulls last, certificates.created_at desc
    limit 1
  ) as pilot_certificate on true
  where members.organization_id = p_organization_id
    and members.teaching_role = 'student'
  order by coalesce(
    organization_person.organization_display_name,
    self_person.display_name,
    profiles.display_name,
    'Student'
  );
end;
$$;


ALTER FUNCTION "public"."list_organization_students"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_platform_admin_audit_log"("p_limit" integer DEFAULT 100) RETURNS TABLE("id" "uuid", "actor_user_id" "uuid", "actor_email" "text", "target_user_id" "uuid", "target_email" "text", "action" "text", "previous_role" "text", "new_role" "text", "reason" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
    raise exception 'Platform administrator access is required.'
      using errcode = '42501';
  end if;

  return query
  select
    logs.id,
    logs.actor_user_id,
    logs.actor_email,
    logs.target_user_id,
    logs.target_email,
    logs.action,
    logs.previous_role,
    logs.new_role,
    logs.reason,
    logs.created_at
  from public.platform_admin_audit_logs as logs
  order by logs.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;


ALTER FUNCTION "public"."list_platform_admin_audit_log"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_platform_admins"() RETURNS TABLE("id" "uuid", "email" "text", "display_name" "text", "role" "text", "created_at" timestamp without time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
    raise exception 'Platform administrator access is required.'
      using errcode = '42501';
  end if;

  return query
  select
    profiles.id,
    profiles.email,
    profiles.display_name,
    profiles.role,
    profiles.created_at
  from public.profiles as profiles
  where profiles.role = 'admin'
  order by lower(coalesce(profiles.email, '')), profiles.created_at;
end;
$$;


ALTER FUNCTION "public"."list_platform_admins"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_platform_organizations"() RETURNS TABLE("id" "uuid", "name" "text", "created_at" timestamp with time zone, "owner_user_id" "uuid", "owner_email" "text", "owner_display_name" "text", "member_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
    raise exception 'Platform administrator access is required.'
      using errcode = '42501';
  end if;

  return query
  select
    organizations.id,
    organizations.name,
    organizations.created_at,
    owner_member.user_id,
    owner_profile.email,
    owner_profile.display_name,
    count(all_members.user_id)::bigint
  from public.organizations as organizations
  join public.organization_members as owner_member
    on owner_member.organization_id = organizations.id
   and owner_member.role = 'owner'
  left join public.profiles as owner_profile
    on owner_profile.id = owner_member.user_id
  left join public.organization_members as all_members
    on all_members.organization_id = organizations.id
  group by
    organizations.id,
    organizations.name,
    organizations.created_at,
    owner_member.user_id,
    owner_profile.email,
    owner_profile.display_name
  order by lower(organizations.name), organizations.created_at;
end;
$$;


ALTER FUNCTION "public"."list_platform_organizations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_aircraft_discrepancy_report"("p_report_id" "uuid", "p_status" "text", "p_instructor_person_id" "uuid", "p_asr_submitted" boolean, "p_deferrable" boolean, "p_aircraft_down" boolean, "p_credit_applied" boolean, "p_credit_authorized" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_report public.organization_reports;
  v_discrepancy public.aircraft_discrepancy_reports;
  v_instructor_name text;
  v_instructor_user_id uuid;
  v_actor_name text;
  v_organization_name text;
  v_event_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_status not in ('submitted', 'in_review', 'closed') then
    raise exception 'Invalid report status.' using errcode = '22023';
  end if;

  select * into v_report
  from public.organization_reports where id = p_report_id for update;
  select * into v_discrepancy
  from public.aircraft_discrepancy_reports where report_id = p_report_id for update;
  if v_report.id is null or v_discrepancy.report_id is null then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;
  if not private.can_manage_organization(v_report.organization_id, auth.uid()) then
    raise exception 'Only organization owners and administrators can process reports.' using errcode = '42501';
  end if;
  if v_report.status = 'closed' then
    raise exception 'Closed reports are immutable.' using errcode = '22023';
  end if;

  if p_instructor_person_id is not null then
    select
      coalesce(nullif(btrim(person.organization_display_name), ''), profile.display_name, 'Instructor'),
      person.user_id
    into v_instructor_name, v_instructor_user_id
    from public.organization_people person
    left join public.profiles profile on profile.id = person.user_id
    where person.id = p_instructor_person_id
      and person.organization_id = v_report.organization_id
      and person.teaching_role = 'instructor'
      and person.status in ('pending', 'linked');
    if v_instructor_name is null then
      raise exception 'The selected instructor is not valid for this organization.' using errcode = '22023';
    end if;
  end if;
  if v_discrepancy.instructor_signed_at is not null
    and p_instructor_person_id is distinct from v_discrepancy.instructor_person_id then
    raise exception 'The instructor cannot be changed after signature.' using errcode = '22023';
  end if;

  v_actor_name := private.organization_report_actor_name(v_report.organization_id, auth.uid());
  update public.aircraft_discrepancy_reports
  set instructor_person_id = p_instructor_person_id,
      instructor_name = v_instructor_name,
      is_asr_submitted = p_asr_submitted,
      is_deferrable = p_deferrable,
      is_aircraft_down = p_aircraft_down,
      is_credit_applied = p_credit_applied,
      processed_by = auth.uid(),
      processed_by_name = v_actor_name,
      credit_authorized_by = case when p_credit_authorized then auth.uid() else null end,
      credit_authorized_name = case when p_credit_authorized then v_actor_name else null end,
      credit_authorized_at = case when p_credit_authorized then timezone('utc', now()) else null end,
      updated_at = timezone('utc', now())
  where report_id = p_report_id;

  update public.organization_reports
  set status = p_status,
      updated_at = timezone('utc', now()),
      closed_at = case when p_status = 'closed' then timezone('utc', now()) else null end
  where id = p_report_id;

  v_event_type := case when p_status = 'closed' then 'closed' else 'reviewed' end;
  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name, details
  ) values (
    p_report_id, v_event_type, auth.uid(), v_actor_name,
    jsonb_build_object(
      'status', p_status,
      'asr_submitted', p_asr_submitted,
      'deferrable', p_deferrable,
      'aircraft_down', p_aircraft_down,
      'credit_applied', p_credit_applied,
      'credit_authorized', p_credit_authorized
    )
  );

  select organization.name into v_organization_name
  from public.organizations organization where organization.id = v_report.organization_id;

  if p_instructor_person_id is distinct from v_discrepancy.instructor_person_id
    and v_instructor_user_id is not null
    and v_instructor_user_id <> auth.uid() then
    perform private.create_user_notification(
      v_instructor_user_id,
      'Aircraft report needs instructor signature',
      v_discrepancy.aircraft_tail_number || ': review and sign the discrepancy report.',
      'organization', 'high', v_report.organization_id, v_organization_name,
      '/dashboard/reports?reportId=' || p_report_id::text,
      'aircraft-report:' || p_report_id::text || ':signature:' || v_instructor_user_id::text,
      auth.uid()
    );
  end if;

  if p_status = 'closed' and v_report.submitted_by <> auth.uid() then
    perform private.create_user_notification(
      v_report.submitted_by,
      'Aircraft report closed',
      v_discrepancy.aircraft_tail_number || ': the discrepancy report was closed.',
      'organization', 'normal', v_report.organization_id, v_organization_name,
      '/dashboard/reports?reportId=' || p_report_id::text,
      'aircraft-report:' || p_report_id::text || ':closed',
      auth.uid()
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."process_aircraft_discrepancy_report"("p_report_id" "uuid", "p_status" "text", "p_instructor_person_id" "uuid", "p_asr_submitted" boolean, "p_deferrable" boolean, "p_aircraft_down" boolean, "p_credit_applied" boolean, "p_credit_authorized" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_my_profile_reminders"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."refresh_my_profile_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_role text;
  target_role text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  caller_role := private.organization_role(p_organization_id, auth.uid());
  target_role := private.organization_role(p_organization_id, p_user_id);

  if target_role is null then
    raise exception 'The user is not a member of this organization.' using errcode = 'P0002';
  end if;
  if target_role = 'owner' then
    raise exception 'Transfer ownership before removing the owner.' using errcode = '42501';
  end if;
  if not private.is_platform_admin(auth.uid())
    and caller_role <> 'owner'
    and not (caller_role = 'organization_admin' and target_role = 'member') then
    raise exception 'You do not have permission to remove this member.' using errcode = '42501';
  end if;

  delete from public.organization_members
  where organization_id = p_organization_id and user_id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."remove_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."endorsement_template_change_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "action" "text" NOT NULL,
    "proposed_data" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "reviewed_by" "uuid",
    "review_note" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "endorsement_request_action_target_check" CHECK (((("action" = 'create'::"text") AND ("template_id" IS NULL)) OR (("action" = 'update'::"text") AND ("template_id" IS NOT NULL)))),
    CONSTRAINT "endorsement_template_change_requests_action_check" CHECK (("action" = ANY (ARRAY['create'::"text", 'update'::"text"]))),
    CONSTRAINT "endorsement_template_change_requests_proposed_data_check" CHECK (("jsonb_typeof"("proposed_data") = 'object'::"text")),
    CONSTRAINT "endorsement_template_change_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."endorsement_template_change_requests" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_endorsement_template_change_request"("p_request_id" "uuid", "p_approve" boolean, "p_review_note" "text" DEFAULT NULL::"text") RETURNS "public"."endorsement_template_change_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  request_record public.endorsement_template_change_requests;
  applied_template_id uuid;
begin
  if auth.uid() is null or not private.is_platform_admin() then
    raise exception 'Only a platform administrator can review endorsement changes.' using errcode = '42501';
  end if;

  select * into request_record
  from public.endorsement_template_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Endorsement change request not found.' using errcode = 'P0002';
  end if;
  if request_record.status <> 'pending' then
    raise exception 'This endorsement change request has already been reviewed.' using errcode = '22023';
  end if;

  if p_approve then
    if request_record.action = 'create' then
      insert into public.endorsement_templates (
        key, reference_number, title, body, fields, category, status, sort_order, created_by, updated_by
      ) values (
        request_record.proposed_data->>'key',
        nullif(request_record.proposed_data->>'reference_number', ''),
        request_record.proposed_data->>'title',
        request_record.proposed_data->>'body',
        request_record.proposed_data->'fields',
        nullif(request_record.proposed_data->>'category', ''),
        coalesce(nullif(request_record.proposed_data->>'status', ''), 'inactive'),
        coalesce((request_record.proposed_data->>'sort_order')::integer, 0),
        request_record.submitted_by,
        auth.uid()
      ) returning id into applied_template_id;
    else
      update public.endorsement_templates
      set key = request_record.proposed_data->>'key',
          reference_number = nullif(request_record.proposed_data->>'reference_number', ''),
          title = request_record.proposed_data->>'title',
          body = request_record.proposed_data->>'body',
          fields = request_record.proposed_data->'fields',
          category = nullif(request_record.proposed_data->>'category', ''),
          status = coalesce(nullif(request_record.proposed_data->>'status', ''), 'inactive'),
          sort_order = coalesce((request_record.proposed_data->>'sort_order')::integer, 0),
          updated_by = auth.uid()
      where id = request_record.template_id;
      if not found then
        raise exception 'The target endorsement no longer exists.' using errcode = 'P0002';
      end if;
      applied_template_id := request_record.template_id;
    end if;
  end if;

  update public.endorsement_template_change_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      template_id = coalesce(applied_template_id, template_id),
      reviewed_by = auth.uid(),
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      reviewed_at = now()
  where id = p_request_id
  returning * into request_record;

  return request_record;
end;
$$;


ALTER FUNCTION "public"."review_endorsement_template_change_request"("p_request_id" "uuid", "p_approve" boolean, "p_review_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_asr_draft"("p_organization_id" "uuid", "p_report_id" "uuid", "p_client_request_id" "uuid", "p_report_data" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_report_id uuid;
  v_aircraft_id uuid;
  v_aircraft_tail text;
  v_aircraft_type text;
  v_source_report_id uuid;
  v_actor_name text;
begin
  if auth.uid() is null
    or not private.is_organization_member(p_organization_id, auth.uid()) then
    raise exception 'Organization membership is required.' using errcode = '42501';
  end if;
  if p_report_data is null or jsonb_typeof(p_report_data) <> 'object' then
    raise exception 'ASR report data must be a JSON object.' using errcode = '22023';
  end if;

  v_aircraft_id := nullif(p_report_data->>'aircraft_id', '')::uuid;
  if v_aircraft_id is not null then
    if not private.can_use_aircraft_in_organization(
      v_aircraft_id, p_organization_id, auth.uid()
    ) then
      raise exception 'This aircraft is not available to the organization.'
        using errcode = '42501';
    end if;
    select aircraft.tail_number, model.name
    into v_aircraft_tail, v_aircraft_type
    from public.aircraft aircraft
    left join public.aircraft_models model on model.id = aircraft.model_id
    where aircraft.id = v_aircraft_id;
  else
    v_aircraft_tail := nullif(btrim(p_report_data->>'aircraft_registration'), '');
    v_aircraft_type := nullif(btrim(p_report_data->>'aircraft_type'), '');
  end if;

  v_source_report_id := nullif(p_report_data->>'source_discrepancy_report_id', '')::uuid;
  if v_source_report_id is not null and not exists (
    select 1
    from public.organization_reports source_report
    where source_report.id = v_source_report_id
      and source_report.organization_id = p_organization_id
      and source_report.report_type = 'aircraft_discrepancy'
      and private.can_read_organization_report(source_report.id, auth.uid())
  ) then
    raise exception 'The linked aircraft discrepancy report is not valid.'
      using errcode = '22023';
  end if;

  v_actor_name := private.organization_report_actor_name(p_organization_id, auth.uid());
  if p_report_id is null then
    insert into public.organization_reports (
      organization_id, report_type, status, submitted_by,
      submitted_by_name, client_request_id
    ) values (
      p_organization_id, 'asr', 'draft', auth.uid(),
      v_actor_name, coalesce(p_client_request_id, gen_random_uuid())
    )
    on conflict (organization_id, submitted_by, client_request_id)
    do update set updated_at = timezone('utc', now())
    returning id into v_report_id;

    insert into public.asr_reports (
      report_id, source_discrepancy_report_id, aircraft_id,
      aircraft_tail_number, aircraft_type, occurrence_date,
      occurrence_local_time, type_of_occurrence, description,
      report_data, reporter_title
    ) values (
      v_report_id, v_source_report_id, v_aircraft_id,
      v_aircraft_tail, v_aircraft_type,
      nullif(p_report_data->>'occurrence_date', '')::date,
      nullif(p_report_data->>'occurrence_local_time', '')::time,
      nullif(btrim(p_report_data->>'type_of_occurrence'), ''),
      nullif(btrim(p_report_data->>'description'), ''),
      p_report_data,
      nullif(btrim(p_report_data->>'reporter_title'), '')
    )
    on conflict (report_id) do nothing;
  else
    select report.id into v_report_id
    from public.organization_reports report
    where report.id = p_report_id
      and report.organization_id = p_organization_id
      and report.report_type = 'asr'
      and report.status = 'draft'
      and report.submitted_by = auth.uid()
    for update;
    if v_report_id is null then
      raise exception 'Only the owner can edit this ASR draft.' using errcode = '42501';
    end if;
  end if;

  update public.asr_reports
  set source_discrepancy_report_id = v_source_report_id,
      aircraft_id = v_aircraft_id,
      aircraft_tail_number = v_aircraft_tail,
      aircraft_type = v_aircraft_type,
      occurrence_date = nullif(p_report_data->>'occurrence_date', '')::date,
      occurrence_local_time = nullif(p_report_data->>'occurrence_local_time', '')::time,
      type_of_occurrence = nullif(btrim(p_report_data->>'type_of_occurrence'), ''),
      description = nullif(btrim(p_report_data->>'description'), ''),
      report_data = p_report_data,
      reporter_title = nullif(btrim(p_report_data->>'reporter_title'), ''),
      updated_at = timezone('utc', now())
  where report_id = v_report_id;
  update public.organization_reports
  set updated_at = timezone('utc', now())
  where id = v_report_id;

  return v_report_id;
end;
$$;


ALTER FUNCTION "public"."save_asr_draft"("p_organization_id" "uuid", "p_report_id" "uuid", "p_client_request_id" "uuid", "p_report_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_organization_aircraft_atomic"("p_organization_id" "uuid", "p_aircraft_id" "uuid", "p_model_id" "uuid", "p_tail_number" "text", "p_empty_weight" numeric, "p_empty_arm" numeric, "p_empty_lat_arm" numeric, "p_hundred_hour_due_hours" numeric, "p_annual_due_date" "date", "p_static_due_date" "date", "p_transponder_due_date" "date", "p_elt_due_date" "date", "p_adsb_due_date" "date", "p_registration_due_date" "date", "p_operational_status" "text", "p_operational_status_note" "text", "p_meter_type" "text", "p_meter_value" numeric, "p_meter_observed_at" timestamp with time zone, "p_meter_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  aircraft_record public.aircraft;
  saved_aircraft_id uuid;
  previous_meter_value numeric;
  can_edit_identity boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign in before saving organization aircraft.' using errcode = '42501';
  end if;

  if p_organization_id is null
    or not private.is_organization_manager(p_organization_id, auth.uid())
  then
    raise exception 'Only an organization Owner or Admin can save aircraft.'
      using errcode = '42501';
  end if;

  if p_operational_status not in ('available', 'away', 'in_maintenance', 'grounded') then
    raise exception 'Choose a valid aircraft availability status.' using errcode = '22023';
  end if;

  if p_operational_status = 'grounded'
    and char_length(btrim(coalesce(p_operational_status_note, ''))) < 3
  then
    raise exception 'Enter why this aircraft is grounded.' using errcode = '22023';
  end if;

  if p_hundred_hour_due_hours is not null and p_hundred_hour_due_hours < 0 then
    raise exception 'The next 100-hour due reading cannot be negative.' using errcode = '22023';
  end if;

  if p_aircraft_id is null then
    can_edit_identity := true;
  else
    select *
      into aircraft_record
      from public.aircraft
      where id = p_aircraft_id
      for update;

    if not found then
      raise exception 'Aircraft not found.' using errcode = 'P0002';
    end if;

    can_edit_identity :=
      aircraft_record.visibility = 'organization'
      and aircraft_record.organization_id = p_organization_id;

    if not can_edit_identity and not exists (
      select 1
      from public.aircraft_organization_assignments as assignment
      where assignment.aircraft_id = p_aircraft_id
        and assignment.organization_id = p_organization_id
    ) then
      raise exception 'This aircraft is not available to the selected organization.'
        using errcode = '42501';
    end if;
  end if;

  if can_edit_identity then
    if p_model_id is null or not exists (
      select 1
      from public.aircraft_models as model
      where model.id = p_model_id
        and (model.organization_id is null or model.organization_id = p_organization_id)
    ) then
      raise exception 'Choose an aircraft model available to this organization.'
        using errcode = '22023';
    end if;

    if btrim(coalesce(p_tail_number, '')) = '' then
      raise exception 'Enter the aircraft registration or tail number.'
        using errcode = '22023';
    end if;

    if p_empty_weight is null or p_empty_weight <= 0 then
      raise exception 'Basic empty weight must be greater than 0.' using errcode = '22023';
    end if;

    if p_empty_arm is null then
      raise exception 'Enter the basic empty-weight arm.' using errcode = '22023';
    end if;

    if p_aircraft_id is null then
      insert into public.aircraft (
        model_id,
        tail_number,
        name,
        empty_weight,
        empty_arm,
        empty_lat_arm,
        created_by,
        updated_by,
        owner_user_id,
        visibility,
        organization_id
      )
      values (
        p_model_id,
        upper(btrim(p_tail_number)),
        upper(btrim(p_tail_number)),
        p_empty_weight,
        p_empty_arm,
        p_empty_lat_arm,
        auth.uid(),
        auth.uid(),
        null,
        'organization',
        p_organization_id
      )
      returning id into saved_aircraft_id;
    else
      update public.aircraft
      set model_id = p_model_id,
          tail_number = upper(btrim(p_tail_number)),
          name = upper(btrim(p_tail_number)),
          empty_weight = p_empty_weight,
          empty_arm = p_empty_arm,
          empty_lat_arm = p_empty_lat_arm,
          updated_by = auth.uid(),
          updated_at = timezone('utc', now())
      where id = p_aircraft_id
      returning id into saved_aircraft_id;
    end if;
  else
    saved_aircraft_id := p_aircraft_id;
  end if;

  insert into public.organization_aircraft_maintenance (
    aircraft_id,
    hundred_hour_due_hours,
    annual_due_date,
    static_due_date,
    transponder_due_date,
    elt_due_date,
    adsb_due_date,
    registration_due_date,
    operational_status,
    operational_status_note,
    updated_by,
    updated_at
  )
  values (
    saved_aircraft_id,
    p_hundred_hour_due_hours,
    p_annual_due_date,
    p_static_due_date,
    p_transponder_due_date,
    p_elt_due_date,
    p_adsb_due_date,
    p_registration_due_date,
    p_operational_status,
    nullif(btrim(coalesce(p_operational_status_note, '')), ''),
    auth.uid(),
    timezone('utc', now())
  )
  on conflict (aircraft_id) do update
  set hundred_hour_due_hours = excluded.hundred_hour_due_hours,
      annual_due_date = excluded.annual_due_date,
      static_due_date = excluded.static_due_date,
      transponder_due_date = excluded.transponder_due_date,
      elt_due_date = excluded.elt_due_date,
      adsb_due_date = excluded.adsb_due_date,
      registration_due_date = excluded.registration_due_date,
      operational_status = excluded.operational_status,
      operational_status_note = excluded.operational_status_note,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  if p_meter_value is not null then
    if p_meter_type not in ('hobbs', 'tach')
      or p_meter_value < 0
      or p_meter_observed_at is null
      or char_length(btrim(coalesce(p_meter_reason, ''))) < 3
    then
      raise exception
        'Meter type, non-negative reading, observation time, and reason are required.'
        using errcode = '22023';
    end if;

    select current_meter_value
      into previous_meter_value
      from public.organization_aircraft_maintenance
      where aircraft_id = saved_aircraft_id
      for update;

    insert into public.aircraft_meter_readings (
      aircraft_id,
      organization_id,
      meter_type,
      previous_value,
      meter_value,
      observed_at,
      submitted_by,
      source,
      correction_reason
    )
    values (
      saved_aircraft_id,
      p_organization_id,
      p_meter_type,
      previous_meter_value,
      p_meter_value,
      p_meter_observed_at,
      auth.uid(),
      'admin',
      btrim(p_meter_reason)
    );

    update public.organization_aircraft_maintenance
    set current_meter_type = p_meter_type,
        current_meter_value = p_meter_value,
        meter_observed_at = p_meter_observed_at,
        meter_source = 'admin',
        meter_source_brief_id = null,
        updated_by = auth.uid(),
        updated_at = timezone('utc', now())
    where aircraft_id = saved_aircraft_id;
  end if;

  return saved_aircraft_id;
exception
  when unique_violation then
    raise exception 'This tail number is already in the organization fleet.'
      using errcode = '23505';
end;
$$;


ALTER FUNCTION "public"."save_organization_aircraft_atomic"("p_organization_id" "uuid", "p_aircraft_id" "uuid", "p_model_id" "uuid", "p_tail_number" "text", "p_empty_weight" numeric, "p_empty_arm" numeric, "p_empty_lat_arm" numeric, "p_hundred_hour_due_hours" numeric, "p_annual_due_date" "date", "p_static_due_date" "date", "p_transponder_due_date" "date", "p_elt_due_date" "date", "p_adsb_due_date" "date", "p_registration_due_date" "date", "p_operational_status" "text", "p_operational_status_note" "text", "p_meter_type" "text", "p_meter_value" numeric, "p_meter_observed_at" timestamp with time zone, "p_meter_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."save_organization_aircraft_atomic"("p_organization_id" "uuid", "p_aircraft_id" "uuid", "p_model_id" "uuid", "p_tail_number" "text", "p_empty_weight" numeric, "p_empty_arm" numeric, "p_empty_lat_arm" numeric, "p_hundred_hour_due_hours" numeric, "p_annual_due_date" "date", "p_static_due_date" "date", "p_transponder_due_date" "date", "p_elt_due_date" "date", "p_adsb_due_date" "date", "p_registration_due_date" "date", "p_operational_status" "text", "p_operational_status_note" "text", "p_meter_type" "text", "p_meter_value" numeric, "p_meter_observed_at" timestamp with time zone, "p_meter_reason" "text") IS 'Atomically saves organization aircraft identity, shared maintenance status, and an optional audited meter correction.';



CREATE OR REPLACE FUNCTION "public"."set_aircraft_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_aircraft_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_endorsement_template_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_endorsement_template_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_endorsement_templates_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_endorsement_templates_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_organization_member_role"("p_organization_id" "uuid", "p_user_id" "uuid", "p_role" "text") RETURNS "public"."organization_members"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_role text;
  target_role text;
  updated_member public.organization_members;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if p_role not in ('organization_admin', 'member') then
    raise exception 'Role must be organization_admin or member.' using errcode = '22023';
  end if;

  caller_role := private.organization_role(p_organization_id, auth.uid());
  if not private.is_platform_admin(auth.uid()) and caller_role <> 'owner' then
    raise exception 'Only the organization owner can change administrator roles.' using errcode = '42501';
  end if;

  target_role := private.organization_role(p_organization_id, p_user_id);
  if target_role is null then
    raise exception 'The user is not a member of this organization.' using errcode = 'P0002';
  end if;
  if target_role = 'owner' then
    raise exception 'Transfer ownership before changing the owner''s role.' using errcode = '42501';
  end if;

  update public.organization_members
  set role = p_role, updated_at = timezone('utc', now())
  where organization_id = p_organization_id and user_id = p_user_id
  returning * into updated_member;

  return updated_member;
end;
$$;


ALTER FUNCTION "public"."set_organization_member_role"("p_organization_id" "uuid", "p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_organization_member_teaching_role"("p_organization_id" "uuid", "p_user_id" "uuid", "p_teaching_role" "text") RETURNS "public"."organization_members"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  updated_member public.organization_members;
begin
  if auth.uid() is null or not private.can_manage_organization(p_organization_id, auth.uid()) then
    raise exception 'Only organization owners and administrators can assign teaching roles.' using errcode = '42501';
  end if;
  if p_teaching_role is not null and p_teaching_role not in ('instructor', 'student') then
    raise exception 'Teaching role must be instructor, student, or empty.' using errcode = '22023';
  end if;

  update public.organization_members
  set teaching_role = nullif(trim(coalesce(p_teaching_role, '')), ''),
      updated_at = timezone('utc', now())
  where organization_id = p_organization_id and user_id = p_user_id
  returning * into updated_member;

  if not found then
    raise exception 'Organization member not found.' using errcode = 'P0002';
  end if;
  return updated_member;
end;
$$;


ALTER FUNCTION "public"."set_organization_member_teaching_role"("p_organization_id" "uuid", "p_user_id" "uuid", "p_teaching_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_organization_report_reviewer_capability"("p_organization_id" "uuid", "p_user_id" "uuid", "p_capability" "text", "p_enabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null
    or not private.can_manage_organization(p_organization_id, auth.uid()) then
    raise exception 'Only organization owners and administrators can assign report reviewers.'
      using errcode = '42501';
  end if;
  if p_capability not in (
    'training_reviewer', 'maintenance_reviewer', 'safety_reviewer'
  ) then
    raise exception 'Invalid reviewer capability.' using errcode = '22023';
  end if;
  if not private.is_organization_member(p_organization_id, p_user_id) then
    raise exception 'Reviewer must be an organization member.' using errcode = '22023';
  end if;

  if p_enabled then
    insert into public.organization_report_reviewer_assignments (
      organization_id, user_id, capability, assigned_by
    ) values (
      p_organization_id, p_user_id, p_capability, auth.uid()
    ) on conflict (organization_id, user_id, capability) do nothing;
  else
    delete from public.organization_report_reviewer_assignments
    where organization_id = p_organization_id
      and user_id = p_user_id
      and capability = p_capability;
  end if;
end;
$$;


ALTER FUNCTION "public"."set_organization_report_reviewer_capability"("p_organization_id" "uuid", "p_user_id" "uuid", "p_capability" "text", "p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_platform_admin_by_email"("p_email" "text", "p_make_admin" boolean, "p_reason" "text") RETURNS TABLE("id" "uuid", "email" "text", "display_name" "text", "role" "text", "created_at" timestamp without time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_email text;
  v_target public.profiles%rowtype;
  v_normalized_email text := lower(trim(coalesce(p_email, '')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_admin_count integer;
  v_new_role text;
begin
  if v_actor_id is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  -- Serialize all platform-role changes, then re-check the actor's authority.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pilotseal.platform_admin_access', 0)
  );

  if not private.is_platform_admin(v_actor_id) then
    raise exception 'Platform administrator access is required.'
      using errcode = '42501';
  end if;

  if v_normalized_email = '' then
    raise exception 'Enter the registered account email.' using errcode = '22023';
  end if;

  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'Reason must be between 3 and 500 characters.'
      using errcode = '22023';
  end if;

  select profiles.*
  into v_target
  from public.profiles as profiles
  where lower(trim(coalesce(profiles.email, ''))) = v_normalized_email
  order by profiles.created_at
  limit 1
  for update;

  if not found then
    raise exception 'No registered account matches that email.'
      using errcode = 'P0002';
  end if;

  select profiles.email
  into v_actor_email
  from public.profiles as profiles
  where profiles.id = v_actor_id;

  if p_make_admin then
    if v_target.role = 'admin' then
      raise exception 'This account is already a platform administrator.'
        using errcode = '22023';
    end if;
    v_new_role := 'admin';
  else
    if v_target.role is distinct from 'admin' then
      raise exception 'This account is not a platform administrator.'
        using errcode = '22023';
    end if;

    if v_target.id = v_actor_id then
      raise exception 'You cannot revoke your own platform access.'
        using errcode = '22023';
    end if;

    select count(*)
    into v_admin_count
    from public.profiles as profiles
    where profiles.role = 'admin';

    if v_admin_count <= 1 then
      raise exception 'The last platform administrator cannot be revoked.'
        using errcode = '22023';
    end if;

    v_new_role := 'user';
  end if;

  update public.profiles as profiles
  set role = v_new_role
  where profiles.id = v_target.id;

  insert into public.platform_admin_audit_logs (
    actor_user_id,
    actor_email,
    target_user_id,
    target_email,
    action,
    previous_role,
    new_role,
    reason
  )
  values (
    v_actor_id,
    v_actor_email,
    v_target.id,
    coalesce(v_target.email, v_normalized_email),
    case when p_make_admin then 'granted' else 'revoked' end,
    v_target.role,
    v_new_role,
    v_reason
  );

  return query
  select
    profiles.id,
    profiles.email,
    profiles.display_name,
    profiles.role,
    profiles.created_at
  from public.profiles as profiles
  where profiles.id = v_target.id;
end;
$$;


ALTER FUNCTION "public"."set_platform_admin_by_email"("p_email" "text", "p_make_admin" boolean, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_platform_aircraft_organizations"("p_aircraft_id" "uuid", "p_organization_ids" "uuid"[]) RETURNS "uuid"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_aircraft public.aircraft%rowtype;
  v_organization_ids uuid[];
  v_requested_count integer;
  v_existing_count integer;
begin
  if v_actor_id is null or not private.is_platform_admin(v_actor_id) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;

  select array_agg(distinct requested_id order by requested_id)
  into v_organization_ids
  from unnest(coalesce(p_organization_ids, array[]::uuid[])) as requested(requested_id)
  where requested_id is not null;
  v_organization_ids := coalesce(v_organization_ids, array[]::uuid[]);

  select * into v_aircraft
  from public.aircraft
  where public.aircraft.id = p_aircraft_id
  for update;
  if not found then
    raise exception 'Aircraft not found.' using errcode = 'P0002';
  end if;
  if v_aircraft.visibility <> 'private'
    or v_aircraft.organization_id is not null
    or v_aircraft.owner_user_id is distinct from v_actor_id then
    raise exception 'Only a private aircraft owned by your account can be assigned.'
      using errcode = '42501';
  end if;

  v_requested_count := cardinality(v_organization_ids);
  select count(*) into v_existing_count
  from public.organizations
  where id = any(v_organization_ids);
  if v_existing_count <> v_requested_count then
    raise exception 'One or more selected organizations no longer exist.' using errcode = '23503';
  end if;

  insert into public.aircraft_organization_assignment_audit_logs (
    aircraft_id, aircraft_tail_number, organization_id, organization_name, actor_user_id, action
  )
  select v_aircraft.id, v_aircraft.tail_number, assignments.organization_id,
    organizations.name, v_actor_id, 'unassigned'
  from public.aircraft_organization_assignments assignments
  join public.organizations on organizations.id = assignments.organization_id
  where assignments.aircraft_id = v_aircraft.id
    and not (assignments.organization_id = any(v_organization_ids));

  delete from public.aircraft_organization_assignments
  where aircraft_id = v_aircraft.id
    and not (organization_id = any(v_organization_ids));

  with inserted as (
    insert into public.aircraft_organization_assignments (aircraft_id, organization_id, assigned_by)
    select v_aircraft.id, organizations.id, v_actor_id
    from public.organizations
    where organizations.id = any(v_organization_ids)
    on conflict (aircraft_id, organization_id) do nothing
    returning organization_id
  )
  insert into public.aircraft_organization_assignment_audit_logs (
    aircraft_id, aircraft_tail_number, organization_id, organization_name, actor_user_id, action
  )
  select v_aircraft.id, v_aircraft.tail_number, inserted.organization_id,
    organizations.name, v_actor_id, 'assigned'
  from inserted
  join public.organizations on organizations.id = inserted.organization_id;

  return v_organization_ids;
end;
$$;


ALTER FUNCTION "public"."set_platform_aircraft_organizations"("p_aircraft_id" "uuid", "p_organization_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sign_aircraft_discrepancy_report"("p_report_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_report public.organization_reports;
  v_discrepancy public.aircraft_discrepancy_reports;
  v_actor_name text;
  v_organization_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_report
  from public.organization_reports where id = p_report_id for update;
  select * into v_discrepancy
  from public.aircraft_discrepancy_reports where report_id = p_report_id for update;

  if v_report.id is null or v_discrepancy.report_id is null then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;
  if v_report.status = 'closed' then
    raise exception 'Closed reports cannot be signed.' using errcode = '22023';
  end if;
  if v_discrepancy.instructor_signed_at is not null then
    return;
  end if;
  if not exists (
    select 1 from public.organization_people person
    where person.id = v_discrepancy.instructor_person_id
      and person.organization_id = v_report.organization_id
      and person.user_id = auth.uid()
      and person.teaching_role = 'instructor'
      and person.status = 'linked'
  ) then
    raise exception 'Only the selected linked instructor can sign this report.' using errcode = '42501';
  end if;

  v_actor_name := private.organization_report_actor_name(v_report.organization_id, auth.uid());
  update public.aircraft_discrepancy_reports
  set instructor_signed_by = auth.uid(),
      instructor_signed_name = v_actor_name,
      instructor_signed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where report_id = p_report_id;

  update public.organization_reports
  set updated_at = timezone('utc', now())
  where id = p_report_id;

  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name
  ) values (
    p_report_id, 'instructor_signed', auth.uid(), v_actor_name
  );

  select organization.name into v_organization_name
  from public.organizations organization where organization.id = v_report.organization_id;
  if v_report.submitted_by <> auth.uid() then
    perform private.create_user_notification(
      v_report.submitted_by,
      'Aircraft report signed',
      v_discrepancy.aircraft_tail_number || ': the instructor signature was added.',
      'organization', 'normal', v_report.organization_id, v_organization_name,
      '/dashboard/reports?reportId=' || p_report_id::text,
      'aircraft-report:' || p_report_id::text || ':signed',
      auth.uid()
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."sign_aircraft_discrepancy_report"("p_report_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_aircraft_discrepancy_report"("p_organization_id" "uuid", "p_client_request_id" "uuid", "p_aircraft_id" "uuid", "p_report_date" "date", "p_student_person_id" "uuid", "p_instructor_person_id" "uuid", "p_flight_hobbs_end" numeric, "p_maintenance_hobbs_end" numeric, "p_flight_duration" numeric, "p_discrepancy_type" "text", "p_description" "text", "p_ground_aircraft" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_report_id uuid;
  v_aircraft_tail text;
  v_student_name text;
  v_instructor_name text;
  v_instructor_user_id uuid;
  v_actor_name text;
  v_organization_name text;
  v_member record;
begin
  if auth.uid() is null
    or not private.is_organization_member(p_organization_id, auth.uid()) then
    raise exception 'Organization membership is required.' using errcode = '42501';
  end if;
  if p_client_request_id is null or p_report_date is null then
    raise exception 'Request ID and report date are required.' using errcode = '22023';
  end if;
  if not private.can_use_aircraft_in_organization(p_aircraft_id, p_organization_id, auth.uid()) then
    raise exception 'This aircraft is not available to the organization.' using errcode = '42501';
  end if;
  if p_flight_hobbs_end < 0 or p_maintenance_hobbs_end < 0 or p_flight_duration < 0 then
    raise exception 'Hobbs readings and flight duration cannot be negative.' using errcode = '22023';
  end if;

  select aircraft.tail_number into v_aircraft_tail
  from public.aircraft aircraft where aircraft.id = p_aircraft_id;

  if p_student_person_id is not null then
    select coalesce(nullif(btrim(person.organization_display_name), ''), profile.display_name, 'Student')
    into v_student_name
    from public.organization_people person
    left join public.profiles profile on profile.id = person.user_id
    where person.id = p_student_person_id
      and person.organization_id = p_organization_id
      and person.teaching_role = 'student'
      and person.status in ('pending', 'linked');
    if v_student_name is null then
      raise exception 'The selected student is not valid for this organization.' using errcode = '22023';
    end if;
  end if;

  if p_instructor_person_id is not null then
    select
      coalesce(nullif(btrim(person.organization_display_name), ''), profile.display_name, 'Instructor'),
      person.user_id
    into v_instructor_name, v_instructor_user_id
    from public.organization_people person
    left join public.profiles profile on profile.id = person.user_id
    where person.id = p_instructor_person_id
      and person.organization_id = p_organization_id
      and person.teaching_role = 'instructor'
      and person.status in ('pending', 'linked');
    if v_instructor_name is null then
      raise exception 'The selected instructor is not valid for this organization.' using errcode = '22023';
    end if;
  end if;

  v_actor_name := private.organization_report_actor_name(p_organization_id, auth.uid());
  select organization.name into v_organization_name
  from public.organizations organization where organization.id = p_organization_id;

  insert into public.organization_reports (
    organization_id, report_type, status, submitted_by, submitted_by_name, client_request_id
  ) values (
    p_organization_id, 'aircraft_discrepancy', 'submitted',
    auth.uid(), v_actor_name, p_client_request_id
  )
  on conflict (organization_id, submitted_by, client_request_id)
  do update set client_request_id = excluded.client_request_id
  returning id into v_report_id;

  if exists (
    select 1 from public.aircraft_discrepancy_reports where report_id = v_report_id
  ) then
    return v_report_id;
  end if;

  insert into public.aircraft_discrepancy_reports (
    report_id, aircraft_id, aircraft_tail_number, report_date,
    student_person_id, student_name, instructor_person_id, instructor_name,
    flight_hobbs_end, maintenance_hobbs_end, flight_duration,
    discrepancy_type, description, is_aircraft_down
  ) values (
    v_report_id, p_aircraft_id, v_aircraft_tail, p_report_date,
    p_student_person_id, v_student_name, p_instructor_person_id, v_instructor_name,
    p_flight_hobbs_end, p_maintenance_hobbs_end, p_flight_duration,
    p_discrepancy_type, btrim(p_description),
    case when p_ground_aircraft then true else null end
  );

  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name, details
  ) values (
    v_report_id, 'submitted', auth.uid(), v_actor_name,
    jsonb_build_object('ground_aircraft', p_ground_aircraft)
  );

  if p_ground_aircraft then
    insert into public.organization_aircraft_maintenance (
      aircraft_id, operational_status, updated_by, updated_at
    ) values (
      p_aircraft_id, 'grounded', auth.uid(), timezone('utc', now())
    )
    on conflict (aircraft_id) do update
      set operational_status = 'grounded',
          updated_by = auth.uid(),
          updated_at = timezone('utc', now());

    insert into public.organization_report_events (
      report_id, event_type, actor_user_id, actor_name, details
    ) values (
      v_report_id, 'grounded', auth.uid(), v_actor_name,
      jsonb_build_object('aircraft_id', p_aircraft_id, 'tail_number', v_aircraft_tail)
    );
  end if;

  for v_member in
    select member.user_id
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.role in ('owner', 'organization_admin')
      and member.user_id <> auth.uid()
  loop
    perform private.create_user_notification(
      v_member.user_id,
      case when p_ground_aircraft then 'Aircraft grounded' else 'Aircraft discrepancy reported' end,
      v_aircraft_tail || ': ' || left(btrim(p_description), 240),
      'organization',
      case when p_ground_aircraft then 'critical' else 'high' end,
      p_organization_id,
      v_organization_name,
      '/dashboard/reports?reportId=' || v_report_id::text,
      'aircraft-report:' || v_report_id::text || ':submitted:' || v_member.user_id::text,
      auth.uid()
    );
  end loop;

  if v_instructor_user_id is not null and v_instructor_user_id <> auth.uid() then
    perform private.create_user_notification(
      v_instructor_user_id,
      'Aircraft report needs instructor signature',
      v_aircraft_tail || ': review and sign the submitted discrepancy report.',
      'organization', 'high', p_organization_id, v_organization_name,
      '/dashboard/reports?reportId=' || v_report_id::text,
      'aircraft-report:' || v_report_id::text || ':signature',
      auth.uid()
    );
  end if;

  return v_report_id;
end;
$$;


ALTER FUNCTION "public"."submit_aircraft_discrepancy_report"("p_organization_id" "uuid", "p_client_request_id" "uuid", "p_aircraft_id" "uuid", "p_report_date" "date", "p_student_person_id" "uuid", "p_instructor_person_id" "uuid", "p_flight_hobbs_end" numeric, "p_maintenance_hobbs_end" numeric, "p_flight_duration" numeric, "p_discrepancy_type" "text", "p_description" "text", "p_ground_aircraft" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_asr_report"("p_report_id" "uuid", "p_create_discrepancy" boolean DEFAULT false, "p_discrepancy_type" "text" DEFAULT NULL::"text", "p_discrepancy_description" "text" DEFAULT NULL::"text", "p_ground_aircraft" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_report public.organization_reports;
  v_asr public.asr_reports;
  v_data jsonb;
  v_actor_name text;
  v_reference text;
  v_discrepancy_report_id uuid;
  v_reviewer record;
  v_organization_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  select * into v_report
  from public.organization_reports where id = p_report_id for update;
  select * into v_asr
  from public.asr_reports where report_id = p_report_id for update;
  if v_report.id is null or v_asr.report_id is null
    or v_report.report_type <> 'asr'
    or v_report.status <> 'draft'
    or v_report.submitted_by <> auth.uid() then
    raise exception 'Only the owner can submit this ASR draft.' using errcode = '42501';
  end if;

  v_data := v_asr.report_data;
  if v_asr.occurrence_date is null
    or v_asr.occurrence_local_time is null
    or v_asr.type_of_occurrence is null
    or nullif(btrim(v_data->>'nature_of_flight'), '') is null
    or nullif(btrim(v_data->>'phase_of_flight'), '') is null
    or nullif(btrim(v_data->>'aircraft_commander_name'), '') is null
    or char_length(btrim(coalesce(v_asr.description, ''))) < 3
    or nullif(btrim(v_asr.reporter_title), '') is null then
    raise exception 'Occurrence date/time, occurrence and flight types, phase, aircraft commander, description, and reporter title are required.'
      using errcode = '22023';
  end if;
  if v_asr.aircraft_id is null
    and coalesce((v_data->>'no_aircraft')::boolean, false) = false
    and (v_asr.aircraft_tail_number is null or v_asr.aircraft_type is null) then
    raise exception 'Select an organization aircraft, enter an external aircraft, or mark aircraft not applicable.'
      using errcode = '22023';
  end if;

  v_actor_name := private.organization_report_actor_name(
    v_report.organization_id, auth.uid()
  );
  v_reference := 'ASR-' || extract(year from v_asr.occurrence_date)::integer::text
    || '-' || lpad(v_asr.reference_serial::text, 6, '0');

  update public.asr_reports
  set reporter_signed_by = auth.uid(),
      reporter_signed_name = v_actor_name,
      reporter_signed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where report_id = p_report_id;
  update public.organization_reports
  set status = 'submitted',
      reference_number = v_reference,
      updated_at = timezone('utc', now())
  where id = p_report_id;

  if v_asr.source_discrepancy_report_id is not null then
    v_discrepancy_report_id := v_asr.source_discrepancy_report_id;
  elsif p_create_discrepancy then
    if v_asr.aircraft_id is null then
      raise exception 'An organization aircraft is required to create a discrepancy.'
        using errcode = '22023';
    end if;
    v_discrepancy_report_id := public.submit_aircraft_discrepancy_report(
      v_report.organization_id,
      gen_random_uuid(),
      v_asr.aircraft_id,
      v_asr.occurrence_date,
      nullif(v_data->>'student_person_id', '')::uuid,
      nullif(v_data->>'instructor_person_id', '')::uuid,
      null, null, null,
      p_discrepancy_type,
      coalesce(nullif(btrim(p_discrepancy_description), ''), v_asr.description),
      p_ground_aircraft
    );
    update public.asr_reports
    set source_discrepancy_report_id = v_discrepancy_report_id
    where report_id = p_report_id;
  elsif p_ground_aircraft then
    raise exception 'Grounding from an ASR requires creating a linked discrepancy.'
      using errcode = '22023';
  end if;

  if v_discrepancy_report_id is not null then
    insert into public.organization_report_links (
      report_id, related_report_id, relationship_type, created_by
    ) values (
      p_report_id, v_discrepancy_report_id, 'asr_discrepancy', auth.uid()
    ) on conflict do nothing;
    update public.aircraft_discrepancy_reports
    set is_asr_submitted = true,
        updated_at = timezone('utc', now())
    where report_id = v_discrepancy_report_id;
    insert into public.organization_report_events (
      report_id, event_type, actor_user_id, actor_name, details
    ) values (
      p_report_id, 'linked', auth.uid(), v_actor_name,
      jsonb_build_object('related_report_id', v_discrepancy_report_id)
    );
  end if;

  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name, details
  ) values (
    p_report_id, 'asr_submitted', auth.uid(), v_actor_name,
    jsonb_build_object('reference_number', v_reference)
  );

  select organization.name into v_organization_name
  from public.organizations organization where organization.id = v_report.organization_id;
  for v_reviewer in
    select distinct member.user_id
    from public.organization_members member
    left join public.organization_report_reviewer_assignments assignment
      on assignment.organization_id = member.organization_id
     and assignment.user_id = member.user_id
     and assignment.capability = 'safety_reviewer'
    where member.organization_id = v_report.organization_id
      and (
        member.role in ('owner', 'organization_admin')
        or assignment.user_id is not null
      )
      and member.user_id <> auth.uid()
  loop
    perform private.create_user_notification(
      v_reviewer.user_id,
      'New ASR submitted',
      v_reference || ': ' || left(v_asr.description, 220),
      'organization', 'high', v_report.organization_id, v_organization_name,
      '/dashboard/reports?type=asr&reportId=' || p_report_id::text,
      'asr:' || p_report_id::text || ':submitted:' || v_reviewer.user_id::text,
      auth.uid()
    );
  end loop;
  return p_report_id;
end;
$$;


ALTER FUNCTION "public"."submit_asr_report"("p_report_id" "uuid", "p_create_discrepancy" boolean, "p_discrepancy_type" "text", "p_discrepancy_description" "text", "p_ground_aircraft" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_endorsement_template_change_request"("p_organization_id" "uuid", "p_template_id" "uuid", "p_action" "text", "p_proposed_data" "jsonb") RETURNS "public"."endorsement_template_change_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  result public.endorsement_template_change_requests;
begin
  if auth.uid() is null or not private.can_manage_organization(p_organization_id) then
    raise exception 'Only organization owners and administrators can propose endorsement changes.' using errcode = '42501';
  end if;
  if p_action not in ('create', 'update') then
    raise exception 'Unsupported endorsement change action.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_proposed_data) <> 'object'
     or coalesce(trim(p_proposed_data->>'key'), '') = ''
     or coalesce(trim(p_proposed_data->>'title'), '') = ''
     or coalesce(trim(p_proposed_data->>'body'), '') = ''
     or jsonb_typeof(p_proposed_data->'fields') <> 'array' then
    raise exception 'The endorsement proposal is incomplete.' using errcode = '22023';
  end if;
  if p_action = 'create' and p_template_id is not null then
    raise exception 'A create proposal cannot target an existing endorsement.' using errcode = '22023';
  end if;
  if p_action = 'update' and not exists (
    select 1 from public.endorsement_templates where id = p_template_id
  ) then
    raise exception 'Endorsement template not found.' using errcode = 'P0002';
  end if;

  insert into public.endorsement_template_change_requests (
    organization_id, template_id, action, proposed_data, submitted_by
  ) values (
    p_organization_id, p_template_id, p_action, p_proposed_data, auth.uid()
  ) returning * into result;

  return result;
end;
$$;


ALTER FUNCTION "public"."submit_endorsement_template_change_request"("p_organization_id" "uuid", "p_template_id" "uuid", "p_action" "text", "p_proposed_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_organization_ownership"("p_organization_id" "uuid", "p_new_owner_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  current_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select user_id into current_owner_id
  from public.organization_members
  where organization_id = p_organization_id and role = 'owner'
  for update;

  if current_owner_id is null then
    raise exception 'This organization does not have an owner.' using errcode = 'P0002';
  end if;
  if not private.is_platform_admin(auth.uid()) and current_owner_id <> auth.uid() then
    raise exception 'Only the current owner can transfer ownership.' using errcode = '42501';
  end if;
  if not private.is_organization_member(p_organization_id, p_new_owner_user_id) then
    raise exception 'The new owner must already be a member.' using errcode = 'P0002';
  end if;
  if current_owner_id = p_new_owner_user_id then
    return;
  end if;

  update public.organization_members
  set role = 'organization_admin', updated_at = timezone('utc', now())
  where organization_id = p_organization_id and user_id = current_owner_id;

  update public.organization_members
  set role = 'owner', updated_at = timezone('utc', now())
  where organization_id = p_organization_id and user_id = p_new_owner_user_id;
end;
$$;


ALTER FUNCTION "public"."transfer_organization_ownership"("p_organization_id" "uuid", "p_new_owner_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_organization_person"("p_person_id" "uuid", "p_display_name" "text" DEFAULT NULL::"text", "p_teaching_role" "text" DEFAULT NULL::"text", "p_internal_id" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "public"."organization_people"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_person public.organization_people;
  v_teaching_role text := nullif(btrim(coalesce(p_teaching_role, '')), '');
begin
  select * into v_person
  from public.organization_people
  where id = p_person_id
  for update;
  if not found then
    raise exception 'Organization person not found.' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not (
    private.can_manage_organization(v_person.organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Only organization Owners and Admins can update people.' using errcode = '42501';
  end if;
  if v_teaching_role is not null and v_teaching_role not in ('instructor', 'student') then
    raise exception 'Teaching role must be Instructor, Student, or empty.' using errcode = '22023';
  end if;

  update public.organization_people
  set organization_display_name = nullif(btrim(coalesce(p_display_name, '')), ''),
      teaching_role = v_teaching_role,
      internal_id = nullif(btrim(coalesce(p_internal_id, '')), ''),
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_at = timezone('utc', now())
  where id = p_person_id
  returning * into v_person;

  if v_person.user_id is not null then
    update public.organization_members
    set teaching_role = v_teaching_role,
        updated_at = timezone('utc', now())
    where organization_id = v_person.organization_id
      and user_id = v_person.user_id;
  end if;
  return v_person;
end;
$$;


ALTER FUNCTION "public"."update_organization_person"("p_person_id" "uuid", "p_display_name" "text", "p_teaching_role" "text", "p_internal_id" "text", "p_notes" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aircraft" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "model_id" "uuid",
    "tail_number" "text" NOT NULL,
    "name" "text",
    "empty_weight" numeric,
    "empty_arm" numeric,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "empty_lat_arm" numeric,
    "owner_id" "uuid",
    "created_by" "uuid",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "owner_user_id" "uuid",
    "visibility" "text" DEFAULT 'shared'::"text" NOT NULL,
    "organization_id" "uuid",
    CONSTRAINT "aircraft_scope_check" CHECK (((("visibility" = 'shared'::"text") AND ("organization_id" IS NULL)) OR (("visibility" = 'private'::"text") AND ("owner_user_id" IS NOT NULL) AND ("organization_id" IS NULL)) OR (("visibility" = 'organization'::"text") AND ("organization_id" IS NOT NULL) AND ("owner_user_id" IS NULL)))),
    CONSTRAINT "aircraft_visibility_check" CHECK (("visibility" = ANY (ARRAY['shared'::"text", 'private'::"text", 'organization'::"text"])))
);


ALTER TABLE "public"."aircraft" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aircraft_discrepancy_reports" (
    "report_id" "uuid" NOT NULL,
    "aircraft_id" "uuid" NOT NULL,
    "aircraft_tail_number" "text" NOT NULL,
    "report_date" "date" NOT NULL,
    "student_person_id" "uuid",
    "student_name" "text",
    "instructor_person_id" "uuid",
    "instructor_name" "text",
    "flight_hobbs_end" numeric,
    "maintenance_hobbs_end" numeric,
    "flight_duration" numeric,
    "discrepancy_type" "text" NOT NULL,
    "description" "text" NOT NULL,
    "is_asr_submitted" boolean,
    "is_deferrable" boolean,
    "is_aircraft_down" boolean,
    "is_credit_applied" boolean,
    "instructor_signed_by" "uuid",
    "instructor_signed_name" "text",
    "instructor_signed_at" timestamp with time zone,
    "processed_by" "uuid",
    "processed_by_name" "text",
    "credit_authorized_by" "uuid",
    "credit_authorized_name" "text",
    "credit_authorized_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "aircraft_discrepancy_reports_description_check" CHECK ((("char_length"("btrim"("description")) >= 3) AND ("char_length"("btrim"("description")) <= 5000))),
    CONSTRAINT "aircraft_discrepancy_reports_discrepancy_type_check" CHECK (("discrepancy_type" = ANY (ARRAY['Wings'::"text", 'Fuselage'::"text", 'Main Rotor'::"text", 'Tail Rotor'::"text", 'Propeller'::"text", 'Flight Controls'::"text", 'Engine'::"text", 'Fuel'::"text", 'Landing Gear'::"text", 'Electrical/Lighting'::"text", 'Flight Instrument'::"text", 'Hobbs'::"text", 'Pitot Static'::"text", 'Radio'::"text", 'Navigation'::"text", 'EFIS'::"text", 'Transponder/ADS-B'::"text", 'Auto Pilot'::"text"]))),
    CONSTRAINT "aircraft_discrepancy_reports_flight_duration_check" CHECK ((("flight_duration" IS NULL) OR ("flight_duration" >= (0)::numeric))),
    CONSTRAINT "aircraft_discrepancy_reports_flight_hobbs_end_check" CHECK ((("flight_hobbs_end" IS NULL) OR ("flight_hobbs_end" >= (0)::numeric))),
    CONSTRAINT "aircraft_discrepancy_reports_maintenance_hobbs_end_check" CHECK ((("maintenance_hobbs_end" IS NULL) OR ("maintenance_hobbs_end" >= (0)::numeric)))
);


ALTER TABLE "public"."aircraft_discrepancy_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aircraft_inspection_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "definition_id" "uuid" NOT NULL,
    "aircraft_id" "uuid" NOT NULL,
    "due_date" "date",
    "due_meter" numeric,
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "aircraft_inspection_assignments_due_meter_check" CHECK ((("due_meter" IS NULL) OR ("due_meter" >= (0)::numeric)))
);


ALTER TABLE "public"."aircraft_inspection_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aircraft_meter_readings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "aircraft_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "meter_type" "text" NOT NULL,
    "previous_value" numeric,
    "meter_value" numeric NOT NULL,
    "observed_at" timestamp with time zone NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "flight_brief_id" "uuid",
    "correction_reason" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "aircraft_meter_readings_meter_type_check" CHECK (("meter_type" = ANY (ARRAY['hobbs'::"text", 'tach'::"text"]))),
    CONSTRAINT "aircraft_meter_readings_meter_value_check" CHECK (("meter_value" >= (0)::numeric)),
    CONSTRAINT "aircraft_meter_readings_source_check" CHECK (("source" = ANY (ARRAY['preflight'::"text", 'admin'::"text", 'maintenance'::"text"])))
);


ALTER TABLE "public"."aircraft_meter_readings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aircraft_models" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "stations" "jsonb" NOT NULL,
    "envelope" "jsonb" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "chart_type" "text",
    "avg_fuel_burn_rate" numeric,
    "organization_id" "uuid",
    "max_weight" numeric
);


ALTER TABLE "public"."aircraft_models" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aircraft_organization_assignment_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "aircraft_id" "uuid",
    "aircraft_tail_number" "text" NOT NULL,
    "organization_id" "uuid",
    "organization_name" "text" NOT NULL,
    "actor_user_id" "uuid",
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "aircraft_organization_assignment_audit_logs_action_check" CHECK (("action" = ANY (ARRAY['assigned'::"text", 'unassigned'::"text"])))
);


ALTER TABLE "public"."aircraft_organization_assignment_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aircraft_organization_assignments" (
    "aircraft_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."aircraft_organization_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aircraft_update_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "aircraft_id" "uuid" NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "proposed_empty_weight" numeric,
    "proposed_empty_arm" numeric,
    "proposed_empty_lat_arm" numeric,
    "note" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "aircraft_update_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."aircraft_update_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."airport_config" (
    "icao" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."airport_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anniversary_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."anniversary_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asr_external_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "agency" "text" NOT NULL,
    "notified_on" "date",
    "contact_information" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "asr_external_notifications_agency_check" CHECK ((("char_length"("btrim"("agency")) >= 1) AND ("char_length"("btrim"("agency")) <= 120)))
);


ALTER TABLE "public"."asr_external_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asr_reports" (
    "report_id" "uuid" NOT NULL,
    "reference_serial" bigint NOT NULL,
    "source_discrepancy_report_id" "uuid",
    "aircraft_id" "uuid",
    "aircraft_tail_number" "text",
    "aircraft_type" "text",
    "occurrence_date" "date",
    "occurrence_local_time" time without time zone,
    "type_of_occurrence" "text",
    "description" "text",
    "report_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reporter_title" "text",
    "reporter_signed_by" "uuid",
    "reporter_signed_name" "text",
    "reporter_signed_at" timestamp with time zone,
    "risk_score" integer,
    "risk_rated_by" "uuid",
    "risk_rated_name" "text",
    "risk_rated_at" timestamp with time zone,
    "training_review_required" boolean DEFAULT false NOT NULL,
    "training_comments" "text",
    "training_signed_by" "uuid",
    "training_signed_name" "text",
    "training_signed_title" "text",
    "training_signed_at" timestamp with time zone,
    "maintenance_review_required" boolean DEFAULT false NOT NULL,
    "maintenance_comments" "text",
    "maintenance_action" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "maintenance_signed_by" "uuid",
    "maintenance_signed_name" "text",
    "maintenance_signed_title" "text",
    "maintenance_signed_at" timestamp with time zone,
    "safety_comments" "text",
    "hazard_log_reference" "text",
    "internal_investigation_reference" "text",
    "safety_signed_by" "uuid",
    "safety_signed_name" "text",
    "safety_signed_title" "text",
    "safety_signed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "asr_reports_risk_score_check" CHECK ((("risk_score" IS NULL) OR ("risk_score" = ANY (ARRAY[1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 20, 25]))))
);


ALTER TABLE "public"."asr_reports" OWNER TO "postgres";


ALTER TABLE "public"."asr_reports" ALTER COLUMN "reference_serial" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."asr_reports_reference_serial_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."endorsement_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "student_id" "uuid",
    "student_name" "text" NOT NULL,
    "student_cert_number" "text",
    "instructor_name" "text" NOT NULL,
    "endorsement_date" "text" NOT NULL,
    "template_titles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_size_bytes" integer,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "instructor_cert_number" "text",
    "organization_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."endorsement_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."endorsement_template_settings" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "source" "text" NOT NULL,
    "source_date" "text" NOT NULL,
    "updated_date" "text" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "endorsement_template_settings_singleton_check" CHECK (("id" = 'default'::"text"))
);


ALTER TABLE "public"."endorsement_template_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."endorsement_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "fields" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "category" "text",
    "status" "text" DEFAULT 'inactive'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "reference_number" "text",
    CONSTRAINT "endorsement_templates_fields_array_check" CHECK (("jsonb_typeof"("fields") = 'array'::"text")),
    CONSTRAINT "endorsement_templates_reference_number_check" CHECK ((("reference_number" IS NULL) OR ("reference_number" ~ '^A([1-9]|[1-8][0-9]|9[0-6])$'::"text"))),
    CONSTRAINT "endorsement_templates_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."endorsement_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logbook" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "tail_number" "text" NOT NULL,
    "route" "text",
    "approaches" integer DEFAULT 0,
    "approach_notes" "text",
    "day_landings" integer DEFAULT 0,
    "night_landings" integer DEFAULT 0,
    "day_time" numeric DEFAULT 0,
    "night_time" numeric DEFAULT 0,
    "xc_25" numeric DEFAULT 0,
    "night_xc" numeric DEFAULT 0,
    "dual_received" numeric DEFAULT 0,
    "solo" numeric DEFAULT 0,
    "pic" numeric DEFAULT 0,
    "sic" numeric DEFAULT 0,
    "cfi" numeric DEFAULT 0,
    "cfii" numeric DEFAULT 0,
    "imc" numeric DEFAULT 0,
    "simulated_instrument" numeric DEFAULT 0,
    "ground_simulator" numeric DEFAULT 0,
    "xc_50" boolean DEFAULT false,
    "flight_review" boolean DEFAULT false,
    "comments" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    CONSTRAINT "approaches_requires_instrument" CHECK ((("approaches" = 0) OR (("imc" > (0)::numeric) OR ("simulated_instrument" > (0)::numeric)))),
    CONSTRAINT "day_landings_requires_day" CHECK ((("day_landings" = 0) OR ("day_time" > (0)::numeric))),
    CONSTRAINT "night_landings_requires_night" CHECK ((("night_landings" = 0) OR ("night_time" > (0)::numeric))),
    CONSTRAINT "night_xc_requires_both" CHECK ((("night_xc" = (0)::numeric) OR (("night_time" > (0)::numeric) AND ("xc_25" > (0)::numeric))))
);


ALTER TABLE "public"."logbook" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "personal_reminders_enabled" boolean DEFAULT true NOT NULL,
    "organization_messages_enabled" boolean DEFAULT true NOT NULL,
    "platform_notices_enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_reads" (
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "content" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "message" "text",
    "priority" "text" DEFAULT 'normal'::"text",
    "status" "text" DEFAULT 'draft'::"text",
    "scheduled_at" timestamp without time zone,
    "created_by" "uuid",
    "kind" "text" DEFAULT 'system'::"text" NOT NULL,
    "recipient_user_id" "uuid",
    "organization_id" "uuid",
    "action_url" "text",
    "dedupe_key" "text",
    "source_label" "text",
    CONSTRAINT "notifications_kind_check" CHECK (("kind" = ANY (ARRAY['system'::"text", 'reminder'::"text", 'organization'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_asr_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "value" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "organization_asr_options_category_check" CHECK (("category" = ANY (ARRAY['occurrence_type'::"text", 'nature_of_flight'::"text", 'phase_of_flight'::"text", 'maneuver'::"text", 'training_area'::"text", 'program'::"text", 'day_night'::"text", 'flight_conditions'::"text", 'precipitation'::"text", 'intensity'::"text", 'external_agency'::"text"]))),
    CONSTRAINT "organization_asr_options_value_check" CHECK ((("char_length"("btrim"("value")) >= 1) AND ("char_length"("btrim"("value")) <= 120)))
);


ALTER TABLE "public"."organization_asr_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_inspection_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "basis" "text" NOT NULL,
    "model_id" "uuid",
    "warning_days" integer,
    "warning_hours" numeric,
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "organization_inspection_definitions_basis_check" CHECK (("basis" = ANY (ARRAY['calendar'::"text", 'hobbs'::"text", 'tach'::"text", 'whichever_first'::"text"]))),
    CONSTRAINT "organization_inspection_definitions_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 120))),
    CONSTRAINT "organization_inspection_definitions_warning_days_check" CHECK ((("warning_days" IS NULL) OR ("warning_days" >= 0))),
    CONSTRAINT "organization_inspection_definitions_warning_hours_check" CHECK ((("warning_hours" IS NULL) OR ("warning_hours" >= (0)::numeric)))
);


ALTER TABLE "public"."organization_inspection_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_report_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_user_id" "uuid",
    "actor_name" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "organization_report_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['submitted'::"text", 'instructor_signed'::"text", 'grounded'::"text", 'reviewed'::"text", 'closed'::"text", 'asr_submitted'::"text", 'review_requested'::"text", 'risk_rated'::"text", 'training_review_completed'::"text", 'maintenance_review_completed'::"text", 'safety_review_completed'::"text", 'revision_created'::"text", 'linked'::"text"])))
);


ALTER TABLE "public"."organization_report_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_report_links" (
    "report_id" "uuid" NOT NULL,
    "related_report_id" "uuid" NOT NULL,
    "relationship_type" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "organization_report_links_check" CHECK (("report_id" <> "related_report_id")),
    CONSTRAINT "organization_report_links_relationship_type_check" CHECK (("relationship_type" = 'asr_discrepancy'::"text"))
);


ALTER TABLE "public"."organization_report_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_report_reviewer_assignments" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "capability" "text" NOT NULL,
    "assigned_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "organization_report_reviewer_assignments_capability_check" CHECK (("capability" = ANY (ARRAY['training_reviewer'::"text", 'maintenance_reviewer'::"text", 'safety_reviewer'::"text"])))
);


ALTER TABLE "public"."organization_report_reviewer_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "report_type" "text" NOT NULL,
    "status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "submitted_by_name" "text" NOT NULL,
    "client_request_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "closed_at" timestamp with time zone,
    "reference_number" "text",
    "supersedes_report_id" "uuid",
    "revision_number" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "organization_reports_report_type_check" CHECK (("report_type" = ANY (ARRAY['aircraft_discrepancy'::"text", 'asr'::"text"]))),
    CONSTRAINT "organization_reports_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'submitted'::"text", 'in_review'::"text", 'closed'::"text", 'superseded'::"text"])))
);


ALTER TABLE "public"."organization_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "organizations_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 120)))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_admin_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid",
    "actor_email" "text",
    "target_user_id" "uuid",
    "target_email" "text" NOT NULL,
    "action" "text" NOT NULL,
    "previous_role" "text",
    "new_role" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "platform_admin_audit_logs_action_check" CHECK (("action" = ANY (ARRAY['granted'::"text", 'revoked'::"text"]))),
    CONSTRAINT "platform_admin_audit_logs_reason_check" CHECK ((("char_length"(TRIM(BOTH FROM "reason")) >= 3) AND ("char_length"(TRIM(BOTH FROM "reason")) <= 500)))
);


ALTER TABLE "public"."platform_admin_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_organization_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "organization_name" "text" NOT NULL,
    "actor_user_id" "uuid",
    "actor_email" "text",
    "owner_user_id" "uuid",
    "owner_email" "text" NOT NULL,
    "action" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "platform_organization_audit_logs_action_check" CHECK (("action" = 'created'::"text")),
    CONSTRAINT "platform_organization_audit_logs_reason_check" CHECK ((("char_length"(TRIM(BOTH FROM "reason")) >= 3) AND ("char_length"(TRIM(BOTH FROM "reason")) <= 500)))
);


ALTER TABLE "public"."platform_organization_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'user'::"text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "email" "text",
    "display_name" "text",
    "last_medical_alerted_date" "date",
    "medical_class" integer,
    "medical_birth_date" "date",
    "medical_exam_date" "date",
    "medical_exp_date" "date" GENERATED ALWAYS AS ("public"."calculate_medical_expiry"("medical_birth_date", "medical_exam_date", "medical_class")) STORED,
    "last_medical_alerted_due_date" "date",
    "medical_alert_sent_at" timestamp with time zone,
    "self_person_id" "uuid"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."route_sessions" (
    "route_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "start_json" "jsonb",
    "destination_json" "jsonb",
    "route_options_json" "jsonb"
);


ALTER TABLE "public"."route_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_aircraft" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "aircraft_id" "uuid" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hundred_hour_due_hours" numeric,
    "annual_due_date" "date",
    "static_due_date" "date",
    "transponder_due_date" "date",
    "elt_due_date" "date"
);


ALTER TABLE "public"."saved_aircraft" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_people" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "role" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "cert_number" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "is_default" boolean DEFAULT false,
    "alert_sent" boolean DEFAULT false,
    "cert_exp_date" "date",
    "last_alerted_exp_date" "text",
    "alert_sent_at" timestamp without time zone,
    "weight_Ibs" numeric,
    "bag_weight_lbs" numeric,
    CONSTRAINT "saved_people_role_check" CHECK (("role" = ANY (ARRAY['self'::"text", 'cfi'::"text", 'student'::"text"])))
);


ALTER TABLE "public"."saved_people" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_person_certificates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "certificate_type" "text" NOT NULL,
    "certificate_number" "text",
    "ratings" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "issue_date" "date",
    "last_event_date" "date",
    "event_type" "text",
    "is_default_for_endorsements" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "last_alerted_due_date" "date",
    "alert_sent_at" timestamp with time zone,
    CONSTRAINT "saved_person_certificates_certificate_type_check" CHECK (("certificate_type" = ANY (ARRAY['pilot'::"text", 'flight_instructor'::"text", 'ground_instructor'::"text"])))
);


ALTER TABLE "public"."saved_person_certificates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weather_cache" (
    "key" "text" NOT NULL,
    "data" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."weather_cache" OWNER TO "postgres";


ALTER TABLE ONLY "public"."aircraft_discrepancy_reports"
    ADD CONSTRAINT "aircraft_discrepancy_reports_pkey" PRIMARY KEY ("report_id");



ALTER TABLE ONLY "public"."aircraft_inspection_assignments"
    ADD CONSTRAINT "aircraft_inspection_assignments_definition_id_aircraft_id_key" UNIQUE ("definition_id", "aircraft_id");



ALTER TABLE ONLY "public"."aircraft_inspection_assignments"
    ADD CONSTRAINT "aircraft_inspection_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aircraft_meter_readings"
    ADD CONSTRAINT "aircraft_meter_readings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aircraft_models"
    ADD CONSTRAINT "aircraft_models_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aircraft_organization_assignment_audit_logs"
    ADD CONSTRAINT "aircraft_organization_assignment_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aircraft_organization_assignments"
    ADD CONSTRAINT "aircraft_organization_assignments_pkey" PRIMARY KEY ("aircraft_id", "organization_id");



ALTER TABLE ONLY "public"."aircraft"
    ADD CONSTRAINT "aircraft_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aircraft_update_requests"
    ADD CONSTRAINT "aircraft_update_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."airport_config"
    ADD CONSTRAINT "airport_config_pkey" PRIMARY KEY ("icao");



ALTER TABLE ONLY "public"."anniversary_logs"
    ADD CONSTRAINT "anniversary_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anniversary_logs"
    ADD CONSTRAINT "anniversary_logs_year_key" UNIQUE ("year");



ALTER TABLE ONLY "public"."asr_external_notifications"
    ADD CONSTRAINT "asr_external_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asr_reports"
    ADD CONSTRAINT "asr_reports_pkey" PRIMARY KEY ("report_id");



ALTER TABLE ONLY "public"."asr_reports"
    ADD CONSTRAINT "asr_reports_reference_serial_key" UNIQUE ("reference_serial");



ALTER TABLE ONLY "public"."endorsement_records"
    ADD CONSTRAINT "endorsement_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."endorsement_template_change_requests"
    ADD CONSTRAINT "endorsement_template_change_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."endorsement_template_settings"
    ADD CONSTRAINT "endorsement_template_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."endorsement_templates"
    ADD CONSTRAINT "endorsement_templates_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."endorsement_templates"
    ADD CONSTRAINT "endorsement_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."flight_briefs"
    ADD CONSTRAINT "flight_briefs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logbook"
    ADD CONSTRAINT "logbook_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notification_id", "user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_aircraft_maintenance"
    ADD CONSTRAINT "organization_aircraft_maintenance_pkey" PRIMARY KEY ("aircraft_id");



ALTER TABLE ONLY "public"."organization_asr_options"
    ADD CONSTRAINT "organization_asr_options_organization_id_category_value_key" UNIQUE ("organization_id", "category", "value");



ALTER TABLE ONLY "public"."organization_asr_options"
    ADD CONSTRAINT "organization_asr_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_inspection_definitions"
    ADD CONSTRAINT "organization_inspection_definitions_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."organization_inspection_definitions"
    ADD CONSTRAINT "organization_inspection_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_people"
    ADD CONSTRAINT "organization_people_organization_id_normalized_email_key" UNIQUE ("organization_id", "normalized_email");



ALTER TABLE ONLY "public"."organization_people"
    ADD CONSTRAINT "organization_people_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_report_events"
    ADD CONSTRAINT "organization_report_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_report_links"
    ADD CONSTRAINT "organization_report_links_pkey" PRIMARY KEY ("report_id", "related_report_id", "relationship_type");



ALTER TABLE ONLY "public"."organization_report_reviewer_assignments"
    ADD CONSTRAINT "organization_report_reviewer_assignments_pkey" PRIMARY KEY ("organization_id", "user_id", "capability");



ALTER TABLE ONLY "public"."organization_reports"
    ADD CONSTRAINT "organization_reports_organization_id_submitted_by_client_re_key" UNIQUE ("organization_id", "submitted_by", "client_request_id");



ALTER TABLE ONLY "public"."organization_reports"
    ADD CONSTRAINT "organization_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admin_audit_logs"
    ADD CONSTRAINT "platform_admin_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_organization_audit_logs"
    ADD CONSTRAINT "platform_organization_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."route_sessions"
    ADD CONSTRAINT "route_sessions_pkey" PRIMARY KEY ("route_key");



ALTER TABLE ONLY "public"."saved_aircraft"
    ADD CONSTRAINT "saved_aircraft_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_people"
    ADD CONSTRAINT "saved_people_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_person_certificates"
    ADD CONSTRAINT "saved_person_certificates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weather_cache"
    ADD CONSTRAINT "weather_cache_pkey" PRIMARY KEY ("key");



CREATE INDEX "aircraft_assignment_audit_actor_idx" ON "public"."aircraft_organization_assignment_audit_logs" USING "btree" ("actor_user_id") WHERE ("actor_user_id" IS NOT NULL);



CREATE INDEX "aircraft_assignment_audit_aircraft_idx" ON "public"."aircraft_organization_assignment_audit_logs" USING "btree" ("aircraft_id") WHERE ("aircraft_id" IS NOT NULL);



CREATE INDEX "aircraft_assignment_audit_created_idx" ON "public"."aircraft_organization_assignment_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "aircraft_assignment_audit_organization_idx" ON "public"."aircraft_organization_assignment_audit_logs" USING "btree" ("organization_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "aircraft_assignments_assigned_by_idx" ON "public"."aircraft_organization_assignments" USING "btree" ("assigned_by") WHERE ("assigned_by" IS NOT NULL);



CREATE INDEX "aircraft_discrepancy_aircraft_idx" ON "public"."aircraft_discrepancy_reports" USING "btree" ("aircraft_id", "report_date" DESC);



CREATE INDEX "aircraft_meter_readings_aircraft_idx" ON "public"."aircraft_meter_readings" USING "btree" ("aircraft_id", "observed_at" DESC);



CREATE UNIQUE INDEX "aircraft_meter_readings_brief_idx" ON "public"."aircraft_meter_readings" USING "btree" ("flight_brief_id") WHERE ("flight_brief_id" IS NOT NULL);



CREATE INDEX "aircraft_meter_readings_organization_idx" ON "public"."aircraft_meter_readings" USING "btree" ("organization_id", "observed_at" DESC);



CREATE INDEX "aircraft_model_id_idx" ON "public"."aircraft" USING "btree" ("model_id") WHERE ("model_id" IS NOT NULL);



CREATE INDEX "aircraft_models_organization_id_idx" ON "public"."aircraft_models" USING "btree" ("organization_id");



CREATE INDEX "aircraft_organization_assignments_org_idx" ON "public"."aircraft_organization_assignments" USING "btree" ("organization_id", "aircraft_id");



CREATE INDEX "aircraft_organization_idx" ON "public"."aircraft" USING "btree" ("organization_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "aircraft_owner_user_id_idx" ON "public"."aircraft" USING "btree" ("owner_user_id");



CREATE UNIQUE INDEX "aircraft_tail_number_organization_unique_idx" ON "public"."aircraft" USING "btree" ("organization_id", "upper"("btrim"("tail_number"))) WHERE (("visibility" = 'organization'::"text") AND ("organization_id" IS NOT NULL));



CREATE UNIQUE INDEX "aircraft_tail_number_private_owner_unique_idx" ON "public"."aircraft" USING "btree" ("owner_user_id", "upper"("tail_number")) WHERE (("visibility" = 'private'::"text") AND ("owner_user_id" IS NOT NULL));



CREATE UNIQUE INDEX "aircraft_tail_number_shared_unique_idx" ON "public"."aircraft" USING "btree" ("upper"("tail_number")) WHERE ("visibility" = 'shared'::"text");



CREATE INDEX "aircraft_update_requests_aircraft_id_idx" ON "public"."aircraft_update_requests" USING "btree" ("aircraft_id");



CREATE INDEX "aircraft_update_requests_status_idx" ON "public"."aircraft_update_requests" USING "btree" ("status");



CREATE INDEX "aircraft_visibility_idx" ON "public"."aircraft" USING "btree" ("visibility");



CREATE INDEX "asr_external_notifications_report_idx" ON "public"."asr_external_notifications" USING "btree" ("report_id", "sort_order");



CREATE INDEX "asr_reports_aircraft_occurrence_idx" ON "public"."asr_reports" USING "btree" ("aircraft_id", "occurrence_date" DESC);



CREATE INDEX "asr_reports_source_discrepancy_idx" ON "public"."asr_reports" USING "btree" ("source_discrepancy_report_id") WHERE ("source_discrepancy_report_id" IS NOT NULL);



CREATE INDEX "endorsement_change_requests_org_idx" ON "public"."endorsement_template_change_requests" USING "btree" ("organization_id", "submitted_at" DESC);



CREATE INDEX "endorsement_change_requests_pending_idx" ON "public"."endorsement_template_change_requests" USING "btree" ("status", "submitted_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "endorsement_records_organization_idx" ON "public"."endorsement_records" USING "btree" ("organization_id", "created_at" DESC) WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "endorsement_records_user_created_idx" ON "public"."endorsement_records" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "endorsement_records_user_student_idx" ON "public"."endorsement_records" USING "btree" ("user_id", "lower"("student_name"));



CREATE INDEX "endorsement_template_settings_updated_by_idx" ON "public"."endorsement_template_settings" USING "btree" ("updated_by");



CREATE INDEX "endorsement_templates_category_idx" ON "public"."endorsement_templates" USING "btree" ("category");



CREATE INDEX "endorsement_templates_created_by_idx" ON "public"."endorsement_templates" USING "btree" ("created_by");



CREATE UNIQUE INDEX "endorsement_templates_reference_number_key" ON "public"."endorsement_templates" USING "btree" ("reference_number") WHERE ("reference_number" IS NOT NULL);



CREATE INDEX "endorsement_templates_status_sort_idx" ON "public"."endorsement_templates" USING "btree" ("status", "sort_order", "reference_number", "title");



CREATE INDEX "endorsement_templates_updated_by_idx" ON "public"."endorsement_templates" USING "btree" ("updated_by");



CREATE INDEX "flight_briefs_aircraft_idx" ON "public"."flight_briefs" USING "btree" ("aircraft_id", "flight_date" DESC) WHERE ("aircraft_id" IS NOT NULL);



CREATE INDEX "flight_briefs_org_idx" ON "public"."flight_briefs" USING "btree" ("organization_id", "status", "flight_date" DESC) WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "flight_briefs_owner_idx" ON "public"."flight_briefs" USING "btree" ("created_by", "created_at" DESC);



CREATE INDEX "inspection_assignments_aircraft_idx" ON "public"."aircraft_inspection_assignments" USING "btree" ("aircraft_id", "is_active");



CREATE INDEX "inspection_definitions_org_idx" ON "public"."organization_inspection_definitions" USING "btree" ("organization_id", "is_active", "name");



CREATE INDEX "notification_reads_user_id_idx" ON "public"."notification_reads" USING "btree" ("user_id", "read_at" DESC);



CREATE INDEX "notifications_organization_created_at_idx" ON "public"."notifications" USING "btree" ("organization_id", "created_at" DESC) WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "notifications_recipient_created_at_idx" ON "public"."notifications" USING "btree" ("recipient_user_id", "created_at" DESC);



CREATE UNIQUE INDEX "notifications_recipient_dedupe_key" ON "public"."notifications" USING "btree" ("recipient_user_id", "dedupe_key");



CREATE UNIQUE INDEX "organization_members_one_owner_idx" ON "public"."organization_members" USING "btree" ("organization_id") WHERE ("role" = 'owner'::"text");



CREATE INDEX "organization_members_teaching_role_idx" ON "public"."organization_members" USING "btree" ("organization_id", "teaching_role") WHERE ("teaching_role" IS NOT NULL);



CREATE INDEX "organization_members_user_idx" ON "public"."organization_members" USING "btree" ("user_id", "organization_id");



CREATE INDEX "organization_people_added_by_idx" ON "public"."organization_people" USING "btree" ("added_by") WHERE ("added_by" IS NOT NULL);



CREATE UNIQUE INDEX "organization_people_org_user_idx" ON "public"."organization_people" USING "btree" ("organization_id", "user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "organization_people_pending_email_idx" ON "public"."organization_people" USING "btree" ("normalized_email", "created_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "organization_people_user_id_idx" ON "public"."organization_people" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "organization_report_events_report_idx" ON "public"."organization_report_events" USING "btree" ("report_id", "created_at");



CREATE INDEX "organization_report_links_related_idx" ON "public"."organization_report_links" USING "btree" ("related_report_id", "report_id");



CREATE INDEX "organization_reports_org_created_idx" ON "public"."organization_reports" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "organization_reports_org_type_created_idx" ON "public"."organization_reports" USING "btree" ("organization_id", "report_type", "created_at" DESC);



CREATE UNIQUE INDEX "organization_reports_reference_unique" ON "public"."organization_reports" USING "btree" ("reference_number") WHERE ("reference_number" IS NOT NULL);



CREATE INDEX "organization_reports_submitter_created_idx" ON "public"."organization_reports" USING "btree" ("submitted_by", "created_at" DESC);



CREATE INDEX "organization_reports_supersedes_idx" ON "public"."organization_reports" USING "btree" ("supersedes_report_id") WHERE ("supersedes_report_id" IS NOT NULL);



CREATE INDEX "platform_admin_audit_logs_created_idx" ON "public"."platform_admin_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "platform_admin_audit_logs_target_idx" ON "public"."platform_admin_audit_logs" USING "btree" ("target_user_id", "created_at" DESC);



CREATE INDEX "platform_organization_audit_logs_created_idx" ON "public"."platform_organization_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "platform_organization_audit_logs_organization_idx" ON "public"."platform_organization_audit_logs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "report_reviewer_assignments_user_idx" ON "public"."organization_report_reviewer_assignments" USING "btree" ("user_id", "organization_id");



CREATE UNIQUE INDEX "saved_aircraft_user_aircraft_unique" ON "public"."saved_aircraft" USING "btree" ("user_id", "aircraft_id");



CREATE UNIQUE INDEX "saved_aircraft_user_default_unique" ON "public"."saved_aircraft" USING "btree" ("user_id") WHERE ("is_default" = true);



CREATE INDEX "saved_aircraft_user_id_idx" ON "public"."saved_aircraft" USING "btree" ("user_id");



CREATE UNIQUE INDEX "saved_person_certificates_one_default_instructor" ON "public"."saved_person_certificates" USING "btree" ("user_id") WHERE (("certificate_type" = ANY (ARRAY['flight_instructor'::"text", 'ground_instructor'::"text"])) AND ("is_default_for_endorsements" = true));



CREATE INDEX "saved_person_certificates_person_idx" ON "public"."saved_person_certificates" USING "btree" ("user_id", "person_id");



CREATE INDEX "saved_person_certificates_reminder_idx" ON "public"."saved_person_certificates" USING "btree" ("certificate_type", "last_event_date") WHERE (("certificate_type" = ANY (ARRAY['flight_instructor'::"text", 'ground_instructor'::"text"])) AND ("last_event_date" IS NOT NULL));



CREATE INDEX "saved_person_certificates_type_idx" ON "public"."saved_person_certificates" USING "btree" ("user_id", "certificate_type");



CREATE OR REPLACE TRIGGER "aircraft_set_updated_at" BEFORE UPDATE ON "public"."aircraft" FOR EACH ROW EXECUTE FUNCTION "public"."set_aircraft_updated_at"();



CREATE OR REPLACE TRIGGER "endorsement_template_settings_set_updated_at" BEFORE UPDATE ON "public"."endorsement_template_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_endorsement_template_settings_updated_at"();



CREATE OR REPLACE TRIGGER "endorsement_templates_set_updated_at" BEFORE UPDATE ON "public"."endorsement_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_endorsement_templates_updated_at"();



CREATE OR REPLACE TRIGGER "enforce_notification_preferences" BEFORE INSERT OR UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_notification_preferences"();



CREATE OR REPLACE TRIGGER "ensure_aircraft_grounding_note" BEFORE INSERT OR UPDATE OF "operational_status", "operational_status_note" ON "public"."organization_aircraft_maintenance" FOR EACH ROW EXECUTE FUNCTION "private"."ensure_aircraft_grounding_note"();



CREATE OR REPLACE TRIGGER "notify_endorsement_template_request_change" AFTER INSERT OR UPDATE OF "status" ON "public"."endorsement_template_change_requests" FOR EACH ROW EXECUTE FUNCTION "private"."notify_endorsement_template_request_change"();



CREATE OR REPLACE TRIGGER "notify_organization_aircraft_maintenance_change" AFTER INSERT OR UPDATE ON "public"."organization_aircraft_maintenance" FOR EACH ROW EXECUTE FUNCTION "private"."notify_organization_aircraft_maintenance_change"();



CREATE OR REPLACE TRIGGER "notify_organization_endorsement_created" AFTER INSERT ON "public"."endorsement_records" FOR EACH ROW EXECUTE FUNCTION "private"."notify_organization_endorsement_created"();



CREATE OR REPLACE TRIGGER "notify_organization_membership_change" AFTER INSERT OR DELETE OR UPDATE OF "role", "teaching_role" ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "private"."notify_organization_membership_change"();



CREATE OR REPLACE TRIGGER "prepare_endorsement_record" BEFORE INSERT OR UPDATE ON "public"."endorsement_records" FOR EACH ROW EXECUTE FUNCTION "private"."prepare_endorsement_record"();



CREATE OR REPLACE TRIGGER "seed_new_organization_asr_options" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "private"."seed_new_organization_asr_options"();



CREATE OR REPLACE TRIGGER "sync_organization_person_from_member" AFTER INSERT OR DELETE OR UPDATE OF "teaching_role" ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "private"."sync_organization_person_from_member"();



CREATE OR REPLACE TRIGGER "validate_aircraft_discrepancy_report_input" BEFORE INSERT OR UPDATE OF "report_date", "description" ON "public"."aircraft_discrepancy_reports" FOR EACH ROW EXECUTE FUNCTION "private"."validate_aircraft_discrepancy_report_input"();



CREATE OR REPLACE TRIGGER "validate_aircraft_inspection_assignment" BEFORE INSERT OR UPDATE ON "public"."aircraft_inspection_assignments" FOR EACH ROW EXECUTE FUNCTION "private"."validate_aircraft_inspection_assignment"();



CREATE OR REPLACE TRIGGER "validate_aircraft_model_scope" BEFORE INSERT OR UPDATE OF "model_id", "visibility", "organization_id" ON "public"."aircraft" FOR EACH ROW EXECUTE FUNCTION "private"."validate_aircraft_model_scope"();



ALTER TABLE ONLY "public"."aircraft"
    ADD CONSTRAINT "aircraft_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aircraft_discrepancy_reports"
    ADD CONSTRAINT "aircraft_discrepancy_reports_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."aircraft_discrepancy_reports"
    ADD CONSTRAINT "aircraft_discrepancy_reports_credit_authorized_by_fkey" FOREIGN KEY ("credit_authorized_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aircraft_discrepancy_reports"
    ADD CONSTRAINT "aircraft_discrepancy_reports_instructor_person_id_fkey" FOREIGN KEY ("instructor_person_id") REFERENCES "public"."organization_people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aircraft_discrepancy_reports"
    ADD CONSTRAINT "aircraft_discrepancy_reports_instructor_signed_by_fkey" FOREIGN KEY ("instructor_signed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aircraft_discrepancy_reports"
    ADD CONSTRAINT "aircraft_discrepancy_reports_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aircraft_discrepancy_reports"
    ADD CONSTRAINT "aircraft_discrepancy_reports_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."organization_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aircraft_discrepancy_reports"
    ADD CONSTRAINT "aircraft_discrepancy_reports_student_person_id_fkey" FOREIGN KEY ("student_person_id") REFERENCES "public"."organization_people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aircraft_inspection_assignments"
    ADD CONSTRAINT "aircraft_inspection_assignments_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aircraft_inspection_assignments"
    ADD CONSTRAINT "aircraft_inspection_assignments_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "public"."organization_inspection_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aircraft_inspection_assignments"
    ADD CONSTRAINT "aircraft_inspection_assignments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aircraft_meter_readings"
    ADD CONSTRAINT "aircraft_meter_readings_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."aircraft_meter_readings"
    ADD CONSTRAINT "aircraft_meter_readings_flight_brief_id_fkey" FOREIGN KEY ("flight_brief_id") REFERENCES "public"."flight_briefs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."aircraft_meter_readings"
    ADD CONSTRAINT "aircraft_meter_readings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."aircraft_meter_readings"
    ADD CONSTRAINT "aircraft_meter_readings_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."aircraft"
    ADD CONSTRAINT "aircraft_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."aircraft_models"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aircraft_models"
    ADD CONSTRAINT "aircraft_models_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."aircraft_organization_assignment_audit_logs"
    ADD CONSTRAINT "aircraft_organization_assignment_audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aircraft_organization_assignment_audit_logs"
    ADD CONSTRAINT "aircraft_organization_assignment_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aircraft_organization_assignment_audit_logs"
    ADD CONSTRAINT "aircraft_organization_assignment_audit_logs_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aircraft_organization_assignments"
    ADD CONSTRAINT "aircraft_organization_assignments_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aircraft_organization_assignments"
    ADD CONSTRAINT "aircraft_organization_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aircraft_organization_assignments"
    ADD CONSTRAINT "aircraft_organization_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aircraft"
    ADD CONSTRAINT "aircraft_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."aircraft"
    ADD CONSTRAINT "aircraft_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."aircraft"
    ADD CONSTRAINT "aircraft_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aircraft_update_requests"
    ADD CONSTRAINT "aircraft_update_requests_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aircraft_update_requests"
    ADD CONSTRAINT "aircraft_update_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aircraft_update_requests"
    ADD CONSTRAINT "aircraft_update_requests_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aircraft"
    ADD CONSTRAINT "aircraft_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asr_external_notifications"
    ADD CONSTRAINT "asr_external_notifications_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."asr_reports"("report_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asr_reports"
    ADD CONSTRAINT "asr_reports_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."asr_reports"
    ADD CONSTRAINT "asr_reports_maintenance_signed_by_fkey" FOREIGN KEY ("maintenance_signed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asr_reports"
    ADD CONSTRAINT "asr_reports_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."organization_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asr_reports"
    ADD CONSTRAINT "asr_reports_reporter_signed_by_fkey" FOREIGN KEY ("reporter_signed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asr_reports"
    ADD CONSTRAINT "asr_reports_risk_rated_by_fkey" FOREIGN KEY ("risk_rated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asr_reports"
    ADD CONSTRAINT "asr_reports_safety_signed_by_fkey" FOREIGN KEY ("safety_signed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asr_reports"
    ADD CONSTRAINT "asr_reports_source_discrepancy_report_id_fkey" FOREIGN KEY ("source_discrepancy_report_id") REFERENCES "public"."organization_reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asr_reports"
    ADD CONSTRAINT "asr_reports_training_signed_by_fkey" FOREIGN KEY ("training_signed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."endorsement_records"
    ADD CONSTRAINT "endorsement_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."endorsement_records"
    ADD CONSTRAINT "endorsement_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."saved_people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."endorsement_records"
    ADD CONSTRAINT "endorsement_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."endorsement_template_change_requests"
    ADD CONSTRAINT "endorsement_template_change_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."endorsement_template_change_requests"
    ADD CONSTRAINT "endorsement_template_change_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."endorsement_template_change_requests"
    ADD CONSTRAINT "endorsement_template_change_requests_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."endorsement_template_change_requests"
    ADD CONSTRAINT "endorsement_template_change_requests_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."endorsement_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."endorsement_template_settings"
    ADD CONSTRAINT "endorsement_template_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."endorsement_templates"
    ADD CONSTRAINT "endorsement_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."endorsement_templates"
    ADD CONSTRAINT "endorsement_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."flight_briefs"
    ADD CONSTRAINT "flight_briefs_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."flight_briefs"
    ADD CONSTRAINT "flight_briefs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flight_briefs"
    ADD CONSTRAINT "flight_briefs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."flight_briefs"
    ADD CONSTRAINT "flight_briefs_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "public"."flight_briefs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_aircraft_maintenance"
    ADD CONSTRAINT "organization_aircraft_maintenance_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_aircraft_maintenance"
    ADD CONSTRAINT "organization_aircraft_maintenance_meter_source_brief_id_fkey" FOREIGN KEY ("meter_source_brief_id") REFERENCES "public"."flight_briefs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_aircraft_maintenance"
    ADD CONSTRAINT "organization_aircraft_maintenance_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_asr_options"
    ADD CONSTRAINT "organization_asr_options_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_inspection_definitions"
    ADD CONSTRAINT "organization_inspection_definitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_inspection_definitions"
    ADD CONSTRAINT "organization_inspection_definitions_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."aircraft_models"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."organization_inspection_definitions"
    ADD CONSTRAINT "organization_inspection_definitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_inspection_definitions"
    ADD CONSTRAINT "organization_inspection_definitions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_people"
    ADD CONSTRAINT "organization_people_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_people"
    ADD CONSTRAINT "organization_people_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_people"
    ADD CONSTRAINT "organization_people_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_report_events"
    ADD CONSTRAINT "organization_report_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_report_events"
    ADD CONSTRAINT "organization_report_events_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."organization_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_report_links"
    ADD CONSTRAINT "organization_report_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_report_links"
    ADD CONSTRAINT "organization_report_links_related_report_id_fkey" FOREIGN KEY ("related_report_id") REFERENCES "public"."organization_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_report_links"
    ADD CONSTRAINT "organization_report_links_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."organization_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_report_reviewer_assignments"
    ADD CONSTRAINT "organization_report_reviewer_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_report_reviewer_assignments"
    ADD CONSTRAINT "organization_report_reviewer_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_report_reviewer_assignments"
    ADD CONSTRAINT "organization_report_reviewer_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_reports"
    ADD CONSTRAINT "organization_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_reports"
    ADD CONSTRAINT "organization_reports_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."organization_reports"
    ADD CONSTRAINT "organization_reports_supersedes_report_id_fkey" FOREIGN KEY ("supersedes_report_id") REFERENCES "public"."organization_reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."platform_admin_audit_logs"
    ADD CONSTRAINT "platform_admin_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."platform_admin_audit_logs"
    ADD CONSTRAINT "platform_admin_audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."platform_organization_audit_logs"
    ADD CONSTRAINT "platform_organization_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."platform_organization_audit_logs"
    ADD CONSTRAINT "platform_organization_audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."platform_organization_audit_logs"
    ADD CONSTRAINT "platform_organization_audit_logs_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_self_person_id_fkey" FOREIGN KEY ("self_person_id") REFERENCES "public"."saved_people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."saved_aircraft"
    ADD CONSTRAINT "saved_aircraft_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_aircraft"
    ADD CONSTRAINT "saved_aircraft_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_people"
    ADD CONSTRAINT "saved_people_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_person_certificates"
    ADD CONSTRAINT "saved_person_certificates_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."saved_people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_person_certificates"
    ADD CONSTRAINT "saved_person_certificates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."aircraft" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aircraft_assignment_audit_deny_direct_read" ON "public"."aircraft_organization_assignment_audit_logs" FOR SELECT TO "authenticated" USING (false);



CREATE POLICY "aircraft_assignments_select_authorized" ON "public"."aircraft_organization_assignments" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_platform_admin"() AS "is_platform_admin") OR ( SELECT "private"."is_organization_member"("aircraft_organization_assignments"."organization_id") AS "is_organization_member")));



CREATE POLICY "aircraft_delete_authorized" ON "public"."aircraft" FOR DELETE TO "authenticated" USING (((("visibility" = 'private'::"text") AND ("owner_user_id" = ( SELECT "auth"."uid"() AS "uid"))) OR (("visibility" = 'organization'::"text") AND ("organization_id" IS NOT NULL) AND ( SELECT "private"."is_organization_manager"("aircraft"."organization_id") AS "is_organization_manager")) OR (("visibility" = 'shared'::"text") AND ("organization_id" IS NULL) AND ( SELECT "private"."is_platform_admin"() AS "is_platform_admin"))));



ALTER TABLE "public"."aircraft_discrepancy_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aircraft_discrepancy_reports_select_authorized" ON "public"."aircraft_discrepancy_reports" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_read_organization_report"("aircraft_discrepancy_reports"."report_id", ( SELECT "auth"."uid"() AS "uid")) AS "can_read_organization_report"));



CREATE POLICY "aircraft_insert_authorized" ON "public"."aircraft" FOR INSERT TO "authenticated" WITH CHECK (((("visibility" = 'private'::"text") AND ("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("organization_id" IS NULL)) OR (("visibility" = 'organization'::"text") AND ("organization_id" IS NOT NULL) AND ( SELECT "private"."is_organization_manager"("aircraft"."organization_id") AS "is_organization_manager")) OR (("visibility" = 'shared'::"text") AND ("organization_id" IS NULL) AND ( SELECT "private"."is_platform_admin"() AS "is_platform_admin"))));



ALTER TABLE "public"."aircraft_inspection_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aircraft_inspections_delete_manager" ON "public"."aircraft_inspection_assignments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_inspection_definitions" "definitions"
  WHERE (("definitions"."id" = "aircraft_inspection_assignments"."definition_id") AND ( SELECT "private"."is_organization_manager"("definitions"."organization_id") AS "is_organization_manager") AND ( SELECT "private"."can_use_aircraft_in_organization"("aircraft_inspection_assignments"."aircraft_id", "definitions"."organization_id") AS "can_use_aircraft_in_organization")))));



CREATE POLICY "aircraft_inspections_insert_manager" ON "public"."aircraft_inspection_assignments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_inspection_definitions" "definitions"
  WHERE (("definitions"."id" = "aircraft_inspection_assignments"."definition_id") AND ( SELECT "private"."is_organization_manager"("definitions"."organization_id") AS "is_organization_manager") AND ( SELECT "private"."can_use_aircraft_in_organization"("aircraft_inspection_assignments"."aircraft_id", "definitions"."organization_id") AS "can_use_aircraft_in_organization")))));



CREATE POLICY "aircraft_inspections_select_member" ON "public"."aircraft_inspection_assignments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_inspection_definitions" "definitions"
  WHERE (("definitions"."id" = "aircraft_inspection_assignments"."definition_id") AND ( SELECT "private"."can_use_aircraft_in_organization"("aircraft_inspection_assignments"."aircraft_id", "definitions"."organization_id") AS "can_use_aircraft_in_organization")))));



CREATE POLICY "aircraft_inspections_update_manager" ON "public"."aircraft_inspection_assignments" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_inspection_definitions" "definitions"
  WHERE (("definitions"."id" = "aircraft_inspection_assignments"."definition_id") AND ( SELECT "private"."is_organization_manager"("definitions"."organization_id") AS "is_organization_manager") AND ( SELECT "private"."can_use_aircraft_in_organization"("aircraft_inspection_assignments"."aircraft_id", "definitions"."organization_id") AS "can_use_aircraft_in_organization"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_inspection_definitions" "definitions"
  WHERE (("definitions"."id" = "aircraft_inspection_assignments"."definition_id") AND ( SELECT "private"."is_organization_manager"("definitions"."organization_id") AS "is_organization_manager") AND ( SELECT "private"."can_use_aircraft_in_organization"("aircraft_inspection_assignments"."aircraft_id", "definitions"."organization_id") AS "can_use_aircraft_in_organization")))));



ALTER TABLE "public"."aircraft_meter_readings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aircraft_meter_readings_select_authorized" ON "public"."aircraft_meter_readings" FOR SELECT TO "authenticated" USING ((("submitted_by" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_organization_manager"("aircraft_meter_readings"."organization_id") AS "is_organization_manager")));



ALTER TABLE "public"."aircraft_models" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aircraft_models_delete_authorized" ON "public"."aircraft_models" FOR DELETE TO "authenticated" USING (((("organization_id" IS NULL) AND ( SELECT "private"."is_platform_admin"() AS "is_platform_admin")) OR (("organization_id" IS NOT NULL) AND ( SELECT "private"."is_organization_manager"("aircraft_models"."organization_id") AS "is_organization_manager"))));



CREATE POLICY "aircraft_models_insert_authorized" ON "public"."aircraft_models" FOR INSERT TO "authenticated" WITH CHECK (((("organization_id" IS NULL) AND ( SELECT "private"."is_platform_admin"() AS "is_platform_admin")) OR (("organization_id" IS NOT NULL) AND ( SELECT "private"."is_organization_manager"("aircraft_models"."organization_id") AS "is_organization_manager"))));



CREATE POLICY "aircraft_models_select_authenticated" ON "public"."aircraft_models" FOR SELECT TO "authenticated" USING ((("organization_id" IS NULL) OR (("organization_id" IS NOT NULL) AND ( SELECT "private"."is_organization_member"("aircraft_models"."organization_id") AS "is_organization_member")) OR ( SELECT "private"."is_platform_admin"() AS "is_platform_admin")));



CREATE POLICY "aircraft_models_select_global_public" ON "public"."aircraft_models" FOR SELECT TO "anon" USING (("organization_id" IS NULL));



CREATE POLICY "aircraft_models_update_authorized" ON "public"."aircraft_models" FOR UPDATE TO "authenticated" USING (((("organization_id" IS NULL) AND ( SELECT "private"."is_platform_admin"() AS "is_platform_admin")) OR (("organization_id" IS NOT NULL) AND ( SELECT "private"."is_organization_manager"("aircraft_models"."organization_id") AS "is_organization_manager")))) WITH CHECK (((("organization_id" IS NULL) AND ( SELECT "private"."is_platform_admin"() AS "is_platform_admin")) OR (("organization_id" IS NOT NULL) AND ( SELECT "private"."is_organization_manager"("aircraft_models"."organization_id") AS "is_organization_manager"))));



ALTER TABLE "public"."aircraft_organization_assignment_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."aircraft_organization_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aircraft_select_authenticated" ON "public"."aircraft" FOR SELECT TO "authenticated" USING ((("visibility" = 'shared'::"text") OR ("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("organization_id" IS NOT NULL) AND ( SELECT "private"."is_organization_member"("aircraft"."organization_id") AS "is_organization_member")) OR (EXISTS ( SELECT 1
   FROM "public"."aircraft_organization_assignments" "assignments"
  WHERE (("assignments"."aircraft_id" = "aircraft"."id") AND ( SELECT "private"."is_organization_member"("assignments"."organization_id") AS "is_organization_member")))) OR ( SELECT "private"."is_platform_admin"() AS "is_platform_admin")));



CREATE POLICY "aircraft_select_shared_anon" ON "public"."aircraft" FOR SELECT TO "anon" USING (("visibility" = 'shared'::"text"));



CREATE POLICY "aircraft_update_authorized" ON "public"."aircraft" FOR UPDATE TO "authenticated" USING (((("visibility" = 'private'::"text") AND ("owner_user_id" = ( SELECT "auth"."uid"() AS "uid"))) OR (("visibility" = 'organization'::"text") AND ("organization_id" IS NOT NULL) AND ( SELECT "private"."is_organization_manager"("aircraft"."organization_id") AS "is_organization_manager")) OR (("visibility" = 'shared'::"text") AND ("organization_id" IS NULL) AND ( SELECT "private"."is_platform_admin"() AS "is_platform_admin")))) WITH CHECK (((("visibility" = 'private'::"text") AND ("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("organization_id" IS NULL)) OR (("visibility" = 'organization'::"text") AND ("organization_id" IS NOT NULL) AND ( SELECT "private"."is_organization_manager"("aircraft"."organization_id") AS "is_organization_manager")) OR (("visibility" = 'shared'::"text") AND ("organization_id" IS NULL) AND ( SELECT "private"."is_platform_admin"() AS "is_platform_admin"))));



ALTER TABLE "public"."aircraft_update_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aircraft_update_requests_admin_delete" ON "public"."aircraft_update_requests" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "aircraft_update_requests_admin_update" ON "public"."aircraft_update_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "aircraft_update_requests_insert_own" ON "public"."aircraft_update_requests" FOR INSERT TO "authenticated" WITH CHECK ((("submitted_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"text")));



CREATE POLICY "aircraft_update_requests_select_own_or_admin" ON "public"."aircraft_update_requests" FOR SELECT TO "authenticated" USING ((("submitted_by" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'admin'::"text"))))));



ALTER TABLE "public"."airport_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anniversary_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."asr_external_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asr_external_notifications_select_authorized" ON "public"."asr_external_notifications" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_read_organization_report"("asr_external_notifications"."report_id", ( SELECT "auth"."uid"() AS "uid")) AS "can_read_organization_report"));



ALTER TABLE "public"."asr_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asr_reports_select_authorized" ON "public"."asr_reports" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_read_organization_report"("asr_reports"."report_id", ( SELECT "auth"."uid"() AS "uid")) AS "can_read_organization_report"));



CREATE POLICY "endorsement_change_requests_select_authorized" ON "public"."endorsement_template_change_requests" FOR SELECT TO "authenticated" USING ((( SELECT "private"."can_manage_organization"("endorsement_template_change_requests"."organization_id") AS "can_manage_organization") OR ( SELECT "private"."is_platform_admin"() AS "is_platform_admin")));



ALTER TABLE "public"."endorsement_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "endorsement_records_delete_own" ON "public"."endorsement_records" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "endorsement_records_insert_own" ON "public"."endorsement_records" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (("organization_id" IS NULL) OR ( SELECT "private"."is_organization_member"("endorsement_records"."organization_id") AS "is_organization_member"))));



CREATE POLICY "endorsement_records_select_authorized" ON "public"."endorsement_records" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (("organization_id" IS NOT NULL) AND ( SELECT "private"."can_manage_organization"("endorsement_records"."organization_id") AS "can_manage_organization"))));



CREATE POLICY "endorsement_records_update_own" ON "public"."endorsement_records" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."endorsement_template_change_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."endorsement_template_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "endorsement_template_settings_select" ON "public"."endorsement_template_settings" FOR SELECT TO "authenticated", "anon" USING (("id" = 'default'::"text"));



CREATE POLICY "endorsement_template_settings_update_admin" ON "public"."endorsement_template_settings" FOR UPDATE TO "authenticated" USING ((("id" = 'default'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'admin'::"text")))))) WITH CHECK ((("id" = 'default'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'admin'::"text"))))));



ALTER TABLE "public"."endorsement_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "endorsement_templates_delete_admin" ON "public"."endorsement_templates" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "endorsement_templates_insert_admin" ON "public"."endorsement_templates" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "endorsement_templates_select_active_anon" ON "public"."endorsement_templates" FOR SELECT TO "anon" USING (("status" = 'active'::"text"));



CREATE POLICY "endorsement_templates_select_visible_authenticated" ON "public"."endorsement_templates" FOR SELECT TO "authenticated" USING ((("status" = 'active'::"text") OR ( SELECT "private"."is_organization_manager"() AS "is_organization_manager") OR ( SELECT "private"."is_platform_admin"() AS "is_platform_admin")));



CREATE POLICY "endorsement_templates_update_admin" ON "public"."endorsement_templates" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'admin'::"text")))));



ALTER TABLE "public"."flight_briefs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "flight_briefs_delete_own_draft" ON "public"."flight_briefs" FOR DELETE TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'draft'::"text")));



CREATE POLICY "flight_briefs_insert_own" ON "public"."flight_briefs" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'draft'::"text") AND (("organization_id" IS NULL) OR ( SELECT "private"."is_organization_member"("flight_briefs"."organization_id") AS "is_organization_member"))));



CREATE POLICY "flight_briefs_select_authorized" ON "public"."flight_briefs" FOR SELECT TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR (("status" = ANY (ARRAY['finalized'::"text", 'superseded'::"text"])) AND ("organization_id" IS NOT NULL) AND (( SELECT "private"."is_organization_manager"("flight_briefs"."organization_id") AS "is_organization_manager") OR (( SELECT "private"."is_organization_instructor"("flight_briefs"."organization_id") AS "is_organization_instructor") AND (EXISTS ( SELECT 1
   FROM "public"."organization_members" "student_membership"
  WHERE (("student_membership"."organization_id" = "flight_briefs"."organization_id") AND ("student_membership"."user_id" = "flight_briefs"."created_by") AND ("student_membership"."teaching_role" = 'student'::"text")))))))));



CREATE POLICY "flight_briefs_update_own_draft" ON "public"."flight_briefs" FOR UPDATE TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'draft'::"text"))) WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'draft'::"text")));



ALTER TABLE "public"."logbook" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "logbook_delete_own" ON "public"."logbook" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "logbook_insert_own" ON "public"."logbook" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "logbook_select_own" ON "public"."logbook" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "logbook_update_own" ON "public"."logbook" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_preferences_own_insert" ON "public"."notification_preferences" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notification_preferences_own_select" ON "public"."notification_preferences" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notification_preferences_own_update" ON "public"."notification_preferences" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."notification_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_reads_own_delete" ON "public"."notification_reads" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notification_reads_own_insert" ON "public"."notification_reads" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."notifications" "notification"
  WHERE ("notification"."id" = "notification_reads"."notification_id")))));



CREATE POLICY "notification_reads_own_select" ON "public"."notification_reads" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notification_reads_own_update" ON "public"."notification_reads" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_authenticated_inbox_read" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("recipient_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("recipient_user_id" IS NULL) AND ("organization_id" IS NULL) AND ("status" = 'sent'::"text") AND COALESCE("is_active", true) AND (("scheduled_at" IS NULL) OR ("scheduled_at" <= "now"()))) OR (( SELECT "private"."is_platform_admin"() AS "is_platform_admin") AND ("recipient_user_id" IS NULL) AND ("organization_id" IS NULL))));



CREATE POLICY "notifications_platform_admin_delete" ON "public"."notifications" FOR DELETE TO "authenticated" USING ((( SELECT "private"."is_platform_admin"() AS "is_platform_admin") AND ("recipient_user_id" IS NULL) AND ("organization_id" IS NULL)));



CREATE POLICY "notifications_platform_admin_insert" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_platform_admin"() AS "is_platform_admin") AND ("recipient_user_id" IS NULL) AND ("organization_id" IS NULL) AND ("kind" = 'system'::"text")));



CREATE POLICY "notifications_platform_admin_update" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."is_platform_admin"() AS "is_platform_admin") AND ("recipient_user_id" IS NULL) AND ("organization_id" IS NULL))) WITH CHECK ((( SELECT "private"."is_platform_admin"() AS "is_platform_admin") AND ("recipient_user_id" IS NULL) AND ("organization_id" IS NULL) AND ("kind" = 'system'::"text")));



CREATE POLICY "notifications_public_sent_read" ON "public"."notifications" FOR SELECT TO "anon" USING ((("recipient_user_id" IS NULL) AND ("organization_id" IS NULL) AND ("status" = 'sent'::"text") AND COALESCE("is_active", true) AND (("scheduled_at" IS NULL) OR ("scheduled_at" <= "now"()))));



ALTER TABLE "public"."organization_aircraft_maintenance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_asr_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_asr_options_delete_manager" ON "public"."organization_asr_options" FOR DELETE TO "authenticated" USING (( SELECT "private"."can_manage_organization"("organization_asr_options"."organization_id", ( SELECT "auth"."uid"() AS "uid")) AS "can_manage_organization"));



CREATE POLICY "organization_asr_options_insert_manager" ON "public"."organization_asr_options" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."can_manage_organization"("organization_asr_options"."organization_id", ( SELECT "auth"."uid"() AS "uid")) AS "can_manage_organization"));



CREATE POLICY "organization_asr_options_select_member" ON "public"."organization_asr_options" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_organization_member"("organization_asr_options"."organization_id", ( SELECT "auth"."uid"() AS "uid")) AS "is_organization_member"));



CREATE POLICY "organization_asr_options_update_manager" ON "public"."organization_asr_options" FOR UPDATE TO "authenticated" USING (( SELECT "private"."can_manage_organization"("organization_asr_options"."organization_id", ( SELECT "auth"."uid"() AS "uid")) AS "can_manage_organization")) WITH CHECK (( SELECT "private"."can_manage_organization"("organization_asr_options"."organization_id", ( SELECT "auth"."uid"() AS "uid")) AS "can_manage_organization"));



ALTER TABLE "public"."organization_inspection_definitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_inspections_delete_manager" ON "public"."organization_inspection_definitions" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_organization_manager"("organization_inspection_definitions"."organization_id") AS "is_organization_manager"));



CREATE POLICY "organization_inspections_insert_manager" ON "public"."organization_inspection_definitions" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_organization_manager"("organization_inspection_definitions"."organization_id") AS "is_organization_manager") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "organization_inspections_select_member" ON "public"."organization_inspection_definitions" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_organization_member"("organization_inspection_definitions"."organization_id") AS "is_organization_member"));



CREATE POLICY "organization_inspections_update_manager" ON "public"."organization_inspection_definitions" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_organization_manager"("organization_inspection_definitions"."organization_id") AS "is_organization_manager")) WITH CHECK (( SELECT "private"."is_organization_manager"("organization_inspection_definitions"."organization_id") AS "is_organization_manager"));



CREATE POLICY "organization_maintenance_insert_manager" ON "public"."organization_aircraft_maintenance" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."can_manage_aircraft_mx"("organization_aircraft_maintenance"."aircraft_id") AS "can_manage_aircraft_mx"));



CREATE POLICY "organization_maintenance_select_member" ON "public"."organization_aircraft_maintenance" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."aircraft"
  WHERE (("aircraft"."id" = "organization_aircraft_maintenance"."aircraft_id") AND ((("aircraft"."organization_id" IS NOT NULL) AND ( SELECT "private"."is_organization_member"("aircraft"."organization_id") AS "is_organization_member")) OR (EXISTS ( SELECT 1
           FROM "public"."aircraft_organization_assignments" "assignments"
          WHERE (("assignments"."aircraft_id" = "aircraft"."id") AND ( SELECT "private"."is_organization_member"("assignments"."organization_id") AS "is_organization_member")))))))) OR ( SELECT "private"."is_platform_admin"() AS "is_platform_admin")));



CREATE POLICY "organization_maintenance_update_manager" ON "public"."organization_aircraft_maintenance" FOR UPDATE TO "authenticated" USING (( SELECT "private"."can_manage_aircraft_mx"("organization_aircraft_maintenance"."aircraft_id") AS "can_manage_aircraft_mx")) WITH CHECK (( SELECT "private"."can_manage_aircraft_mx"("organization_aircraft_maintenance"."aircraft_id") AS "can_manage_aircraft_mx"));



ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_members_select_authorized" ON "public"."organization_members" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_platform_admin"() AS "is_platform_admin") OR ( SELECT "private"."can_manage_organization"("organization_members"."organization_id") AS "can_manage_organization")));



ALTER TABLE "public"."organization_people" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_people_deny_direct_access" ON "public"."organization_people" FOR SELECT TO "authenticated" USING (false);



ALTER TABLE "public"."organization_report_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_report_events_select_authorized" ON "public"."organization_report_events" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_read_organization_report"("organization_report_events"."report_id", ( SELECT "auth"."uid"() AS "uid")) AS "can_read_organization_report"));



ALTER TABLE "public"."organization_report_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_report_links_select_authorized" ON "public"."organization_report_links" FOR SELECT TO "authenticated" USING ((( SELECT "private"."can_read_organization_report"("organization_report_links"."report_id", ( SELECT "auth"."uid"() AS "uid")) AS "can_read_organization_report") OR ( SELECT "private"."can_read_organization_report"("organization_report_links"."related_report_id", ( SELECT "auth"."uid"() AS "uid")) AS "can_read_organization_report")));



ALTER TABLE "public"."organization_report_reviewer_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_reports_select_authorized" ON "public"."organization_reports" FOR SELECT TO "authenticated" USING (( SELECT "private"."can_read_organization_report"("organization_reports"."id", ( SELECT "auth"."uid"() AS "uid")) AS "can_read_organization_report"));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_select_accessible" ON "public"."organizations" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_platform_admin"() AS "is_platform_admin") OR ( SELECT "private"."is_organization_member"("organizations"."id") AS "is_organization_member")));



ALTER TABLE "public"."platform_admin_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_organization_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "report_reviewer_assignments_select_member" ON "public"."organization_report_reviewer_assignments" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_organization_member"("organization_report_reviewer_assignments"."organization_id", ( SELECT "auth"."uid"() AS "uid")) AS "is_organization_member"));



ALTER TABLE "public"."route_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_aircraft" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saved_aircraft_delete_own" ON "public"."saved_aircraft" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "saved_aircraft_insert_own" ON "public"."saved_aircraft" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "saved_aircraft_select_own" ON "public"."saved_aircraft" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "saved_aircraft_update_own" ON "public"."saved_aircraft" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."saved_people" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saved_people_delete_own" ON "public"."saved_people" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "saved_people_insert_own" ON "public"."saved_people" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "saved_people_select_own" ON "public"."saved_people" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "saved_people_update_own" ON "public"."saved_people" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."saved_person_certificates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saved_person_certificates_delete_own" ON "public"."saved_person_certificates" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "saved_person_certificates_insert_own" ON "public"."saved_person_certificates" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "saved_person_certificates_select_own" ON "public"."saved_person_certificates" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "saved_person_certificates_update_own" ON "public"."saved_person_certificates" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "service_role_manage_anniversary_logs" ON "public"."anniversary_logs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_manage_weather_cache" ON "public"."weather_cache" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."weather_cache" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT USAGE ON SCHEMA "private" TO "anon";
GRANT USAGE ON SCHEMA "private" TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_manage_aircraft_mx"("p_aircraft_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_manage_aircraft_mx"("p_aircraft_id" "uuid", "p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_manage_organization"("p_organization_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_manage_organization"("p_organization_id" "uuid", "p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_read_organization_report"("p_report_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_read_organization_report"("p_report_id" "uuid", "p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_use_aircraft_in_organization"("p_aircraft_id" "uuid", "p_organization_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_use_aircraft_in_organization"("p_aircraft_id" "uuid", "p_organization_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."can_use_aircraft_in_organization"("p_aircraft_id" "uuid", "p_organization_id" "uuid", "p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."create_signup_organization"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."create_user_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_kind" "text", "p_priority" "text", "p_organization_id" "uuid", "p_source_label" "text", "p_action_url" "text", "p_dedupe_key" "text", "p_created_by" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."enforce_notification_preferences"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."has_report_reviewer_capability"("p_organization_id" "uuid", "p_capability" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."has_report_reviewer_capability"("p_organization_id" "uuid", "p_capability" "text", "p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_organization_manager"("p_organization_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_organization_manager"("p_organization_id" "uuid", "p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_platform_admin"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_platform_admin"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."is_platform_admin"("p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."organization_report_actor_name"("p_organization_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."organization_report_actor_name"("p_organization_id" "uuid", "p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."organization_role"("p_organization_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."organization_role"("p_organization_id" "uuid", "p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."prevent_owner_account_deletion"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."sync_organization_person_from_member"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."validate_aircraft_discrepancy_report_input"() FROM PUBLIC;



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_organization_member_by_email"("p_organization_id" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_organization_member_by_email"("p_organization_id" "uuid", "p_email" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."add_organization_member_by_email"("p_organization_id" "uuid", "p_email" "text") TO "authenticated";



GRANT ALL ON TABLE "public"."organization_people" TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_organization_person"("p_organization_id" "uuid", "p_email" "text", "p_display_name" "text", "p_teaching_role" "text", "p_internal_id" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_organization_person"("p_organization_id" "uuid", "p_email" "text", "p_display_name" "text", "p_teaching_role" "text", "p_internal_id" "text", "p_notes" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."add_organization_person"("p_organization_id" "uuid", "p_email" "text", "p_display_name" "text", "p_teaching_role" "text", "p_internal_id" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."approve_aircraft_update_request"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_aircraft_update_request"("p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."archive_pending_organization_person"("p_person_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."archive_pending_organization_person"("p_person_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."archive_pending_organization_person"("p_person_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."attach_aircraft_by_tail"("p_user_id" "uuid", "p_model_id" "uuid", "p_tail_number" "text", "p_empty_weight" numeric, "p_empty_arm" numeric, "p_empty_lat_arm" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."attach_aircraft_by_tail"("p_user_id" "uuid", "p_model_id" "uuid", "p_tail_number" "text", "p_empty_weight" numeric, "p_empty_arm" numeric, "p_empty_lat_arm" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."bulk_update_platform_aircraft_organizations"("p_aircraft_ids" "uuid"[], "p_organization_ids" "uuid"[], "p_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bulk_update_platform_aircraft_organizations"("p_aircraft_ids" "uuid"[], "p_organization_ids" "uuid"[], "p_mode" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."bulk_update_platform_aircraft_organizations"("p_aircraft_ids" "uuid"[], "p_organization_ids" "uuid"[], "p_mode" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."calculate_medical_expiry"("birth_date" "date", "exam_date" "date", "class" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_medical_expiry"("birth_date" "date", "exam_date" "date", "class" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_medical_expiry"("birth_date" "date", "exam_date" "date", "class" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_organization_person"("p_person_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_organization_person"("p_person_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."claim_organization_person"("p_person_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cleanup_route_sessions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_route_sessions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_asr_report"("p_report_id" "uuid", "p_safety_comments" "text", "p_hazard_log_reference" "text", "p_internal_investigation_reference" "text", "p_title" "text", "p_external_notifications" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_asr_report"("p_report_id" "uuid", "p_safety_comments" "text", "p_hazard_log_reference" "text", "p_internal_investigation_reference" "text", "p_title" "text", "p_external_notifications" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_asr_report"("p_report_id" "uuid", "p_safety_comments" "text", "p_hazard_log_reference" "text", "p_internal_investigation_reference" "text", "p_title" "text", "p_external_notifications" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_asr_maintenance_review"("p_report_id" "uuid", "p_comments" "text", "p_title" "text", "p_maintenance_action" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_asr_maintenance_review"("p_report_id" "uuid", "p_comments" "text", "p_title" "text", "p_maintenance_action" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_asr_maintenance_review"("p_report_id" "uuid", "p_comments" "text", "p_title" "text", "p_maintenance_action" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_asr_training_review"("p_report_id" "uuid", "p_comments" "text", "p_title" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_asr_training_review"("p_report_id" "uuid", "p_comments" "text", "p_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_asr_training_review"("p_report_id" "uuid", "p_comments" "text", "p_title" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."configure_asr_review"("p_report_id" "uuid", "p_risk_score" integer, "p_training_required" boolean, "p_maintenance_required" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."configure_asr_review"("p_report_id" "uuid", "p_risk_score" integer, "p_training_required" boolean, "p_maintenance_required" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."configure_asr_review"("p_report_id" "uuid", "p_risk_score" integer, "p_training_required" boolean, "p_maintenance_required" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."organization_aircraft_maintenance" TO "anon";
GRANT ALL ON TABLE "public"."organization_aircraft_maintenance" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_aircraft_maintenance" TO "service_role";



REVOKE ALL ON FUNCTION "public"."correct_aircraft_meter"("p_aircraft_id" "uuid", "p_meter_type" "text", "p_meter_value" numeric, "p_observed_at" timestamp with time zone, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."correct_aircraft_meter"("p_aircraft_id" "uuid", "p_meter_type" "text", "p_meter_value" numeric, "p_observed_at" timestamp with time zone, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."correct_aircraft_meter"("p_aircraft_id" "uuid", "p_meter_type" "text", "p_meter_value" numeric, "p_observed_at" timestamp with time zone, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_asr_revision"("p_report_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_asr_revision"("p_report_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_asr_revision"("p_report_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_flight_brief_revision"("p_brief_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_flight_brief_revision"("p_brief_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_flight_brief_revision"("p_brief_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_organization_for_registered_user"("p_name" "text", "p_owner_email" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_organization_for_registered_user"("p_name" "text", "p_owner_email" "text", "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_organization_for_registered_user"("p_name" "text", "p_owner_email" "text", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_organization_notification"("p_organization_id" "uuid", "p_title" "text", "p_message" "text", "p_priority" "text", "p_action_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_organization_notification"("p_organization_id" "uuid", "p_title" "text", "p_message" "text", "p_priority" "text", "p_action_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_organization_notification"("p_organization_id" "uuid", "p_title" "text", "p_message" "text", "p_priority" "text", "p_action_url" "text") TO "service_role";



GRANT ALL ON TABLE "public"."flight_briefs" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."flight_briefs" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."finalize_flight_brief"("p_brief_id" "uuid", "p_meter_type" "text", "p_meter_value" numeric, "p_observed_at" timestamp with time zone, "p_planned_meter_increase" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_flight_brief"("p_brief_id" "uuid", "p_meter_type" "text", "p_meter_value" numeric, "p_observed_at" timestamp with time zone, "p_planned_meter_increase" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_flight_brief"("p_brief_id" "uuid", "p_meter_type" "text", "p_meter_value" numeric, "p_observed_at" timestamp with time zone, "p_planned_meter_increase" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_organizations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_organizations"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_my_organizations"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "supabase_auth_admin";



REVOKE ALL ON FUNCTION "public"."list_aircraft_assignment_audit"("p_organization_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_aircraft_assignment_audit"("p_organization_id" "uuid", "p_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."list_aircraft_assignment_audit"("p_organization_id" "uuid", "p_limit" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."list_my_available_organizations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_my_available_organizations"() TO "service_role";
GRANT ALL ON FUNCTION "public"."list_my_available_organizations"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."list_organization_aircraft"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_organization_aircraft"("p_organization_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."list_organization_aircraft"("p_organization_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."list_organization_members"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_organization_members"("p_organization_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."list_organization_members"("p_organization_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."list_organization_people"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_organization_people"("p_organization_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."list_organization_people"("p_organization_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."list_organization_report_people"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_organization_report_people"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_organization_report_people"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_organization_students"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_organization_students"("p_organization_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."list_organization_students"("p_organization_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."list_platform_admin_audit_log"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_platform_admin_audit_log"("p_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."list_platform_admin_audit_log"("p_limit" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."list_platform_admins"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_platform_admins"() TO "service_role";
GRANT ALL ON FUNCTION "public"."list_platform_admins"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."list_platform_organizations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_platform_organizations"() TO "service_role";
GRANT ALL ON FUNCTION "public"."list_platform_organizations"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."process_aircraft_discrepancy_report"("p_report_id" "uuid", "p_status" "text", "p_instructor_person_id" "uuid", "p_asr_submitted" boolean, "p_deferrable" boolean, "p_aircraft_down" boolean, "p_credit_applied" boolean, "p_credit_authorized" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_aircraft_discrepancy_report"("p_report_id" "uuid", "p_status" "text", "p_instructor_person_id" "uuid", "p_asr_submitted" boolean, "p_deferrable" boolean, "p_aircraft_down" boolean, "p_credit_applied" boolean, "p_credit_authorized" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_aircraft_discrepancy_report"("p_report_id" "uuid", "p_status" "text", "p_instructor_person_id" "uuid", "p_asr_submitted" boolean, "p_deferrable" boolean, "p_aircraft_down" boolean, "p_credit_applied" boolean, "p_credit_authorized" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_my_profile_reminders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_my_profile_reminders"() TO "service_role";
GRANT ALL ON FUNCTION "public"."refresh_my_profile_reminders"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."remove_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."endorsement_template_change_requests" TO "service_role";
GRANT SELECT ON TABLE "public"."endorsement_template_change_requests" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_endorsement_template_change_request"("p_request_id" "uuid", "p_approve" boolean, "p_review_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_endorsement_template_change_request"("p_request_id" "uuid", "p_approve" boolean, "p_review_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_endorsement_template_change_request"("p_request_id" "uuid", "p_approve" boolean, "p_review_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_asr_draft"("p_organization_id" "uuid", "p_report_id" "uuid", "p_client_request_id" "uuid", "p_report_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_asr_draft"("p_organization_id" "uuid", "p_report_id" "uuid", "p_client_request_id" "uuid", "p_report_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_asr_draft"("p_organization_id" "uuid", "p_report_id" "uuid", "p_client_request_id" "uuid", "p_report_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_organization_aircraft_atomic"("p_organization_id" "uuid", "p_aircraft_id" "uuid", "p_model_id" "uuid", "p_tail_number" "text", "p_empty_weight" numeric, "p_empty_arm" numeric, "p_empty_lat_arm" numeric, "p_hundred_hour_due_hours" numeric, "p_annual_due_date" "date", "p_static_due_date" "date", "p_transponder_due_date" "date", "p_elt_due_date" "date", "p_adsb_due_date" "date", "p_registration_due_date" "date", "p_operational_status" "text", "p_operational_status_note" "text", "p_meter_type" "text", "p_meter_value" numeric, "p_meter_observed_at" timestamp with time zone, "p_meter_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_organization_aircraft_atomic"("p_organization_id" "uuid", "p_aircraft_id" "uuid", "p_model_id" "uuid", "p_tail_number" "text", "p_empty_weight" numeric, "p_empty_arm" numeric, "p_empty_lat_arm" numeric, "p_hundred_hour_due_hours" numeric, "p_annual_due_date" "date", "p_static_due_date" "date", "p_transponder_due_date" "date", "p_elt_due_date" "date", "p_adsb_due_date" "date", "p_registration_due_date" "date", "p_operational_status" "text", "p_operational_status_note" "text", "p_meter_type" "text", "p_meter_value" numeric, "p_meter_observed_at" timestamp with time zone, "p_meter_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."save_organization_aircraft_atomic"("p_organization_id" "uuid", "p_aircraft_id" "uuid", "p_model_id" "uuid", "p_tail_number" "text", "p_empty_weight" numeric, "p_empty_arm" numeric, "p_empty_lat_arm" numeric, "p_hundred_hour_due_hours" numeric, "p_annual_due_date" "date", "p_static_due_date" "date", "p_transponder_due_date" "date", "p_elt_due_date" "date", "p_adsb_due_date" "date", "p_registration_due_date" "date", "p_operational_status" "text", "p_operational_status_note" "text", "p_meter_type" "text", "p_meter_value" numeric, "p_meter_observed_at" timestamp with time zone, "p_meter_reason" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."set_aircraft_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_aircraft_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_aircraft_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_endorsement_template_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_endorsement_template_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_endorsement_template_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_endorsement_templates_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_endorsement_templates_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_endorsement_templates_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_organization_member_role"("p_organization_id" "uuid", "p_user_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_organization_member_role"("p_organization_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_organization_member_role"("p_organization_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_organization_member_teaching_role"("p_organization_id" "uuid", "p_user_id" "uuid", "p_teaching_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_organization_member_teaching_role"("p_organization_id" "uuid", "p_user_id" "uuid", "p_teaching_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_organization_member_teaching_role"("p_organization_id" "uuid", "p_user_id" "uuid", "p_teaching_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_organization_report_reviewer_capability"("p_organization_id" "uuid", "p_user_id" "uuid", "p_capability" "text", "p_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_organization_report_reviewer_capability"("p_organization_id" "uuid", "p_user_id" "uuid", "p_capability" "text", "p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_organization_report_reviewer_capability"("p_organization_id" "uuid", "p_user_id" "uuid", "p_capability" "text", "p_enabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_platform_admin_by_email"("p_email" "text", "p_make_admin" boolean, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_platform_admin_by_email"("p_email" "text", "p_make_admin" boolean, "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."set_platform_admin_by_email"("p_email" "text", "p_make_admin" boolean, "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_platform_aircraft_organizations"("p_aircraft_id" "uuid", "p_organization_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_platform_aircraft_organizations"("p_aircraft_id" "uuid", "p_organization_ids" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."set_platform_aircraft_organizations"("p_aircraft_id" "uuid", "p_organization_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sign_aircraft_discrepancy_report"("p_report_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sign_aircraft_discrepancy_report"("p_report_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sign_aircraft_discrepancy_report"("p_report_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_aircraft_discrepancy_report"("p_organization_id" "uuid", "p_client_request_id" "uuid", "p_aircraft_id" "uuid", "p_report_date" "date", "p_student_person_id" "uuid", "p_instructor_person_id" "uuid", "p_flight_hobbs_end" numeric, "p_maintenance_hobbs_end" numeric, "p_flight_duration" numeric, "p_discrepancy_type" "text", "p_description" "text", "p_ground_aircraft" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_aircraft_discrepancy_report"("p_organization_id" "uuid", "p_client_request_id" "uuid", "p_aircraft_id" "uuid", "p_report_date" "date", "p_student_person_id" "uuid", "p_instructor_person_id" "uuid", "p_flight_hobbs_end" numeric, "p_maintenance_hobbs_end" numeric, "p_flight_duration" numeric, "p_discrepancy_type" "text", "p_description" "text", "p_ground_aircraft" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_aircraft_discrepancy_report"("p_organization_id" "uuid", "p_client_request_id" "uuid", "p_aircraft_id" "uuid", "p_report_date" "date", "p_student_person_id" "uuid", "p_instructor_person_id" "uuid", "p_flight_hobbs_end" numeric, "p_maintenance_hobbs_end" numeric, "p_flight_duration" numeric, "p_discrepancy_type" "text", "p_description" "text", "p_ground_aircraft" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_asr_report"("p_report_id" "uuid", "p_create_discrepancy" boolean, "p_discrepancy_type" "text", "p_discrepancy_description" "text", "p_ground_aircraft" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_asr_report"("p_report_id" "uuid", "p_create_discrepancy" boolean, "p_discrepancy_type" "text", "p_discrepancy_description" "text", "p_ground_aircraft" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_asr_report"("p_report_id" "uuid", "p_create_discrepancy" boolean, "p_discrepancy_type" "text", "p_discrepancy_description" "text", "p_ground_aircraft" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_endorsement_template_change_request"("p_organization_id" "uuid", "p_template_id" "uuid", "p_action" "text", "p_proposed_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_endorsement_template_change_request"("p_organization_id" "uuid", "p_template_id" "uuid", "p_action" "text", "p_proposed_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_endorsement_template_change_request"("p_organization_id" "uuid", "p_template_id" "uuid", "p_action" "text", "p_proposed_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."transfer_organization_ownership"("p_organization_id" "uuid", "p_new_owner_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_organization_ownership"("p_organization_id" "uuid", "p_new_owner_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_organization_ownership"("p_organization_id" "uuid", "p_new_owner_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_organization_person"("p_person_id" "uuid", "p_display_name" "text", "p_teaching_role" "text", "p_internal_id" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_organization_person"("p_person_id" "uuid", "p_display_name" "text", "p_teaching_role" "text", "p_internal_id" "text", "p_notes" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_organization_person"("p_person_id" "uuid", "p_display_name" "text", "p_teaching_role" "text", "p_internal_id" "text", "p_notes" "text") TO "authenticated";



GRANT ALL ON TABLE "public"."aircraft" TO "anon";
GRANT ALL ON TABLE "public"."aircraft" TO "authenticated";
GRANT ALL ON TABLE "public"."aircraft" TO "service_role";



GRANT ALL ON TABLE "public"."aircraft_discrepancy_reports" TO "service_role";
GRANT SELECT ON TABLE "public"."aircraft_discrepancy_reports" TO "authenticated";



GRANT ALL ON TABLE "public"."aircraft_inspection_assignments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."aircraft_inspection_assignments" TO "authenticated";



GRANT ALL ON TABLE "public"."aircraft_meter_readings" TO "service_role";
GRANT SELECT ON TABLE "public"."aircraft_meter_readings" TO "authenticated";



GRANT ALL ON TABLE "public"."aircraft_models" TO "anon";
GRANT ALL ON TABLE "public"."aircraft_models" TO "authenticated";
GRANT ALL ON TABLE "public"."aircraft_models" TO "service_role";



GRANT ALL ON TABLE "public"."aircraft_organization_assignment_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."aircraft_organization_assignments" TO "service_role";
GRANT SELECT ON TABLE "public"."aircraft_organization_assignments" TO "authenticated";



GRANT ALL ON TABLE "public"."aircraft_update_requests" TO "anon";
GRANT ALL ON TABLE "public"."aircraft_update_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."aircraft_update_requests" TO "service_role";



GRANT ALL ON TABLE "public"."airport_config" TO "anon";
GRANT ALL ON TABLE "public"."airport_config" TO "authenticated";
GRANT ALL ON TABLE "public"."airport_config" TO "service_role";



GRANT ALL ON TABLE "public"."anniversary_logs" TO "service_role";



GRANT ALL ON TABLE "public"."asr_external_notifications" TO "service_role";
GRANT SELECT ON TABLE "public"."asr_external_notifications" TO "authenticated";



GRANT ALL ON TABLE "public"."asr_reports" TO "service_role";
GRANT SELECT ON TABLE "public"."asr_reports" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."asr_reports_reference_serial_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."asr_reports_reference_serial_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."asr_reports_reference_serial_seq" TO "service_role";



GRANT ALL ON TABLE "public"."endorsement_records" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."endorsement_records" TO "authenticated";



GRANT ALL ON TABLE "public"."endorsement_template_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."endorsement_template_settings" TO "anon";
GRANT SELECT,UPDATE ON TABLE "public"."endorsement_template_settings" TO "authenticated";



GRANT ALL ON TABLE "public"."endorsement_templates" TO "service_role";
GRANT SELECT ON TABLE "public"."endorsement_templates" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."endorsement_templates" TO "authenticated";



GRANT ALL ON TABLE "public"."logbook" TO "anon";
GRANT ALL ON TABLE "public"."logbook" TO "authenticated";
GRANT ALL ON TABLE "public"."logbook" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."notification_preferences" TO "authenticated";



GRANT ALL ON TABLE "public"."notification_reads" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."notification_reads" TO "authenticated";



GRANT ALL ON TABLE "public"."notifications" TO "service_role";
GRANT SELECT ON TABLE "public"."notifications" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."notifications" TO "authenticated";



GRANT ALL ON TABLE "public"."organization_asr_options" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."organization_asr_options" TO "authenticated";



GRANT ALL ON TABLE "public"."organization_inspection_definitions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."organization_inspection_definitions" TO "authenticated";



GRANT ALL ON TABLE "public"."organization_report_events" TO "service_role";
GRANT SELECT ON TABLE "public"."organization_report_events" TO "authenticated";



GRANT ALL ON TABLE "public"."organization_report_links" TO "service_role";
GRANT SELECT ON TABLE "public"."organization_report_links" TO "authenticated";



GRANT ALL ON TABLE "public"."organization_report_reviewer_assignments" TO "service_role";
GRANT SELECT ON TABLE "public"."organization_report_reviewer_assignments" TO "authenticated";



GRANT ALL ON TABLE "public"."organization_reports" TO "service_role";
GRANT SELECT ON TABLE "public"."organization_reports" TO "authenticated";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."platform_admin_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."platform_organization_audit_logs" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("display_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("medical_class") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("medical_birth_date") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("medical_exam_date") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("self_person_id") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."route_sessions" TO "anon";
GRANT ALL ON TABLE "public"."route_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."route_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."saved_aircraft" TO "anon";
GRANT ALL ON TABLE "public"."saved_aircraft" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_aircraft" TO "service_role";



GRANT ALL ON TABLE "public"."saved_people" TO "anon";
GRANT ALL ON TABLE "public"."saved_people" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_people" TO "service_role";



GRANT ALL ON TABLE "public"."saved_person_certificates" TO "anon";
GRANT ALL ON TABLE "public"."saved_person_certificates" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_person_certificates" TO "service_role";



GRANT ALL ON TABLE "public"."weather_cache" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- Application-owned triggers on Supabase-managed auth tables are not included
-- in a public/private schema-only pg_dump, so keep them explicitly in the
-- local baseline.
DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";
CREATE TRIGGER "on_auth_user_created"
AFTER INSERT ON "auth"."users"
FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();

DROP TRIGGER IF EXISTS "on_auth_user_created_organization" ON "auth"."users";
CREATE TRIGGER "on_auth_user_created_organization"
AFTER INSERT ON "auth"."users"
FOR EACH ROW EXECUTE FUNCTION "private"."create_signup_organization"();

DROP TRIGGER IF EXISTS "prevent_organization_owner_deletion" ON "auth"."users";
CREATE TRIGGER "prevent_organization_owner_deletion"
BEFORE DELETE ON "auth"."users"
FOR EACH ROW EXECUTE FUNCTION "private"."prevent_owner_account_deletion"();
