begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'training_subjects', 'platform training subject catalog exists');
select has_table('public', 'organization_training_guides', 'organization guidance exists');
select has_table('public', 'instructor_training_guides', 'instructor guidance exists');
select has_table('public', 'training_subject_notes', 'organization-scoped student notes exist');
select has_table('public', 'cfi_schedule_event_subjects', 'schedule subject links exist');
select has_table('private', 'training_guide_student_assignments', 'durable student subject access exists');
select has_function('public', 'publish_cfi_schedule_draft_v3', array['bigint','uuid','jsonb'], 'schedule publishing accepts training subjects');
select has_function('public', 'list_my_instructor_training_guides', array['uuid','uuid'], 'students can read guidance from assigned instructors');
select has_function('public', 'list_my_training_guide_subjects', array['uuid'], 'student catalog is derived from scheduled lessons');

select set_config('training_guide.cfi',(select id::text from public.profiles where email='instructor.one@example.test'),true);
select set_config('training_guide.student',(select id::text from public.profiles where email='pilot.one@example.test'),true);
select set_config('training_guide.admin',(select id::text from public.profiles where email='platform.admin@example.test'),true);
select set_config('training_guide.organization','10000000-0000-4000-8000-000000000001',true);
select set_config('training_guide.aircraft','30000000-0000-4000-8000-000000000001',true);
select set_config('training_guide.subject',(select id::text from public.training_subjects where stable_key='pvt.pa-v-b'),true);

select isnt(current_setting('training_guide.subject'), '', 'Ground Reference Maneuvers is seeded');
select is(
  (select task_code from public.training_subjects where id=current_setting('training_guide.subject')::uuid),
  'PA.V.B',
  'the seeded subject preserves its ACS task code'
);
select is(
  (select count(*)::integer from public.training_subject_references where subject_id=current_setting('training_guide.subject')::uuid),
  3,
  'the seeded subject has three official reading references'
);
select is(
  (select study_guide->>'what' from public.training_subjects where id=current_setting('training_guide.subject')::uuid),
  'Ground reference maneuvers use a visible reference on the surface to practice flying a precise ground track while wind changes the airplane''s groundspeed and drift.',
  'the seeded subject has a plain-language what explanation'
);

insert into public.organization_members(organization_id,user_id,role,teaching_role,added_by)
values
  (current_setting('training_guide.organization')::uuid,current_setting('training_guide.cfi')::uuid,'member','instructor',current_setting('training_guide.admin')::uuid),
  (current_setting('training_guide.organization')::uuid,current_setting('training_guide.student')::uuid,'member','student',current_setting('training_guide.admin')::uuid)
on conflict(organization_id,user_id) do update
set role=excluded.role, teaching_role=excluded.teaching_role;

insert into public.saved_people(id,user_id,role,display_name,cert_number)
values(
  '57000000-0000-4000-8000-000000000001',
  current_setting('training_guide.cfi')::uuid,
  'student','Training Guide Student','GUIDE-1'
);
insert into public.saved_person_account_links(saved_person_id,owner_user_id,linked_user_id)
values(
  '57000000-0000-4000-8000-000000000001',
  current_setting('training_guide.cfi')::uuid,
  current_setting('training_guide.student')::uuid
);
insert into public.cfi_schedule_student_grants(cfi_user_id,saved_person_id,student_user_id)
values(
  current_setting('training_guide.cfi')::uuid,
  '57000000-0000-4000-8000-000000000001',
  current_setting('training_guide.student')::uuid
);

select set_config('request.jwt.claim.sub',current_setting('training_guide.admin'),true);
set local role authenticated;

select set_config('training_guide.unrelated_subject', public.save_training_subject(jsonb_build_object(
  'stable_key','pvt.pa-i-a', 'certificate_code','PVT', 'area_code','I',
  'area_title','Preflight Preparation', 'task_code','PA.I.A',
  'title','Pilot Qualifications', 'acs_document','FAA-S-ACS-6C', 'acs_version','6C',
  'source_url','https://www.faa.gov/training_testing/testing/acs/private_airplane_acs_6.pdf',
  'components','[]'::jsonb,
  'study_guide',jsonb_build_object('what','Qualifications','why','Legal readiness','how',jsonb_build_array('Review the applicable requirements'),'proficiency','Meet the listed ACS standards.'),
  'standards','{"knowledge":[],"risk_management":[],"skills":[]}'::jsonb,
  'status','published', 'sort_order',10010
))::text, true);

