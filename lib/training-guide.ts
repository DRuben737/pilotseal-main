import { getSupabaseClient } from "@/lib/supabase";

export type TrainingStandardGroup = "knowledge" | "risk_management" | "skills";

export type TrainingStandardItem = {
  code: string;
  text: string;
};

export type TrainingSubjectComponent = {
  key: string;
  title: string;
};

export type TrainingStudyGuide = {
  what: string;
  why: string;
  how: string[];
  proficiency: string;
};

export type TrainingSubjectReference = {
  id?: string;
  subject_id?: string;
  title: string;
  document_number: string;
  chapter: string;
  page_label: string;
  source_url: string;
  sort_order: number;
  verified_at: string | null;
};

export type TrainingSubject = {
  id: string;
  stable_key: string;
  certificate_code: string;
  area_code: string;
  area_title: string;
  task_code: string;
  title: string;
  acs_document: string;
  acs_version: string;
  effective_date: string | null;
  source_url: string;
  components: TrainingSubjectComponent[];
  study_guide: TrainingStudyGuide;
  standards: Record<TrainingStandardGroup, TrainingStandardItem[]>;
  status: "draft" | "published" | "retired";
  sort_order: number;
  references: TrainingSubjectReference[];
  created_at?: string;
  updated_at?: string;
};

export type TrainingResource = {
  title: string;
  url: string;
};

export type TrainingGuideStep = {
  id: string;
  title: string;
  prepare: string;
  method: string;
  focus_questions: string[];
  expected_result: string;
  component_keys: string[];
  resources: TrainingResource[];
};

export type TrainingGuideProgress = {
  current_step_id: string | null;
  completed_step_ids: string[];
  last_opened_at: string | null;
  updated_at: string | null;
};

export type StudentTrainingGuideModule = {
  access_id: string;
  instructor_user_id: string;
  instructor_name: string;
  organization_id: string | null;
  last_assigned_at: string;
  guide?: InstructorTrainingGuide;
  progress?: TrainingGuideProgress;
};

export type OrganizationTrainingGuide = {
  organization_id: string;
  subject_id: string;
  enabled: boolean;
  guidance: string;
  resources: TrainingResource[];
  updated_at?: string;
};

export type InstructorTrainingGuide = {
  id: string;
  organization_id: string | null;
  instructor_user_id: string;
  instructor_name?: string;
  subject_id: string;
  explanation: string;
  key_points: string[];
  resources: TrainingResource[];
  steps: TrainingGuideStep[];
  updated_at?: string;
};

export type OrganizationTrainingManeuverGuide = {
  id?: string;
  organization_id: string;
  subject_id: string;
  component_key: string;
  title: string;
  revision_label: string;
  source_name: string;
  source_pages: string;
  applicable_aircraft: string[];
  setup_items: string[];
  fly_items: string[];
  exit_items: string[];
  callouts: string[];
  enabled: boolean;
  updated_at?: string;
};

export type InstructorTrainingManeuverOverride = {
  id?: string;
  organization_id: string;
  instructor_user_id: string;
  subject_id: string;
  component_key: string;
  setup_notes: string[];
  fly_notes: string[];
  exit_notes: string[];
  callouts: string[];
  resources: TrainingResource[];
  updated_at?: string;
};

export type StudentTrainingSubjectNote = {
  id: string;
  organization_id: string | null;
  subject_id: string;
  instructor_user_id: string;
  student_user_id: string;
  step_id: string | null;
  body: string;
  updated_at: string;
};

export type CommunityTrainingNote = {
  id: string;
  component_key: string | null;
  body: string;
  status: "active" | "reported" | "hidden";
  author_user_id: string;
  author_name: string;
  is_mine: boolean;
  created_at: string;
  updated_at: string;
};

export type ScheduleTrainingSubject = {
  subject_id: string;
  organization_id: string | null;
  position: number;
  personal_note: string;
  subject_snapshot?: TrainingSubject | null;
  organization_guide_snapshot?: Partial<OrganizationTrainingGuide> | null;
  instructor_guide_snapshot?:
    (Partial<InstructorTrainingGuide> & { instructor_name?: string }) | null;
};

