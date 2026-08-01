"use client";

import { useState, type InputHTMLAttributes } from "react";

import {
  isoDateToUsInput,
  isoDateTimeLocalToUsInput,
  isoMonthToUsInput,
  parseUsDate,
  parseUsDateTimeLocal,
  parseUsMonth,
} from "@/lib/date-format";

type UsDateInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "maxLength" | "inputMode" | "pattern"
> & {
  precision?: "day" | "month";
  value: string;
  onChange: (value: string) => void;
};

function normalizeDraft(value: string, precision: "day" | "month") {
  const digits = value.replace(/\D/g, "").slice(0, precision === "day" ? 8 : 6);
  if (precision === "month") {
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  }
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

export function UsDateInput({
  precision = "day",
  value,
  onChange,
  onBlur,
  className = "",
  placeholder,
  ...props
}: UsDateInputProps) {
  const formatValue = precision === "day" ? isoDateToUsInput : isoMonthToUsInput;
  const parseValue = precision === "day" ? parseUsDate : parseUsMonth;
  const expectedLength = precision === "day" ? 10 : 7;
  const formatLabel = precision === "day" ? "MM/DD/YYYY" : "MM/YYYY";
  const [draft, setDraft] = useState(() => formatValue(value));
  const [editing, setEditing] = useState(false);

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={expectedLength}
      pattern={precision === "day" ? "\\d{2}/\\d{2}/\\d{4}" : "\\d{2}/\\d{4}"}
      className={className}
      placeholder={placeholder ?? formatLabel}
      value={editing ? draft : formatValue(value)}
      onFocus={() => {
        setDraft(formatValue(value));
        setEditing(true);
      }}
      onChange={(event) => {
        const nextDraft = normalizeDraft(event.target.value, precision);
        setDraft(nextDraft);
        event.currentTarget.setCustomValidity("");
        if (!nextDraft) {
          onChange("");
          return;
        }
        if (nextDraft.length === expectedLength) {
          const parsed = parseValue(nextDraft);
          if (parsed) onChange(parsed);
          else event.currentTarget.setCustomValidity(`Enter a valid date as ${formatLabel}.`);
        }
      }}
      onBlur={(event) => {
        const parsed = draft ? parseValue(draft) : "";
        event.currentTarget.setCustomValidity(
          draft && !parsed ? `Enter a valid date as ${formatLabel}.` : ""
        );
        setEditing(false);
        onBlur?.(event);
      }}
    />
  );
}

type UsDateTimeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "maxLength" | "inputMode" | "pattern"
> & {
  value: string;
  onChange: (value: string) => void;
};

function normalizeDateTimeDraft(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  if (digits.length > 10) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)} ${digits.slice(8, 10)}:${digits.slice(10)}`;
  if (digits.length > 8) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)} ${digits.slice(8)}`;
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

export function UsDateTimeInput({
  value,
  onChange,
  onBlur,
  className = "",
  placeholder = "MM/DD/YYYY HH:MM",
  min,
  max,
  ...props
}: UsDateTimeInputProps) {
  const [draft, setDraft] = useState(() => isoDateTimeLocalToUsInput(value));
  const [editing, setEditing] = useState(false);

  function validityMessage(nextValue: string) {
    const parsed = nextValue ? parseUsDateTimeLocal(nextValue) : "";
    if (nextValue && !parsed) return "Enter a valid date and 24-hour time as MM/DD/YYYY HH:MM.";
    if (parsed && typeof min === "string" && parsed < min) return `Enter a date and time on or after ${isoDateTimeLocalToUsInput(min)}.`;
    if (parsed && typeof max === "string" && parsed > max) return `Enter a date and time on or before ${isoDateTimeLocalToUsInput(max)}.`;
    return "";
  }

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={16}
      pattern="\\d{2}/\\d{2}/\\d{4} \\d{2}:\\d{2}"
      className={className}
      placeholder={placeholder}
      value={editing ? draft : isoDateTimeLocalToUsInput(value)}
      onFocus={() => {
        setDraft(isoDateTimeLocalToUsInput(value));
        setEditing(true);
      }}
      onChange={(event) => {
        const nextDraft = normalizeDateTimeDraft(event.target.value);
        setDraft(nextDraft);
        const message = nextDraft.length === 16 ? validityMessage(nextDraft) : "";
        event.currentTarget.setCustomValidity(message);
        if (!nextDraft) onChange("");
        else if (!message && nextDraft.length === 16) onChange(parseUsDateTimeLocal(nextDraft) ?? "");
      }}
      onBlur={(event) => {
        event.currentTarget.setCustomValidity(validityMessage(draft));
        setEditing(false);
        onBlur?.(event);
      }}
    />
  );
}
