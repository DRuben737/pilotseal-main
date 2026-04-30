const NOTAM_TERM_MAP = {
  AD: "aerodrome",
  ADAP: "airport development aid program",
  AP: "airport",
  APCH: "approach",
  ARR: "arrival",
  ARRS: "arrivals",
  ARPT: "airport",
  BTN: "between",
  CLNC: "clearance",
  CLSD: "closed",
  COM: "communications",
  CTAF: "common traffic advisory frequency",
  CTL: "control",
  CTLD: "controlled",
  DEP: "departure",
  DEPS: "departures",
  DLY: "daily",
  EAST: "east",
  EST: "estimated",
  EXC: "except",
  FDC: "flight data center",
  FREQ: "frequency",
  FRI: "Friday",
  GND: "ground",
  GP: "glide path",
  GRASS: "grass",
  HDG: "heading",
  HEL: "helicopter",
  IAP: "instrument approach procedure",
  ID: "identifier",
  ILS: "instrument landing system",
  INDEFLY: "indefinitely",
  INTXN: "intersection",
  LDG: "landing",
  LGT: "lighting",
  LTD: "limited",
  MAINT: "maintenance",
  MEN: "men",
  "M-F": "Monday through Friday",
  MON: "Monday",
  MOV: "movement",
  NAV: "navigation",
  NSTD: "nonstandard",
  OBSC: "obscured",
  OBST: "obstacle",
  OPS: "operations",
  OTS: "out of service",
  PERM: "permanent",
  PILOT: "pilot",
  PPR: "prior permission required",
  PROC: "procedure",
  RDO: "radio",
  REIL: "runway end identifier lights",
  RMK: "remark",
  ROTG: "rotating",
  RPZL: "runway precipitation zone lights",
  RSA: "runway safety area",
  RTIL: "runway threshold identifier lights",
  RWY: "runway",
  SAT: "Saturday",
  SFC: "surface",
  SID: "standard instrument departure",
  SLP: "sea level pressure",
  SPLY: "supply",
  STAR: "standard terminal arrival route",
  SUN: "Sunday",
  SVC: "service",
  TAXI: "taxi",
  TFR: "temporary flight restriction",
  THR: "threshold",
  THRU: "through",
  THU: "Thursday",
  TIL: "until",
  TMPA: "temporary",
  TUE: "Tuesday",
  TWY: "taxiway",
  UFN: "until further notice",
  UNL: "unlimited",
  UNSVC: "unserviceable",
  "U/S": "unserviceable",
  VASI: "visual approach slope indicator",
  VGSI: "visual glide slope indicator",
  WED: "Wednesday",
  WEF: "with effect from",
  WIP: "work in progress",
  "W/O": "without",
  WPT: "waypoint",
};

function titleize(text) {
  return text
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function formatNotamTimestamp(token) {
  if (!token) return null;
  const match = String(token).match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  return `20${year}-${month}-${day} ${hour}:${minute}Z`;
}

function formatTimeWindow(segment) {
  if (!segment) return null;
  if (segment === "PERM") return "Permanent";
  if (segment === "EST") return "Estimated";
  if (segment === "UFN") return "Until further notice";

  const match = String(segment).match(
    /^(\d{10}|PERM|EST|UFN)-(\d{10}|PERM|EST|UFN)$/
  );

  if (!match) return null;

  const start = formatNotamTimestamp(match[1]) ?? match[1];
  const end = formatNotamTimestamp(match[2]) ?? match[2];
  return `${start} to ${end}`;
}

function decodeToken(token) {
  if (!token) return token;
  if (NOTAM_TERM_MAP[token]) return NOTAM_TERM_MAP[token];
  if (/^[A-Z]{2,}\/[A-Z0-9]{1,}$/.test(token)) {
    const [left, right] = token.split("/");
    const decodedLeft = NOTAM_TERM_MAP[left] ?? left.toLowerCase();
    return `${decodedLeft} ${right}`;
  }
  return token;
}

function decodeBody(body) {
  const tokens = body.split(/\s+/).filter(Boolean);
  return tokens.map((token) => decodeToken(token)).join(" ");
}

function extractTimeWindow(text) {
  const match = text.match(/\b(\d{10}|PERM|EST|UFN)-(\d{10}|PERM|EST|UFN)\b/);
  return match ? match[0] : null;
}

function extractSubject(tokens) {
  const candidates = [
    "RWY",
    "TWY",
    "APRON",
    "NAV",
    "ILS",
    "VASI",
    "VGSI",
    "OBST",
    "CRANE",
    "AIRSPACE",
    "SID",
    "STAR",
    "IAP",
    "COM",
    "SVC",
  ];

  const first = tokens.find((token) => candidates.includes(token));
  if (first) return decodeToken(first);

  return tokens[0] ? decodeToken(tokens[0]) : null;
}

function extractCondition(tokens) {
  const conditions = ["CLSD", "OTS", "U/S", "UNSVC", "WIP", "EST", "PERM", "UFN"];
  const token = tokens.find((entry) => conditions.includes(entry));
  return token ? decodeToken(token) : null;
}

export function parseNotam(rawInput) {
  const raw = rawInput.trim().replace(/\s+/g, " ");
  if (!raw) return null;

  const normalized = raw.toUpperCase();
  let source = "NOTAM";
  let accountability = null;
  let notamNumber = null;
  let body = normalized;

  const domesticMatch = normalized.match(/^!([A-Z0-9]{3,5})\s+([A-Z]\d{4}\/\d{2})\s+(.+)$/);
  const fdcMatch = normalized.match(/^FDC\s+(\d+\/\d+)\s+(.+)$/);

  if (domesticMatch) {
    accountability = domesticMatch[1];
    notamNumber = domesticMatch[2];
    body = domesticMatch[3];
  } else if (fdcMatch) {
    source = "FDC";
    notamNumber = fdcMatch[1];
    body = fdcMatch[2];
  }

  const bodyTokens = body.split(/\s+/).filter(Boolean);
  const location = bodyTokens[0] && /^[A-Z0-9]{3,5}$/.test(bodyTokens[0]) ? bodyTokens[0] : accountability;
  const timeWindowToken = extractTimeWindow(body);
  const subject = extractSubject(bodyTokens);
  const condition = extractCondition(bodyTokens);
  const decodedBody = decodeBody(body);

  return {
    kind: "notam",
    raw,
    source,
    accountability,
    location,
    notamNumber,
    subject,
    condition,
    effectiveWindow: formatTimeWindow(timeWindowToken),
    timeWindowToken,
    decodedBody,
    body,
  };
}