export type StudentTrainingSubjectAccess = {
  subject: TrainingSubject;
  instructor_modules: StudentTrainingGuideModule[];
};

export type StudentTrainingGuideSubject = StudentTrainingSubjectAccess;

export type TrainingModuleLineItem = {
  id: string;
  position: number;
  text: string;
  minimum_score: number;
};

export type TrainingCourseModule = {
  id: string;
  stage_number: number;
  module_number: number;
  module_type: string;
  duration_label: string;
  duration_hours: number;
  lesson_objective: string;
  study_material: string;
  completion_standards: string;
  source_page: number;
  line_items: TrainingModuleLineItem[];
};

export type TrainingCourse = {
  id: string;
  stable_key: string;
  provider_name: string;
  title: string;
  revision_label: string;
  source_file_name: string;
  modules: TrainingCourseModule[];
};

export type ScheduleTrainingCourse = TrainingCourse & {
  organization_id: string;
  organization_name: string;
};

export type ScheduleTrainingCourseModule = {
  course_module_id: string;
  organization_id: string;
  position: number;
  personal_note: string;
  module_snapshot?: {
    course: Omit<TrainingCourse, "modules">;
    module: TrainingCourseModule;
  } | null;
};

const emptyStandards: TrainingSubject["standards"] = {
  knowledge: [],
  risk_management: [],
  skills: [],
};

function normalizeResources(value: unknown): TrainingResource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = String(record.title ?? "").trim();
    const url = String(record.url ?? "").trim();
    return title && /^https:\/\//i.test(url) ? [{ title, url }] : [];
  });
}

function normalizeSteps(value: unknown): TrainingGuideStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id = String(record.id ?? `step-${index + 1}`).trim();
    const title = String(record.title ?? "").trim();
    if (!id || !title) return [];
    return [
      {
        id,
        title,
        prepare: String(record.prepare ?? ""),
        method: String(record.method ?? ""),
        focus_questions: Array.isArray(record.focus_questions)
          ? record.focus_questions.map(String).filter(Boolean)
          : [],
        expected_result: String(record.expected_result ?? ""),
        component_keys: Array.isArray(record.component_keys)
          ? record.component_keys.map(String).filter(Boolean)
          : [],
        resources: normalizeResources(record.resources),
      },
    ];
  });
}

