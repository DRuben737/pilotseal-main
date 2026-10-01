"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ENDORSEMENT_AUTOMATIC_FIELDS,
  normalizeEndorsementAutomaticFieldKey,
  parseEndorsementWording,
  serializeEndorsementStatement,
} from "@/lib/endorsement-wording";
import type { EndorsementTemplateField } from "@/lib/endorsement-templates";

type TextSegment = { type: "text"; value: string };
type FillInSegment = { type: "fill-in"; key: string };
type WordingSegment = TextSegment | FillInSegment;
type WordingParagraph = { segments: WordingSegment[] };
type FillInDefinition = EndorsementTemplateField & {
  system?: boolean;
  source?: string;
  insertable?: boolean;
};
type InsertionPoint = { paragraphIndex: number; segmentIndex: number; offset: number };

type FieldDraft = {
  editingKey: string | null;
  label: string;
  type: EndorsementTemplateField["type"];
  required: boolean;
  optionsText: string;
  placeholder: string;
};

const emptyFieldDraft: FieldDraft = {
  editingKey: null,
  label: "",
  type: "text",
  required: true,
  optionsText: "",
  placeholder: "",
};

function humanizeKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function normalizeParagraph(paragraph: WordingParagraph): WordingParagraph {
  const segments: WordingSegment[] = [];
  for (const segment of paragraph.segments) {
    const previous = segments.at(-1);
    if (segment.type === "text" && previous?.type === "text") {
      previous.value += segment.value;
    } else {
      segments.push({ ...segment });
    }
  }

  if (segments.length === 0 || segments[0].type !== "text") {
    segments.unshift({ type: "text", value: "" });
  }
  if (segments.at(-1)?.type !== "text") {
    segments.push({ type: "text", value: "" });
  }

  return { segments };
}

function createFieldKey(label: string, usedKeys: Set<string>) {
  const words = label.match(/[A-Za-z0-9]+/g) ?? ["fill", "in"];
  const base = words
    .map((word, index) => {
      const normalized = word.toLowerCase();
      return index === 0 ? normalized : normalized[0].toUpperCase() + normalized.slice(1);
    })
    .join("") || "fillIn";
  let key = base;
  let suffix = 2;

  while (usedKeys.has(key)) {
    key = `${base}${suffix}`;
    suffix += 1;
  }
  return key;
}

function getUsedKeys(paragraphs: WordingParagraph[]) {
  return new Set(
    paragraphs.flatMap((paragraph) =>
      paragraph.segments.flatMap((segment) => (segment.type === "fill-in" ? [segment.key] : []))
    )
  );
}

