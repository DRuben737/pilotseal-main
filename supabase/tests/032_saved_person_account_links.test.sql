begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select has_table(
  'public',
  'saved_person_account_links',
  'saved person account links table exists'
);

select has_function(
  'public',
  'link_saved_person_account',
  array['uuid', 'text'],
  'saved person account link function exists'
);

select has_function(
  'public',
  'list_my_saved_person_account_links',
  array[]::text[],
  'saved person account context function exists'
);

select has_function(
  'public',
  'unlink_saved_person_account',
  array['uuid'],
  'saved person account unlink function exists'
);

select is(
  (
    select relrowsecurity
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'saved_person_account_links'
  ),
  true,
  'saved person account links use RLS'
);

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'platform.admin@example.test'),
  true
);
set local role authenticated;

select is(
  (select count(*) from public.get_my_organizations()),
  0::bigint,
  'platform administrators are not synthetic members of every organization'
);

reset role;

insert into public.organization_members (
  organization_id,
  user_id,
  role,
  teaching_role,
  added_by
) values (
  '10000000-0000-4000-8000-000000000001',
  (select id from public.profiles where email = 'platform.admin@example.test'),
  'member',
  'instructor',
  (select id from public.profiles where email = 'pilot.one@example.test')
);

set local role authenticated;

select is(
  (select member_role from public.get_my_organizations() limit 1),
  'platform_admin',
  'a platform administrator who is a real member receives effective platform admin access'
);

reset role;

insert into public.saved_people (
  id,
  user_id,
  role,
  display_name,
  cert_number
) values (
  '40000000-0000-4000-8000-000000000001',
  (select id from public.profiles where email = 'pilot.one@example.test'),
  'student',
  'Linked Student Fixture',
  'TEST-100'
);

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
set local role authenticated;

select lives_ok(
  $$select public.link_saved_person_account(
    '40000000-0000-4000-8000-000000000001',
    'instructor.one@example.test'
  )$$,
  'record owner can link a saved person by verified account email'
);

select ok(
  (
    select linked_user_id is not null
    from public.saved_person_account_links
    where saved_person_id = '40000000-0000-4000-8000-000000000001'
  ),
  'the logical link points at the verified platform account'
);

select is(
  (
    select shared_organization_names
    from public.list_my_saved_person_account_links()
    where saved_person_id = '40000000-0000-4000-8000-000000000001'
  ),
  array['PilotSeal Local Test School']::text[],
  'a linked identity includes organizations shared by the record owner and linked account'
);

select throws_ok(
  $$select public.link_saved_person_account(
    '40000000-0000-4000-8000-000000000001',
    'pilot.one@example.test'
  )$$,
  '22023',
  'A saved person cannot be linked to your own account.',
  'owners cannot link private people records to themselves'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'instructor.one@example.test'),
  true
);
set local role authenticated;

select is(
  (select count(*) from public.saved_person_account_links),
  0::bigint,
  'the linked account cannot read the record owner private link row'
);

select is(
  (select count(*) from public.list_my_saved_person_account_links()),
  0::bigint,
  'the linked account cannot discover another owner account context through the RPC'
);

select throws_ok(
  $$select public.unlink_saved_person_account(
    '40000000-0000-4000-8000-000000000001'
  )$$,
  'P0002',
  'Linked saved person not found.',
  'another account cannot unlink the owner private record'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
set local role authenticated;

select lives_ok(
  $$select public.unlink_saved_person_account(
    '40000000-0000-4000-8000-000000000001'
  )$$,
  'record owner can unlink the platform account'
);

select is(
  (select count(*) from public.saved_person_account_links),
  0::bigint,
  'unlink removes only the logical link'
);

reset role;
set local role anon;

select throws_ok(
  $$select public.link_saved_person_account(
    '40000000-0000-4000-8000-000000000001',
    'instructor.one@example.test'
  )$$,
  '42501',
  'permission denied for function link_saved_person_account',
  'anonymous callers cannot execute the link function'
);

select * from finish();
rollback;
