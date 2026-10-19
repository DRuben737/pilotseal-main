"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  AdminNameList,
  CompactToolbar,
  DetailDrawer,
  ManagementDisclosure,
} from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  createCommunityTrainingNote,
  deleteCommunityTrainingNote,
  deleteStudentTrainingSubjectNote,
  fetchCommunityTrainingNotes,
  fetchMyTrainingGuideSubjects,
  fetchMyAssignedInstructorTrainingGuides,
  fetchMyInstructorTrainingGuides,
  fetchOrganizationTrainingGuides,
  fetchStudentTrainingSubjectNotes,
  fetchTrainingSubjects,
  moderateCommunityTrainingNote,
  reportCommunityTrainingNote,
  saveInstructorTrainingGuide,
  saveOrganizationTrainingGuide,
  saveStudentTrainingSubjectNote,
  saveTrainingSubject,
  updateCommunityTrainingNote,
  type CommunityTrainingNote,
  type InstructorTrainingGuide,
  type OrganizationTrainingGuide,
  type StudentTrainingSubjectNote,
  type StudentTrainingSubjectAccess,
  type TrainingResource,
  type TrainingStandardGroup,
  type TrainingStandardItem,
  type TrainingSubject,
  type TrainingSubjectReference,
} from "@/lib/training-guide";
import {
  fetchOrganizationStudents,
  type OrganizationStudent,
} from "@/lib/organizations";
import { fetchScheduleEligibility } from "@/lib/dashboard-preferences";

type Workspace = "personal" | "organization" | "platform";
type Drawer =
  | "subject"
  | "platform-editor"
  | "organization-editor"
  | "instructor-editor"
  | "student-note"
  | null;

const trainingCategoryLabels: Record<string, string> = {
  PVT: "Private Pilot",
  IR: "Instrument Rating",
  COM: "Commercial Pilot",
  CFI: "Flight Instructor",
  CFII: "Instrument Instructor",
  MULTI: "Multi-Engine",
  MEL: "Multi-Engine",
  "HIGH PERFORMANCE": "High Performance",
  COMPLEX: "Complex Airplane",
};

const blankSubject = (): TrainingSubject => ({
  id: "",
  stable_key: "",
  certificate_code: "PVT",
  area_code: "",
  area_title: "",
  task_code: "",
  title: "",
  acs_document: "FAA-S-ACS-6C",
  acs_version: "6C",
  effective_date: "",
  source_url: "https://www.faa.gov/training_testing/testing/acs",
  components: [],
  study_guide: { what: "", why: "", how: [], proficiency: "" },
  standards: { knowledge: [], risk_management: [], skills: [] },
  status: "draft",
  sort_order: 0,
  references: [],
});

type InstructorStepDraft = {
  id: string;
  title: string;
  prepare: string;
  method: string;
  focusQuestions: string;
  expectedResult: string;
  componentKeys: string[];
  resources: string;
};

function blankInstructorStep(): InstructorStepDraft {
  return {
    id: crypto.randomUUID(),
    title: "",
    prepare: "",
    method: "",
    focusQuestions: "",
    expectedResult: "",
    componentKeys: [],
    resources: "",
  };
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error)
    return String(error.message);
  return fallback;
}

function resourcesToText(resources: TrainingResource[]) {
  return resources
    .map((resource) => `${resource.title} | ${resource.url}`)
    .join("\n");
}

function parseResources(value: string) {
  return value.split("\n").flatMap((line) => {
    const separator = line.indexOf("|");
    if (separator < 0) return [];
    const title = line.slice(0, separator).trim();
    const url = line.slice(separator + 1).trim();
    return title && /^https:\/\//i.test(url) ? [{ title, url }] : [];
  });
}

function standardsToText(items: TrainingStandardItem[]) {
  return items.map((item) => `${item.code} | ${item.text}`).join("\n");
}

function parseStandards(value: string) {
  return value.split("\n").flatMap((line) => {
    const separator = line.indexOf("|");
    if (separator < 0) return [];
    const code = line.slice(0, separator).trim();
    const text = line.slice(separator + 1).trim();
    return code && text ? [{ code, text }] : [];
  });
}

function referencesToText(references: TrainingSubjectReference[]) {
  return references
    .map((reference) =>
      [
        reference.title,
        reference.document_number,
        reference.chapter,
        reference.page_label,
        reference.source_url,
      ].join(" | "),
    )
    .join("\n");
}