export default function EndorsementWordingEditor({
  body,
  fields,
  suggestions,
  onChange,
}: {
  body: string;
  fields: EndorsementTemplateField[];
  suggestions: EndorsementTemplateField[];
  onChange: (body: string, fields: EndorsementTemplateField[]) => void;
}) {
  const paragraphs = useMemo(
    () => parseEndorsementWording(body) as WordingParagraph[],
    [body]
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [insertionPoint, setInsertionPoint] = useState<InsertionPoint | null>(null);
  const [fieldDraft, setFieldDraft] = useState<FieldDraft | null>(null);
  const [fieldError, setFieldError] = useState("");

  const baseFields = ENDORSEMENT_AUTOMATIC_FIELDS as FillInDefinition[];
  const fieldCatalog = useMemo(() => {
    const byKey = new Map<string, FillInDefinition>();
    for (const field of [...baseFields, ...suggestions, ...fields]) {
      const key = normalizeEndorsementAutomaticFieldKey(field.key);
      const automaticField = baseFields.find((item) => item.key === key);
      if (!byKey.has(key)) {
        byKey.set(key, automaticField ?? { ...field, key });
      }
    }
    for (const key of getUsedKeys(paragraphs)) {
      if (!byKey.has(key)) {
        byKey.set(key, { key, label: humanizeKey(key), type: "text", required: true });
      }
    }
    return byKey;
  }, [baseFields, fields, paragraphs, suggestions]);

  const visiblePickerFields = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    return Array.from(fieldCatalog.values())
      .filter((field) => field.insertable !== false)
      .filter((field) => !query || `${field.label} ${field.source ?? ""}`.toLowerCase().includes(query))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [fieldCatalog, pickerQuery]);
  const automaticPickerFields = visiblePickerFields.filter((field) => field.system);
  const questionPickerFields = visiblePickerFields.filter((field) => !field.system);

  useEffect(() => {
    if (!pickerOpen && !fieldDraft) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      if (fieldDraft) {
        setFieldDraft(null);
      } else {
        setPickerOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [fieldDraft, pickerOpen]);

  function commit(nextParagraphs: WordingParagraph[], nextFields = fields) {
    const normalizedParagraphs = nextParagraphs.map(normalizeParagraph);
    const usedKeys = getUsedKeys(normalizedParagraphs);
    const systemKeys = new Set(baseFields.map((field) => field.key));
    const uniqueFields = new Map<string, EndorsementTemplateField>();

    for (const field of nextFields) {
      if (usedKeys.has(field.key) && !systemKeys.has(field.key) && !uniqueFields.has(field.key)) {
        uniqueFields.set(field.key, field);
      }
    }

    onChange(serializeEndorsementStatement(normalizedParagraphs), Array.from(uniqueFields.values()));
  }

  function updateText(paragraphIndex: number, segmentIndex: number, value: string) {
    const next = structuredClone(paragraphs) as WordingParagraph[];
    const segment = next[paragraphIndex].segments[segmentIndex];
    if (segment.type === "text") {
      segment.value = value;
      commit(next);
    }
  }

  function openPicker(point: InsertionPoint) {
    setInsertionPoint(point);
    setPickerQuery("");
    setPickerOpen(true);
  }

  function insertField(field: FillInDefinition, customFields = fields) {
    if (!insertionPoint) return;
    const next = structuredClone(paragraphs) as WordingParagraph[];
    const paragraph = next[insertionPoint.paragraphIndex];
    const segment = paragraph.segments[insertionPoint.segmentIndex];
    if (!segment || segment.type !== "text") return;

    const offset = Math.max(0, Math.min(insertionPoint.offset, segment.value.length));
    paragraph.segments.splice(
      insertionPoint.segmentIndex,
      1,
      { type: "text", value: segment.value.slice(0, offset) },
      { type: "fill-in", key: field.key },
      { type: "text", value: segment.value.slice(offset) }
    );

    const isSystemField = baseFields.some((baseField) => baseField.key === field.key);
    const nextFields = isSystemField || customFields.some((item) => item.key === field.key)
      ? customFields
      : [...customFields, field];
    commit(next, nextFields);
    setPickerOpen(false);
    setInsertionPoint(null);
  }

  function removeFillIn(paragraphIndex: number, segmentIndex: number) {
    const next = structuredClone(paragraphs) as WordingParagraph[];
    next[paragraphIndex].segments.splice(segmentIndex, 1);
    commit(next);
  }

  function moveFillIn(paragraphIndex: number, segmentIndex: number, direction: -1 | 1) {
    const next = structuredClone(paragraphs) as WordingParagraph[];
    const segments = next[paragraphIndex].segments;
    const targetIndex = segmentIndex + direction;
    if (targetIndex < 0 || targetIndex >= segments.length) return;
    [segments[segmentIndex], segments[targetIndex]] = [segments[targetIndex], segments[segmentIndex]];
    commit(next);
  }

  function addParagraph(afterIndex: number) {
    const next = structuredClone(paragraphs) as WordingParagraph[];
    next.splice(afterIndex + 1, 0, { segments: [{ type: "text", value: "" }] });
    commit(next);
  }

  function moveParagraph(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= paragraphs.length) return;
    const next = structuredClone(paragraphs) as WordingParagraph[];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    commit(next);
  }

  function removeParagraph(index: number) {
    const next = structuredClone(paragraphs) as WordingParagraph[];
    next.splice(index, 1);
    commit(next.length > 0 ? next : [{ segments: [{ type: "text", value: "" }] }]);
  }

  function openFieldEditor(field: FillInDefinition) {
    if (field.system) return;
    setFieldError("");
    setFieldDraft({
      editingKey: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      optionsText: field.options?.join("\n") ?? "",
      placeholder: field.placeholder ?? "",
    });
  }

  function openNewFieldEditor() {
    setPickerOpen(false);
    setFieldError("");
    setFieldDraft(emptyFieldDraft);
  }

  function saveFieldDraft() {
    if (!fieldDraft) return;
    const label = fieldDraft.label.trim();
    if (!label) {
      setFieldError("Enter the question users will see.");
      return;
    }

    const options = fieldDraft.optionsText
      .split("\n")
      .map((option) => option.trim())
      .filter(Boolean);
    if ((fieldDraft.type === "select" || fieldDraft.type === "multi-select") && options.length === 0) {
      setFieldError("Add at least one choice.");
      return;
    }

    if (fieldDraft.editingKey) {
      const nextFields = fields.map((field) =>
        field.key === fieldDraft.editingKey
          ? {
              ...field,
              label,
              type: fieldDraft.type,
              required: fieldDraft.required,
              ...(options.length > 0 ? { options } : { options: undefined }),
              ...(fieldDraft.placeholder.trim()
                ? { placeholder: fieldDraft.placeholder.trim() }
                : { placeholder: undefined }),
            }
          : field
      );
      commit(paragraphs, nextFields);
      setFieldDraft(null);
      return;
    }

    const usedKeys = new Set(fieldCatalog.keys());
    const field: EndorsementTemplateField = {
      key: createFieldKey(label, usedKeys),
      label,
      type: fieldDraft.type,
      required: fieldDraft.required,
      ...(options.length > 0 ? { options } : {}),
      ...(fieldDraft.placeholder.trim() ? { placeholder: fieldDraft.placeholder.trim() } : {}),
    };
    insertField(field, [...fields, field]);
    setFieldDraft(null);
  }

  return (
    <div className="mt-4 grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Endorsement wording</h3>
          <p className="mt-0.5 text-xs text-slate-500">Edit the text and insert the information users need to provide.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => addParagraph(paragraphs.length - 1)}>
          Add paragraph
        </button>
      </div>

      {paragraphs.map((paragraph, paragraphIndex) => (
        <section key={paragraphIndex} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-500">Paragraph {paragraphIndex + 1}</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 disabled:opacity-40"
                disabled={paragraphIndex === 0}
                onClick={() => moveParagraph(paragraphIndex, -1)}
              >
                Move up
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 disabled:opacity-40"
                disabled={paragraphIndex === paragraphs.length - 1}
                onClick={() => moveParagraph(paragraphIndex, 1)}
              >
                Move down
              </button>
              <button
                type="button"
                className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700"
                onClick={() => removeParagraph(paragraphIndex)}
              >
                Remove
              </button>
            </div>
          </div>

          <div className="grid gap-2">
            {paragraph.segments.map((segment, segmentIndex) => {
              if (segment.type === "fill-in") {
                const field = fieldCatalog.get(segment.key) ?? {
                  key: segment.key,
                  label: humanizeKey(segment.key),
                  type: "text" as const,
                  required: true,
                };
                return (
                  <div key={`${segment.key}-${segmentIndex}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm font-semibold text-blue-950">{field.label}</span>
                    <span className="text-xs text-blue-700">{field.system ? `Auto-filled · ${field.source}` : field.required ? "Required" : "Optional"}</span>
                    {!field.system ? (
                      <button type="button" className="rounded-md bg-white px-2 py-1 text-xs text-blue-800" onClick={() => openFieldEditor(field)}>
                        Edit
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-md bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-40"
                      disabled={segmentIndex === 0}
                      onClick={() => moveFillIn(paragraphIndex, segmentIndex, -1)}
                    >
                      Earlier
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-40"
                      disabled={segmentIndex === paragraph.segments.length - 1}
                      onClick={() => moveFillIn(paragraphIndex, segmentIndex, 1)}
                    >
                      Later
                    </button>
                    <button type="button" className="rounded-md bg-white px-2 py-1 text-xs text-red-700" onClick={() => removeFillIn(paragraphIndex, segmentIndex)}>
                      Remove
                    </button>
                  </div>
                );
              }

              return (
                <div key={`text-${segmentIndex}`} className="grid gap-1.5">
                  <textarea
                    value={segment.value}
                    rows={Math.max(2, Math.min(6, Math.ceil(segment.value.length / 95)))}
                    onChange={(event) => updateText(paragraphIndex, segmentIndex, event.target.value)}
                    className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800"
                  />
                  <button
                    type="button"
                    className="justify-self-start rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
                    onClick={(event) => {
                      const textarea = event.currentTarget.previousElementSibling as HTMLTextAreaElement | null;
                      openPicker({
                        paragraphIndex,
                        segmentIndex,
                        offset: textarea?.selectionStart ?? segment.value.length,
                      });
                    }}
                  >
                    Insert fill-in here
                  </button>
                </div>
              );
            })}
          </div>

          <button type="button" className="mt-3 text-xs font-semibold text-blue-700" onClick={() => addParagraph(paragraphIndex)}>
            Add paragraph below
          </button>
        </section>
      ))}

      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
        <p className="text-sm font-semibold text-slate-900">Signature details added automatically</p>
        <p className="mt-0.5 text-xs text-slate-500">Date, instructor name, certificate number and expiration date are added when the endorsement is generated.</p>
      </div>

      {pickerOpen ? (
        <div data-endorsement-child-dialog className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/50 p-4">
          <div role="dialog" aria-modal="true" className="max-h-[82vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-950">Insert fill-in</h3>
              <button type="button" className="secondary-button" onClick={() => setPickerOpen(false)}>Close</button>
            </div>
            <input
              type="search"
              value={pickerQuery}
              onChange={(event) => setPickerQuery(event.target.value)}
              placeholder="Search fill-ins"
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              autoFocus
            />
            <div className="mt-3 max-h-80 space-y-4 overflow-auto">
              {automaticPickerFields.length > 0 ? (
                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase text-slate-500">Automatic information</p>
                  {automaticPickerFields.map((field) => (
                    <button
                      key={field.key}
                      type="button"
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50"
                      onClick={() => insertField(field)}
                    >
                      <span className="text-sm font-medium text-slate-900">{field.label}</span>
                      <span className="text-xs text-slate-500">Auto-filled · {field.source}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {questionPickerFields.length > 0 ? (
                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase text-slate-500">Questions for the user</p>
                  {questionPickerFields.map((field) => (
                    <button
                      key={field.key}
                      type="button"
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50"
                      onClick={() => insertField(field)}
                    >
                      <span className="text-sm font-medium text-slate-900">{field.label}</span>
                      <span className="text-xs text-slate-500">{field.type === "multi-select" ? "Multiple choice" : field.type === "select" ? "Single choice" : field.type === "date" ? "Date" : "Text"}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button type="button" className="primary-button mt-4 w-full" onClick={openNewFieldEditor}>
              Create a new fill-in
            </button>
          </div>
        </div>
      ) : null}

      {fieldDraft ? (
        <div data-endorsement-child-dialog className="fixed inset-0 z-[10002] flex items-center justify-center bg-slate-950/50 p-4">
          <div role="dialog" aria-modal="true" className="max-h-[86vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-950">{fieldDraft.editingKey ? "Edit fill-in" : "New fill-in"}</h3>
              <button type="button" className="secondary-button" onClick={() => setFieldDraft(null)}>Close</button>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Question shown to users
                <input value={fieldDraft.label} onChange={(event) => setFieldDraft((current) => current ? { ...current, label: event.target.value } : current)} className="rounded-lg border border-slate-200 px-3 py-2 font-normal" autoFocus />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Answer type
                <select value={fieldDraft.type} onChange={(event) => setFieldDraft((current) => current ? { ...current, type: event.target.value as EndorsementTemplateField["type"] } : current)} className="rounded-lg border border-slate-200 px-3 py-2 font-normal">
                  <option value="text">Text</option>
                  <option value="date">Date</option>
                  <option value="select">Single choice</option>
                  <option value="multi-select">Multiple choice</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={fieldDraft.required} onChange={(event) => setFieldDraft((current) => current ? { ...current, required: event.target.checked } : current)} />
                Required
              </label>
              {fieldDraft.type === "select" || fieldDraft.type === "multi-select" ? (
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Choices
                  <textarea value={fieldDraft.optionsText} onChange={(event) => setFieldDraft((current) => current ? { ...current, optionsText: event.target.value } : current)} rows={6} placeholder="Enter one choice per line" className="rounded-lg border border-slate-200 px-3 py-2 font-normal" />
                </label>
              ) : null}
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Example or hint <span className="font-normal text-slate-400">Optional</span>
                <input value={fieldDraft.placeholder} onChange={(event) => setFieldDraft((current) => current ? { ...current, placeholder: event.target.value } : current)} className="rounded-lg border border-slate-200 px-3 py-2 font-normal" />
              </label>
              {fieldError ? <p className="text-sm text-red-600">{fieldError}</p> : null}
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" className="primary-button" onClick={saveFieldDraft}>Save fill-in</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
