-- USATS Instrument Rating flight-training modules.
-- The source content is stored verbatim apart from PDF line wrapping. Stage is
-- retained only as module grouping; it is not represented as a module.

create table public.training_courses (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique,
  provider_name text not null,
  title text not null,
  revision_label text not null,
  source_file_name text not null,
  status text not null default 'published' check (status in ('draft', 'published', 'retired')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (stable_key = lower(stable_key) and stable_key ~ '^[a-z0-9][a-z0-9._-]*$'),
  check (char_length(provider_name) between 1 and 160),
  check (char_length(title) between 1 and 200)
);

create table public.training_course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  stage_number smallint not null check (stage_number > 0),
  module_number smallint not null check (module_number > 0),
  module_type text not null,
  duration_label text not null,
  duration_hours numeric(4,1) not null check (duration_hours > 0),
  lesson_objective text not null,
  study_material text not null default '',
  completion_standards text not null,
  source_page integer not null check (source_page > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (course_id, module_number)
);

create index training_course_modules_stage_idx
  on public.training_course_modules (course_id, stage_number, module_number);

create table public.training_module_line_items (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.training_course_modules(id) on delete cascade,
  position smallint not null check (position > 0),
  item_text text not null,
  minimum_score smallint not null check (minimum_score between 1 and 5),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (module_id, position),
  check (char_length(item_text) between 1 and 300)
);

create index training_module_line_items_module_idx
  on public.training_module_line_items (module_id, position);

create table public.organization_training_courses (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, course_id)
);

create index organization_training_courses_course_idx
  on public.organization_training_courses (course_id, organization_id)
  where enabled;

alter table public.training_courses enable row level security;
alter table public.training_course_modules enable row level security;
alter table public.training_module_line_items enable row level security;
alter table public.organization_training_courses enable row level security;

revoke all on table public.training_courses from public, anon, authenticated;
revoke all on table public.training_course_modules from public, anon, authenticated;
revoke all on table public.training_module_line_items from public, anon, authenticated;
revoke all on table public.organization_training_courses from public, anon, authenticated;

grant all on table public.training_courses to service_role;
grant all on table public.training_course_modules to service_role;
grant all on table public.training_module_line_items to service_role;
grant all on table public.organization_training_courses to service_role;

create policy training_courses_read_assigned
on public.training_courses for select to authenticated
using (
  private.is_platform_admin((select auth.uid()))
  or exists (
    select 1
    from public.organization_training_courses assignment
    where assignment.course_id = training_courses.id
      and assignment.enabled
      and private.is_organization_member(assignment.organization_id, (select auth.uid()))
  )
);

create policy training_course_modules_read_assigned
on public.training_course_modules for select to authenticated
using (
  private.is_platform_admin((select auth.uid()))
  or exists (
    select 1
    from public.organization_training_courses assignment
    where assignment.course_id = training_course_modules.course_id
      and assignment.enabled
      and private.is_organization_member(assignment.organization_id, (select auth.uid()))
  )
);

create policy training_module_line_items_read_assigned
on public.training_module_line_items for select to authenticated
using (
  private.is_platform_admin((select auth.uid()))
  or exists (
    select 1
    from public.training_course_modules module
    join public.organization_training_courses assignment on assignment.course_id = module.course_id
    where module.id = training_module_line_items.module_id
      and assignment.enabled
      and private.is_organization_member(assignment.organization_id, (select auth.uid()))
  )
);

create policy organization_training_courses_read_member
on public.organization_training_courses for select to authenticated
using (
  private.is_platform_admin((select auth.uid()))
  or private.is_organization_member(organization_id, (select auth.uid()))
);

create temporary table usats_course_import (value jsonb not null) on commit drop;

