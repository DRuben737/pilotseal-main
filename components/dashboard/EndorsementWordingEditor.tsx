"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ENDORSEMENT_AUTOMATIC_FIELDS,
  normalizeEndorsementAutomaticFieldKey,
  parseEndorsementWording,
  serializeEndorsementStatement,
} from "@/lib/endorsement-wording";
import type { EndorsementTemplateField } from "@/lib/endorsement-templates";

type Segment = { type: "text"; value: string } | { type: "fill-in"; key: string };
type Paragraph = { segments: Segment[] };
type FillIn = EndorsementTemplateField & {
  system?: boolean;
  source?: string;
  insertable?: boolean;
};
type FieldDraft = {
  editingKey: string | null;
  label: string;
  type: EndorsementTemplateField["type"];
  required: boolean;
  optionsText: string;
  placeholder: string;
};
type TouchDrag = {
  active: boolean;
  element: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  timer: number | null;
};

const emptyFieldDraft: FieldDraft = {
  editingKey: null,
  label: "",
  type: "text",
  required: true,
  optionsText: "",
  placeholder: "",
};
const BLOCK_TAGS = new Set(["DIV", "P"]);

function humanizeKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
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
  while (usedKeys.has(key)) key = `${base}${suffix++}`;
  return key;
}

function getStatement(body: string) {
  return serializeEndorsementStatement(parseEndorsementWording(body) as Paragraph[]);
}

function getBlockStatus(field: FillIn) {
  if (field.system) return "Auto";
  return field.required ? "Required" : "Optional";
}

function updateFillInElement(element: HTMLElement, field: FillIn) {
  element.dataset.fillIn = field.key;
  element.setAttribute("contenteditable", "false");
  element.setAttribute("draggable", "true");
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.setAttribute(
    "aria-label",
    `${field.label}. ${field.system ? `Auto-filled from ${field.source}.` : `${getBlockStatus(field)} field.`}`
  );
  element.title = field.system ? `Auto-filled from ${field.source}` : "Click to edit. Drag to move.";
  element.className =
    "mx-0.5 inline-flex max-w-full cursor-grab select-none items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1 py-0 align-baseline text-xs font-semibold leading-5 text-blue-950 focus:outline-none focus:ring-2 focus:ring-blue-400 active:cursor-grabbing";
  element.replaceChildren();

  const label = document.createElement("span");
  label.className = "max-w-44 truncate";
  label.textContent = field.label;
  const status = document.createElement("span");
  status.className = "text-[10px] font-semibold uppercase text-blue-600";
  status.textContent = getBlockStatus(field);
  const remove = document.createElement("span");
  remove.dataset.removeFillIn = "true";
  remove.setAttribute("role", "button");
  remove.setAttribute("aria-label", `Remove ${field.label}`);
  remove.title = `Remove ${field.label}`;
  remove.className =
    "ml-0.5 rounded px-0.5 text-sm font-medium text-blue-500 hover:bg-blue-100 hover:text-red-600";
  remove.textContent = "×";
  element.append(label, status, remove);
}

function createFillInElement(field: FillIn) {
  const element = document.createElement("span");
  updateFillInElement(element, field);
  return element;
}

function serializeEditor(editor: HTMLElement) {
  let output = "";

  function appendNode(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      output += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.fillIn) {
      output += `{${node.dataset.fillIn}}`;
      return;
    }
    if (node.tagName === "BR") {
      output += "\n";
      return;
    }

    const isBlock = BLOCK_TAGS.has(node.tagName);
    const isEmptyBlock =
      isBlock &&
      node.childNodes.length === 1 &&
      node.firstChild instanceof HTMLElement &&
      node.firstChild.tagName === "BR";
    if (isBlock && output && !output.endsWith("\n")) output += "\n";
    if (isEmptyBlock) {
      output += "\n";
      return;
    }
    for (const child of node.childNodes) appendNode(child);
    if (isBlock) output += "\n";
  }

  for (const child of editor.childNodes) appendNode(child);
  return output.replace(/\n$/, "");
}

function getUsedKeys(editor: HTMLElement) {
  return new Set(
    Array.from(editor.querySelectorAll<HTMLElement>("[data-fill-in]"))
      .map((element) => element.dataset.fillIn)
      .filter((key): key is string => Boolean(key))
  );
}