insert into public.organization_training_guides(organization_id,subject_id,guidance,resources,updated_by)
values(
  current_setting('training_guide.organization')::uuid,
  current_setting('training_guide.subject')::uuid,
  'School guidance',
  '[{"title":"School resource","url":"https://example.test/school"}]'::jsonb,
  auth.uid()
);

select set_config('request.jwt.claim.sub',current_setting('training_guide.cfi'),true);
insert into public.instructor_training_guides(organization_id,instructor_user_id,subject_id,explanation,key_points,resources)
values(
  current_setting('training_guide.organization')::uuid,
  auth.uid(),
  current_setting('training_guide.subject')::uuid,
  'Instructor explanation',
  array['Correct for wind early'],
  '[{"title":"Video","url":"https://www.youtube.com/watch?v=test"}]'::jsonb
);

select set_config('training_guide.revision',public.get_cfi_schedule_snapshot_v2('2026-10-25','2026-10-27')->>'revision',true);
select lives_ok($$select public.publish_cfi_schedule_draft_v3(
  current_setting('training_guide.revision')::bigint,
  '57000000-0000-4000-8000-000000000010',
  jsonb_build_array(
    jsonb_build_object(
      'id','57000000-0000-4000-8000-000000000011',
      'student_user_id',current_setting('training_guide.student'),
      'lesson_kind','flight','aircraft_id',current_setting('training_guide.aircraft'),
      'assigned_instructor_user_id',current_setting('training_guide.cfi'),
      'start_at','2026-10-26T12:00:00Z','end_at','2026-10-26T14:00:00Z',
      'note','','status','scheduled',
      'training_subjects',jsonb_build_array(jsonb_build_object(
        'subject_id',current_setting('training_guide.subject'),
        'organization_id',current_setting('training_guide.organization'),
        'position',0,
        'personal_note','Review wind correction before the lesson'
      ))
    ),
    jsonb_build_object(
      'id','57000000-0000-4000-8000-000000000012',
      'student_user_id',current_setting('training_guide.student'),
      'lesson_kind','ground','aircraft_id',null,
      'assigned_instructor_user_id',current_setting('training_guide.cfi'),
      'start_at','2026-10-27T12:00:00Z','end_at','2026-10-27T14:00:00Z',
      'note','','status','scheduled',
      'training_subjects',jsonb_build_array(jsonb_build_object(
        'subject_id',current_setting('training_guide.unrelated_subject'),
        'organization_id',current_setting('training_guide.organization'),
        'position',0,
        'personal_note','Cancelled lesson subject'
      ))
    )
  )
)$$,'instructor publishes a lesson with an ordered training subject');

select set_config('training_guide.revision',public.get_cfi_schedule_snapshot_v2('2026-10-25','2026-10-28')->>'revision',true);
select lives_ok($$select public.publish_cfi_schedule_draft_v3(
  current_setting('training_guide.revision')::bigint,
  '57000000-0000-4000-8000-000000000013',
  jsonb_build_array(jsonb_build_object(
    'id','57000000-0000-4000-8000-000000000012',
    'student_user_id',current_setting('training_guide.student'),
    'lesson_kind','ground','aircraft_id',null,
    'assigned_instructor_user_id',current_setting('training_guide.cfi'),
    'start_at','2026-10-27T12:00:00Z','end_at','2026-10-27T14:00:00Z',
    'note','','status','cancelled',
    'training_subjects',jsonb_build_array(jsonb_build_object(
      'subject_id',current_setting('training_guide.unrelated_subject'),
      'organization_id',current_setting('training_guide.organization'),
      'position',0,
      'personal_note','Cancelled lesson subject'
    ))
  ))
)$$,'cancelling a lesson removes it from Training Guide access');

