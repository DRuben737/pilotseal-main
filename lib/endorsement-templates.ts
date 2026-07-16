import { getSupabaseClient } from "@/lib/supabase";

export type EndorsementTemplateStatus = "active" | "inactive" | "archived";

export type EndorsementTemplateField = {
  key: string;
  label: string;
  type: "text" | "date" | "select" | "multi-select";
  required: boolean;
  options?: string[];
  placeholder?: string;
  hideOptionalTag?: boolean;
};

export type EndorsementTemplate = {
  id: string;
  key: string;
  reference_number: string | null;
  title: string;
  body: string;
  fields: EndorsementTemplateField[];
  category: string | null;
  status: EndorsementTemplateStatus;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

export type EndorsementTemplateSettings = {
  id: string;
  source: string;
  source_date: string;
  updated_date: string;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type EndorsementTemplateInput = {
  key: string;
  reference_number?: string | null;
  title: string;
  body: string;
  fields: unknown;
  category?: string | null;
  status: EndorsementTemplateStatus;
  sort_order?: number | null;
  userId?: string | null;
};

export type EndorsementTemplateSettingsInput = {
  source: string;
  source_date: string;
  updated_date: string;
  userId?: string | null;
};

export type EndorsementTemplateMap = Record<
  string,
  {
    text: string;
    fields: EndorsementTemplateField[];
    category?: string | null;
    sortOrder?: number;
    referenceNumber?: string | null;
  }
>;

const ENDORSEMENT_TEMPLATE_SELECT =
  "id, key, reference_number, title, body, fields, category, status, sort_order, created_at, updated_at, created_by, updated_by";
const ENDORSEMENT_TEMPLATE_SETTINGS_SELECT = "id, source, source_date, updated_date, updated_at, updated_by";

const VALID_STATUSES = new Set(["active", "inactive", "archived"]);
const VALID_FIELD_TYPES = new Set(["text", "date", "select", "multi-select"]);

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeReferenceNumber(value: unknown) {
  const normalized = normalizeText(value).toUpperCase();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^A([1-9][0-9]?)$/);
  if (!match) {
    throw new Error("AC number must look like A1 through A96.");
  }

  const number = Number(match[1]);
  if (number < 1 || number > 96) {
    throw new Error("AC number must be between A1 and A96.");
  }

  return `A${number}`;
}

function assertValidStatus(value: unknown): EndorsementTemplateStatus {
  const status = normalizeText(value) || "inactive";
  if (!VALID_STATUSES.has(status)) {
    throw new Error("Template status must be active, inactive, or archived.");
  }
  return status as EndorsementTemplateStatus;
}

export function validateEndorsementTemplateFields(value: unknown): EndorsementTemplateField[] {
  if (!Array.isArray(value)) {
    throw new Error("Fields must be a JSON array.");
  }

  return value.map((field, index) => {
    if (!field || typeof field !== "object") {
      throw new Error(`Field ${index + 1} must be an object.`);
    }

    const record = field as Record<string, unknown>;
    const key = normalizeText(record.key);
    const label = normalizeText(record.label);
    const type = normalizeText(record.type) || "text";

    if (!key) {
      throw new Error(`Field ${index + 1} is missing a key.`);
    }

    if (!label) {
      throw new Error(`Field ${key} is missing a label.`);
    }

    if (!VALID_FIELD_TYPES.has(type)) {
      throw new Error(`Field ${key} has an unsupported type.`);
    }

    const options = Array.isArray(record.options)
      ? record.options.map((option) => normalizeText(option)).filter(Boolean)
      : undefined;

    if ((type === "select" || type === "multi-select") && (!options || options.length === 0)) {
      throw new Error(`Field ${key} must include options.`);
    }

    return {
      key,
      label,
      type: type as EndorsementTemplateField["type"],
      required: Boolean(record.required),
      ...(options ? { options } : {}),
      ...(normalizeText(record.placeholder) ? { placeholder: normalizeText(record.placeholder) } : {}),
      ...(record.hideOptionalTag === true ? { hideOptionalTag: true } : {}),
    };
  });
}

function normalizeTemplateRecord(record: Record<string, unknown>): EndorsementTemplate {
  return {
    id: normalizeText(record.id),
    key: normalizeText(record.key),
    reference_number: normalizeReferenceNumber(record.reference_number),
    title: normalizeText(record.title),
    body: String(record.body ?? ""),
    fields: validateEndorsementTemplateFields(record.fields ?? []),
    category: normalizeNullableText(record.category),
    status: assertValidStatus(record.status),
    sort_order: Number.isFinite(Number(record.sort_order)) ? Number(record.sort_order) : 0,
    created_at: normalizeNullableText(record.created_at),
    updated_at: normalizeNullableText(record.updated_at),
    created_by: normalizeNullableText(record.created_by),
    updated_by: normalizeNullableText(record.updated_by),
  };
}

function normalizeSettingsRecord(record: Record<string, unknown>): EndorsementTemplateSettings {
  return {
    id: normalizeText(record.id),
    source: normalizeText(record.source),
    source_date: normalizeText(record.source_date),
    updated_date: normalizeText(record.updated_date),
    updated_at: normalizeNullableText(record.updated_at),
    updated_by: normalizeNullableText(record.updated_by),
  };
}

export function normalizeEndorsementTemplateInput(input: EndorsementTemplateInput) {
  const key = normalizeText(input.key);
  const title = normalizeText(input.title);
  const body = String(input.body ?? "").trim();
  const fields = validateEndorsementTemplateFields(input.fields);

  if (!key) {
    throw new Error("Template key is required.");
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(key)) {
    throw new Error("Template key must use lowercase letters, numbers, and hyphens.");
  }

  if (!title) {
    throw new Error("Template title is required.");
  }

  if (!body) {
    throw new Error("Template body is required.");
  }

  return {
    key,
    reference_number: normalizeReferenceNumber(input.reference_number),
    title,
    body,
    fields,
    category: normalizeNullableText(input.category),
    status: assertValidStatus(input.status),
    sort_order: Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0,
    updated_by: input.userId || null,
  };
}

export function normalizeEndorsementTemplateSettingsInput(input: EndorsementTemplateSettingsInput) {
  const source = normalizeText(input.source);
  const sourceDate = normalizeText(input.source_date);
  const updatedDate = normalizeText(input.updated_date);

  if (!source) {
    throw new Error("Template data is required.");
  }

  if (!sourceDate) {
    throw new Error("Source date is required.");
  }

  if (!updatedDate) {
    throw new Error("Updated date is required.");
  }

  return {
    source,
    source_date: sourceDate,
    updated_date: updatedDate,
    updated_by: input.userId || null,
  };
}

export function endorsementTemplatesToGeneratorMap(
  templates: EndorsementTemplate[]
): EndorsementTemplateMap {
  return Object.fromEntries(
    templates.map((template) => [
      template.title,
      {
        text: template.body,
        fields: template.fields,
        category: template.category,
        sortOrder: template.sort_order,
        referenceNumber: template.reference_number,
      },
    ])
  );
}

export async function fetchActiveEndorsementTemplates() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("endorsement_templates")
    .select(ENDORSEMENT_TEMPLATE_SELECT)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("reference_number", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(normalizeTemplateRecord);
}

export async function fetchAdminEndorsementTemplates() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("endorsement_templates")
    .select(ENDORSEMENT_TEMPLATE_SELECT)
    .order("sort_order", { ascending: true })
    .order("reference_number", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(normalizeTemplateRecord);
}

export async function fetchEndorsementTemplateSettings() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("endorsement_template_settings")
    .select(ENDORSEMENT_TEMPLATE_SETTINGS_SELECT)
    .eq("id", "default")
    .single();

  if (error) {
    throw error;
  }

  return normalizeSettingsRecord(data as Record<string, unknown>);
}

export async function updateEndorsementTemplateSettings(input: EndorsementTemplateSettingsInput) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("endorsement_template_settings")
    .update(normalizeEndorsementTemplateSettingsInput(input))
    .eq("id", "default")
    .select(ENDORSEMENT_TEMPLATE_SETTINGS_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return normalizeSettingsRecord(data as Record<string, unknown>);
}

export async function createEndorsementTemplate(input: EndorsementTemplateInput) {
  const supabase = getSupabaseClient();
  const payload = {
    ...normalizeEndorsementTemplateInput(input),
    created_by: input.userId || null,
  };
  const { data, error } = await supabase
    .from("endorsement_templates")
    .insert(payload)
    .select(ENDORSEMENT_TEMPLATE_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return normalizeTemplateRecord(data as Record<string, unknown>);
}

export async function updateEndorsementTemplate(id: string, input: EndorsementTemplateInput) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("endorsement_templates")
    .update(normalizeEndorsementTemplateInput(input))
    .eq("id", id)
    .select(ENDORSEMENT_TEMPLATE_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return normalizeTemplateRecord(data as Record<string, unknown>);
}
