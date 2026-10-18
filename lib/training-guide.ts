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

export type StudentTrainingSubjectAccess = {
  subject: TrainingSubject;
  access_state: "scheduled" | "completed";
  next_scheduled_at: string | null;
  last_flown_at: string | null;
};

export type TrainingResource = {
  title: string;
  url: string;
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
  updated_at?: string;
};

export type StudentTrainingSubjectNote = {
  id: string;
  organization_id: string | null;
  subject_id: string;
  instructor_user_id: string;
  student_user_id: string;
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

export async function fetchMyTrainingGuideSubjects(organizationId: string) {
  if (!organizationId) return [] as StudentTrainingSubjectAccess[];
  const { data, error } = await getSupabaseClient().rpc(
    "list_my_training_guide_subjects",
    { p_organization_id: organizationId },
  );
  if (error) throw error;
  return (Array.isArray(data) ? data : []).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (!record.subject || typeof record.subject !== "object") return [];
    return [
      {
        subject: normalizeSubject(record.subject as Record<string, unknown>),
        access_state:
          record.access_state === "completed" ? "completed" : "scheduled",
        next_scheduled_at:
          typeof record.next_scheduled_at === "string"
            ? record.next_scheduled_at
            : null,
        last_flown_at:
          typeof record.last_flown_at === "string"
            ? record.last_flown_at
            : null,
      } satisfies StudentTrainingSubjectAccess,
    ];
  });
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
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    organization_id:
      typeof row.organization_id === "string" ? row.organization_id : null,
    instructor_user_id: String(row.instructor_user_id),
    subject_id: String(row.subject_id),
    explanation: String(row.explanation ?? ""),
    key_points: Array.isArray(row.key_points) ? row.key_points.map(String) : [],
    resources: normalizeResources(row.resources),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
  }));
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
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id ?? ""),
    organization_id: String(row.organization_id ?? "") || null,
    instructor_user_id: String(row.instructor_user_id ?? ""),
    instructor_name: String(row.instructor_name ?? "Instructor"),
    subject_id: String(row.subject_id ?? ""),
    explanation: String(row.explanation ?? ""),
    key_points: Array.isArray(row.key_points)
      ? row.key_points.map((point) => String(point))
      : [],
    resources: normalizeResources(row.resources),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
  })) satisfies InstructorTrainingGuide[];
}

export async function saveStudentTrainingSubjectNote(
  input: Omit<StudentTrainingSubjectNote, "id" | "updated_at"> & {
    id?: string;
  },
) {
  const payload = {
    organization_id: input.organization_id,
    subject_id: input.subject_id,
    instructor_user_id: input.instructor_user_id,
    student_user_id: input.student_user_id,
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