select is(
  (select subject_snapshot->>'acs_document' from public.cfi_schedule_event_subjects where event_id='57000000-0000-4000-8000-000000000011'),
  'FAA-S-ACS-6C',
  'publishing pins the official ACS snapshot'
);
select is(
  (select instructor_guide_snapshot->>'explanation' from public.cfi_schedule_event_subjects where event_id='57000000-0000-4000-8000-000000000011'),
  'Instructor explanation',
  'publishing pins the assigned instructor guidance'
);

select set_config('request.jwt.claim.sub',current_setting('training_guide.student'),true);
select is(
  jsonb_array_length(public.list_my_training_guide_subjects(current_setting('training_guide.organization')::uuid)),
  1,
  'student catalog includes scheduled subjects but excludes unrelated and cancelled subjects'
);
select is(
  public.list_my_training_guide_subjects(current_setting('training_guide.organization')::uuid)->0->'subject'->>'task_code',
  'PA.V.B',
  'student catalog returns the scheduled subject'
);
select is(
  public.list_my_training_guide_subjects(current_setting('training_guide.organization')::uuid)->0->'subject'->'study_guide'->>'why',
  'They build wind awareness, coordinated control, division of attention, and the ground-track judgment used in the airport traffic pattern.',
  'student catalog includes the guided why explanation'
);
select is(
  (select item->>'personal_note'
   from jsonb_array_elements(public.list_my_schedule_training_subjects(
     '2026-10-25','2026-10-27',current_setting('training_guide.cfi')::uuid
   )) item limit 1),
  'Review wind correction before the lesson',
  'student sees the note written for their lesson subject'
);
select is(
  (select count(*)::integer from public.instructor_training_guides),
  0,
  'student cannot query live instructor templates directly'
);
select is(
  (select explanation from public.list_my_instructor_training_guides(
    current_setting('training_guide.organization')::uuid,
    current_setting('training_guide.subject')::uuid
  ) limit 1),
  'Instructor explanation',
  'student can read the template shared by an assigned instructor'
);
select lives_ok(
  format(
    'select public.create_training_subject_note(%L,%L,%L,%L)',
    current_setting('training_guide.organization'),
    current_setting('training_guide.subject'),
    's-turns',
    'Watch the wind before crossing the road.'
  ),
  'organization student can add a subject note'
);
select is(
  (select body from public.list_training_subject_notes(
    current_setting('training_guide.organization')::uuid,
    current_setting('training_guide.subject')::uuid
  ) limit 1),
  'Watch the wind before crossing the road.',
  'organization members can read the shared subject note'
);

select set_config('request.jwt.claim.sub',current_setting('training_guide.cfi'),true);
insert into public.student_training_subject_notes(
  organization_id,subject_id,instructor_user_id,student_user_id,body
) values (
  current_setting('training_guide.organization')::uuid,
  current_setting('training_guide.subject')::uuid,
  auth.uid(),
  current_setting('training_guide.student')::uuid,
  'Student-specific correction'
);

select set_config('request.jwt.claim.sub',current_setting('training_guide.student'),true);
select is(
  (select body from public.student_training_subject_notes where subject_id=current_setting('training_guide.subject')::uuid),
  'Student-specific correction',
  'the intended student can read their private subject note'
);

reset role;
update private.training_guide_student_assignments
set start_at = timezone('utc', now()) - interval '40 days',
    end_at = timezone('utc', now()) - interval '39 days'
where event_id = '57000000-0000-4000-8000-000000000011';
delete from public.cfi_schedule_events
where id = '57000000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('training_guide.student'),true);
select is(
  jsonb_array_length(public.list_my_training_guide_subjects(current_setting('training_guide.organization')::uuid)),
  1,
  'completed subject access survives Schedule history cleanup'
);
select is(
  public.list_my_training_guide_subjects(current_setting('training_guide.organization')::uuid)->0->>'access_state',
  'completed',
  'a past retained assignment is shown as completed'
);

reset role;
select * from finish();
rollback;