function normalizeInstructorGuide(
  row: Record<string, unknown>,
): InstructorTrainingGuide {
  return {
    id: String(row.id ?? ""),
    organization_id:
      typeof row.organization_id === "string" ? row.organization_id : null,
    instructor_user_id: String(row.instructor_user_id ?? ""),
    instructor_name:
      typeof row.instructor_name === "string" ? row.instructor_name : undefined,
    subject_id: String(row.subject_id ?? ""),
    explanation: String(row.explanation ?? ""),
    key_points: Array.isArray(row.key_points) ? row.key_points.map(String) : [],
    resources: normalizeResources(row.resources),
    steps: normalizeSteps(row.steps),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

function normalizeTextArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function normalizeTrainingCourse(value: unknown): TrainingCourse | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const modules = Array.isArray(row.modules)
    ? row.modules.flatMap((moduleValue) => {
        if (!moduleValue || typeof moduleValue !== "object") return [];
        const courseModule = moduleValue as Record<string, unknown>;
        const lineItems = Array.isArray(courseModule.line_items)
          ? courseModule.line_items.flatMap((itemValue) => {
              if (!itemValue || typeof itemValue !== "object") return [];
              const item = itemValue as Record<string, unknown>;
              return [
                {
                  id: String(item.id ?? ""),
                  position: Number(item.position ?? 0),
                  text: String(item.text ?? ""),
                  minimum_score: Number(item.minimum_score ?? 0),
                },
              ];
            })
          : [];
        return [
          {
            id: String(courseModule.id ?? ""),
            stage_number: Number(courseModule.stage_number ?? 0),
            module_number: Number(courseModule.module_number ?? 0),
            module_type: String(courseModule.module_type ?? ""),
            duration_label: String(courseModule.duration_label ?? ""),
            duration_hours: Number(courseModule.duration_hours ?? 0),
            lesson_objective: String(courseModule.lesson_objective ?? ""),
            study_material: String(courseModule.study_material ?? ""),
            completion_standards: String(
              courseModule.completion_standards ?? "",
            ),
            source_page: Number(courseModule.source_page ?? 0),
            line_items: lineItems.sort((a, b) => a.position - b.position),
          },
        ];
      })
    : [];
  return {
    id: String(row.id ?? ""),
    stable_key: String(row.stable_key ?? ""),
    provider_name: String(row.provider_name ?? ""),
    title: String(row.title ?? ""),
    revision_label: String(row.revision_label ?? ""),
    source_file_name: String(row.source_file_name ?? ""),
    modules: modules.sort(
      (a, b) =>
        a.stage_number - b.stage_number || a.module_number - b.module_number,
    ),
  };
}

function normalizeOrganizationManeuverGuide(
  row: Record<string, unknown>,
): OrganizationTrainingManeuverGuide {
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    organization_id: String(row.organization_id ?? ""),
    subject_id: String(row.subject_id ?? ""),
    component_key: String(row.component_key ?? ""),
    title: String(row.title ?? ""),
    revision_label: String(row.revision_label ?? ""),
    source_name: String(row.source_name ?? ""),
    source_pages: String(row.source_pages ?? ""),
    applicable_aircraft: normalizeTextArray(row.applicable_aircraft),
    setup_items: normalizeTextArray(row.setup_items),
    fly_items: normalizeTextArray(row.fly_items),
    exit_items: normalizeTextArray(row.exit_items),
    callouts: normalizeTextArray(row.callouts),
    enabled: row.enabled !== false,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

function normalizeInstructorManeuverOverride(
  row: Record<string, unknown>,
): InstructorTrainingManeuverOverride {
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    organization_id: String(row.organization_id ?? ""),
    instructor_user_id: String(row.instructor_user_id ?? ""),
    subject_id: String(row.subject_id ?? ""),
    component_key: String(row.component_key ?? ""),
    setup_notes: normalizeTextArray(row.setup_notes),
    fly_notes: normalizeTextArray(row.fly_notes),
    exit_notes: normalizeTextArray(row.exit_notes),
    callouts: normalizeTextArray(row.callouts),
    resources: normalizeResources(row.resources),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

function normalizeStudentModule(
  value: unknown,
  subjectId: string,
): StudentTrainingGuideModule | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const rawGuide =
    row.guide && typeof row.guide === "object"
      ? (row.guide as Record<string, unknown>)
      : null;
  const rawProgress =
    row.progress && typeof row.progress === "object"
      ? (row.progress as Record<string, unknown>)
      : null;
  return {
    access_id: String(row.access_id ?? ""),
    instructor_user_id: String(row.instructor_user_id ?? ""),
    instructor_name: String(row.instructor_name ?? "Instructor"),
    organization_id:
      typeof row.organization_id === "string" ? row.organization_id : null,
    last_assigned_at: String(row.last_assigned_at ?? ""),
    guide: rawGuide
      ? normalizeInstructorGuide({ ...rawGuide, subject_id: subjectId })
      : undefined,
    progress: rawProgress
      ? {
          current_step_id:
            typeof rawProgress.current_step_id === "string"
              ? rawProgress.current_step_id
              : null,
          completed_step_ids: Array.isArray(rawProgress.completed_step_ids)
            ? rawProgress.completed_step_ids.map(String)
            : [],
          last_opened_at:
            typeof rawProgress.last_opened_at === "string"
              ? rawProgress.last_opened_at
              : null,
          updated_at:
            typeof rawProgress.updated_at === "string"
              ? rawProgress.updated_at
              : null,
        }
      : undefined,
  };
}

function normalizeSubject(
  row: Record<string, unknown>,
  references: TrainingSubjectReference[] = [],
): TrainingSubject {
  const rawStandards =
    row.standards && typeof row.standards === "object"
      ? (row.standards as Partial<TrainingSubject["standards"]>)
      : {};
  const rawStudyGuide =
    row.study_guide && typeof row.study_guide === "object"
      ? (row.study_guide as Partial<TrainingStudyGuide>)
      : {};
  return {
    id: String(row.id ?? ""),
    stable_key: String(row.stable_key ?? ""),
    certificate_code: String(row.certificate_code ?? ""),
    area_code: String(row.area_code ?? ""),
    area_title: String(row.area_title ?? ""),
    task_code: String(row.task_code ?? ""),
    title: String(row.title ?? ""),
    acs_document: String(row.acs_document ?? ""),
    acs_version: String(row.acs_version ?? ""),
    effective_date:
      typeof row.effective_date === "string" ? row.effective_date : null,
    source_url: String(row.source_url ?? ""),
    components: Array.isArray(row.components)
      ? (row.components as TrainingSubjectComponent[])
      : [],
    study_guide: {
      what: String(rawStudyGuide.what ?? ""),
      why: String(rawStudyGuide.why ?? ""),
      how: Array.isArray(rawStudyGuide.how)
        ? rawStudyGuide.how.map((item) => String(item)).filter(Boolean)
        : [],
      proficiency: String(rawStudyGuide.proficiency ?? ""),
    },
    standards: {
      knowledge: Array.isArray(rawStandards.knowledge)
        ? rawStandards.knowledge
        : emptyStandards.knowledge,
      risk_management: Array.isArray(rawStandards.risk_management)
        ? rawStandards.risk_management
        : emptyStandards.risk_management,
      skills: Array.isArray(rawStandards.skills)
        ? rawStandards.skills
        : emptyStandards.skills,
    },
    status:
      row.status === "draft" || row.status === "retired"
        ? row.status
        : "published",
    sort_order: Number(row.sort_order ?? 0),
    references,
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

export async function fetchMyTrainingGuideSubjects(organizationId?: string) {
  const { data, error } = await getSupabaseClient().rpc(
    "list_my_training_guide_subjects",
    { p_organization_id: organizationId || null },
  );
  if (error) throw error;
  return (Array.isArray(data) ? data : []).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (!record.subject || typeof record.subject !== "object") return [];
    const subject = normalizeSubject(record.subject as Record<string, unknown>);
    const modules = Array.isArray(record.instructor_modules)
      ? record.instructor_modules
          .map((module) => normalizeStudentModule(module, subject.id))
          .filter((module): module is StudentTrainingGuideModule => Boolean(module))
      : [];
    return [{ subject, instructor_modules: modules }];
  });
}

export async function fetchMyTrainingGuideSubject(subjectId: string) {
  const { data, error } = await getSupabaseClient().rpc(
    "get_my_training_guide_subject",
    { p_subject_id: subjectId },
  );
  if (error) throw error;
  if (!data || typeof data !== "object")
    throw new Error("Training subject is unavailable.");
  const record = data as Record<string, unknown>;
  if (!record.subject || typeof record.subject !== "object")
    throw new Error("Training subject is unavailable.");
  const subject = normalizeSubject(record.subject as Record<string, unknown>);
  const modules = Array.isArray(record.instructor_modules)
    ? record.instructor_modules
        .map((module) => normalizeStudentModule(module, subject.id))
        .filter((module): module is StudentTrainingGuideModule => Boolean(module))
    : [];
  return { subject, instructor_modules: modules } satisfies StudentTrainingGuideSubject;
}

export async function saveMyTrainingGuideProgress(input: {
  moduleAccessId: string;
  currentStepId: string | null;
  completedStepIds: string[];
}) {
  const { error } = await getSupabaseClient().rpc(
    "save_my_training_guide_progress",
    {
      p_module_access_id: input.moduleAccessId,
      p_current_step_id: input.currentStepId,
      p_completed_step_ids: input.completedStepIds,
    },
  );
  if (error) throw error;
}

export async function fetchTrainingSubjects(
  options: { includeUnpublished?: boolean } = {},
) {
  const supabase = getSupabaseClient();
  let subjectQuery = supabase
    .from("training_subjects")
    .select("*")
    .order("certificate_code")
    .order("area_code")
    .order("sort_order")
    .order("title");
  if (!options.includeUnpublished)
    subjectQuery = subjectQuery.eq("status", "published");
  const [subjectResult, referenceResult] = await Promise.all([
    subjectQuery,
    supabase
      .from("training_subject_references")
      .select("*")
      .order("sort_order")
      .order("title"),
  ]);
  if (subjectResult.error) throw subjectResult.error;
  if (referenceResult.error) throw referenceResult.error;
  const references = (referenceResult.data ?? []) as TrainingSubjectReference[];
  return ((subjectResult.data ?? []) as Record<string, unknown>[]).map((row) =>
    normalizeSubject(
      row,
      references.filter((reference) => reference.subject_id === row.id),
    ),
  );
}

export async function saveTrainingSubject(
  subject: Omit<TrainingSubject, "references">,
  references: TrainingSubjectReference[],
) {
  const { data, error } = await getSupabaseClient().rpc(
    "save_training_subject",
    {
      p_subject: {
        ...subject,
        components: subject.components,
        standards: subject.standards,
      },
    },
  );
  if (error) throw error;
  const subjectId = String(data);
  const { error: referenceError } = await getSupabaseClient().rpc(
    "replace_training_subject_references",
    {
      p_subject_id: subjectId,
      p_references: references.map((reference, index) => ({
        ...reference,
        sort_order: index * 10,
      })),
    },
  );
  if (referenceError) throw referenceError;
  return subjectId;
}

export async function fetchOrganizationTrainingGuides(organizationId: string) {
  if (!organizationId) return [] as OrganizationTrainingGuide[];
  const { data, error } = await getSupabaseClient()
    .from("organization_training_guides")
    .select("*")
    .eq("organization_id", organizationId);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    organization_id: String(row.organization_id),
    subject_id: String(row.subject_id),
    enabled: row.enabled !== false,
    guidance: String(row.guidance ?? ""),
    resources: normalizeResources(row.resources),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
  }));
}