function getRangeAtPoint(x: number, y: number) {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) {
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  return doc.caretRangeFromPoint?.(x, y) ?? null;
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
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const lastStatementRef = useRef("");
  const draggedElementRef = useRef<HTMLElement | null>(null);
  const touchDragRef = useRef<TouchDrag | null>(null);
  const suppressClickRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [fieldDraft, setFieldDraft] = useState<FieldDraft | null>(null);
  const [fieldError, setFieldError] = useState("");

  const baseFields = ENDORSEMENT_AUTOMATIC_FIELDS as FillIn[];
  const fieldCatalog = useMemo(() => {
    const byKey = new Map<string, FillIn>();
    for (const field of [...baseFields, ...suggestions, ...fields]) {
      const key = normalizeEndorsementAutomaticFieldKey(field.key);
      const automatic = baseFields.find((item) => item.key === key);
      if (!byKey.has(key)) byKey.set(key, automatic ?? { ...field, key });
    }
    for (const paragraph of parseEndorsementWording(body) as Paragraph[]) {
      for (const segment of paragraph.segments) {
        if (segment.type === "fill-in" && !byKey.has(segment.key)) {
          byKey.set(segment.key, {
            key: segment.key,
            label: humanizeKey(segment.key),
            type: "text",
            required: true,
          });
        }
      }
    }
    return byKey;
  }, [baseFields, body, fields, suggestions]);

  const pickerFields = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    return Array.from(fieldCatalog.values())
      .filter((field) => field.insertable !== false)
      .filter((field) => !query || `${field.label} ${field.source ?? ""}`.toLowerCase().includes(query))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [fieldCatalog, pickerQuery]);
  const automaticPickerFields = pickerFields.filter((field) => field.system);
  const questionPickerFields = pickerFields.filter((field) => !field.system);

  function renderStatement(statement: string) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.replaceChildren();
    for (const paragraph of parseEndorsementWording(statement) as Paragraph[]) {
      const line = document.createElement("div");
      for (const segment of paragraph.segments) {
        if (segment.type === "text") {
          line.append(document.createTextNode(segment.value));
        } else {
          const field = fieldCatalog.get(segment.key) ?? {
            key: segment.key,
            label: humanizeKey(segment.key),
            type: "text" as const,
            required: true,
          };
          line.append(createFillInElement(field));
        }
      }
      if (!line.hasChildNodes()) line.append(document.createElement("br"));
      editor.append(line);
    }
  }

  useEffect(() => {
    const editor = editorRef.current;
    const statement = getStatement(body);
    if (!editor) return;
    if (serializeEditor(editor) !== statement && lastStatementRef.current !== statement) {
      renderStatement(statement);
    }
    lastStatementRef.current = statement;
  });

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    for (const element of editor.querySelectorAll<HTMLElement>("[data-fill-in]")) {
      const field = element.dataset.fillIn ? fieldCatalog.get(element.dataset.fillIn) : undefined;
      if (field) updateFillInElement(element, field);
    }
  }, [fieldCatalog]);

  useEffect(() => {
    if (!pickerOpen && !fieldDraft) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      if (fieldDraft) setFieldDraft(null);
      else setPickerOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [fieldDraft, pickerOpen]);

  function emitChange(nextFields = fields) {
    const editor = editorRef.current;
    if (!editor) return;
    const statement = serializeEditor(editor);
    const usedKeys = getUsedKeys(editor);
    const systemKeys = new Set(baseFields.map((field) => field.key));
    const uniqueFields = new Map<string, EndorsementTemplateField>();
    for (const field of nextFields) {
      const key = normalizeEndorsementAutomaticFieldKey(field.key);
      if (usedKeys.has(key) && !systemKeys.has(key) && !uniqueFields.has(key)) {
        uniqueFields.set(key, { ...field, key });
      }
    }
    lastStatementRef.current = statement;
    onChange(statement, Array.from(uniqueFields.values()));
  }

  function saveSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedRangeRef.current = range.cloneRange();
  }

  function getInsertionRange() {
    const editor = editorRef.current;
    if (!editor) return null;
    if (savedRangeRef.current && editor.contains(savedRangeRef.current.commonAncestorContainer)) {
      return savedRangeRef.current;
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  }

  function placeCaret(range: Range) {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRangeRef.current = range.cloneRange();
    editorRef.current?.focus();
  }

  function insertField(field: FillIn, customFields = fields) {
    const range = getInsertionRange();
    if (!range) return;
    const element = createFillInElement(field);
    range.deleteContents();
    range.insertNode(element);
    const nextRange = document.createRange();
    nextRange.setStartAfter(element);
    nextRange.collapse(true);
    const systemField = baseFields.some((item) => item.key === field.key);
    const nextFields = systemField || customFields.some((item) => item.key === field.key)
      ? customFields
      : [...customFields, field];
    emitChange(nextFields);
    setPickerOpen(false);
    placeCaret(nextRange);
  }

  function removeFillIn(element: HTMLElement) {
    const range = document.createRange();
    range.setStartBefore(element);
    range.collapse(true);
    element.remove();
    emitChange();
    placeCaret(range);
  }

  function openFieldEditor(field: FillIn) {
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

  function saveFieldDraft() {
    if (!fieldDraft) return;
    const label = fieldDraft.label.trim();
    if (!label) {
      setFieldError("Enter the question users will see.");
      return;
    }
    const options = fieldDraft.optionsText.split("\n").map((option) => option.trim()).filter(Boolean);
    if ((fieldDraft.type === "select" || fieldDraft.type === "multi-select") && options.length === 0) {
      setFieldError("Add at least one choice.");
      return;
    }
    if (fieldDraft.editingKey) {
      emitChange(fields.map((field) => field.key === fieldDraft.editingKey ? {
        ...field,
        label,
        type: fieldDraft.type,
        required: fieldDraft.required,
        ...(options.length ? { options } : { options: undefined }),
        ...(fieldDraft.placeholder.trim()
          ? { placeholder: fieldDraft.placeholder.trim() }
          : { placeholder: undefined }),
      } : field));
      setFieldDraft(null);
      return;
    }
    const field: EndorsementTemplateField = {
      key: createFieldKey(label, new Set(fieldCatalog.keys())),
      label,
      type: fieldDraft.type,
      required: fieldDraft.required,
      ...(options.length ? { options } : {}),
      ...(fieldDraft.placeholder.trim() ? { placeholder: fieldDraft.placeholder.trim() } : {}),
    };
    insertField(field, [...fields, field]);
    setFieldDraft(null);
  }

  function adjacentFillIn(range: Range, before: boolean) {
    const container = range.startContainer;
    const offset = range.startOffset;
    let candidate: Node | null = null;
    if (container.nodeType === Node.TEXT_NODE) {
      const length = container.textContent?.length ?? 0;
      if (before && offset === 0) candidate = container.previousSibling;
      if (!before && offset === length) candidate = container.nextSibling;
    } else {
      candidate = before
        ? container.childNodes[offset - 1] ?? container.previousSibling
        : container.childNodes[offset] ?? container.nextSibling;
    }
    return candidate instanceof HTMLElement && candidate.dataset.fillIn ? candidate : null;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Backspace" && event.key !== "Delete") return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return;
    const element = adjacentFillIn(selection.getRangeAt(0), event.key === "Backspace");
    if (!element) return;
    event.preventDefault();
    removeFillIn(element);
  }

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const target = event.target as HTMLElement;
    const element = target.closest<HTMLElement>("[data-fill-in]");
    const key = element?.dataset.fillIn;
    if (!element || !key) return;
    if (target.closest("[data-remove-fill-in]")) removeFillIn(element);
    else {
      const field = fieldCatalog.get(key);
      if (field) openFieldEditor(field);
    }
  }

  function moveElement(element: HTMLElement, x: number, y: number) {
    const editor = editorRef.current;
    let range = getRangeAtPoint(x, y);
    if (!editor || !range || !editor.contains(range.commonAncestorContainer)) return;
    const target = range.startContainer instanceof HTMLElement
      ? range.startContainer.closest<HTMLElement>("[data-fill-in]")
      : range.startContainer.parentElement?.closest<HTMLElement>("[data-fill-in]");
    if (target === element) return;
    if (target) {
      const next = document.createRange();
      if (x < target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2) {
        next.setStartBefore(target);
      } else next.setStartAfter(target);
      next.collapse(true);
      range = next;
    }
    element.remove();
    range.insertNode(element);
    const caret = document.createRange();
    caret.setStartAfter(element);
    caret.collapse(true);
    emitChange();
    placeCaret(caret);
  }

  function clearTouchDrag() {
    const state = touchDragRef.current;
    if (!state) return;
    if (state.timer !== null) window.clearTimeout(state.timer);
    state.element.classList.remove("opacity-60", "ring-2", "ring-blue-400");
    touchDragRef.current = null;
  }

  return (
    <div className="mt-3 grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-700">Endorsement wording</h3>
        <button
          type="button"
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            saveSelection();
            setPickerQuery("");
            setPickerOpen(true);
          }}
        >
          Insert fill-in
        </button>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Endorsement wording"
        aria-multiline="true"
        spellCheck
        className="min-h-32 whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 [&>div]:min-h-6"
        onInput={() => {
          saveSelection();
          emitChange();
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onFocus={saveSelection}
        onClick={handleClick}
        onPaste={(event) => {
          event.preventDefault();
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
        }}
        onDragStart={(event) => {
          const element = (event.target as HTMLElement).closest<HTMLElement>("[data-fill-in]");
          if (!element) return;
          draggedElementRef.current = element;
          element.classList.add("opacity-50");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", element.dataset.fillIn ?? "fill-in");
        }}
        onDragOver={(event) => {
          if (draggedElementRef.current) event.preventDefault();
        }}
        onDrop={(event) => {
          const element = draggedElementRef.current;
          if (!element) return;
          event.preventDefault();
          moveElement(element, event.clientX, event.clientY);
          element.classList.remove("opacity-50");
          draggedElementRef.current = null;
        }}
        onDragEnd={() => {
          draggedElementRef.current?.classList.remove("opacity-50");
          draggedElementRef.current = null;
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          const element = (event.target as HTMLElement).closest<HTMLElement>("[data-fill-in]");
          if (!element) return;
          const state: TouchDrag = {
            active: false,
            element,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            x: event.clientX,
            y: event.clientY,
            timer: null,
          };
          state.timer = window.setTimeout(() => {
            state.active = true;
            element.classList.add("opacity-60", "ring-2", "ring-blue-400");
            editorRef.current?.setPointerCapture(state.pointerId);
          }, 420);
          touchDragRef.current = state;
        }}
        onPointerMove={(event) => {
          const state = touchDragRef.current;
          if (!state || state.pointerId !== event.pointerId) return;
          state.x = event.clientX;
          state.y = event.clientY;
          if (!state.active && Math.hypot(state.x - state.startX, state.y - state.startY) > 8) {
            clearTouchDrag();
          } else if (state.active) event.preventDefault();
        }}
        onPointerUp={(event) => {
          const state = touchDragRef.current;
          if (!state || state.pointerId !== event.pointerId) return;
          if (state.active) {
            event.preventDefault();
            suppressClickRef.current = true;
            moveElement(state.element, state.x, state.y);
          }
          clearTouchDrag();
        }}
        onPointerCancel={clearTouchDrag}
      />

      <p className="text-xs text-slate-500">
        <span className="font-medium text-slate-600">Signature details added automatically:</span>{" "}
        date, instructor name, certificate number and expiration date.
      </p>

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
              {automaticPickerFields.length ? (
                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase text-slate-500">Automatic information</p>
                  {automaticPickerFields.map((field) => (
                    <button key={field.key} type="button" className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50" onClick={() => insertField(field)}>
                      <span className="text-sm font-medium text-slate-900">{field.label}</span>
                      <span className="text-xs text-slate-500">Auto-filled · {field.source}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {questionPickerFields.length ? (
                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase text-slate-500">Questions for the user</p>
                  {questionPickerFields.map((field) => (
                    <button key={field.key} type="button" className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50" onClick={() => insertField(field)}>
                      <span className="text-sm font-medium text-slate-900">{field.label}</span>
                      <span className="text-xs text-slate-500">{field.type === "multi-select" ? "Multiple choice" : field.type === "select" ? "Single choice" : field.type === "date" ? "Date" : "Text"}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button type="button" className="primary-button mt-4 w-full" onClick={() => {
              setPickerOpen(false);
              setFieldError("");
              setFieldDraft(emptyFieldDraft);
            }}>
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
