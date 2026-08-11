begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_table(
  'public',
  'notification_inbox_deletions',
  'personal notification inbox deletions table exists'
);

select is(
  (
    select relrowsecurity
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'notification_inbox_deletions'
  ),
  true,
  'personal notification inbox deletions use RLS'
);

insert into public.notifications (
  id, title, message, content, priority, status, is_active, scheduled_at, kind
) values (
  '40000000-0000-4000-8000-000000000001',
  'Shared notice',
  'Visible in each personal inbox',
  'Visible in each personal inbox',
  'normal',
  'sent',
  true,
  now(),
  'system'
);

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
set local role authenticated;

select lives_ok(
  format(
    'insert into public.notification_inbox_deletions (notification_id, user_id) values (%L, %L)',
    '40000000-0000-4000-8000-000000000001',
    (select id::text from public.profiles where email = 'pilot.one@example.test')
  ),
  'first user can delete a notification from their own inbox'
);

select is(
  (select count(*) from public.notification_inbox_deletions),
  1::bigint,
  'first user sees their own inbox deletion'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'instructor.one@example.test'),
  true
);
set local role authenticated;

select is(
  (select count(*) from public.notification_inbox_deletions),
  0::bigint,
  'second user cannot see the first user inbox deletion'
);

select lives_ok(
  format(
    'insert into public.notification_inbox_deletions (notification_id, user_id) values (%L, %L)',
    '40000000-0000-4000-8000-000000000001',
    (select id::text from public.profiles where email = 'instructor.one@example.test')
  ),
  'second user can independently delete the same notification'
);

select is(
  (select count(*) from public.notification_inbox_deletions),
  1::bigint,
  'second user only sees their own inbox deletion'
);

reset role;

select is(
  (select count(*) from public.notification_inbox_deletions),
  2::bigint,
  'both personal inbox deletions are stored independently'
);

select is(
  (
    select count(*)
    from public.notifications
    where id = '40000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'deleting from an inbox does not delete the shared platform notification'
);

select * from finish();
rollback;
