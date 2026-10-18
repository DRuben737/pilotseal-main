"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  createCommunityTrainingNote,
  deleteCommunityTrainingNote,
  fetchCommunityTrainingNotes,
  fetchMyTrainingGuideSubject,
  fetchStudentTrainingSubjectNotes,
  reportCommunityTrainingNote,
  saveMyTrainingGuideProgress,
  type CommunityTrainingNote,
  type StudentTrainingGuideModule,
  type StudentTrainingGuideSubject,
  type StudentTrainingSubjectNote,
  type TrainingGuideStep,
} from "@/lib/training-guide";

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function safeReturnPath(value?: string) {
  if (!value) return "/console/personal/training-guide";
  return value.startsWith("/console/personal/schedule") ||
    value.startsWith("/dashboard/schedule")
    ? value
    : "/console/personal/training-guide";
}

function firstStep(
  module: StudentTrainingGuideModule,
  steps: TrainingGuideStep[],
) {
  const current = module.progress?.current_step_id;
  if (current && steps.some((step) => step.id === current)) return current;
  const completed = new Set(module.progress?.completed_step_ids ?? []);
  return steps.find((step) => !completed.has(step.id))?.id ?? steps[0]?.id ?? null;
}

export default function TrainingGuideStudy({
  subjectId,
  preferredInstructorId,
  preferredOrganizationId,
  returnTo,
}: {
  subjectId: string;
  preferredInstructorId?: string;
  preferredOrganizationId?: string;
  returnTo?: string;
}) {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? "";
  const [data, setData] = useState<StudentTrainingGuideSubject | null>(null);
  const [moduleId, setModuleId] = useState("");
  const [stepId, setStepId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [privateNotes, setPrivateNotes] = useState<StudentTrainingSubjectNote[]>([]);
  const [communityNotes, setCommunityNotes] = useState<CommunityTrainingNote[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [noteComponent, setNoteComponent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const activeModule = useMemo(
    () => data?.instructor_modules.find((item) => item.access_id === moduleId) ?? null,
    [data, moduleId],
  );
  const steps = activeModule?.guide?.steps ?? [];
  const activeStep = steps.find((step) => step.id === stepId) ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const next = await fetchMyTrainingGuideSubject(subjectId);
      setData(next);
      const preferred = next.instructor_modules.find(
        (module) =>
          module.instructor_user_id === preferredInstructorId &&
          (!preferredOrganizationId ||
            module.organization_id === preferredOrganizationId),
      );
      const lastStudied = [...next.instructor_modules].sort((a, b) =>
        String(b.progress?.last_opened_at ?? "").localeCompare(
          String(a.progress?.last_opened_at ?? ""),
        ),
      )[0];
      const nextModule = preferred ?? lastStudied ?? next.instructor_modules[0];
      if (nextModule) {
        const moduleSteps = nextModule.guide?.steps ?? [];
        let restoredStep = firstStep(nextModule, moduleSteps);
        let restoredCompleted = nextModule.progress?.completed_step_ids ?? [];
        try {
          const local = JSON.parse(
            localStorage.getItem(`training-guide-progress:${nextModule.access_id}`) ?? "null",
          ) as { currentStepId?: string; completedStepIds?: string[] } | null;
          if (
            local?.currentStepId &&
            moduleSteps.some((step) => step.id === local.currentStepId)
          )
            restoredStep = local.currentStepId;
          if (Array.isArray(local?.completedStepIds))
            restoredCompleted = local.completedStepIds.filter((id) =>
              moduleSteps.some((step) => step.id === id),
            );
        } catch {
          localStorage.removeItem(`training-guide-progress:${nextModule.access_id}`);
        }
        setModuleId(nextModule.access_id);
        setCompleted(restoredCompleted);
        setStepId(restoredStep);
        if (restoredStep)
          await saveMyTrainingGuideProgress({
            moduleAccessId: nextModule.access_id,
            currentStepId: restoredStep,
            completedStepIds: restoredCompleted,
          });
      }
    } catch (failure) {
      setError(message(failure, "Unable to open this Training Guide."));
    } finally {
      setLoading(false);
    }
  }, [preferredInstructorId, preferredOrganizationId, subjectId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeModule || !userId) return;
    const organizationId = activeModule.organization_id;
    Promise.all([
      fetchStudentTrainingSubjectNotes({
        subjectId,
        instructorUserId: activeModule.instructor_user_id,
        studentUserId: userId,
        organizationId,
      }),
      organizationId
        ? fetchCommunityTrainingNotes(organizationId, subjectId).catch(() => [])
        : Promise.resolve([]),
    ]).then(([notes, shared]) => {
      setPrivateNotes(notes);
      setCommunityNotes(shared);
    });
    try {
      const draft = JSON.parse(
        localStorage.getItem(`training-guide-note:${activeModule.access_id}`) ?? "null",
      ) as { body?: string; component?: string } | null;
      setNoteBody(draft?.body ?? "");
      setNoteComponent(draft?.component ?? "");
    } catch {
      setNoteBody("");
      setNoteComponent("");
    }
  }, [activeModule, subjectId, userId]);

  async function persist(nextStepId: string | null, nextCompleted: string[]) {
    if (!activeModule) return false;
    setSaving(true);
    setError("");
    localStorage.setItem(
      `training-guide-progress:${activeModule.access_id}`,
      JSON.stringify({
        currentStepId: nextStepId,
        completedStepIds: nextCompleted,
        updatedAt: new Date().toISOString(),
      }),
    );
    try {
      await saveMyTrainingGuideProgress({
        moduleAccessId: activeModule.access_id,
        currentStepId: nextStepId,
        completedStepIds: nextCompleted,
      });
      return true;
    } catch (failure) {
      setError(message(failure, "Your place could not be saved. Try again."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function chooseModule(nextId: string) {
    const next = data?.instructor_modules.find((item) => item.access_id === nextId);
    if (!next) return;
    const nextCompleted = next.progress?.completed_step_ids ?? [];
    const nextStep = firstStep(next, next.guide?.steps ?? []);
    if (nextStep) {
      setSaving(true);
      try {
        await saveMyTrainingGuideProgress({
          moduleAccessId: next.access_id,
          currentStepId: nextStep,
          completedStepIds: nextCompleted,
        });
      } catch (failure) {
        setError(message(failure, "This instructor guide could not be opened."));
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    setModuleId(nextId);
    setCompleted(nextCompleted);
    setStepId(nextStep);
    setError("");
  }

  async function chooseStep(nextId: string) {
    if (nextId === stepId) return;
    if (!(await persist(nextId, completed))) return;
    setStepId(nextId);
  }

  async function completeAndContinue() {
    if (!activeStep) return;
    const nextCompleted = Array.from(new Set([...completed, activeStep.id]));
    const index = steps.findIndex((step) => step.id === activeStep.id);
    const nextStep = steps[index + 1]?.id ?? activeStep.id;
    if (!(await persist(nextStep, nextCompleted))) return;
    setCompleted(nextCompleted);
    setStepId(nextStep);
  }

  async function postCommunityNote() {
    if (!activeModule?.organization_id || !noteBody.trim()) return;
    setSaving(true);
    setError("");
    try {
      await createCommunityTrainingNote({
        organizationId: activeModule.organization_id,
        subjectId,
        componentKey: noteComponent,
        body: noteBody,
      });
      setNoteBody("");
      setNoteComponent("");
      localStorage.removeItem(`training-guide-note:${activeModule.access_id}`);
      setCommunityNotes(
        await fetchCommunityTrainingNotes(activeModule.organization_id, subjectId),
      );
    } catch (failure) {
      setError(message(failure, "Unable to post your note."));
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return <div className="panel-card p-6 text-sm text-slate-600">Opening Training Guide…</div>;

  if (!data)
    return (
      <div className="panel-card p-6">
        <p role="alert" className="text-sm text-rose-700">{error}</p>
        <button className="secondary-button mt-4" type="button" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );

  const stepNotes = privateNotes.filter(
    (note) => !note.step_id || note.step_id === activeStep?.id,
  );
  const isLastStep = activeStep && steps.at(-1)?.id === activeStep.id;
  const isAlreadyComplete = activeStep ? completed.includes(activeStep.id) : false;

  return (
    <main className="mx-auto w-full max-w-5xl pb-28 sm:pb-10">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <button
          type="button"
          className="min-h-11 cursor-pointer text-sm font-semibold text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          onClick={() => router.push(safeReturnPath(returnTo))}
        >
          ← Back
        </button>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {data.subject.certificate_code} · {data.subject.task_code}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950 sm:text-3xl">
          {data.subject.title}
        </h1>
        {data.instructor_modules.length > 1 ? (
          <label className="mt-4 block max-w-sm text-sm font-semibold text-slate-700">
            Instructor guide
            <select
              className="mt-1 min-h-11 w-full rounded-sm border border-slate-300 bg-white px-3 text-base"
              value={moduleId}
              onChange={(event) => void chooseModule(event.target.value)}
            >
              {data.instructor_modules.map((module) => (
                <option key={module.access_id} value={module.access_id}>
                  {module.instructor_name}
                </option>
              ))}
            </select>
          </label>
        ) : activeModule ? (
          <p className="mt-3 text-sm text-slate-600">Guide by {activeModule.instructor_name}</p>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="mx-4 mt-4 border-l-2 border-rose-600 bg-rose-50 px-3 py-2 text-sm text-rose-800 sm:mx-6">
          {error}
        </p>
      ) : null}

      {!activeModule || !steps.length ? (
        <section className="mx-4 mt-6 border border-slate-200 bg-white p-5 sm:mx-6">
          <h2 className="text-lg font-semibold text-slate-950">Preparation guide not published yet</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This subject is open to you. Your instructor has not added guided preparation steps yet.
          </p>
        </section>
      ) : activeStep ? (
        <div className="grid gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="self-start lg:sticky lg:top-4">
            <label className="block text-sm font-semibold text-slate-700">
              Current item
              <select
                className="mt-1 min-h-11 w-full rounded-sm border border-slate-300 bg-white px-3 text-base lg:hidden"
                value={activeStep.id}
                disabled={saving}
                onChange={(event) => void chooseStep(event.target.value)}
              >
                {steps.map((step) => (
                  <option key={step.id} value={step.id}>
                    {completed.includes(step.id) ? "Completed · " : ""}{step.title}
                  </option>
                ))}
              </select>
            </label>
            <nav className="mt-2 hidden border border-slate-200 bg-white lg:block" aria-label="Study items">
              {steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  aria-current={step.id === activeStep.id ? "step" : undefined}
                  className={`min-h-11 w-full cursor-pointer border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 ${
                    step.id === activeStep.id
                      ? "bg-blue-50 font-semibold text-blue-900"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                  onClick={() => void chooseStep(step.id)}
                >
                  {completed.includes(step.id) ? "✓ " : ""}{step.title}
                </button>
              ))}
            </nav>
          </aside>

          <article className="min-w-0 border border-slate-200 bg-white p-5 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              {isAlreadyComplete ? "Previously completed" : "Prepare this next"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">{activeStep.title}</h2>

            <section className="mt-6">
              <h3 className="text-sm font-semibold text-slate-950">What to prepare</h3>
              <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-slate-700">
                {activeStep.prepare || "No preparation instruction has been added for this item."}
              </p>
            </section>

            {activeStep.method ? (
              <section className="mt-6 border-l-2 border-blue-700 pl-4">
                <h3 className="text-sm font-semibold text-slate-950">How to work through it</h3>
                <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-slate-700">{activeStep.method}</p>
              </section>
            ) : null}

            {activeStep.focus_questions.length ? (
              <section className="mt-6">
                <h3 className="text-sm font-semibold text-slate-950">Questions to work through</h3>
                <ol className="mt-3 grid gap-3">
                  {activeStep.focus_questions.map((question, index) => (
                    <li key={`${index}-${question}`} className="grid grid-cols-[1.75rem_1fr] gap-2 text-base leading-7 text-slate-700">
                      <span className="font-semibold text-blue-800">{index + 1}</span>
                      <span>{question}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {activeStep.expected_result ? (
              <section className="mt-6 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-950">What you should be able to produce</h3>
                <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-slate-700">{activeStep.expected_result}</p>
              </section>
            ) : null}

            {stepNotes.map((note) => (
              <aside key={note.id} className="mt-6 border-l-2 border-amber-500 bg-amber-50 px-4 py-3">
                <strong className="text-sm text-amber-950">A note from your instructor</strong>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-amber-950">{note.body}</p>
              </aside>
            ))}

            {activeStep.resources.length ? (
              <section className="mt-6">
                <h3 className="text-sm font-semibold text-slate-950">Instructor resources</h3>
                <div className="mt-2 divide-y divide-slate-100 border border-slate-200">
                  {activeStep.resources.map((resource) => (
                    <a key={`${resource.title}-${resource.url}`} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50" href={resource.url} target="_blank" rel="noreferrer">
                      <span>{resource.title}</span><span aria-hidden="true">↗</span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </article>
        </div>
      ) : null}

      <div className="px-4 sm:px-6">
        <details className="border border-slate-200 bg-white">
          <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700">
            Official references and ACS
          </summary>
          <div className="border-t border-slate-200 p-4">
            <div className="divide-y divide-slate-100 border border-slate-200">
              {data.subject.references.map((reference) => (
                <a key={reference.id ?? reference.title} className="block min-h-11 cursor-pointer px-3 py-2 hover:bg-blue-50" href={reference.source_url} target="_blank" rel="noreferrer">
                  <strong className="text-sm text-blue-800">{reference.title}</strong>
                  <span className="mt-1 block text-sm text-slate-600">
                    {[reference.chapter, reference.page_label && `pp. ${reference.page_label}`].filter(Boolean).join(" · ")}
                  </span>
                </a>
              ))}
            </div>
            <a className="mt-3 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-blue-700" href={data.subject.source_url} target="_blank" rel="noreferrer">
              Open the official ACS ↗
            </a>
          </div>
        </details>

        {activeModule?.organization_id ? (
          <details className="mt-4 border border-slate-200 bg-white">
            <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700">
              Notes from other students
            </summary>
            <div className="border-t border-slate-200 p-4">
              <label className="block text-sm font-semibold text-slate-700">
                Related maneuver
                <select className="mt-1 min-h-11 w-full rounded-sm border border-slate-300 bg-white px-3 text-base" value={noteComponent} onChange={(event) => { const component = event.target.value; setNoteComponent(component); localStorage.setItem(`training-guide-note:${activeModule.access_id}`, JSON.stringify({ body: noteBody, component })); }}>
                  <option value="">Whole subject</option>
                  {data.subject.components.map((component) => <option key={component.key} value={component.key}>{component.title}</option>)}
                </select>
              </label>
              <label className="mt-3 block text-sm font-semibold text-slate-700">
                Your note
                <textarea className="mt-1 w-full rounded-sm border border-slate-300 p-3 text-base" rows={4} maxLength={2000} value={noteBody} onChange={(event) => { const body = event.target.value; setNoteBody(body); localStorage.setItem(`training-guide-note:${activeModule.access_id}`, JSON.stringify({ body, component: noteComponent })); }} />
              </label>
              <button type="button" className="primary-button mt-3 min-h-11" disabled={saving || !noteBody.trim()} onClick={() => void postCommunityNote()}>
                Post note
              </button>
              <div className="mt-5 divide-y divide-slate-100 border border-slate-200">
                {!communityNotes.length ? <p className="p-3 text-sm text-slate-500">No student notes yet.</p> : communityNotes.map((note) => (
                  <article key={note.id} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm text-slate-900">{note.author_name}</strong>
                      {note.is_mine ? (
                        <button type="button" className="min-h-11 cursor-pointer text-xs font-semibold text-rose-700" onClick={() => void deleteCommunityTrainingNote(note.id).then(async () => { if (activeModule.organization_id) setCommunityNotes(await fetchCommunityTrainingNotes(activeModule.organization_id, subjectId)); }).catch((failure) => setError(message(failure, "Unable to delete your note.")))}>Delete</button>
                      ) : (
                        <button type="button" className="min-h-11 cursor-pointer text-xs font-semibold text-slate-600" onClick={() => { const reason = window.prompt("Reason for reporting this note"); if (reason) void reportCommunityTrainingNote(note.id, reason).then(async () => { if (activeModule.organization_id) setCommunityNotes(await fetchCommunityTrainingNotes(activeModule.organization_id, subjectId)); }).catch((failure) => setError(message(failure, "Unable to report this note."))); }}>Report</button>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{note.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </details>
        ) : null}
      </div>

      {activeStep ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-5xl justify-end">
            <button type="button" className="primary-button min-h-11 w-full cursor-pointer sm:w-auto" disabled={saving || Boolean(isLastStep && isAlreadyComplete)} onClick={() => void completeAndContinue()}>
              {saving ? "Saving…" : isLastStep ? (isAlreadyComplete ? "Preparation saved" : "Complete this item") : "Complete this item and continue"}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
