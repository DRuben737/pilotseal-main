"use client";

import { useEffect, useRef, useState } from "react";

const PILOT_LEVELS = ["Student", "Private", "Commercial", "ATP"] as const;

const CATEGORY_CLASS_RATINGS = [
  "ASEL",
  "AMEL",
  "ASES",
  "AMES",
  "Rotorcraft-Helicopter",
  "Rotorcraft-Gyroplane",
  "Glider",
  "Balloon",
  "Powered Lift",
] as const;

const INSTRUMENT_RATINGS = ["Airplane", "Helicopter"] as const;

function availablePrivilegeTypes(level: string) {
  const levelIndex = PILOT_LEVELS.indexOf(level as (typeof PILOT_LEVELS)[number]);
  if (levelIndex <= 0) return [];
  return [...PILOT_LEVELS.slice(1, levelIndex), "Instrument"];
}

function ratingsForPrivilegeType(type: string): readonly string[] {
  return type === "Instrument" ? INSTRUMENT_RATINGS : CATEGORY_CLASS_RATINGS;
}

function normalizePrivilege(value: string) {
  const [type, rating] = value.split(" — ");
  if ((type === "Private" || type === "Commercial") && rating === "IR-Airplane") {
    return "Instrument — Airplane";
  }
  if ((type === "Private" || type === "Commercial") && rating === "IR-Helicopter") {
    return "Instrument — Helicopter";
  }
  return value;
}

export function normalizeLowerPrivileges(values: string[], level: string) {
  const allowedTypes = new Set(availablePrivilegeTypes(level));
  return Array.from(new Set(values.map(normalizePrivilege))).filter((value) => {
    const [type, rating] = value.split(" — ");
    return allowedTypes.has(type) && ratingsForPrivilegeType(type).includes(rating);
  });
}

export default function PilotPrivilegePicker({
  level,
  value,
  onChange,
}: {
  level: string;
  value: string[];
  onChange: (privileges: string[]) => void;
}) {
  const availableTypes = availablePrivilegeTypes(level);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const typeSelectRef = useRef<HTMLSelectElement>(null);
  const [adding, setAdding] = useState(false);
  const [editorLevel, setEditorLevel] = useState("");
  const [privilegeType, setPrivilegeType] = useState("");
  const [rating, setRating] = useState("");
  const editorOpen = adding && editorLevel === level;

  useEffect(() => {
    if (editorOpen) typeSelectRef.current?.focus();
  }, [editorOpen]);

  function closeEditor() {
    setAdding(false);
    setEditorLevel("");
    setPrivilegeType("");
    setRating("");
    window.requestAnimationFrame(() => addButtonRef.current?.focus());
  }

  function addPrivilege() {
    if (!privilegeType || !rating) return;
    const privilege = `${privilegeType} — ${rating}`;
    if (!value.includes(privilege)) onChange([...value, privilege]);
    closeEditor();
  }

  if (!level) {
    return <p className="pilot-privilege-help">Select the primary certificate level first.</p>;
  }

  return (
    <div className="pilot-privilege-picker">
      {value.length > 0 ? (
        <div className="pilot-privilege-list" aria-label="Added privileges">
          {value.map((privilege) => (
            <span className="pilot-privilege-item" key={privilege}>
              <span>{privilege}</span>
              <button
                type="button"
                aria-label={`Remove ${privilege}`}
                onClick={() => onChange(value.filter((item) => item !== privilege))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="pilot-privilege-help">No additional privileges added.</p>
      )}

      {editorOpen ? (
        <div
          className="pilot-privilege-editor"
          onKeyDown={(event) => {
            if (event.key === "Escape") closeEditor();
          }}
        >
          <label className="saas-field">
            <span>Privilege level or type</span>
            <select
              ref={typeSelectRef}
              value={privilegeType}
              onChange={(event) => {
                setPrivilegeType(event.target.value);
                setRating("");
              }}
            >
              <option value="">Select privilege</option>
              {availableTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="saas-field">
            <span>Rating</span>
            <select
              value={rating}
              disabled={!privilegeType}
              onChange={(event) => setRating(event.target.value)}
            >
              <option value="">Select rating</option>
              {ratingsForPrivilegeType(privilegeType).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <div className="pilot-privilege-actions">
            <button type="button" className="primary-button" disabled={!privilegeType || !rating} onClick={addPrivilege}>Add</button>
            <button type="button" className="secondary-button" onClick={closeEditor}>Cancel</button>
          </div>
        </div>
      ) : (
        <button
          ref={addButtonRef}
          type="button"
          className="secondary-button pilot-privilege-add"
          disabled={availableTypes.length === 0}
          onClick={() => {
            setEditorLevel(level);
            setPrivilegeType("");
            setRating("");
            setAdding(true);
          }}
        >
          Add additional privilege
        </button>
      )}
    </div>
  );
}
