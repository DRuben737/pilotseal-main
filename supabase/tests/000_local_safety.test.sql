begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'aircraft', 'aircraft table exists');
select has_function(
  'public',
  'get_my_organizations',
  'organization lookup function exists'
);

select is(
  (
    select count(*)::integer
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relkind in ('r', 'p')
      and not pg_class.relrowsecurity
  ),
  0,
  'every public table has RLS enabled'
);

select is(
  (select count(*) from public.profiles),
  3::bigint,
  'only the three synthetic local profiles exist'
);

select is(
  (
    select count(*)
    from public.profiles
    where email is null or email !~ '@example[.]test$'
  ),
  0::bigint,
  'all local profiles use reserved synthetic email addresses'
);

select is(
  (
    select count(*)
    from public.organizations
    where name = 'PilotSeal Local Test School'
  ),
  1::bigint,
  'the deterministic synthetic organization exists'
);

select is(
  (select count(*) from public.aircraft where tail_number = 'N000PS'),
  1::bigint,
  'the deterministic synthetic aircraft exists'
);

select * from finish();
rollback;
