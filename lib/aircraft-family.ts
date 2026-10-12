export type AircraftFamily = {
  key: string;
  label: string;
};

export type AircraftFamilyGroup<T> = AircraftFamily & {
  items: T[];
};

const naturalCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

const manufacturerPrefix = /^(CESSNA|PIPER|DIAMOND|CIRRUS|ROBINSON|BEECHCRAFT|BEECH|MOONEY)\s+/;

const knownFamilies: Array<{ pattern: RegExp; family: AircraftFamily }> = [
  { pattern: /^(?:C)?150[A-Z0-9]*$/, family: { key: "c150", label: "C150" } },
  { pattern: /^(?:C)?152[A-Z0-9]*$/, family: { key: "c152", label: "C152" } },
  { pattern: /^(?:C)?172[A-Z0-9]*$/, family: { key: "c172", label: "C172" } },
  { pattern: /^(?:C)?177[A-Z0-9]*$/, family: { key: "c177", label: "C177" } },
  { pattern: /^(?:C)?182[A-Z0-9]*$/, family: { key: "c182", label: "C182" } },
  { pattern: /^(?:C)?206[A-Z0-9]*$/, family: { key: "c206", label: "C206" } },
  { pattern: /^(?:C)?210[A-Z0-9]*$/, family: { key: "c210", label: "C210" } },
  { pattern: /^PA28R[A-Z0-9]*$/, family: { key: "pa-28r", label: "PA-28R" } },
  { pattern: /^PA28[A-Z0-9]*$/, family: { key: "pa-28", label: "PA-28" } },
  { pattern: /^DA20[A-Z0-9]*$/, family: { key: "da20", label: "DA20" } },
  { pattern: /^DA40[A-Z0-9]*$/, family: { key: "da40", label: "DA40" } },
  { pattern: /^DA42[A-Z0-9]*$/, family: { key: "da42", label: "DA42" } },
  { pattern: /^SR20[A-Z0-9]*$/, family: { key: "sr20", label: "SR20" } },
  { pattern: /^SR22T[A-Z0-9]*$/, family: { key: "sr22t", label: "SR22T" } },
  { pattern: /^SR22[A-Z0-9]*$/, family: { key: "sr22", label: "SR22" } },
  { pattern: /^R22[A-Z0-9]*$/, family: { key: "r22", label: "R22" } },
  { pattern: /^R44[A-Z0-9]*$/, family: { key: "r44", label: "R44" } },
  { pattern: /^R66[A-Z0-9]*$/, family: { key: "r66", label: "R66" } },
];

function cleanModelName(modelName: string | null | undefined) {
  return String(modelName ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[\u2012-\u2015]/g, "-")
    .replace(/\s+/g, " ");
}

function familyKeyFromLabel(label: string) {
  return label
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown-model";
}

export function getAircraftFamily(modelName: string | null | undefined): AircraftFamily {
  const cleaned = cleanModelName(modelName);
  if (!cleaned) return { key: "unknown-model", label: "Unknown model" };

  const withoutManufacturer = cleaned
    .toLocaleUpperCase("en")
    .replace(manufacturerPrefix, "")
    .trim();
  const compact = withoutManufacturer.replace(/[^A-Z0-9]/g, "");
  const match = knownFamilies.find((candidate) => candidate.pattern.test(compact));
  if (match) return match.family;

  return {
    key: familyKeyFromLabel(cleaned),
    label: cleaned,
  };
}

export function groupByAircraftFamily<T>(
  items: readonly T[],
  getModelName: (item: T) => string | null | undefined,
): AircraftFamilyGroup<T>[] {
  const groups = new Map<string, AircraftFamilyGroup<T>>();

  for (const item of items) {
    const family = getAircraftFamily(getModelName(item));
    const existing = groups.get(family.key);
    if (existing) existing.items.push(item);
    else groups.set(family.key, { ...family, items: [item] });
  }

  return Array.from(groups.values()).sort((left, right) =>
    naturalCollator.compare(left.label, right.label)
  );
}

export function compareAircraftLabels(left: string, right: string) {
  return naturalCollator.compare(left, right);
}
