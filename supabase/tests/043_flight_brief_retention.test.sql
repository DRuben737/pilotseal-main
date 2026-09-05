begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select has_function(
  'private',
  'purge_expired_flight_briefs',
  array['timestamptz'],
  'Flight Brief retention purge exists'
);
select ok(
  not has_function_privilege('authenticated', 'private.purge_expired_flight_briefs(timestamptz)', 'execute'),
  'clients cannot invoke the privileged purge directly'
);

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);

insert into public.flight_briefs (
  id, created_by, aircraft_tail_number, student_name, instructor_name,
  status, created_at
) values
(
  '73000000-0000-4000-8000-000000000001',
  (select id from public.profiles where email = 'pilot.one@example.test'),
  'NOLD01', 'Old Pilot', 'Old Instructor', 'finalized',
  now() - interval '8 days'
),
(
  '73000000-0000-4000-8000-000000000002',
  (select id from public.profiles where email = 'pilot.one@example.test'),
  'NNEW01', 'Recent Pilot', 'Recent Instructor', 'draft',
  now() - interval '2 days'
),
(
  '73000000-0000-4000-8000-000000000003',
  (select id from public.profiles where email = 'pilot.one@example.test'),
  'NNEW02', 'Revision Pilot', 'Revision Instructor', 'draft',
  now() - interval '1 day'
);

update public.flight_briefs
set supersedes_id = '73000000-0000-4000-8000-000000000001'
where id = '73000000-0000-4000-8000-000000000003';

select is(
  private.purge_expired_flight_briefs(now() - interval '7 days'),
  1::bigint,
  'purge removes the expired Flight Brief'
);
select is(
  (select count(*) from public.flight_briefs where id = '73000000-0000-4000-8000-000000000001'),
  0::bigint,
  'expired Flight Brief no longer exists'
);
select is(
  (select count(*) from public.flight_briefs where id = '73000000-0000-4000-8000-000000000002'),
  1::bigint,
  'recent Flight Brief is retained'
);
select is(
  (select supersedes_id from public.flight_briefs where id = '73000000-0000-4000-8000-000000000003'),
  null::uuid,
  'a retained revision survives when its expired predecessor is purged'
);

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
set local role authenticated;
select is(
  (select count(*) from public.list_my_flight_briefs() where id = '73000000-0000-4000-8000-000000000002'),
  1::bigint,
  'owner listing includes a recent unfinished brief'
);
select lives_ok(
  $$delete from public.flight_briefs where id = '73000000-0000-4000-8000-000000000002'$$,
  'owner can delete an unfinished Flight Brief'
);
reset role;
select is(
  (select count(*) from public.flight_briefs where id = '73000000-0000-4000-8000-000000000002'),
  0::bigint,
  'deleted unfinished Flight Brief is physically removed'
);

select * from finish();
rollback;