export async function fetchOrganizationTrainingCourses(
  organizationId: string,
) {
  if (!organizationId) return [] as TrainingCourse[];
  const { data, error } = await getSupabaseClient().rpc(
    "list_organization_training_courses",
    { p_organization_id: organizationId },
  );
  if (error) throw error;
  if (!Array.isArray(data)) return [] as TrainingCourse[];
  return data.flatMap((value) => {
    const course = normalizeTrainingCourse(value);
    return course ? [course] : [];
  });
}

export async function fetchMyScheduleTrainingCourses() {
  const { data, error } = await getSupabaseClient().rpc(
    "list_my_schedule_training_courses",
  );
  if (error) throw error;
  if (!Array.isArray(data)) return [] as ScheduleTrainingCourse[];
  return data.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const course = normalizeTrainingCourse(row);
    return course
      ? [
          {
            ...course,
            organization_id: String(row.organization_id ?? ""),
            organization_name: String(row.organization_name ?? ""),
          },
        ]
      : [];
  });
}

export async function saveOrganizationTrainingGuide(
  input: OrganizationTrainingGuide,
) {
  const { error } = await getSupabaseClient()
    .from("organization_training_guides")
    .upsert(
      {
        organization_id: input.organization_id,
        subject_id: input.subject_id,
        enabled: input.enabled,
        guidance: input.guidance.trim(),
        resources: input.resources,
        updated_by:
          (await getSupabaseClient().auth.getUser()).data.user?.id ?? null,
      },
      { onConflict: "organization_id,subject_id" },
    );
  if (error) throw error;
}