insert into usats_course_import (value)
values ($usats_course${
  "provider_name": "U.S. Aviation Training Solutions",
  "course_title": "Instrument Rating - Airplane Single Engine Land",
  "revision": "Rev 0",
  "course_key": "usats.instrument-rating-airplane-single-engine-land.rev-0",
  "modules": [
    {
      "module_number": 1,
      "stage_number": 1,
      "module_type": "Oral",
      "duration": "1.0 hours",
      "lesson_objective": "The objective of this lesson is to ensure the learner achieves a high level of proficiency in critical instrument flight skills and Single-Pilot Resource Management (SRM) through oral assessments. By the end of this lesson, the learner will be able to perform a thorough instrument flight deck check, maintain accurate flight attitudes using instruments, effectively manage partial panel flight conditions, and demonstrate strong SRM techniques. The learner will achieve a minimum score of 4 in each of these areas, indicating a solid understanding and ability to apply these essential instrument flight operations and resource management principles.",
      "line_items": [
        {
          "position": 1,
          "text": "Instrument flight deck check",
          "minimum_score": 4
        },
        {
          "position": 2,
          "text": "Instrument flight attitude",
          "minimum_score": 4
        },
        {
          "position": 3,
          "text": "Partial panel flight",
          "minimum_score": 4
        },
        {
          "position": 4,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 4
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "Upon completion of this lesson, the learner will have demonstrated proficiency in key instrument flight skills and Single-Pilot Resource Management (SRM) by achieving a minimum score of 4 in each of the following areas: instrument flight deck check, instrument flight attitude, partial panel flight, and SRM. The learner will be able to conduct a comprehensive instrument flight deck check, maintain accurate flight attitudes using instruments, effectively manage flight operations under partial panel conditions, and apply SRM principles to ensure safe and efficient flight operations.",
      "source_page": 28
    },
    {
      "module_number": 2,
      "stage_number": 1,
      "module_type": "Flight",
      "duration": "1.5 hours",
      "lesson_objective": "The objective of this lesson is to enhance the learner's scan and instrument interpretation skills, familiarize them with the systems and instruments associated with IFR flight, and review basic attitude instrument flying skills. By the end of this lesson, the learner will be proficient in conducting a thorough preflight assessment, managing the flight deck, effectively using checklists, starting the engine, and performing an instrument flight deck check. The learner will also demonstrate competence in instrument flight, maneuvering during slow flight, checking instruments and equipment, and applying Single-Pilot Resource Management (SRM) principles to maintain safety and efficiency in IFR operations.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 4
        },
        {
          "position": 2,
          "text": "Preflight Procedure",
          "minimum_score": 4
        },
        {
          "position": 3,
          "text": "Flight Deck Management",
          "minimum_score": 4
        },
        {
          "position": 4,
          "text": "Checklist Usage",
          "minimum_score": 4
        },
        {
          "position": 5,
          "text": "Engine Starting",
          "minimum_score": 4
        },
        {
          "position": 6,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 4
        },
        {
          "position": 7,
          "text": "Instrument Flight",
          "minimum_score": 4
        },
        {
          "position": 8,
          "text": "Maneuvering During Slow Flight",
          "minimum_score": 4
        },
        {
          "position": 9,
          "text": "Checking Instruments and Equipment",
          "minimum_score": 4
        },
        {
          "position": 10,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 4
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "By the end of the unit, the learner will be proficient in instrument scanning techniques. With instructor assistance, the learner will be able to recognize improper instrument indications. The learner will maintain the standards outlined in the Instrument Rating Airman Certification Standards when performing basic instrument maneuvers. To satisfactorily complete the unit, the learner must achieve the specified minimum score for all line items.",
      "source_page": 29
    },
    {
      "module_number": 3,
      "stage_number": 1,
      "module_type": "Flight",
      "duration": "1.5 hours",
      "lesson_objective": "To develop the learner's scan and instrument interpretation skills and familiarize them with the systems and instruments associated with IFR flight. The learner will perform slow flight by instrument reference, review Basic Attitude Instrument (BAI) flying skills, and execute the BAI patterns listed for this unit. The lesson will also cover essential tasks such as preflight assessment, flight deck management, checklist usage, engine starting, instrument flight deck check, and single-pilot resource management, ensuring proficiency in each area with a minimum score of 4 for all line items.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 4
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 4
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 4
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 4
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 4
        },
        {
          "position": 6,
          "text": "Instrument Flight",
          "minimum_score": 4
        },
        {
          "position": 7,
          "text": "Maneuvering During Slow Flight",
          "minimum_score": 4
        },
        {
          "position": 8,
          "text": "Pattern A",
          "minimum_score": 4
        },
        {
          "position": 9,
          "text": "Pattern B",
          "minimum_score": 4
        },
        {
          "position": 10,
          "text": "Checking Instruments and Equipment",
          "minimum_score": 4
        },
        {
          "position": 11,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 4
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "With instructor assistance, the learner should be able to recognize if instruments are not indicating properly. The learner will maintain the standards outlined in the Instrument Rating Airman Certification Standards when performing Basic Instrument Maneuvers. To satisfactorily complete the unit, the learner must achieve the specified minimum score of 4 for all line items.",
      "source_page": 30
    },
    {
      "module_number": 4,
      "stage_number": 1,
      "module_type": "Flight",
      "duration": "1.5 hours",
      "lesson_objective": "The objective of this lesson is to develop the learner's skills in instrument scanning, interpretation, and overall flight deck management. The learner will become familiar with the systems and instruments associated with IFR flight, ensuring proficiency in performing Basic Attitude Instrument flying skills. Additionally, the learner will practice maneuvering during slow flight by instrument reference and perform the BAI patterns listed for this unit. Key areas of focus include preflight assessment, checklist usage, engine starting, instrument flight deck check, and single-pilot resource management. The learner must achieve a minimum score of 4 in all line items to demonstrate competency and successfully complete the lesson.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 4
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 4
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 4
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 4
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 4
        },
        {
          "position": 6,
          "text": "Instrument Flight",
          "minimum_score": 4
        },
        {
          "position": 7,
          "text": "Maneuvering During Slow Flight",
          "minimum_score": 4
        },
        {
          "position": 8,
          "text": "Pattern A",
          "minimum_score": 4
        },
        {
          "position": 9,
          "text": "Pattern B",
          "minimum_score": 4
        },
        {
          "position": 10,
          "text": "Checking Instruments and Equipment",
          "minimum_score": 4
        },
        {
          "position": 11,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 4
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "By the end of this unit, the learner will demonstrate proficiency in instrument scanning techniques and the ability to recognize if instruments are not indicating properly with assistance from the instructor. The learner will adhere to the standards outlined in the Instrument Rating Airman Certification Standards when performing Basic Instrument Maneuvers. To satisfactorily complete the unit, the learner must achieve a minimum score of 4 on all line items, ensuring competence in preflight assessment, flight deck management, checklist usage, engine starting, instrument flight deck check, instrument flight, maneuvering during slow flight, pattern A, pattern B, checking instruments and equipment, and single-pilot resource management.",
      "source_page": 31
    },
    {
      "module_number": 5,
      "stage_number": 1,
      "module_type": "Oral",
      "duration": "1.5 hours",
      "lesson_objective": "The objective of this unit is to familiarize the learner with the procedures for intercepting and tracking both ground-based and satellite-based navigational systems, as well as tracking navigational arcs. By the end of this unit, the learner will be able to effectively use flight instruments and navigational equipment, understanding their functions in relation to ground and satellite navigation aids. Additionally, the learner will develop proficiency in single-pilot resource management, ensuring safe and efficient navigation during flight operations.",
      "line_items": [
        {
          "position": 1,
          "text": "Intercepting and Tracking Ground Based Navigational Systems",
          "minimum_score": 4
        },
        {
          "position": 2,
          "text": "Intercepting and Tracking Satellite Based Navigational Systems",
          "minimum_score": 4
        },
        {
          "position": 3,
          "text": "Intercepting and Tracking Arcs",
          "minimum_score": 4
        },
        {
          "position": 4,
          "text": "Airplane Flight Instruments and Navigation Equipment",
          "minimum_score": 4
        },
        {
          "position": 5,
          "text": "Single Pilot Resource Management",
          "minimum_score": 4
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "Upon completion of this unit, the learner will demonstrate proficiency in intercepting and tracking both ground-based and satellite-based navigational systems, as well as navigating arcs. The learner will effectively utilize airplane flight instruments and navigation equipment, understanding their functions in relation to ground and satellite navigation aids. Additionally, the learner will exhibit competency in single-pilot resource management, ensuring the safe and efficient execution of navigation procedures during flight operations.",
      "source_page": 32
    },
    {
      "module_number": 6,
      "stage_number": 1,
      "module_type": "Flight",
      "duration": "1.5 hours",
      "lesson_objective": "The objective of this lesson is to introduce the learner to the procedures associated with intercepting and tracking both ground-based and satellite-based navigational systems, as well as navigating arcs.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Intercepting and Tracking Ground Based Navigational Systems",
          "minimum_score": 4
        },
        {
          "position": 7,
          "text": "Intercepting and Tracking Satellite Based Navigational Systems",
          "minimum_score": 4
        },
        {
          "position": 8,
          "text": "Intercepting and Tracking Arcs",
          "minimum_score": 4
        },
        {
          "position": 9,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner should demonstrate knowledge of the established USATS procedures for intercepting and tracking navigational systems. They should be able to identify any instrument or equipment malfunctions during the Instrument Flight Deck Check. To satisfactorily complete the unit, the learner must achieve the specified minimum score for all line items.",
      "source_page": 33
    },
    {
      "module_number": 7,
      "stage_number": 1,
      "module_type": "Flight",
      "duration": "1.5 hours",
      "lesson_objective": "The objective of this lesson is to provide the learner with practical experience in navigating using various navigational systems. Emphasis will be placed on the proper use of established procedures for intercepting and tracking these systems. Additionally, the learner will understand the importance of maintaining orientation throughout the navigation exercises, ensuring accurate and efficient flight path management.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Intercepting and Tracking Ground Based Navigational Systems",
          "minimum_score": 4
        },
        {
          "position": 7,
          "text": "Intercepting and Tracking Satellite Based Navigational Systems",
          "minimum_score": 4
        },
        {
          "position": 8,
          "text": "Intercepting and Tracking Arcs",
          "minimum_score": 4
        },
        {
          "position": 9,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner must demonstrate knowledge of the established USATS intercepting and tracking procedures. During the Instrument Flight Deck Check, the learner should be able to identify any instrument or equipment malfunctions. To satisfactorily complete the unit, the learner must achieve the specified minimum score for all line items.",
      "source_page": 34
    },
    {
      "module_number": 8,
      "stage_number": 1,
      "module_type": "Flight",
      "duration": "2.0 hours",
      "lesson_objective": "This unit aims to provide the learner with practical experience in performing various navigational tasks in an actual airplane. Emphasis will be placed on mastering intercepting and tracking ground-based and satellite-based navigational systems, as well as arcs.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Intercepting and Tracking Ground Based Navigational Systems",
          "minimum_score": 3
        },
        {
          "position": 7,
          "text": "Intercepting and Tracking Satellite Based Navigational Systems",
          "minimum_score": 3
        },
        {
          "position": 8,
          "text": "Intercepting and Tracking Arcs",
          "minimum_score": 3
        },
        {
          "position": 9,
          "text": "Pattern A",
          "minimum_score": 3
        },
        {
          "position": 10,
          "text": "Pattern B",
          "minimum_score": 3
        },
        {
          "position": 11,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner should be proficient in the established USATS intercepting and tracking procedures, able to perform them with minimal assistance from the instructor. Additionally, the learner must demonstrate the ability to identify any instrument or equipment malfunctions during the Instrument Flight Deck Check. To satisfactorily complete the unit, the learner must achieve the specified minimum score for all line items.",
      "source_page": 35
    },
    {
      "module_number": 9,
      "stage_number": 1,
      "module_type": "Flight - PA",
      "duration": "1.5 hours",
      "lesson_objective": "This unit serves as an assessment to verify the learner's ability to perform basic intercepting and tracking procedures while flying solely by reference to instruments. The assessment will be administered by the Chief Instructor, Assistant Chief Instructor, or an Authorized Check Instructor. The learner is expected to demonstrate the knowledge and skills necessary to meet the standards established for this unit without assistance from the check pilot.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Intercepting and Tracking Ground Based Navigational Systems",
          "minimum_score": 3
        },
        {
          "position": 7,
          "text": "Intercepting and Tracking Satellite Based Navigational Systems",
          "minimum_score": 3
        },
        {
          "position": 8,
          "text": "Intercepting and Tracking Arcs",
          "minimum_score": 3
        },
        {
          "position": 9,
          "text": "Pattern A or Pattern B",
          "minimum_score": 3
        },
        {
          "position": 10,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "",
      "completion_standards": "The learner must achieve the specified minimum score for all line items to satisfactorily complete the unit.",
      "source_page": 36
    },
    {
      "module_number": 10,
      "stage_number": 2,
      "module_type": "Oral",
      "duration": "1.0 hours",
      "lesson_objective": "This unit will introduce the learner to the procedures associated with holding, holding entries, and the ATC clearances typically assigned to aircraft required to hold. The learner will gain proficiency in various holding procedures, including VOR, Localizer, Intersection, DME, and GPS holds, while effectively applying Single-Pilot Resource Management techniques.",
      "line_items": [
        {
          "position": 1,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 4
        },
        {
          "position": 2,
          "text": "Holding Procedures (VOR)",
          "minimum_score": 4
        },
        {
          "position": 3,
          "text": "Holding Procedures (Localizer)",
          "minimum_score": 4
        },
        {
          "position": 4,
          "text": "Holding Procedures (Intersection)",
          "minimum_score": 4
        },
        {
          "position": 5,
          "text": "Holding Procedures (DME)",
          "minimum_score": 4
        },
        {
          "position": 6,
          "text": "Holding Procedures (GPS)",
          "minimum_score": 4
        },
        {
          "position": 7,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 4
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner must demonstrate sufficient knowledge of the listed elements to ensure the instructor's confidence in their preparedness to perform the tasks in the airplane. The learner must achieve the specified minimum score for all line items to satisfactorily complete the unit.",
      "source_page": 37
    },
    {
      "module_number": 11,
      "stage_number": 2,
      "module_type": "Flight",
      "duration": "1.5 hours",
      "lesson_objective": "The objective of this unit is to introduce the learner to holding procedures and associated ATC clearances. Emphasis will be placed on ensuring the learner can accurately determine the correct type of entry for assigned holding patterns. The importance of maintaining orientation within the holding pattern and understanding the effects of wind will be stressed, along with the necessary corrective procedures. By the end of the unit, the learner should be proficient in executing various holding procedures, including VOR, Localizer, Intersection, DME, and GPS holds, while effectively managing single-pilot resources.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Holding Procedures (VOR)",
          "minimum_score": 4
        },
        {
          "position": 7,
          "text": "Holding Procedures (Localizer)",
          "minimum_score": 4
        },
        {
          "position": 8,
          "text": "Holding Procedures (Intersection)",
          "minimum_score": 4
        },
        {
          "position": 9,
          "text": "Holding Procedures (DME)",
          "minimum_score": 4
        },
        {
          "position": 10,
          "text": "Holding Procedures (GPS)",
          "minimum_score": 4
        },
        {
          "position": 11,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner should be able to promptly and accurately copy ATC clearances, verify their validity, and determine if they can be complied with. The learner must adhere to the established USATS intercepting and tracking procedures and apply the correct procedures for each introduced maneuver. Additionally, the learner should be able to determine the proper holding entry for given scenarios. To satisfactorily complete the unit, the learner must achieve the specified minimum score for all line items.",
      "source_page": 38
    },
    {
      "module_number": 12,
      "stage_number": 2,
      "module_type": "Flight",
      "duration": "1.5 hours",
      "lesson_objective": "Review holding procedures and associated ATC clearances, with an emphasis on increasing the learner's independence in performing holding entries and executing holding procedures.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Holding Procedures (VOR)",
          "minimum_score": 4
        },
        {
          "position": 7,
          "text": "Holding Procedures (Localizer)",
          "minimum_score": 4
        },
        {
          "position": 8,
          "text": "Holding Procedures (Intersection)",
          "minimum_score": 4
        },
        {
          "position": 9,
          "text": "Holding Procedures (DME)",
          "minimum_score": 4
        },
        {
          "position": 10,
          "text": "Holding Procedures (GPS)",
          "minimum_score": 4
        },
        {
          "position": 11,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner will adhere to the established USATS intercepting and tracking procedures. They will determine the proper holding entry and demonstrate increased independence in holding procedures. The learner will apply correct wind correction techniques and improve timing on each lap. To satisfactorily complete the unit, the learner must achieve the specified minimum score for all line items.",
      "source_page": 39
    },
    {
      "module_number": 13,
      "stage_number": 2,
      "module_type": "Oral",
      "duration": "1.0 hours",
      "lesson_objective": "This unit will focus on system and equipment malfunctions, with particular attention to the loss of primary flight instrument indicators and the appropriate pilot-in-command actions.",
      "line_items": [
        {
          "position": 1,
          "text": "System and Equipment Malfunctions",
          "minimum_score": 4
        },
        {
          "position": 2,
          "text": "Loss of Primary Flight Instrument Indicators",
          "minimum_score": 4
        },
        {
          "position": 3,
          "text": "Magnetic Compass Turns",
          "minimum_score": 4
        },
        {
          "position": 4,
          "text": "Timed Turns to Magnetic Compass Headings",
          "minimum_score": 4
        },
        {
          "position": 5,
          "text": "Recovery from Unusual Flight Attitudes",
          "minimum_score": 4
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner will demonstrate a thorough understanding of system and equipment malfunctions, particularly the loss of primary flight instrument indicators, and execute the necessary actions as the pilot-in-command. The learner will proficiently perform intercepting and tracking procedures, including DME arcs. The learner must achieve the specified minimum score for all line items to satisfactorily complete the unit, ensuring they can effectively manage these scenarios during flight.",
      "source_page": 40
    },
    {
      "module_number": 14,
      "stage_number": 2,
      "module_type": "Flight",
      "duration": "1.5 hours",
      "lesson_objective": "Teach the learner to recognize flight instrument malfunctions and implement the appropriate troubleshooting and emergency flying procedures when necessary. Additionally, introduce the learner to various other system malfunctions, emphasizing the importance of monitoring all aircraft systems to ensure safe flight operations.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Loss of Primary Flight Instrument Indicators",
          "minimum_score": 4
        },
        {
          "position": 7,
          "text": "Magnetic Compass Turns",
          "minimum_score": 4
        },
        {
          "position": 8,
          "text": "Timed Turns to Magnetic Compass Headings",
          "minimum_score": 4
        },
        {
          "position": 9,
          "text": "System and Equipment Malfunctions",
          "minimum_score": 4
        },
        {
          "position": 10,
          "text": "Recovery from Unusual Flight Attitudes",
          "minimum_score": 4
        },
        {
          "position": 11,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner should promptly recognize flight instrument failures and apply the appropriate responses. They must demonstrate knowledge of magnetic compass errors by correctly performing magnetic compass turns. The learner should also identify unusual attitudes and execute the appropriate recovery procedures. The learner must achieve the specified minimum score for all line items to satisfactorily complete the unit.",
      "source_page": 41
    },
    {
      "module_number": 15,
      "stage_number": 2,
      "module_type": "Flight",
      "duration": "1.5 hours",
      "lesson_objective": "Review intercepting and tracking procedures, loss of primary flight instrument indicators, holding procedures, and associated ATC clearances. Verify that the learner is prepared for the instrument approach phase of this training manual.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Before Takeoff Check",
          "minimum_score": 3
        },
        {
          "position": 7,
          "text": "Holding Procedures",
          "minimum_score": 3
        },
        {
          "position": 8,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 9,
          "text": "Loss of Primary Flight Instrument Indicators",
          "minimum_score": 4
        },
        {
          "position": 10,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner will adhere to established USATS intercepting and tracking procedures, recognize flight instrument failures in a timely manner, and apply the appropriate response procedures. The learner will correctly determine the proper holding entry and consistently apply the correct procedures throughout the maneuver. To satisfactorily complete the unit, the learner must achieve the specified minimum score for all line items.",
      "source_page": 42
    },
    {
      "module_number": 16,
      "stage_number": 2,
      "module_type": "Flight",
      "duration": "1.5 hours",
      "lesson_objective": "This unit will serve as a comprehensive review of the learner’s progress up to this point. It will include a review of partial panel operations, holding procedures, and associated ATC clearances. Additionally, it will verify the learner's preparedness for the instrument approach phase of this training manual.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Before Takeoff Check",
          "minimum_score": 3
        },
        {
          "position": 7,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 8,
          "text": "Holding Procedures",
          "minimum_score": 3
        },
        {
          "position": 9,
          "text": "Loss of Primary Flight Instrument Indicators",
          "minimum_score": 3
        },
        {
          "position": 10,
          "text": "Magnetic Compass Turns",
          "minimum_score": 3
        },
        {
          "position": 11,
          "text": "Timed Turns to Magnetic Compass Headings",
          "minimum_score": 3
        },
        {
          "position": 12,
          "text": "System and Equipment Malfunctions",
          "minimum_score": 3
        },
        {
          "position": 13,
          "text": "Recovery from Unusual Flight Attitudes",
          "minimum_score": 3
        },
        {
          "position": 14,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner adheres to established USATS intercepting and tracking procedures and recognizes flight instrument failures in a timely manner, applying the appropriate response procedures. To satisfactorily complete the unit, the learner must achieve the specified minimum score for all line items.",
      "source_page": 43
    },
    {
      "module_number": 17,
      "stage_number": 2,
      "module_type": "Oral",
      "duration": "1.0 hours",
      "lesson_objective": "This unit will introduce the learner to IFR approach procedures, focusing on VOR and GPS approaches. The instructor will explain in detail how to interpret approach charts and the significance of the information when executing an approach, including missed approach procedures. The learner will be taught the procedures for performing both straight-in and circling approaches and will be introduced to ATC approach clearances.",
      "line_items": [
        {
          "position": 1,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "IFR Approach Charts",
          "minimum_score": 4
        },
        {
          "position": 3,
          "text": "VOR Instrument Approach Procedures",
          "minimum_score": 4
        },
        {
          "position": 4,
          "text": "GPS Instrument Approach Procedures",
          "minimum_score": 4
        },
        {
          "position": 5,
          "text": "Circling Approach",
          "minimum_score": 4
        },
        {
          "position": 6,
          "text": "Missed Approach",
          "minimum_score": 4
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner must demonstrate adequate knowledge of the listed elements, instilling confidence in the instructor that they are prepared to perform the tasks in the airplane. The learner should be able to accurately identify symbols on approach charts. The learner must achieve the specified minimum score for all line items to satisfactorily complete the unit.",
      "source_page": 44
    },
    {
      "module_number": 18,
      "stage_number": 2,
      "module_type": "Flight",
      "duration": "1.5 hours",
      "lesson_objective": "This unit aims to familiarize the learner with VOR approach procedures. The instructor will emphasize the learner's capability to maintain orientation throughout the approach and their ability to execute the required procedures promptly.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 7,
          "text": "VOR Instrument Approach Procedures",
          "minimum_score": 4
        },
        {
          "position": 8,
          "text": "Missed Approach",
          "minimum_score": 4
        },
        {
          "position": 9,
          "text": "Landing from an Instrument Approach",
          "minimum_score": 3
        },
        {
          "position": 10,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner should demonstrate proficiency in selecting, tuning, identifying, and confirming the operational status of navigation equipment required for the approach. They must establish the correct aircraft configuration and complete the relevant checklist for each phase of flight. With guidance from the instructor, the learner should understand and adhere to ATC approach clearances. To satisfactorily complete the unit, the learner must achieve the specified minimum score for all line items.",
      "source_page": 45
    },
    {
      "module_number": 19,
      "stage_number": 2,
      "module_type": "Flight",
      "duration": "1.5 hours",
      "lesson_objective": "This unit aims to enhance the learner's proficiency in executing circling approaches and conducting missed approach procedures. Additionally, the learner will acquire the necessary skills to perform IFR approaches utilizing the GPS navigation system.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 7,
          "text": "GPS Holding",
          "minimum_score": 3
        },
        {
          "position": 8,
          "text": "GPS Instrument Approach Procedures",
          "minimum_score": 4
        },
        {
          "position": 9,
          "text": "Circling Approach",
          "minimum_score": 4
        },
        {
          "position": 10,
          "text": "Landing from an Instrument Approach",
          "minimum_score": 3
        },
        {
          "position": 11,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner demonstrates proficiency in selecting, tuning, identifying, and confirming the operational status of navigation equipment for approach. They establish the correct aircraft configuration and execute the appropriate checklist for each phase of flight. The learner promptly identifies and addresses any irregularities or system failures. Upon reaching the authorized Minimum Descent Altitude (MDA), they safely maneuver the aircraft to maintain altitude and flight path, enabling a normal landing on a runway at least 90° from the final approach course. Successful completion of all line items with the specified minimum score is required to satisfactorily conclude the unit.",
      "source_page": 46
    },
    {
      "module_number": 20,
      "stage_number": 2,
      "module_type": "Flight",
      "duration": "1.5 hours",
      "lesson_objective": "In this unit, the learner will review holding procedures and apply the approach skills from previous sessions to practice approaches.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 7,
          "text": "Holding Procedures",
          "minimum_score": 3
        },
        {
          "position": 8,
          "text": "Nonprecision Approach Procedures",
          "minimum_score": 3
        },
        {
          "position": 9,
          "text": "Missed Approach",
          "minimum_score": 3
        },
        {
          "position": 10,
          "text": "Circling Approach",
          "minimum_score": 3
        },
        {
          "position": 11,
          "text": "Landing from an Instrument Approach",
          "minimum_score": 3
        },
        {
          "position": 12,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "To satisfactorily complete the unit, the learner must demonstrate proficiency in selecting, tuning, identifying, and confirming the operational status of navigation equipment for the approach. Additionally, they should establish the aircraft configuration and complete the appropriate checklists for each phase of flight. During the approach, the learner must safely maneuver the aircraft after reaching the authorized minimum descent altitude (MDA) to maintain altitude and flight path alignment for a normal landing on a runway positioned at least 90° from the final approach course. Achievement of the specified minimum score for all line items is required for satisfactory completion.",
      "source_page": 47
    },
    {
      "module_number": 21,
      "stage_number": 2,
      "module_type": "Flight",
      "duration": "1.5 hours",
      "lesson_objective": "In this unit, the learner will review holding procedures and apply the approach skills from previous sessions to practice approaches.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 7,
          "text": "Runway Incursion Avoidance",
          "minimum_score": 3
        },
        {
          "position": 8,
          "text": "Before Takeoff Check",
          "minimum_score": 3
        },
        {
          "position": 9,
          "text": "Holding Procedures",
          "minimum_score": 3
        },
        {
          "position": 10,
          "text": "Nonprecision Approach",
          "minimum_score": 3
        },
        {
          "position": 11,
          "text": "Missed Approach",
          "minimum_score": 3
        },
        {
          "position": 12,
          "text": "Circling Approach",
          "minimum_score": 3
        },
        {
          "position": 13,
          "text": "Approach with Loss of Primary Flight Instrument Indicators",
          "minimum_score": 3
        },
        {
          "position": 14,
          "text": "Landing from an Instrument Approach",
          "minimum_score": 3
        },
        {
          "position": 15,
          "text": "Checking Instruments and Equipment",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner must effectively perform the following tasks: select, tune, identify, and confirm the operational status of navigation equipment for the approach; establish the appropriate aircraft configuration and airspeed; and complete the aircraft checklist items relevant to the phase of flight. After reaching the authorized minimum descent altitude (MDA), the learner must safely maneuver the aircraft, maintaining the designated altitude and flight path to enable a normal landing on a runway at least 90° from the final approach course. Successful completion of all line items with the specified minimum score is required to satisfactorily complete the unit.",
      "source_page": 48
    },
    {
      "module_number": 22,
      "stage_number": 2,
      "module_type": "Flight",
      "duration": "1.6 hours",
      "lesson_objective": "The learner will review, and practice GPS procedures introduced in the previous unit. Emphasis will be placed on copying, interpreting, and complying with ATC clearances. The learner will review how to establish holding patterns using the GPS system. Additional training in partial panel operations will be conducted to further increase proficiency in managing flight without primary flight instruments.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 7,
          "text": "Holding Procedures",
          "minimum_score": 3
        },
        {
          "position": 8,
          "text": "Nonprecision Approach",
          "minimum_score": 3
        },
        {
          "position": 9,
          "text": "Missed Approach",
          "minimum_score": 3
        },
        {
          "position": 10,
          "text": "Approach with Loss of Primary Flight Instrument Indicators",
          "minimum_score": 3
        },
        {
          "position": 11,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner will select, tune, identify, and confirm the operational status of the navigation equipment used for the approach. They will establish the appropriate aircraft configuration and airspeed and complete the aircraft checklist items appropriate to the phase of flight. The learner will recognize if the heading indicator and/or attitude indicator is inaccurate or inoperative, advise the controller, and proceed accordingly. To satisfactorily complete the unit, the learner must achieve the specified minimum score for all line items.",
      "source_page": 49
    },
    {
      "module_number": 23,
      "stage_number": 2,
      "module_type": "Oral",
      "duration": "1.0 hours",
      "lesson_objective": "The learner will be introduced to Precision Approach Procedures, including the use of Localizer Back Courses. ILS approaches will also be introduced. Additionally, loss of communication procedures will be covered, with an emphasis on how to apply them when executing approaches to an airport under IMC.",
      "line_items": [
        {
          "position": 1,
          "text": "Localizer/Localizer Back Course Approach Procedures",
          "minimum_score": 4
        },
        {
          "position": 2,
          "text": "ILS Approach Procedures",
          "minimum_score": 4
        },
        {
          "position": 3,
          "text": "Loss of Communications",
          "minimum_score": 4
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner must demonstrate sufficient knowledge and proficiency in the listed elements to ensure the instructor's confidence in their ability to perform the tasks in the airplane. The learner must achieve the specified minimum score for all line items to satisfactorily complete the unit.",
      "source_page": 50
    },
    {
      "module_number": 24,
      "stage_number": 2,
      "module_type": "Flight",
      "duration": "2.0 hours",
      "lesson_objective": "Introduce the learner to ILS, Localizer, and Localizer Back Course approach procedures, including the associated missed approach procedures and ATC clearances. Explain the elements and components of a Localizer, Localizer Back Course, and ILS instrument approach procedure. Discuss the importance of adjusting the published MDA/DH and visibility criteria based on FDC and Class II NOTAMs, inoperative aircraft and ground navigation equipment, inoperative visual aids associated with the landing environment, and NWS reporting factors and criteria.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 7,
          "text": "ILS Approach Procedures",
          "minimum_score": 4
        },
        {
          "position": 8,
          "text": "Localizer Holding",
          "minimum_score": 3
        },
        {
          "position": 9,
          "text": "Localizer Approach Procedures",
          "minimum_score": 4
        },
        {
          "position": 10,
          "text": "Missed Approach",
          "minimum_score": 3
        },
        {
          "position": 11,
          "text": "Localizer Back Course Approach Procedures",
          "minimum_score": 4
        },
        {
          "position": 12,
          "text": "Landing from an Instrument Approach",
          "minimum_score": 3
        },
        {
          "position": 13,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner selects, tunes, identifies, and confirms the operational status of the navigation equipment used for the approach. The learner establishes the appropriate aircraft configuration and airspeed and completes the aircraft checklist items appropriate to the phase of flight. The learner correctly identifies the missed approach point and immediately initiates the missed approach procedure at the proper time. The learner must achieve the specified minimum score for all line items to satisfactorily complete the unit.",
      "source_page": 51
    },
    {
      "module_number": 25,
      "stage_number": 2,
      "module_type": "Flight",
      "duration": "2.0 hours",
      "lesson_objective": "Review ILS and localizer approach procedures, including localizer back course and missed approach procedures, along with the associated clearances. Additionally, review loss of communications procedures.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 3
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 3
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 3
        },
        {
          "position": 6,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 7,
          "text": "ILS Approach Procedures",
          "minimum_score": 3
        },
        {
          "position": 8,
          "text": "Localizer Holding",
          "minimum_score": 3
        },
        {
          "position": 9,
          "text": "Localizer Approach Procedures",
          "minimum_score": 3
        },
        {
          "position": 10,
          "text": "Localizer Back Course Approach Procedures",
          "minimum_score": 3
        },
        {
          "position": 11,
          "text": "Missed Approach",
          "minimum_score": 3
        },
        {
          "position": 12,
          "text": "Loss of Communications",
          "minimum_score": 3
        },
        {
          "position": 13,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner selects, tunes, identifies, and confirms the operational status of the navigation equipment used for the approach. The learner establishes the appropriate aircraft configuration and airspeed and completes the checklist items appropriate to the phase of flight. The learner correctly identifies the missed approach point and immediately initiates the missed approach procedure at the proper time. To satisfactorily complete the unit, the learner must achieve the specified minimum score for all line items.",
      "source_page": 52
    },
    {
      "module_number": 26,
      "stage_number": 2,
      "module_type": "Oral",
      "duration": "1.0 hours",
      "lesson_objective": "In this unit, the learner will be introduced to the planning process required to file and fly an IFR cross-country. The instructor will emphasize the importance of conducting a complete and thorough weather analysis, as well as utilizing NOTAM information, DPs, STARs, PIREPs, enroute weather, and all other available information sources. The unit will include a discussion on system and equipment malfunctions, focusing on recognition and corrective action, to prepare the learner for adverse situations during IFR flights. Additionally, the instructor will explain the pilot’s responsibility to maintain instrument currency and qualifications, ensuring the learner understands the regulatory requirements and personal considerations associated with single-pilot IFR flying.",
      "line_items": [
        {
          "position": 1,
          "text": "Pilot Qualifications",
          "minimum_score": 3
        },
        {
          "position": 2,
          "text": "Cross-Country Flight Planning",
          "minimum_score": 3
        },
        {
          "position": 3,
          "text": "Weather Information",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner must demonstrate sufficient knowledge of the listed elements to instill confidence in the instructor that they are prepared to perform the tasks in the airplane. The learner must achieve the specified minimum score for all line items to satisfactorily complete the unit.",
      "source_page": 53
    },
    {
      "module_number": 27,
      "stage_number": 2,
      "module_type": "XC - Flight",
      "duration": "3.0 hours",
      "lesson_objective": "This unit aims to introduce the learner to the complexities of the IFR en route environment, covering IFR flight plans, clearances, and transitory phases such as departures and standard terminal arrival routes (DPs and STARs). Learners will delve into the intricacies of airways and route systems, focusing on position reporting, minimum altitudes, changeover points, and en route holding. Emphasis will be placed on the importance of thorough preflight planning and maintaining situational awareness throughout all phases of flight. Learners will be equipped to utilize all available resources, including ATC and FSS, to ensure safe and efficient en route navigation.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 2
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 2
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 2
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 2
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 2
        },
        {
          "position": 6,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 7,
          "text": "Weather Information",
          "minimum_score": 3
        },
        {
          "position": 8,
          "text": "Departure, En Route and Arrival Operations",
          "minimum_score": 4
        },
        {
          "position": 9,
          "text": "Precision Approach",
          "minimum_score": 2
        },
        {
          "position": 10,
          "text": "Missed Approach",
          "minimum_score": 2
        },
        {
          "position": 11,
          "text": "Nonprecision Approach",
          "minimum_score": 2
        },
        {
          "position": 12,
          "text": "Cross-Country Procedures",
          "minimum_score": 4
        },
        {
          "position": 13,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 3
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner demonstrates proficiency in a comprehensive range of skills essential for safe and efficient en route navigation. They accurately select, tune, and confirm the operational status of navigation equipment, promptly copy and interpret ATC clearances, and effectively analyze assembled weather information. Additionally, the learner determines the necessity of alternate airports and evaluates their suitability based on regulatory requirements. They exhibit adeptness in calculating estimated time en route and fuel requirements, considering various factors like power settings, altitude, wind, and reserve fuel. The learner accurately interprets en route charts, DPs, STARs, and IAPs, as well as obtains and interprets relevant NOTAM information. Utilizing appropriate navigation publications and communication frequencies, the learner seamlessly intercepts courses, radials, and bearings pertinent to the procedure, route, or clearances. Satisfactory completion of the unit requires achieving the specified minimum score for all line items.",
      "source_page": 54
    },
    {
      "module_number": 28,
      "stage_number": 2,
      "module_type": "XC - Flight",
      "duration": "3.0 hours",
      "lesson_objective": "This unit focuses on reinforcing IFR departure, en route, and arrival procedures. Learners will enhance their skills in partial panel flight and magnetic compass usage. Additionally, the training will introduce handling alternator failure during the en route phase, emphasizing sound decision-making and safety considerations. Learners will be instructed on applying appropriate lost communications procedures to ensure safe arrival at the destination or alternate airport. Nighttime training activities will familiarize learners with airport, runway, and taxiway lighting in the night IFR environment.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 2
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 2
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 2
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 2
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 2
        },
        {
          "position": 6,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 3
        },
        {
          "position": 7,
          "text": "Weather Information",
          "minimum_score": 3
        },
        {
          "position": 8,
          "text": "Cross-Country Procedures",
          "minimum_score": 3
        },
        {
          "position": 9,
          "text": "Departure, En Route and Arrival Operations",
          "minimum_score": 3
        },
        {
          "position": 10,
          "text": "Precision Approach",
          "minimum_score": 2
        },
        {
          "position": 11,
          "text": "Nonprecision Approach",
          "minimum_score": 2
        },
        {
          "position": 12,
          "text": "Loss of Communications",
          "minimum_score": 2
        },
        {
          "position": 13,
          "text": "Missed Approach",
          "minimum_score": 2
        },
        {
          "position": 14,
          "text": "Timed Turns to Magnetic Compass Headings",
          "minimum_score": 2
        },
        {
          "position": 15,
          "text": "Approach with Loss of Primary Flight Instrument Indicators",
          "minimum_score": 2
        },
        {
          "position": 16,
          "text": "Emergency Procedures",
          "minimum_score": 2
        },
        {
          "position": 17,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 2
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner demonstrates proficient operation of navigation equipment en route and during approach, ensuring accurate interpretation of ATC clearances and utilizing appropriate communication frequencies. They exhibit adequate knowledge of GPS and RAIM principles. Timely interception of courses, radials, and bearings is achieved, maintaining positive course guidance throughout. The learner executes missed approach procedures when required visual references are not distinctly visible and applies proper loss of communications procedures to ensure safe arrival at the destination or alternate airport. Satisfactory completion of all line items is required to pass the unit.",
      "source_page": 55
    },
    {
      "module_number": 29,
      "stage_number": 2,
      "module_type": "XC - Flight",
      "duration": "4.5 hours",
      "lesson_objective": "This session will reinforce IFR departure, en route, and arrival procedures while emphasizing proactive aircraft management. Learners will be encouraged to anticipate and plan pilot actions for each phase of the flight to stay ahead of the aircraft. Additionally, the session will provide further exposure to partial panel flight and enroute emergency scenarios. The flight will satisfy cross-country requirements outlined in Appendix C to Part 141, covering a minimum distance of 250 nm along airways or ATC-directed routing, with at least one segment spanning 100 nm between airports featuring instrument approaches. Three different types of approaches utilizing navigation systems will be conducted during the flight.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 2
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 2
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 2
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 2
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 2
        },
        {
          "position": 6,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 2
        },
        {
          "position": 7,
          "text": "Runway Incursion Avoidance",
          "minimum_score": 2
        },
        {
          "position": 8,
          "text": "Before Takeoff Check",
          "minimum_score": 2
        },
        {
          "position": 9,
          "text": "Weather Information",
          "minimum_score": 3
        },
        {
          "position": 10,
          "text": "Cross-Country Procedures",
          "minimum_score": 3
        },
        {
          "position": 11,
          "text": "Departure, En Route and Arrival Operations",
          "minimum_score": 3
        },
        {
          "position": 12,
          "text": "Loss of Communications",
          "minimum_score": 2
        },
        {
          "position": 13,
          "text": "Instrument Approach 1",
          "minimum_score": 2
        },
        {
          "position": 14,
          "text": "Instrument Approach 2",
          "minimum_score": 2
        },
        {
          "position": 15,
          "text": "Instrument Approach 3",
          "minimum_score": 2
        },
        {
          "position": 16,
          "text": "Missed Approach",
          "minimum_score": 2
        },
        {
          "position": 17,
          "text": "Approach with Loss of Primary Flight Instrument Indicators",
          "minimum_score": 2
        },
        {
          "position": 18,
          "text": "Emergency Procedures",
          "minimum_score": 2
        },
        {
          "position": 19,
          "text": "Checking Instruments and Equipment",
          "minimum_score": 2
        },
        {
          "position": 20,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 2
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner effectively selects, tunes, identifies, and confirms the operational status of navigation equipment for both en-route and approach phases. They demonstrate promptness in copying and interpreting ATC clearances, seeking clarification or changes when necessary. Utilizing current navigation publications and appropriate communication frequencies, the learner accurately files a flight plan reflecting proposed flight conditions. They adeptly intercept all courses, radials, and bearings pertinent to the procedure, route, or clearance. Furthermore, all approaches are executed in accordance with the standards outlined in the Instrument Rating - Airplane ACS. Satisfactory completion of the unit requires the learner to achieve the specified minimum score for all line items.",
      "source_page": 56
    },
    {
      "module_number": 30,
      "stage_number": 2,
      "module_type": "Oral",
      "duration": "2.0 hours",
      "lesson_objective": "This unit will provide a comprehensive review in preparation for the Instrument Rating practical test. Addressing any previously demonstrated weak areas, the learner will undergo a thorough review to ensure readiness for the check ride. All questions and concerns will be addressed to bolster confidence and proficiency before advancing to the next unit.",
      "line_items": [
        {
          "position": 1,
          "text": "Weather Information",
          "minimum_score": 2
        },
        {
          "position": 2,
          "text": "Pilot Qualifications",
          "minimum_score": 2
        },
        {
          "position": 3,
          "text": "Cross-Country Flight Planning",
          "minimum_score": 2
        },
        {
          "position": 4,
          "text": "Airplane Systems Related to IFR Operations",
          "minimum_score": 2
        },
        {
          "position": 5,
          "text": "Airplane Flight Instruments and Navigation Equipment",
          "minimum_score": 2
        },
        {
          "position": 6,
          "text": "Loss of Communications",
          "minimum_score": 2
        },
        {
          "position": 7,
          "text": "FAR’s Pertaining to IFR",
          "minimum_score": 2
        },
        {
          "position": 8,
          "text": "Any Previously Demonstrated Weak Areas",
          "minimum_score": 2
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner must exhibit a proficient understanding of all elements outlined in preparation for the Instrument Rating practical test, ensuring readiness for examination. Satisfactory completion of the unit requires achieving the specified minimum score for all line items.",
      "source_page": 57
    },
    {
      "module_number": 31,
      "stage_number": 2,
      "module_type": "Flight",
      "duration": "2.0 hours",
      "lesson_objective": "The learner must demonstrate comprehensive readiness for the Instrument Airplane Rating Practical Test, ensuring adherence to the standards specified for each maneuver outlined in the Instrument Rating, Airplane Airman Certification Standards.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 2
        },
        {
          "position": 2,
          "text": "Flight Deck Management",
          "minimum_score": 2
        },
        {
          "position": 3,
          "text": "Checklist Usage",
          "minimum_score": 2
        },
        {
          "position": 4,
          "text": "Engine Starting",
          "minimum_score": 2
        },
        {
          "position": 5,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 2
        },
        {
          "position": 6,
          "text": "Runway Incursion Avoidance",
          "minimum_score": 2
        },
        {
          "position": 7,
          "text": "Before Takeoff Check",
          "minimum_score": 2
        },
        {
          "position": 8,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 2
        },
        {
          "position": 9,
          "text": "Weather",
          "minimum_score": 2
        },
        {
          "position": 10,
          "text": "IFR Flight Plan",
          "minimum_score": 2
        },
        {
          "position": 11,
          "text": "Recovery From Unusual Flight Attitudes",
          "minimum_score": 2
        },
        {
          "position": 12,
          "text": "Holding Procedures",
          "minimum_score": 2
        },
        {
          "position": 13,
          "text": "Intercepting and Tracking Navigational Systems and Arcs",
          "minimum_score": 2
        },
        {
          "position": 14,
          "text": "Precision Approach",
          "minimum_score": 2
        },
        {
          "position": 15,
          "text": "Nonprecision Approach",
          "minimum_score": 2
        },
        {
          "position": 16,
          "text": "Circling Approach",
          "minimum_score": 2
        },
        {
          "position": 17,
          "text": "Missed Approach",
          "minimum_score": 2
        },
        {
          "position": 18,
          "text": "Emergency Procedures",
          "minimum_score": 2
        },
        {
          "position": 19,
          "text": "Approach with Loss of Primary Flight Instrument Indicators",
          "minimum_score": 2
        },
        {
          "position": 20,
          "text": "Landing from an Instrument Approach",
          "minimum_score": 2
        },
        {
          "position": 21,
          "text": "Checking Instruments and Equipment",
          "minimum_score": 2
        },
        {
          "position": 22,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 2
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner must demonstrate proficiency in each task outlined in the Instrument Rating - Airplane ACS for single-engine airplanes. To satisfactorily complete the unit, the learner must achieve the specified minimum score for all line items.",
      "source_page": 58
    },
    {
      "module_number": 32,
      "stage_number": 2,
      "module_type": "Oral - EOCO",
      "duration": "2.0 hours",
      "lesson_objective": "To evaluate the learner's eligibility and proficiency based on the established standards of knowledge, risk management, and skill outlined in the Instrument Rating Airman Certification Standards, using a Plan of Action conducted by the Chief Instructor, Assistant Chief Instructor, or an Authorized Check Instructors.",
      "line_items": [
        {
          "position": 1,
          "text": "Pilot Qualifications",
          "minimum_score": 2
        },
        {
          "position": 2,
          "text": "Weather Information",
          "minimum_score": 2
        },
        {
          "position": 3,
          "text": "Cross-Country Flight Planning",
          "minimum_score": 2
        },
        {
          "position": 4,
          "text": "Airplane Systems Related to IFR Operations",
          "minimum_score": 2
        },
        {
          "position": 5,
          "text": "Airplane Flight Instruments and Navigation Equipment",
          "minimum_score": 2
        },
        {
          "position": 6,
          "text": "Loss of Communications",
          "minimum_score": 2
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner must achieve the specified minimum score for all line items outlined in the current FAA Instrument Rating Airman Certification Standards to satisfactorily complete the unit. Additionally, the learner's actions during the practical test will be evaluated in accordance with ACS Appendix 6, ensuring that students relate to the completion standards and prioritize flight safety.",
      "source_page": 59
    },
    {
      "module_number": 33,
      "stage_number": 2,
      "module_type": "Flight - EOCF",
      "duration": "2.0 hours",
      "lesson_objective": "To evaluate the learner's eligibility and proficiency based on the established standards of knowledge, risk management, and skill outlined in the Instrument Rating Airman Certification Standards, using a Plan of Action conducted by the Chief Instructor, Assistant Chief Instructor, or an Authorized Check Instructor.",
      "line_items": [
        {
          "position": 1,
          "text": "Preflight Preparation",
          "minimum_score": 2
        },
        {
          "position": 2,
          "text": "Instrument Flight Deck Check",
          "minimum_score": 2
        },
        {
          "position": 3,
          "text": "Compliance with Air Traffic Control Clearances",
          "minimum_score": 2
        },
        {
          "position": 4,
          "text": "Departure, En Route, and Arrival Operations",
          "minimum_score": 2
        },
        {
          "position": 5,
          "text": "IFR Flight Plan",
          "minimum_score": 2
        },
        {
          "position": 6,
          "text": "Weather",
          "minimum_score": 2
        },
        {
          "position": 7,
          "text": "Recovery from Unusual Flight Attitudes",
          "minimum_score": 2
        },
        {
          "position": 8,
          "text": "Holding Procedures",
          "minimum_score": 2
        },
        {
          "position": 9,
          "text": "Instrument Flight",
          "minimum_score": 2
        },
        {
          "position": 10,
          "text": "Intercepting and Tracking Navigational Systems and Arcs",
          "minimum_score": 2
        },
        {
          "position": 11,
          "text": "Non-Precision Approach (with Procedure Turn)",
          "minimum_score": 2
        },
        {
          "position": 12,
          "text": "Precision Approach",
          "minimum_score": 2
        },
        {
          "position": 13,
          "text": "Missed Approach",
          "minimum_score": 2
        },
        {
          "position": 14,
          "text": "Circling Approach",
          "minimum_score": 2
        },
        {
          "position": 15,
          "text": "Approach with Loss of Primary Flight Instrument Indicators",
          "minimum_score": 2
        },
        {
          "position": 16,
          "text": "Landing from an Instrument Approach",
          "minimum_score": 2
        },
        {
          "position": 17,
          "text": "Checking Instruments and Equipment",
          "minimum_score": 2
        },
        {
          "position": 18,
          "text": "Single-Pilot Resource Management",
          "minimum_score": 2
        }
      ],
      "study_material": "C172 Checklist, and C172 Maneuvers Standardization Manual, Instrument Flying Handbook.",
      "completion_standards": "The learner must achieve the specified minimum score for all line items outlined in the current FAA Instrument Rating Airman Certification Standards to satisfactorily complete the unit. Additionally, the learner's actions during the practical test will be evaluated in accordance with ACS Appendix 6, ensuring that students relate to the completion standards and prioritize flight safety.",
      "source_page": 60
    }
  ]
}$usats_course$::jsonb);

with payload as (
  select value from usats_course_import
)
insert into public.training_courses (
  stable_key, provider_name, title, revision_label, source_file_name, status
)
select
  value->>'course_key', value->>'provider_name', value->>'course_title', value->>'revision',
  'Instrument Rating TCO no eta.pdf', 'published'
from payload
on conflict (stable_key) do update set
  provider_name = excluded.provider_name,
  title = excluded.title,
  revision_label = excluded.revision_label,
  source_file_name = excluded.source_file_name,
  status = excluded.status,
  updated_at = timezone('utc', now());

with payload as (
  select value from usats_course_import
), course as (
  select id from public.training_courses
  where stable_key = 'usats.instrument-rating-airplane-single-engine-land.rev-0'
)
insert into public.training_course_modules (
  course_id, stage_number, module_number, module_type, duration_label,
  duration_hours, lesson_objective, study_material, completion_standards, source_page
)
select
  course.id,
  (module->>'stage_number')::smallint,
  (module->>'module_number')::smallint,
  module->>'module_type',
  module->>'duration',
  regexp_replace(module->>'duration', '[^0-9.]', '', 'g')::numeric,
  module->>'lesson_objective',
  module->>'study_material',
  module->>'completion_standards',
  (module->>'source_page')::integer
from payload
cross join course
cross join lateral jsonb_array_elements(payload.value->'modules') module
on conflict (course_id, module_number) do update set
  stage_number = excluded.stage_number,
  module_type = excluded.module_type,
  duration_label = excluded.duration_label,
  duration_hours = excluded.duration_hours,
  lesson_objective = excluded.lesson_objective,
  study_material = excluded.study_material,
  completion_standards = excluded.completion_standards,
  source_page = excluded.source_page,
  updated_at = timezone('utc', now());

with payload as (
  select value from usats_course_import
), course as (
  select id from public.training_courses
  where stable_key = 'usats.instrument-rating-airplane-single-engine-land.rev-0'
), source_items as (
  select
    (module->>'module_number')::smallint as module_number,
    (item->>'position')::smallint as position,
    item->>'text' as item_text,
    (item->>'minimum_score')::smallint as minimum_score
  from payload
  cross join lateral jsonb_array_elements(payload.value->'modules') module
  cross join lateral jsonb_array_elements(module->'line_items') item
)
insert into public.training_module_line_items (
  module_id, position, item_text, minimum_score
)
select module.id, source.position, source.item_text, source.minimum_score
from source_items source
cross join course
join public.training_course_modules module
  on module.course_id = course.id and module.module_number = source.module_number
on conflict (module_id, position) do update set
  item_text = excluded.item_text,
  minimum_score = excluded.minimum_score,
  updated_at = timezone('utc', now());

insert into public.organization_training_courses (organization_id, course_id)
select organization.id, course.id
from public.organizations organization
cross join public.training_courses course
where course.stable_key = 'usats.instrument-rating-airplane-single-engine-land.rev-0'
  and regexp_replace(lower(organization.name), '[^a-z0-9]+', '', 'g') in (
    'usaviationtrainingsolutions',
    'usaviationtrainingsolutionsinc',
    'usats'
  )
on conflict (organization_id, course_id) do update set
  enabled = true,
  updated_at = timezone('utc', now());

drop table usats_course_import;

create or replace function public.list_organization_training_courses(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  result jsonb;
begin
  if caller is null or not (
    private.is_platform_admin(caller)
    or private.is_organization_member(p_organization_id, caller)
  ) then
    raise exception 'Organization membership is required.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', course.id,
      'stable_key', course.stable_key,
      'provider_name', course.provider_name,
      'title', course.title,
      'revision_label', course.revision_label,
      'source_file_name', course.source_file_name,
      'modules', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', module.id,
            'stage_number', module.stage_number,
            'module_number', module.module_number,
            'module_type', module.module_type,
            'duration_label', module.duration_label,
            'duration_hours', module.duration_hours,
            'lesson_objective', module.lesson_objective,
            'study_material', module.study_material,
            'completion_standards', module.completion_standards,
            'source_page', module.source_page,
            'line_items', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', item.id,
                  'position', item.position,
                  'text', item.item_text,
                  'minimum_score', item.minimum_score
                ) order by item.position
              )
              from public.training_module_line_items item
              where item.module_id = module.id
            ), '[]'::jsonb)
          ) order by module.stage_number, module.module_number
        )
        from public.training_course_modules module
        where module.course_id = course.id
      ), '[]'::jsonb)
    ) order by course.title
  ), '[]'::jsonb)
  into result
  from public.organization_training_courses assignment
  join public.training_courses course on course.id = assignment.course_id
  where assignment.organization_id = p_organization_id
    and assignment.enabled
    and course.status = 'published';

  return result;
end;
$$;

revoke all on function public.list_organization_training_courses(uuid) from public, anon;
grant execute on function public.list_organization_training_courses(uuid) to authenticated;
