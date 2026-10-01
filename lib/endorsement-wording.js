export const ENDORSEMENT_SIGNATURE_BLOCK = `Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`;

export const ENDORSEMENT_AUTOMATIC_FIELDS = [
  {
    key: "studentName",
    label: "Pilot name",
    type: "text",
    required: false,
    system: true,
    source: "Saved pilot",
    insertable: true,
  },
  {
    key: "studentCertNumber",
    label: "Pilot certificate number",
    type: "text",
    required: false,
    hideOptionalTag: true,
    system: true,
    source: "Saved pilot certificate",
    insertable: true,
  },
  { key: "instructorName", label: "Instructor name", type: "text", required: false, system: true, source: "Saved instructor", insertable: false },
  { key: "instructorCertNumber", label: "Instructor certificate number", type: "text", required: false, system: true, source: "Saved instructor certificate", insertable: false },
  { key: "instructorCertExpDate", label: "Instructor certificate expiration", type: "text", required: false, system: true, source: "Saved instructor certificate", insertable: false },
  { key: "date", label: "Endorsement date", type: "date", required: false, system: true, source: "Today", insertable: false },
];

export const ENDORSEMENT_AUTOMATIC_FIELD_ALIASES = {
  cfiCertificateNumber: "studentCertNumber",
  pilotCertNumber: "studentCertNumber",
  pilotCertificateNumber: "studentCertNumber",
};

export const ENDORSEMENT_BASE_FILL_INS = ENDORSEMENT_AUTOMATIC_FIELDS;

export function normalizeEndorsementAutomaticFieldKey(key) {
  return ENDORSEMENT_AUTOMATIC_FIELD_ALIASES[key] ?? key;
}

const TOKEN_PATTERN = /\{([^}]+)\}/g;

export function stripEndorsementSignatureBlock(body) {
  const normalized = String(body ?? "").replace(/\r\n/g, "\n");
  const trimmed = normalized.trimEnd();
  if (!trimmed.endsWith(ENDORSEMENT_SIGNATURE_BLOCK)) {
    return normalized;
  }

  return trimmed
    .slice(0, -ENDORSEMENT_SIGNATURE_BLOCK.length)
    .replace(/\n$/, "");
}

export function appendEndorsementSignatureBlock(body) {
  const statement = stripEndorsementSignatureBlock(body).trimEnd();
  return statement
    ? `${statement}\n${ENDORSEMENT_SIGNATURE_BLOCK}`
    : ENDORSEMENT_SIGNATURE_BLOCK;
}

export function parseEndorsementWording(body) {
  const statement = stripEndorsementSignatureBlock(body);
  const lines = statement ? statement.split("\n") : [""];

  return lines.map((line) => {
    const segments = [];
    let cursor = 0;
    let match;

    TOKEN_PATTERN.lastIndex = 0;
    while ((match = TOKEN_PATTERN.exec(line)) !== null) {
      segments.push({ type: "text", value: line.slice(cursor, match.index) });
      segments.push({ type: "fill-in", key: normalizeEndorsementAutomaticFieldKey(match[1]) });
      cursor = match.index + match[0].length;
    }
    segments.push({ type: "text", value: line.slice(cursor) });

    return { segments };
  });
}

export function serializeEndorsementStatement(paragraphs) {
  return paragraphs
    .map((paragraph) =>
      paragraph.segments
        .map((segment) => (segment.type === "fill-in" ? `{${segment.key}}` : segment.value))
        .join("")
    )
    .join("\n");
}

export function serializeEndorsementWording(paragraphs) {
  return appendEndorsementSignatureBlock(serializeEndorsementStatement(paragraphs));
}

export function getEndorsementStatementTokens(body) {
  const tokens = [];
  const seen = new Set();
  const statement = stripEndorsementSignatureBlock(body);

  TOKEN_PATTERN.lastIndex = 0;
  for (const match of statement.matchAll(TOKEN_PATTERN)) {
    const key = normalizeEndorsementAutomaticFieldKey(match[1]);
    if (!seen.has(key)) {
      seen.add(key);
      tokens.push(key);
    }
  }

  return tokens;
}
