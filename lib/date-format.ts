const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

export function formatUsDate(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  const match = value.match(ISO_DATE_PATTERN);
  if (match) return `${match[2]}/${match[3]}/${match[1]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatUsMonthYear(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[2]}/${match[1]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatUsDateTime(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function isoDateToUsInput(value: string | null | undefined) {
  return value ? formatUsDate(value, "") : "";
}

export function isoMonthToUsInput(value: string | null | undefined) {
  return value ? formatUsMonthYear(value, "") : "";
}

export function isoDateTimeLocalToUsInput(value: string | null | undefined) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) return `${match[2]}/${match[3]}/${match[1]} ${match[4]}:${match[5]}`;
  return "";
}

export function parseUsDate(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return `${match[3]}-${match[1]}-${match[2]}`;
}

export function parseUsMonth(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  if (month < 1 || month > 12) return null;
  return `${match[2]}-${match[1]}`;
}

export function parseUsDateTimeLocal(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (!match) return null;
  const date = parseUsDate(`${match[1]}/${match[2]}/${match[3]}`);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (!date || hour > 23 || minute > 59) return null;
  return `${date}T${match[4]}:${match[5]}`;
}

export function monthToLastIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${match[1]}-${match[2]}-${String(day).padStart(2, "0")}`;
}