export async function fetchMyInstructorTrainingGuides(
  userId: string,
  organizationId: string | null,
) {
  let query = getSupabaseClient()
    .from("instructor_training_guides")
    .select("*")
    .eq("instructor_user_id", userId);
  query = organizationId
    ? query.eq("organization_id", organizationId)
    : query.is("organization_id", null);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeInstructorGuide);
}

export async function saveInstructorTrainingGuide(
  input: InstructorTrainingGuide,
) {
  const payload = {
    organization_id: input.organization_id,
    instructor_user_id: input.instructor_user_id,
    subject_id: input.subject_id,
    explanation: input.explanation.trim(),
    key_points: input.key_points.map((point) => point.trim()).filter(Boolean),
    resources: input.resources,
    steps: input.steps,
  };
  const query = input.id
    ? getSupabaseClient()
        .from("instructor_training_guides")
        .update(payload)
        .eq("id", input.id)
    : getSupabaseClient().from("instructor_training_guides").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function fetchOrganizationTrainingManeuverGuides(
  organizationId: string,
  subjectId: string,
) {
  if (!organizationId || !subjectId)
    return [] as OrganizationTrainingManeuverGuide[];
  const { data, error } = await getSupabaseClient()
    .from("organization_training_maneuver_guides")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("subject_id", subjectId)
    .order("title");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(
    normalizeOrganizationManeuverGuide,
  );
}

export async function saveOrganizationTrainingManeuverGuide(
  input: OrganizationTrainingManeuverGuide,
) {
  const { error } = await getSupabaseClient()
    .from("organization_training_maneuver_guides")
    .upsert(
      {
        organization_id: input.organization_id,
        subject_id: input.subject_id,
        component_key: input.component_key,
        title: input.title.trim(),
        revision_label: input.revision_label.trim(),
        source_name: input.source_name.trim(),
        source_pages: input.source_pages.trim(),
        applicable_aircraft: input.applicable_aircraft,
        setup_items: input.setup_items,
        fly_items: input.fly_items,
        exit_items: input.exit_items,
        callouts: input.callouts,
        enabled: input.enabled,
        updated_by:
          (await getSupabaseClient().auth.getUser()).data.user?.id ?? null,
      },
      { onConflict: "organization_id,subject_id,component_key" },
    );
  if (error) throw error;
}

export async function fetchInstructorTrainingManeuverOverrides(
  organizationId: string,
  instructorUserId: string,
  subjectId: string,
) {
  if (!organizationId || !instructorUserId || !subjectId)
    return [] as InstructorTrainingManeuverOverride[];
  const { data, error } = await getSupabaseClient()
    .from("instructor_training_maneuver_overrides")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("instructor_user_id", instructorUserId)
    .eq("subject_id", subjectId)
    .order("component_key");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(
    normalizeInstructorManeuverOverride,
  );
}

export async function saveInstructorTrainingManeuverOverride(
  input: InstructorTrainingManeuverOverride,
) {
  const { error } = await getSupabaseClient()
    .from("instructor_training_maneuver_overrides")
    .upsert(
      {
        organization_id: input.organization_id,
        instructor_user_id: input.instructor_user_id,
        subject_id: input.subject_id,
        component_key: input.component_key,
        setup_notes: input.setup_notes,
        fly_notes: input.fly_notes,
        exit_notes: input.exit_notes,
        callouts: input.callouts,
        resources: input.resources,
      },
      {
        onConflict:
          "organization_id,instructor_user_id,subject_id,component_key",
      },
    );
  if (error) throw error;
}

export async function fetchStudentTrainingSubjectNotes(input: {
  subjectId: string;
  instructorUserId?: string;
  studentUserId?: string;
  organizationId: string | null;
}) {
  let query = getSupabaseClient()
    .from("student_training_subject_notes")
    .select("*")
    .eq("subject_id", input.subjectId);
  if (input.instructorUserId)
    query = query.eq("instructor_user_id", input.instructorUserId);
  if (input.studentUserId)
    query = query.eq("student_user_id", input.studentUserId);
  query = input.organizationId
    ? query.eq("organization_id", input.organizationId)
    : query.is("organization_id", null);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StudentTrainingSubjectNote[];
}

export async function fetchMyAssignedInstructorTrainingGuides(
  organizationId: string,
  subjectId: string,
) {
  const { data, error } = await getSupabaseClient().rpc(
    "list_my_instructor_training_guides",
    {
      p_organization_id: organizationId,
      p_subject_id: subjectId,
    },
  );
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(
    normalizeInstructorGuide,
  );
}

export async function saveStudentTrainingSubjectNote(
  input: Omit<StudentTrainingSubjectNote, "id" | "updated_at" | "step_id"> & {
    id?: string;
    step_id?: string | null;
  },
) {
  const payload = {
    organization_id: input.organization_id,
    subject_id: input.subject_id,
    instructor_user_id: input.instructor_user_id,
    student_user_id: input.student_user_id,
    step_id: input.step_id ?? null,
    body: input.body.trim(),
  };
  const query = input.id
    ? getSupabaseClient()
        .from("student_training_subject_notes")
        .update(payload)
        .eq("id", input.id)
    : getSupabaseClient()
        .from("student_training_subject_notes")
        .insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteStudentTrainingSubjectNote(id: string) {
  const { error } = await getSupabaseClient()
    .from("student_training_subject_notes")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function fetchCommunityTrainingNotes(
  organizationId: string,
  subjectId: string,
) {
  const { data, error } = await getSupabaseClient().rpc(
    "list_training_subject_notes",
    {
      p_organization_id: organizationId,
      p_subject_id: subjectId,
    },
  );
  if (error) throw error;
  return (data ?? []) as CommunityTrainingNote[];
}

export async function createCommunityTrainingNote(input: {
  organizationId: string;
  subjectId: string;
  componentKey: string;
  body: string;
}) {
  const { error } = await getSupabaseClient().rpc(
    "create_training_subject_note",
    {
      p_organization_id: input.organizationId,
      p_subject_id: input.subjectId,
      p_component_key: input.componentKey || null,
      p_body: input.body,
    },
  );
  if (error) throw error;
}

export async function updateCommunityTrainingNote(
  id: string,
  componentKey: string,
  body: string,
) {
  const { error } = await getSupabaseClient().rpc(
    "update_training_subject_note",
    {
      p_note_id: id,
      p_component_key: componentKey || null,
      p_body: body,
    },
  );
  if (error) throw error;
}

export async function deleteCommunityTrainingNote(id: string) {
  const { error } = await getSupabaseClient().rpc(
    "delete_training_subject_note",
    { p_note_id: id },
  );
  if (error) throw error;
}

export async function reportCommunityTrainingNote(id: string, reason: string) {
  const { error } = await getSupabaseClient().rpc(
    "report_training_subject_note",
    {
      p_note_id: id,
      p_reason: reason,
    },
  );
  if (error) throw error;
}

export async function moderateCommunityTrainingNote(id: string, hide: boolean) {
  const { error } = await getSupabaseClient().rpc(
    "moderate_training_subject_note",
    {
      p_note_id: id,
      p_hide: hide,
    },
  );
  if (error) throw error;
}

export async function fetchScheduleTrainingSubjects(
  rangeStart: Date,
  rangeEnd: Date,
  cfiUserId?: string,
) {
  const { data, error } = await getSupabaseClient().rpc(
    "list_my_schedule_training_subjects",
    {
      p_range_start: rangeStart.toISOString(),
      p_range_end: rangeEnd.toISOString(),
      p_cfi_id: cfiUserId ?? null,
    },
  );
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as Array<
    ScheduleTrainingSubject & { event_id: string }
  >;
}

export async function fetchScheduleTrainingCourseModules(
  rangeStart: Date,
  rangeEnd: Date,
  cfiUserId?: string,
) {
  const { data, error } = await getSupabaseClient().rpc(
    "list_my_schedule_training_course_modules",
    {
      p_range_start: rangeStart.toISOString(),
      p_range_end: rangeEnd.toISOString(),
      p_cfi_id: cfiUserId ?? null,
    },
  );
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as Array<
    ScheduleTrainingCourseModule & { event_id: string }
  >;
}