function parseReferences(value: string): TrainingSubjectReference[] {
  return value.split("\n").flatMap((line, index) => {
    const [title, documentNumber, chapter, pageLabel, url] = line
      .split("|")
      .map((part) => part.trim());
    if (!title || !/^https:\/\/(www\.)?faa\.gov\//i.test(url ?? "")) return [];
    return [
      {
        title,
        document_number: documentNumber ?? "",
        chapter: chapter ?? "",
        page_label: pageLabel ?? "",
        source_url: url,
        sort_order: index * 10,
        verified_at: new Date().toISOString().slice(0, 10),
      },
    ];
  });
}

function SubjectStandards({ subject }: { subject: TrainingSubject }) {
  const groups: Array<{ key: TrainingStandardGroup; label: string }> = [
    { key: "knowledge", label: "Knowledge" },
    { key: "risk_management", label: "Risk Management" },
    { key: "skills", label: "Skills" },
  ];
  return (
    <div className="grid gap-3">
      {groups.map((group) => (
        <section key={group.key} className="border border-slate-200 bg-white">
          <h3 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            {group.label}
          </h3>
          <div className="divide-y divide-slate-100">
            {!subject.standards[group.key].length ? (
              <p className="px-3 py-3 text-sm text-slate-500">
                No standards entered.
              </p>
            ) : (
              subject.standards[group.key].map((item) => (
                <div
                  key={item.code}
                  className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[7rem_1fr]"
                >
                  <strong className="font-mono text-xs text-slate-700">
                    {item.code}
                  </strong>
                  <span className="text-slate-700">{item.text}</span>
                </div>
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function ResourceLinks({ resources }: { resources: TrainingResource[] }) {
  if (!resources.length)
    return <p className="text-sm text-slate-500">No additional resources.</p>;
  return (
    <div className="divide-y divide-slate-100 border border-slate-200">
      {resources.map((resource) => (
        <a
          key={`${resource.title}-${resource.url}`}
          href={resource.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
        >
          <span>{resource.title}</span>
          <span aria-hidden="true">↗</span>
        </a>
      ))}
    </div>
  );
}

type CommunityForm = {
  id: string;
  componentKey: string;
  body: string;
};

const studySteps = [
  "What it is",
  "Why it matters",
  "How to prepare",
  "Knowledge",
  "Risk management",
  "Proficiency",
  "Reading",
  "Instructor briefing",
  "Student notes",
] as const;

function GuidedStudentStudy({
  subject,
  organizationGuide,
  instructorGuides,
  privateNotes,
  communityNotes,
  communityForm,
  setCommunityForm,
  saving,
  onSaveCommunityNote,
  onDeleteCommunityNote,
  onReportCommunityNote,
}: {
  subject: TrainingSubject;
  organizationGuide: OrganizationTrainingGuide | null;
  instructorGuides: InstructorTrainingGuide[];
  privateNotes: StudentTrainingSubjectNote[];
  communityNotes: CommunityTrainingNote[];
  communityForm: CommunityForm;
  setCommunityForm: Dispatch<SetStateAction<CommunityForm>>;
  saving: boolean;
  onSaveCommunityNote: () => void;
  onDeleteCommunityNote: (id: string) => void;
  onReportCommunityNote: (id: string) => void;
}) {
  const [step, setStep] = useState(0);

  const standards =
    step === 3
      ? subject.standards.knowledge
      : step === 4
        ? subject.standards.risk_management
        : subject.standards.skills;

  function move(next: number) {
    setStep(Math.max(0, Math.min(studySteps.length - 1, next)));
  }

  return (
    <div className="grid gap-5">
      <header className="border-b border-slate-200 pb-4">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
          <span>
            Step {step + 1} of {studySteps.length}
          </span>
          <span>{studySteps[step]}</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label="Study progress"
          aria-valuemin={1}
          aria-valuemax={studySteps.length}
          aria-valuenow={step + 1}
        >
          <div
            className="h-full rounded-full bg-blue-700 transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${((step + 1) / studySteps.length) * 100}%` }}
          />
        </div>
        <nav
          className="mt-3 flex gap-1 overflow-x-auto pb-1"
          aria-label="Study steps"
        >
          {studySteps.map((label, index) => (
            <button
              key={label}
              type="button"
              aria-current={step === index ? "step" : undefined}
              className={`min-h-9 shrink-0 cursor-pointer rounded-sm border px-2.5 text-xs font-semibold transition-colors duration-200 ${
                step === index
                  ? "border-blue-700 bg-blue-50 text-blue-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => setStep(index)}
            >
              {index + 1}. {label}
            </button>
          ))}
        </nav>
      </header>

      <div aria-live="polite">
        {step === 0 ? (
          <section aria-labelledby="study-orientation-title">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              What it is
            </p>
            <h2
              id="study-orientation-title"
              className="mt-1 text-xl font-semibold text-slate-950"
            >
              Understand the training subject
            </h2>
            <p className="mt-2 max-w-prose text-sm leading-6 text-slate-600">
              {subject.study_guide.what ||
                "A plain-language explanation has not been added yet."}
            </p>
            <ol className="mt-4 grid gap-2">
              {subject.components.map((component, index) => (
                <li
                  key={component.key}
                  className="flex items-center gap-3 border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <strong>{component.title}</strong>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {step === 1 ? (
          <section aria-labelledby="study-why-title">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Why it matters
            </p>
            <h2
              id="study-why-title"
              className="mt-1 text-xl font-semibold text-slate-950"
            >
              Connect it to real flying
            </h2>
            <p className="mt-3 max-w-prose text-sm leading-7 text-slate-700">
              {subject.study_guide.why ||
                "The purpose of this subject has not been added yet."}
            </p>
          </section>
        ) : null}

        {step === 2 ? (
          <section aria-labelledby="study-how-title">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              How to prepare
            </p>
            <h2
              id="study-how-title"
              className="mt-1 text-xl font-semibold text-slate-950"
            >
              Follow the preparation sequence
            </h2>
            <ol className="mt-4 grid gap-3">
              {subject.study_guide.how.length ? (
                subject.study_guide.how.map((item, index) => (
                  <li
                    key={`${index}-${item}`}
                    className="grid grid-cols-[2rem_1fr] gap-3 border-l-2 border-blue-700 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800"
                  >
                    <strong className="text-blue-800">{index + 1}</strong>
                    <span>{item}</span>
                  </li>
                ))
              ) : (
                <li className="text-sm text-slate-500">
                  No preparation sequence has been added yet.
                </li>
              )}
            </ol>
          </section>
        ) : null}

        {step >= 3 && step <= 5 ? (
          <section aria-labelledby="study-standard-title">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              ACS · {studySteps[step]}
            </p>
            <h2
              id="study-standard-title"
              className="mt-1 text-xl font-semibold text-slate-950"
            >
              {step === 3
                ? "What you need to understand"
                : step === 4
                  ? "What can go wrong"
                  : "What good performance looks like"}
            </h2>
            {step === 5 && subject.study_guide.proficiency ? (
              <p className="mt-2 max-w-prose text-sm leading-6 text-slate-700">
                {subject.study_guide.proficiency}
              </p>
            ) : null}
            <div className="mt-4 grid gap-3">
              {!standards.length ? (
                <p className="text-sm text-slate-500">
                  No standards have been entered for this step.
                </p>
              ) : (
                standards.map((item, index) => (
                  <article
                    key={item.code}
                    className="border-l-2 border-blue-700 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">
                        {index + 1} of {standards.length}
                      </span>
                      <strong className="font-mono text-xs text-blue-800">
                        {item.code}
                      </strong>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-800">
                      {item.text}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : null}

        {step === 6 ? (
          <section aria-labelledby="study-reading-title">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Assigned reading
            </p>
            <h2
              id="study-reading-title"
              className="mt-1 text-xl font-semibold text-slate-950"
            >
              Read from the official source
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use the chapter and page range below so you do not have to search
              through the entire handbook.
            </p>
            <div className="mt-4 divide-y divide-slate-100 border border-slate-200">
              {!subject.references.length ? (
                <p className="px-3 py-4 text-sm text-slate-500">
                  No assigned reading yet.
                </p>
              ) : (
                subject.references.map((reference) => (
                  <a
                    key={reference.id ?? reference.title}
                    href={reference.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block cursor-pointer px-4 py-3 transition-colors duration-200 hover:bg-blue-50"
                  >
                    <strong className="text-sm text-blue-800">
                      {reference.title}
                    </strong>
                    <span className="mt-1 block text-sm text-slate-600">
                      {[
                        reference.chapter,
                        reference.page_label && `pp. ${reference.page_label}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </a>
                ))
              )}
            </div>
            <a
              className="mt-3 inline-flex cursor-pointer text-sm font-semibold text-blue-700"
              href={subject.source_url}
              target="_blank"
              rel="noreferrer"
            >
              Open the official FAA ACS ↗
            </a>
          </section>
        ) : null}

        {step === 7 ? (
          <section aria-labelledby="study-briefing-title">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Your briefing
            </p>
            <h2
              id="study-briefing-title"
              className="mt-1 text-xl font-semibold text-slate-950"
            >
              What your instructors want you to notice
            </h2>
            <div className="mt-4 grid gap-4">
              {organizationGuide?.guidance ? (
                <article className="border border-slate-200 bg-slate-50 p-4">
                  <strong className="text-sm text-slate-950">
                    School guidance
                  </strong>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {organizationGuide.guidance}
                  </p>
                  <div className="mt-3">
                    <ResourceLinks resources={organizationGuide.resources} />
                  </div>
                </article>
              ) : null}
              {instructorGuides.map((guide) => (
                <article key={guide.id} className="border border-slate-200 p-4">
                  <strong className="text-sm text-slate-950">
                    {guide.instructor_name ?? "Instructor"}
                  </strong>
                </article>
              ))}
              {privateNotes.map((note) => (
                <article
                  key={note.id}
                  className="border-l-2 border-amber-500 bg-amber-50 px-4 py-3"
                >
                  <strong className="text-sm text-amber-950">For you</strong>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-amber-950">
                    {note.body}
                  </p>
                </article>
              ))}
              {!organizationGuide?.guidance &&
              !instructorGuides.length &&
              !privateNotes.length ? (
                <p className="text-sm text-slate-500">
                  No instructor briefing has been added yet.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 8 ? (
          <section aria-labelledby="study-notes-title">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Learn from recent experience
            </p>
            <h2
              id="study-notes-title"
              className="mt-1 text-xl font-semibold text-slate-950"
            >
              Notes from other students
            </h2>
            <div className="mt-4 grid gap-2">
              <select
                className="h-10 rounded-sm border border-slate-300 px-2 text-sm"
                aria-label="Maneuver tag"
                value={communityForm.componentKey}
                onChange={(event) =>
                  setCommunityForm((current) => ({
                    ...current,
                    componentKey: event.target.value,
                  }))
                }
              >
                <option value="">Whole subject</option>
                {subject.components.map((component) => (
                  <option key={component.key} value={component.key}>
                    {component.title}
                  </option>
                ))}
              </select>
              <textarea
                rows={3}
                maxLength={2000}
                aria-label="Your student note"
                className="rounded-sm border border-slate-300 p-3 text-sm"
                placeholder="Share something that may help the next student"
                value={communityForm.body}
                onChange={(event) =>
                  setCommunityForm((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
              />
              <div className="flex justify-end gap-2">
                {communityForm.id ? (
                  <button
                    type="button"
                    className="ghost-button cursor-pointer"
                    onClick={() =>
                      setCommunityForm({ id: "", componentKey: "", body: "" })
                    }
                  >
                    Cancel edit
                  </button>
                ) : null}
                <button
                  type="button"
                  className="primary-button cursor-pointer"
                  disabled={saving || !communityForm.body.trim()}
                  onClick={onSaveCommunityNote}
                >
                  {communityForm.id ? "Save note" : "Post note"}
                </button>
              </div>
            </div>
            <div className="mt-5 divide-y divide-slate-100 border border-slate-200">
              {!communityNotes.length ? (
                <p className="px-3 py-4 text-sm text-slate-500">
                  No student notes yet.
                </p>
              ) : (
                communityNotes.map((note) => (
                  <article key={note.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>
                        {note.author_name}
                        {note.component_key
                          ? ` · ${subject.components.find((item) => item.key === note.component_key)?.title ?? note.component_key}`
                          : ""}
                      </span>
                      <span>
                        {new Intl.DateTimeFormat(undefined, {
                          month: "short",
                          day: "numeric",
                        }).format(new Date(note.created_at))}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {note.body}
                    </p>
                    <div className="mt-2 flex gap-3">
                      {note.is_mine ? (
                        <>
                          <button
                            type="button"
                            className="cursor-pointer text-xs font-semibold text-blue-700"
                            onClick={() =>
                              setCommunityForm({
                                id: note.id,
                                componentKey: note.component_key ?? "",
                                body: note.body,
                              })
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="cursor-pointer text-xs font-semibold text-rose-700"
                            onClick={() => onDeleteCommunityNote(note.id)}
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="cursor-pointer text-xs font-semibold text-slate-600"
                          onClick={() => onReportCommunityNote(note.id)}
                        >
                          Report
                        </button>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : null}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          className="ghost-button cursor-pointer"
          disabled={step === 0}
          onClick={() => move(step - 1)}
        >
          Back
        </button>
        {step < studySteps.length - 1 ? (
          <button
            type="button"
            className="primary-button cursor-pointer"
            onClick={() => move(step + 1)}
          >
            Continue to {studySteps[step + 1]}
          </button>
        ) : (
          <button
            type="button"
            className="secondary-button cursor-pointer"
            onClick={() => move(0)}
          >
            Review again
          </button>
        )}
      </footer>
    </div>
  );
}

export default function TrainingGuideManager({
  workspace,
}: {
  workspace: Workspace;
}) {
  const { session } = useAuthSession();
  const { activeOrganization, activeOrganizationId } = useOrganization();
  const userId = session?.user?.id ?? "";
  const organizationId = activeOrganizationId || "";
  const isInstructor = activeOrganization?.teaching_role === "instructor";
  const isStudent = activeOrganization?.teaching_role === "student";
  const [canInstruct, setCanInstruct] = useState(false);
  const canAuthorGuide =
    workspace === "personal" ? canInstruct : Boolean(isInstructor);
  const canManageOrganization =
    activeOrganization?.member_role === "owner" ||
    activeOrganization?.member_role === "organization_admin" ||
    activeOrganization?.member_role === "platform_admin";
  const [subjects, setSubjects] = useState<TrainingSubject[]>([]);
  const [studentSubjectAccess, setStudentSubjectAccess] = useState<
    StudentTrainingSubjectAccess[]
  >([]);
  const [organizationGuides, setOrganizationGuides] = useState<
    OrganizationTrainingGuide[]
  >([]);
  const [instructorGuides, setInstructorGuides] = useState<
    InstructorTrainingGuide[]
  >([]);
  const [assignedInstructorGuides, setAssignedInstructorGuides] = useState<
    InstructorTrainingGuide[]
  >([]);
  const [organizationStudents, setOrganizationStudents] = useState<
    OrganizationStudent[]
  >([]);
  const [communityNotes, setCommunityNotes] = useState<CommunityTrainingNote[]>(
    [],
  );
  const [studentNotes, setStudentNotes] = useState<
    StudentTrainingSubjectNote[]
  >([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [personalMode, setPersonalMode] = useState<"study" | "instructor">(
    "study",
  );
  const [query, setQuery] = useState("");
  const [certificate, setCertificate] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [subjectForm, setSubjectForm] = useState(blankSubject());
  const [componentText, setComponentText] = useState("");
  const [studyHowText, setStudyHowText] = useState("");
  const [standardText, setStandardText] = useState<
    Record<TrainingStandardGroup, string>
  >({ knowledge: "", risk_management: "", skills: "" });
  const [referenceText, setReferenceText] = useState("");
  const [organizationForm, setOrganizationForm] = useState({
    enabled: true,
    guidance: "",
    resources: "",
  });
  const [instructorForm, setInstructorForm] = useState({
    id: "",
    explanation: "",
    keyPoints: "",
    resources: "",
    steps: [] as InstructorStepDraft[],
  });
  const [communityForm, setCommunityForm] = useState({
    id: "",
    componentKey: "",
    body: "",
  });
  const [studentNoteForm, setStudentNoteForm] = useState({
    id: "",
    studentUserId: "",
    stepId: "",
    body: "",
  });

  const selectedSubject =
    subjects.find((subject) => subject.id === selectedSubjectId) ?? null;
  const selectedOrganizationGuide =
    organizationGuides.find(
      (guide) => guide.subject_id === selectedSubjectId,
    ) ?? null;
  const selectedInstructorGuide =
    instructorGuides.find((guide) => guide.subject_id === selectedSubjectId) ??
    null;
  const instructorGuideOrganizationId =
    workspace === "organization" ? organizationId || null : null;
  const isStudentStudy = Boolean(
    workspace === "personal" &&
    personalMode === "study" &&
    (isStudent || studentSubjectAccess.length > 0),
  );
  const visibleSubjects = useMemo(
    () =>
      isStudentStudy
        ? studentSubjectAccess.map((access) => access.subject)
        : subjects,
    [isStudentStudy, studentSubjectAccess, subjects],
  );
  const certificates = useMemo(
    () =>
      Array.from(
        new Set(visibleSubjects.map((subject) => subject.certificate_code)),
      ).sort(),
    [visibleSubjects],
  );
  const filteredSubjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return visibleSubjects
      .filter(
        (subject) =>
          certificate === "all" || subject.certificate_code === certificate,
      )
      .filter(
        (subject) =>
          !normalized ||
          [
            subject.title,
            subject.task_code,
            subject.area_title,
            subject.acs_document,
          ].some((value) => value.toLowerCase().includes(normalized)),
      );
  }, [certificate, query, visibleSubjects]);
  const groupedSubjects = useMemo(() => {
    const groups = new Map<string, TrainingSubject[]>();
    for (const subject of filteredSubjects) {
      const current = groups.get(subject.certificate_code) ?? [];
      current.push(subject);
      groups.set(subject.certificate_code, current);
    }
    return Array.from(groups.entries());
  }, [filteredSubjects]);

  async function reload() {
    if (!userId) return;
    const includeUnpublished = workspace === "platform";
    const [
      nextSubjects,
      nextOrganizationGuides,
      nextInstructorGuides,
      nextStudents,
      nextStudentSubjectAccess,
      eligibility,
    ] = await Promise.all([
      fetchTrainingSubjects({ includeUnpublished }),
      organizationId
        ? fetchOrganizationTrainingGuides(organizationId)
        : Promise.resolve([]),
      fetchMyInstructorTrainingGuides(userId, instructorGuideOrganizationId),
      organizationId && isInstructor
        ? fetchOrganizationStudents(organizationId)
        : Promise.resolve([]),
      workspace === "personal"
        ? fetchMyTrainingGuideSubjects(organizationId)
        : Promise.resolve([]),
      fetchScheduleEligibility(),
    ]);
    setSubjects(nextSubjects);
    setOrganizationGuides(nextOrganizationGuides);
    setInstructorGuides(nextInstructorGuides);
    setOrganizationStudents(nextStudents);
    setStudentSubjectAccess(nextStudentSubjectAccess);
    setCanInstruct(eligibility.can_instruct);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStatus("");
    reload()
      .catch((error) => {
        if (!cancelled)
          setStatus(errorMessage(error, "Unable to load Training Guide."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // reload is intentionally scoped to identity and organization changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstructor, organizationId, userId, workspace]);

  async function loadSubjectNotes(subjectId: string) {
    if (!organizationId) {
      setCommunityNotes([]);
      setStudentNotes([]);
      setAssignedInstructorGuides([]);
      return;
    }
    const [nextCommunityNotes, nextStudentNotes, nextAssignedInstructorGuides] =
      await Promise.all([
        fetchCommunityTrainingNotes(organizationId, subjectId),
        isInstructor
          ? fetchStudentTrainingSubjectNotes({
              subjectId,
              instructorUserId: userId,
              organizationId,
            })
          : isStudent
            ? fetchStudentTrainingSubjectNotes({
                subjectId,
                studentUserId: userId,
                organizationId,
              })
            : Promise.resolve([]),
        isStudent
          ? fetchMyAssignedInstructorTrainingGuides(organizationId, subjectId)
          : Promise.resolve([]),
      ]);
    setCommunityNotes(nextCommunityNotes);
    setStudentNotes(nextStudentNotes);
    setAssignedInstructorGuides(nextAssignedInstructorGuides);
  }

  async function openSubject(subject: TrainingSubject) {
    setSelectedSubjectId(subject.id);
    setDrawer("subject");
    setStatus("");
    await loadSubjectNotes(subject.id).catch((error) =>
      setStatus(errorMessage(error, "Unable to load subject notes.")),
    );
  }

  function openPlatformEditor(subject?: TrainingSubject) {
    const next = subject ?? blankSubject();
    setSubjectForm({
      ...next,
      components: [...next.components],
      standards: { ...next.standards },
      references: [...next.references],
    });
    setComponentText(
      next.components.map((component) => component.title).join("\n"),
    );
    setStudyHowText(next.study_guide.how.join("\n"));
    setStandardText({
      knowledge: standardsToText(next.standards.knowledge),
      risk_management: standardsToText(next.standards.risk_management),
      skills: standardsToText(next.standards.skills),
    });
    setReferenceText(referencesToText(next.references));
    setDrawer("platform-editor");
  }

  function openOrganizationEditor() {
    setOrganizationForm({
      enabled: selectedOrganizationGuide?.enabled ?? true,
      guidance: selectedOrganizationGuide?.guidance ?? "",
      resources: resourcesToText(selectedOrganizationGuide?.resources ?? []),
    });
    setDrawer("organization-editor");
  }

  function openInstructorEditor() {
    setInstructorForm({
      id: selectedInstructorGuide?.id ?? "",
      explanation: selectedInstructorGuide?.explanation ?? "",
      keyPoints: selectedInstructorGuide?.key_points.join("\n") ?? "",
      resources: resourcesToText(selectedInstructorGuide?.resources ?? []),
      steps: (selectedInstructorGuide?.steps ?? []).map((step) => ({
        id: step.id,
        title: step.title,
        prepare: step.prepare,
        method: step.method,
        focusQuestions: step.focus_questions.join("\n"),
        expectedResult: step.expected_result,
        componentKeys: [...step.component_keys],
        resources: resourcesToText(step.resources),
      })),
    });
    setDrawer("instructor-editor");
  }

  async function handleSaveSubject() {
    setSaving(true);
    setStatus("");
    try {
      const components = componentText
        .split("\n")
        .map((title) => title.trim())
        .filter(Boolean)
        .map((title) => ({
          key: title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
          title,
        }));
      const subject = {
        ...subjectForm,
        components,
        study_guide: {
          ...subjectForm.study_guide,
          how: studyHowText
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        },
        standards: {
          knowledge: parseStandards(standardText.knowledge),
          risk_management: parseStandards(standardText.risk_management),
          skills: parseStandards(standardText.skills),
        },
      };
      const id = await saveTrainingSubject(
        subject,
        parseReferences(referenceText),
      );
      await reload();
      setSelectedSubjectId(id);
      setDrawer("subject");
      setStatus("Training subject saved.");
    } catch (error) {
      setStatus(errorMessage(error, "Unable to save this subject."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveOrganizationGuide() {
    if (!selectedSubject || !organizationId) return;
    setSaving(true);
    setStatus("");
    try {
      await saveOrganizationTrainingGuide({
        organization_id: organizationId,
        subject_id: selectedSubject.id,
        enabled: organizationForm.enabled,
        guidance: organizationForm.guidance,
        resources: parseResources(organizationForm.resources),
      });
      await reload();
      setDrawer("subject");
      setStatus("Organization guidance saved.");
    } catch (error) {
      setStatus(errorMessage(error, "Unable to save organization guidance."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveInstructorGuide() {
    if (!selectedSubject || !userId) return;
    setSaving(true);
    setStatus("");
    try {
      if (!instructorForm.steps.length)
        throw new Error("Add at least one guide page.");
      if (
        instructorForm.steps.some(
          (step) =>
            !step.title.trim() ||
            !step.prepare.trim(),
        )
      )
        throw new Error(
          "Each guide page needs a title and opening passage.",
        );
      await saveInstructorTrainingGuide({
        id: instructorForm.id,
        organization_id: instructorGuideOrganizationId,
        instructor_user_id: userId,
        subject_id: selectedSubject.id,
        explanation: instructorForm.explanation,
        key_points: instructorForm.keyPoints.split("\n"),
        resources: parseResources(instructorForm.resources),
        steps: instructorForm.steps.map((step) => ({
          id: step.id,
          title: step.title.trim(),
          prepare: step.prepare.trim(),
          method: step.method.trim(),
          focus_questions: step.focusQuestions
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          expected_result: step.expectedResult.trim(),
          component_keys: step.componentKeys,
          resources: parseResources(step.resources),
        })),
      });
      await reload();
      setDrawer("subject");
      setStatus("Instructor guidance saved.");
    } catch (error) {
      setStatus(errorMessage(error, "Unable to save instructor guidance."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCommunityNote() {
    if (!selectedSubject || !organizationId || !communityForm.body.trim())
      return;
    setSaving(true);
    setStatus("");
    try {
      if (communityForm.id)
        await updateCommunityTrainingNote(
          communityForm.id,
          communityForm.componentKey,
          communityForm.body,
        );
      else
        await createCommunityTrainingNote({
          organizationId,
          subjectId: selectedSubject.id,
          componentKey: communityForm.componentKey,
          body: communityForm.body,
        });
      setCommunityForm({ id: "", componentKey: "", body: "" });
      await loadSubjectNotes(selectedSubject.id);
      setStatus("Student note saved.");
    } catch (error) {
      setStatus(errorMessage(error, "Unable to save this note."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveStudentNote() {
    if (
      !selectedSubject ||
      !studentNoteForm.studentUserId ||
      !studentNoteForm.body.trim()
    )
      return;
    setSaving(true);
    setStatus("");
    try {
      await saveStudentTrainingSubjectNote({
        id: studentNoteForm.id || undefined,
        organization_id: organizationId || null,
        subject_id: selectedSubject.id,
        instructor_user_id: userId,
        student_user_id: studentNoteForm.studentUserId,
        step_id: studentNoteForm.stepId || null,
        body: studentNoteForm.body,
      });
      await loadSubjectNotes(selectedSubject.id);
      setDrawer("subject");
      setStatus("Student-specific note saved.");
    } catch (error) {
      setStatus(errorMessage(error, "Unable to save this student note."));
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="panel-card p-6 text-sm text-slate-600">
        Loading Training Guide…
      </div>
    );

  const workspaceLabel =
    workspace === "platform"
      ? "Platform subjects"
      : workspace === "organization"
        ? "Organization guidance"
        : "Training Guide";
  const canEditOrganization =
    workspace === "organization" && canManageOrganization;

  return (
    <>
      <ManagementDisclosure
        id={`training-guide-${workspace}`}
        title={workspaceLabel}
        summary={`${filteredSubjects.length}`}
      >
        <CompactToolbar
          actions={
            workspace === "platform" ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => openPlatformEditor()}
              >
                Add subject
              </button>
            ) : workspace === "personal" && canInstruct && isStudent ? (
              <div
                className="flex rounded-sm border border-slate-300 bg-white p-0.5"
                role="group"
                aria-label="Training Guide mode"
              >
                <button
                  type="button"
                  aria-pressed={personalMode === "study"}
                  className={`min-h-8 cursor-pointer rounded-sm px-2.5 text-xs font-semibold transition-colors duration-200 ${
                    personalMode === "study"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                  onClick={() => setPersonalMode("study")}
                >
                  Study
                </button>
                <button
                  type="button"
                  aria-pressed={personalMode === "instructor"}
                  className={`min-h-8 cursor-pointer rounded-sm px-2.5 text-xs font-semibold transition-colors duration-200 ${
                    personalMode === "instructor"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                  onClick={() => setPersonalMode("instructor")}
                >
                  Instructor tools
                </button>
              </div>
            ) : undefined
          }
        >
          <select
            aria-label="Certificate"
            className="h-9 rounded-sm border border-slate-300 bg-white px-2 text-[13px]"
            value={certificate}
            onChange={(event) => setCertificate(event.target.value)}
          >
            <option value="all">All certificates</option>
            {certificates.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            type="search"
            aria-label="Search training subjects"
            className="console-compact-search h-9 rounded-sm border border-slate-300 px-3 text-[13px]"
            placeholder="Search subjects or ACS codes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </CompactToolbar>
        {status ? (
          <p
            role="status"
            className="border-b border-slate-200 px-3 py-2 text-sm text-slate-600"
          >
            {status}
          </p>
        ) : null}
        {isStudentStudy ? (
          <div aria-label="Training subjects" className="grid gap-5 p-3">
            {!groupedSubjects.length ? (
              <div className="border border-dashed border-slate-300 px-4 py-6 text-center">
                <p className="text-sm font-semibold text-slate-800">
                  No subjects are available yet
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  A subject appears here after it is added to a published lesson.
                </p>
              </div>
            ) : (
              groupedSubjects.map(([code, categorySubjects]) => (
                <section
                  key={code}
                  aria-labelledby={`training-category-${code}`}
                >
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <h2
                      id={`training-category-${code}`}
                      className="text-sm font-semibold text-slate-950"
                    >
                      {trainingCategoryLabels[code] ?? code}
                    </h2>
                    <span className="text-xs font-semibold text-slate-500">
                      {code}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-200 border border-slate-200 bg-white">
                    {categorySubjects.map((subject) => (
                        <Link
                          key={subject.id}
                          className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left transition-colors duration-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700"
                          href={`/console/personal/training-guide/${subject.id}`}
                        >
                          <span>
                            <strong className="block text-sm text-slate-900">
                              {subject.title}
                            </strong>
                          </span>
                          <span aria-hidden="true" className="text-blue-700">→</span>
                        </Link>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        ) : (
          <AdminNameList
            label="Training subjects"
            emptyLabel="No training subjects match."
            items={filteredSubjects.map((subject) => ({
              id: subject.id,
              name: `${subject.certificate_code} · ${subject.title}`,
            }))}
            onSelect={(item) => {
              const subject = filteredSubjects.find(
                (candidate) => candidate.id === item.id,
              );
              if (subject) void openSubject(subject);
            }}
          />
        )}
      </ManagementDisclosure>

      <DetailDrawer
        compact
        open={
          !isStudentStudy && drawer === "subject" && Boolean(selectedSubject)
        }
        onClose={() => setDrawer(null)}
        title={selectedSubject?.title ?? "Training subject"}
        description={
          selectedSubject
            ? `${selectedSubject.certificate_code} · ${selectedSubject.task_code} · ${selectedSubject.acs_document}`
            : undefined
        }
      >
        {selectedSubject ? (
          isStudentStudy ? (
            <GuidedStudentStudy
              key={selectedSubject.id}
              subject={selectedSubject}
              organizationGuide={selectedOrganizationGuide}
              instructorGuides={assignedInstructorGuides}
              privateNotes={studentNotes}
              communityNotes={communityNotes}
              communityForm={communityForm}
              setCommunityForm={setCommunityForm}
              saving={saving}
              onSaveCommunityNote={() => void handleSaveCommunityNote()}
              onDeleteCommunityNote={(id) => {
                void deleteCommunityTrainingNote(id)
                  .then(() => loadSubjectNotes(selectedSubject.id))
                  .catch((error) =>
                    setStatus(
                      errorMessage(error, "Unable to delete this note."),
                    ),
                  );
              }}
              onReportCommunityNote={(id) => {
                const reason = window.prompt("Reason for reporting this note");
                if (!reason) return;
                void reportCommunityTrainingNote(id, reason)
                  .then(() => loadSubjectNotes(selectedSubject.id))
                  .catch((error) =>
                    setStatus(
                      errorMessage(error, "Unable to report this note."),
                    ),
                  );
              }}
            />
          ) : (
            <div className="grid gap-5">
              {status ? (
                <p role="status" className="text-sm text-slate-600">
                  {status}
                </p>
              ) : null}
              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-950">
                    ACS Standards
                  </h2>
                  {workspace === "platform" ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => openPlatformEditor(selectedSubject)}
                    >
                      Edit subject
                    </button>
                  ) : null}
                </div>
                {selectedSubject.components.length ? (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {selectedSubject.components.map((component) => (
                      <span
                        key={component.key}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                      >
                        {component.title}
                      </span>
                    ))}
                  </div>
                ) : null}
                <SubjectStandards subject={selectedSubject} />
                <a
                  className="mt-3 inline-flex text-sm font-semibold text-blue-700"
                  href={selectedSubject.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open FAA ACS ↗
                </a>
              </section>

              <section>
                <h2 className="mb-2 text-sm font-semibold text-slate-950">
                  Official References
                </h2>
                <div className="divide-y divide-slate-100 border border-slate-200">
                  {!selectedSubject.references.length ? (
                    <p className="px-3 py-3 text-sm text-slate-500">
                      No references entered.
                    </p>
                  ) : (
                    selectedSubject.references.map((reference) => (
                      <a
                        key={reference.id ?? reference.title}
                        href={reference.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="grid gap-1 px-3 py-2 text-sm hover:bg-blue-50 sm:grid-cols-[1fr_auto]"
                      >
                        <strong className="text-blue-700">
                          {reference.title}
                        </strong>
                        <span className="text-slate-600">
                          {[
                            reference.chapter,
                            reference.page_label &&
                              `pp. ${reference.page_label}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="text-xs text-slate-500 sm:col-span-2">
                          {reference.document_number}
                        </span>
                      </a>
                    ))
                  )}
                </div>
              </section>

              {organizationId ? (
                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-950">
                      Organization Guidance
                    </h2>
                    {canEditOrganization ? (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={openOrganizationEditor}
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                  {selectedOrganizationGuide?.guidance ? (
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {selectedOrganizationGuide.guidance}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500">
                      No organization guidance.
                    </p>
                  )}
                  <div className="mt-2">
                    <ResourceLinks
                      resources={selectedOrganizationGuide?.resources ?? []}
                    />
                  </div>
                </section>
              ) : null}

              {workspace === "personal" && canAuthorGuide ? (
                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-950">
                      My Guidance
                    </h2>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={openInstructorEditor}
                    >
                      {selectedInstructorGuide ? "Edit" : "Add"}
                    </button>
                  </div>
                  {selectedInstructorGuide?.steps.length ? (
                    <ol className="mt-3 divide-y divide-slate-100 border border-slate-200 bg-white">
                      {selectedInstructorGuide.steps.map((step, index) => (
                        <li key={step.id} className="flex min-h-9 items-center gap-3 px-3 py-2 text-sm text-slate-800">
                          <span className="font-semibold text-slate-500">{index + 1}</span>
                          <span>{step.title}</span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </section>
              ) : null}

              {workspace === "personal" && isStudent && organizationId ? (
                <section>
                  <h2 className="mb-2 text-sm font-semibold text-slate-950">
                    Instructor Guidance
                  </h2>
                  {!assignedInstructorGuides.length ? (
                    <p className="text-sm text-slate-500">
                      No guidance has been shared by your assigned instructors.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200">
                      {assignedInstructorGuides.map((guide) => (
                        <article key={guide.id} className="px-3 py-3">
                          <strong className="text-sm text-slate-900">
                            {guide.instructor_name ?? "Instructor"}
                          </strong>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}

              {workspace === "personal" && isStudent && organizationId ? (
                <section>
                  <h2 className="mb-2 text-sm font-semibold text-slate-950">
                    Notes for You
                  </h2>
                  {!studentNotes.length ? (
                    <p className="text-sm text-slate-500">
                      No private notes for this subject.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200">
                      {studentNotes.map((note) => (
                        <article key={note.id} className="px-3 py-3">
                          <strong className="text-sm text-slate-900">
                            {assignedInstructorGuides.find(
                              (guide) =>
                                guide.instructor_user_id ===
                                note.instructor_user_id,
                            )?.instructor_name ?? "Instructor note"}
                          </strong>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {note.body}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}

              {workspace === "personal" && isInstructor && organizationId ? (
                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-950">
                      Student-specific Notes
                    </h2>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setStudentNoteForm({
                          id: "",
                          studentUserId:
                            organizationStudents[0]?.student_user_id ?? "",
                          stepId: "",
                          body: "",
                        });
                        setDrawer("student-note");
                      }}
                    >
                      Add note
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200">
                    {!studentNotes.length ? (
                      <p className="px-3 py-3 text-sm text-slate-500">
                        No student-specific notes.
                      </p>
                    ) : (
                      studentNotes.map((note) => (
                        <div
                          key={note.id}
                          className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <div>
                            <strong>
                              {organizationStudents.find(
                                (student) =>
                                  student.student_user_id ===
                                  note.student_user_id,
                              )?.account_nickname ?? "Student"}
                            </strong>
                            <p className="mt-1 whitespace-pre-wrap text-slate-700">
                              {note.body}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="text-xs font-semibold text-blue-700"
                              onClick={() => {
                                setStudentNoteForm({
                                  id: note.id,
                                  studentUserId: note.student_user_id,
                                  stepId: note.step_id ?? "",
                                  body: note.body,
                                });
                                setDrawer("student-note");
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-xs font-semibold text-rose-700"
                              onClick={() => {
                                void deleteStudentTrainingSubjectNote(note.id)
                                  .then(() =>
                                    loadSubjectNotes(selectedSubject.id),
                                  )
                                  .catch((error) =>
                                    setStatus(
                                      errorMessage(
                                        error,
                                        "Unable to delete this note.",
                                      ),
                                    ),
                                  );
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              ) : null}

              {organizationId ? (
                <section>
                  <h2 className="mb-2 text-sm font-semibold text-slate-950">
                    Student Notes
                  </h2>
                  {activeOrganization?.teaching_role === "student" ? (
                    <div className="mb-3 grid gap-2">
                      <select
                        className="h-9 rounded-sm border border-slate-300 px-2 text-sm"
                        aria-label="Maneuver tag"
                        value={communityForm.componentKey}
                        onChange={(event) =>
                          setCommunityForm((current) => ({
                            ...current,
                            componentKey: event.target.value,
                          }))
                        }
                      >
                        <option value="">Whole subject</option>
                        {selectedSubject.components.map((component) => (
                          <option key={component.key} value={component.key}>
                            {component.title}
                          </option>
                        ))}
                      </select>
                      <textarea
                        rows={3}
                        maxLength={2000}
                        className="rounded-sm border border-slate-300 p-2 text-sm"
                        placeholder="Add a note"
                        value={communityForm.body}
                        onChange={(event) =>
                          setCommunityForm((current) => ({
                            ...current,
                            body: event.target.value,
                          }))
                        }
                      />
                      <div className="flex justify-end gap-2">
                        {communityForm.id ? (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() =>
                              setCommunityForm({
                                id: "",
                                componentKey: "",
                                body: "",
                              })
                            }
                          >
                            Cancel edit
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="primary-button"
                          disabled={saving || !communityForm.body.trim()}
                          onClick={() => void handleSaveCommunityNote()}
                        >
                          {communityForm.id ? "Save note" : "Post note"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="divide-y divide-slate-100 border border-slate-200">
                    {!communityNotes.length ? (
                      <p className="px-3 py-3 text-sm text-slate-500">
                        No student notes yet.
                      </p>
                    ) : (
                      communityNotes.map((note) => (
                        <article key={note.id} className="px-3 py-3">
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                            <span>
                              {note.author_name}
                              {note.component_key
                                ? ` · ${selectedSubject.components.find((item) => item.key === note.component_key)?.title ?? note.component_key}`
                                : ""}
                            </span>
                            <span>
                              {new Intl.DateTimeFormat(undefined, {
                                month: "short",
                                day: "numeric",
                              }).format(new Date(note.created_at))}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                            {note.body}
                          </p>
                          <div className="mt-2 flex gap-3">
                            {note.is_mine ? (
                              <>
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-blue-700"
                                  onClick={() =>
                                    setCommunityForm({
                                      id: note.id,
                                      componentKey: note.component_key ?? "",
                                      body: note.body,
                                    })
                                  }
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-rose-700"
                                  onClick={() => {
                                    void deleteCommunityTrainingNote(
                                      note.id,
                                    ).then(() =>
                                      loadSubjectNotes(selectedSubject.id),
                                    );
                                  }}
                                >
                                  Delete
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="text-xs font-semibold text-slate-600"
                                onClick={() => {
                                  const reason = window.prompt(
                                    "Reason for reporting this note",
                                  );
                                  if (reason)
                                    void reportCommunityTrainingNote(
                                      note.id,
                                      reason,
                                    )
                                      .then(() =>
                                        loadSubjectNotes(selectedSubject.id),
                                      )
                                      .catch((error) =>
                                        setStatus(
                                          errorMessage(
                                            error,
                                            "Unable to report this note.",
                                          ),
                                        ),
                                      );
                                }}
                              >
                                Report
                              </button>
                            )}
                            {canManageOrganization &&
                            note.status !== "hidden" ? (
                              <button
                                type="button"
                                className="text-xs font-semibold text-rose-700"
                                onClick={() => {
                                  void moderateCommunityTrainingNote(
                                    note.id,
                                    true,
                                  ).then(() =>
                                    loadSubjectNotes(selectedSubject.id),
                                  );
                                }}
                              >
                                Hide
                              </button>
                            ) : null}
                            {canManageOrganization &&
                            note.status === "hidden" ? (
                              <button
                                type="button"
                                className="text-xs font-semibold text-blue-700"
                                onClick={() => {
                                  void moderateCommunityTrainingNote(
                                    note.id,
                                    false,
                                  ).then(() =>
                                    loadSubjectNotes(selectedSubject.id),
                                  );
                                }}
                              >
                                Restore
                              </button>
                            ) : null}
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              ) : null}
            </div>
          )
        ) : null}
      </DetailDrawer>

      <DetailDrawer
        compact
        open={drawer === "platform-editor"}
        onClose={() => setDrawer(selectedSubject ? "subject" : null)}
        title={
          subjectForm.id ? "Edit training subject" : "Add training subject"
        }
      >
        <div className="grid gap-3">
          {status ? (
            <p role="alert" className="text-sm text-rose-700">
              {status}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <label className="saas-field">
              <span>Certificate</span>
              <input
                value={subjectForm.certificate_code}
                onChange={(event) =>
                  setSubjectForm((current) => ({
                    ...current,
                    certificate_code: event.target.value,
                  }))
                }
              />
            </label>
            <label className="saas-field">
              <span>Stable key</span>
              <input
                value={subjectForm.stable_key}
                onChange={(event) =>
                  setSubjectForm((current) => ({
                    ...current,
                    stable_key: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label className="saas-field">
            <span>Subject name</span>
            <input
              value={subjectForm.title}
              onChange={(event) =>
                setSubjectForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="saas-field">
              <span>Area</span>
              <input
                value={subjectForm.area_code}
                onChange={(event) =>
                  setSubjectForm((current) => ({
                    ...current,
                    area_code: event.target.value,
                  }))
                }
              />
            </label>
            <label className="saas-field">
              <span>Task code</span>
              <input
                value={subjectForm.task_code}
                onChange={(event) =>
                  setSubjectForm((current) => ({
                    ...current,
                    task_code: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label className="saas-field">
            <span>Area title</span>
            <input
              value={subjectForm.area_title}
              onChange={(event) =>
                setSubjectForm((current) => ({
                  ...current,
                  area_title: event.target.value,
                }))
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="saas-field">
              <span>ACS document</span>
              <input
                value={subjectForm.acs_document}
                onChange={(event) =>
                  setSubjectForm((current) => ({
                    ...current,
                    acs_document: event.target.value,
                  }))
                }
              />
            </label>
            <label className="saas-field">
              <span>Version</span>
              <input
                value={subjectForm.acs_version}
                onChange={(event) =>
                  setSubjectForm((current) => ({
                    ...current,
                    acs_version: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label className="saas-field">
            <span>FAA source URL</span>
            <input
              type="url"
              value={subjectForm.source_url}
              onChange={(event) =>
                setSubjectForm((current) => ({
                  ...current,
                  source_url: event.target.value,
                }))
              }
            />
          </label>
          <label className="saas-field">
            <span>Components · one per line</span>
            <textarea
              rows={4}
              value={componentText}
              onChange={(event) => setComponentText(event.target.value)}
            />
          </label>
          {(
            [
              "knowledge",
              "risk_management",
              "skills",
            ] as TrainingStandardGroup[]
          ).map((group) => (
            <label key={group} className="saas-field">
              <span>
                {group === "risk_management"
                  ? "Risk Management"
                  : group[0].toUpperCase() + group.slice(1)}{" "}
                · code | standard
              </span>
              <textarea
                rows={5}
                value={standardText[group]}
                onChange={(event) =>
                  setStandardText((current) => ({
                    ...current,
                    [group]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
          <label className="saas-field">
            <span>
              References · title | document | chapter | pages | FAA URL
            </span>
            <textarea
              rows={5}
              value={referenceText}
              onChange={(event) => setReferenceText(event.target.value)}
            />
          </label>
          <label className="saas-field">
            <span>Status</span>
            <select
              value={subjectForm.status}
              onChange={(event) =>
                setSubjectForm((current) => ({
                  ...current,
                  status: event.target.value as TrainingSubject["status"],
                }))
              }
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="retired">Retired</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="ghost-button"
            onClick={() => setDrawer(selectedSubject ? "subject" : null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={
              saving ||
              !subjectForm.title.trim() ||
              !subjectForm.stable_key.trim()
            }
            onClick={() => void handleSaveSubject()}
          >
            {saving ? "Saving…" : "Save subject"}
          </button>
        </div>
      </DetailDrawer>

      <DetailDrawer
        compact
        open={drawer === "organization-editor"}
        onClose={() => setDrawer("subject")}
        title="Organization Guidance"
      >
        <div className="grid gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={organizationForm.enabled}
              onChange={(event) =>
                setOrganizationForm((current) => ({
                  ...current,
                  enabled: event.target.checked,
                }))
              }
            />
            Available to organization members
          </label>
          <label className="saas-field">
            <span>Guidance</span>
            <textarea
              rows={10}
              maxLength={12000}
              value={organizationForm.guidance}
              onChange={(event) =>
                setOrganizationForm((current) => ({
                  ...current,
                  guidance: event.target.value,
                }))
              }
            />
          </label>
          <label className="saas-field">
            <span>Resources · title | https://…</span>
            <textarea
              rows={5}
              value={organizationForm.resources}
              onChange={(event) =>
                setOrganizationForm((current) => ({
                  ...current,
                  resources: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="ghost-button"
            onClick={() => setDrawer("subject")}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={saving}
            onClick={() => void handleSaveOrganizationGuide()}
          >
            {saving ? "Saving…" : "Save guidance"}
          </button>
        </div>
      </DetailDrawer>

      <DetailDrawer
        compact
        open={drawer === "instructor-editor"}
        onClose={() => setDrawer("subject")}
        title="My Guidance"
      >
        <div className="grid gap-3">
          <section className="border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Guide pages</h3>
                <p className="mt-0.5 text-xs text-slate-600">Students read one short page at a time in this order.</p>
              </div>
              <button
                type="button"
                className="secondary-button min-h-9"
                onClick={() =>
                  setInstructorForm((current) => ({
                    ...current,
                    steps: [...current.steps, blankInstructorStep()],
                  }))
                }
              >
                Add page
              </button>
            </div>
            <div className="mt-3 grid gap-3">
              {!instructorForm.steps.length ? (
                <p className="border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                  Add the first page to publish this guide.
                </p>
              ) : (
                instructorForm.steps.map((step, index) => {
                  const updateStep = (patch: Partial<InstructorStepDraft>) =>
                    setInstructorForm((current) => ({
                      ...current,
                      steps: current.steps.map((item) =>
                        item.id === step.id ? { ...item, ...patch } : item,
                      ),
                    }));
                  return (
                    <article key={step.id} className="border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm text-slate-900">Page {index + 1}</strong>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="ghost-button min-h-9 px-2"
                            disabled={index === 0}
                            aria-label={`Move page ${index + 1} up`}
                            onClick={() =>
                              setInstructorForm((current) => {
                                const steps = [...current.steps];
                                [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
                                return { ...current, steps };
                              })
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="ghost-button min-h-9 px-2"
                            disabled={index === instructorForm.steps.length - 1}
                            aria-label={`Move page ${index + 1} down`}
                            onClick={() =>
                              setInstructorForm((current) => {
                                const steps = [...current.steps];
                                [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]];
                                return { ...current, steps };
                              })
                            }
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="ghost-button min-h-9 px-2 text-rose-700"
                            onClick={() => {
                              if (!window.confirm("Remove this guide page?")) return;
                              setInstructorForm((current) => ({
                                ...current,
                                steps: current.steps.filter((item) => item.id !== step.id),
                              }));
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3">
                        <label className="saas-field">
                          <span>Page title</span>
                          <input value={step.title} maxLength={160} onChange={(event) => updateStep({ title: event.target.value })} />
                        </label>
                        <label className="saas-field">
                          <span>What the student is about to review</span>
                          <textarea rows={4} value={step.prepare} onChange={(event) => updateStep({ prepare: event.target.value })} />
                        </label>
                        <label className="saas-field">
                          <span>Before the flight · optional</span>
                          <textarea rows={4} value={step.method} onChange={(event) => updateStep({ method: event.target.value })} />
                        </label>
                        <label className="saas-field">
                          <span>As you read, look for · optional, one per line</span>
                          <textarea rows={4} value={step.focusQuestions} onChange={(event) => updateStep({ focusQuestions: event.target.value })} />
                        </label>
                        <label className="saas-field">
                          <span>Why this matters in flight · optional</span>
                          <textarea rows={3} value={step.expectedResult} onChange={(event) => updateStep({ expectedResult: event.target.value })} />
                        </label>
                        {selectedSubject?.components.length ? (
                          <fieldset>
                            <legend className="text-xs font-semibold text-slate-700">Related maneuvers</legend>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {selectedSubject.components.map((component) => (
                                <label key={component.key} className="flex min-h-9 cursor-pointer items-center gap-2 border border-slate-200 bg-white px-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={step.componentKeys.includes(component.key)}
                                    onChange={(event) =>
                                      updateStep({
                                        componentKeys: event.target.checked
                                          ? [...step.componentKeys, component.key]
                                          : step.componentKeys.filter((key) => key !== component.key),
                                      })
                                    }
                                  />
                                  {component.title}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        ) : null}
                        <label className="saas-field">
                          <span>Links shown beside Before the flight · title | https://…</span>
                          <textarea rows={3} value={step.resources} onChange={(event) => updateStep({ resources: event.target.value })} />
                        </label>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="ghost-button"
            onClick={() => setDrawer("subject")}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={saving}
            onClick={() => void handleSaveInstructorGuide()}
          >
            {saving ? "Saving…" : "Save guidance"}
          </button>
        </div>
      </DetailDrawer>

      <DetailDrawer
        compact
        open={drawer === "student-note"}
        onClose={() => setDrawer("subject")}
        title="Student-specific Note"
      >
        <div className="grid gap-3">
          <label className="saas-field">
            <span>Student</span>
            <select
              disabled={Boolean(studentNoteForm.id)}
              value={studentNoteForm.studentUserId}
              onChange={(event) =>
                setStudentNoteForm((current) => ({
                  ...current,
                  studentUserId: event.target.value,
                }))
              }
            >
              <option value="">Select student</option>
              {organizationStudents.map((student) => (
                <option
                  key={student.student_user_id}
                  value={student.student_user_id}
                >
                  {student.account_nickname}
                </option>
              ))}
            </select>
          </label>
          <label className="saas-field">
            <span>Related study item · optional</span>
            <select
              value={studentNoteForm.stepId}
              onChange={(event) =>
                setStudentNoteForm((current) => ({
                  ...current,
                  stepId: event.target.value,
                }))
              }
            >
              <option value="">Whole subject</option>
              {(selectedInstructorGuide?.steps ?? []).map((step) => (
                <option key={step.id} value={step.id}>
                  {step.title}
                </option>
              ))}
            </select>
          </label>
          <label className="saas-field">
            <span>Note</span>
            <textarea
              rows={8}
              maxLength={4000}
              value={studentNoteForm.body}
              onChange={(event) =>
                setStudentNoteForm((current) => ({
                  ...current,
                  body: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="ghost-button"
            onClick={() => setDrawer("subject")}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={
              saving ||
              !studentNoteForm.studentUserId ||
              !studentNoteForm.body.trim()
            }
            onClick={() => void handleSaveStudentNote()}
          >
            {saving ? "Saving…" : "Save note"}
          </button>
        </div>
      </DetailDrawer>
    </>
  );
}
