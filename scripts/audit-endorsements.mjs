import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const templatesPath = path.join(root, "components", "tools-native", "templates.js");
const generatorPath = path.join(root, "components", "tools-native", "EndorsementGenerator.js");
const templateLibPath = path.join(root, "lib", "endorsement-templates.ts");
const templateSqlPath = path.join(root, "supabase", "endorsement_templates.sql");
const seedExporterPath = path.join(root, "scripts", "export-endorsement-template-seed.mjs");
const wordingEditorPath = path.join(root, "lib", "endorsement-wording.js");
const adminPanelPath = path.join(root, "components", "dashboard", "EndorsementTemplateAdminPanel.tsx");
const wordingEditorComponentPath = path.join(root, "components", "dashboard", "EndorsementWordingEditor.tsx");

const templatesSource = fs.readFileSync(templatesPath, "utf8");
const generatorSource = fs.readFileSync(generatorPath, "utf8");
const templateLibSource = fs.readFileSync(templateLibPath, "utf8");
const templateSqlSource = fs.readFileSync(templateSqlPath, "utf8");
const seedExporterSource = fs.readFileSync(seedExporterPath, "utf8");
const adminPanelSource = fs.readFileSync(adminPanelPath, "utf8");
const wordingEditorComponentSource = fs.readFileSync(wordingEditorComponentPath, "utf8");
const templateModule = await import(pathToFileURL(templatesPath).href);
const wordingModule = await import(pathToFileURL(wordingEditorPath).href);
const fallbackTemplates = templateModule.default;
const fallbackTemplateRows = Object.values(fallbackTemplates);
const fallbackReferenceNumbers = fallbackTemplateRows
  .map((template) => template.referenceNumber)
  .filter(Boolean)
  .sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
const expectedReferenceNumbers = Array.from({ length: 96 }, (_, index) => `A${index + 1}`);
const automaticFieldKeys = new Set(
  wordingModule.ENDORSEMENT_AUTOMATIC_FIELDS.map((field) => field.key)
);
const legacyAutomaticFieldKeys = Object.keys(wordingModule.ENDORSEMENT_AUTOMATIC_FIELD_ALIASES);

const checks = [
  {
    name: "TSA citizenship endorsement uses the AC 61-65K body text citation",
    pass:
      templatesSource.includes("49 CFR § 1552.7(a)") &&
      templatesSource.includes(
        "I certify that {studentName} has presented me a {citizenshipDocument}, {citizenshipDocumentNumber} establishing that they are a U.S. citizen or national in accordance with 49 CFR § 1552.7(a)."
      ),
  },
  {
    name: "TSA citizenship UI keeps document type and document number as separate fields",
    pass:
      templatesSource.includes('"citizenshipDocument": {') &&
      templatesSource.includes('"citizenshipDocumentNumber": {') &&
      generatorSource.includes("'citizenshipDocumentNumber'"),
  },
  {
    name: "TSA citizenship endorsement does not use the old document-number wording",
    pass:
      !templatesSource.includes("document number {citizenshipDocumentNumber}") &&
      !templatesSource.includes("{citizenshipDocument}, document number"),
  },
  {
    name: "Old TSA regulatory citation is not present in generator templates",
    pass: !templatesSource.includes("49 CFR § 1552.15(c)"),
  },
  {
    name: "Helicopter touchdown autorotation text matches AC 61-65K A.50 wording",
    pass:
      templatesSource.includes(
        "straight-in autorotations in a single engine helicopter and autorotation with turns in a single engine helicopter to include touchdown"
      ) &&
      templatesSource.includes(
        "related to straight-in autorotations in a single engine helicopter and autorotation with turns in a single engine helicopter"
      ),
  },
  {
    name: "Fallback templates cover AC A1 through A96 once",
    pass:
      fallbackTemplateRows.length === 96 &&
      new Set(fallbackReferenceNumbers).size === 96 &&
      expectedReferenceNumbers.every((referenceNumber, index) => fallbackReferenceNumbers[index] === referenceNumber),
  },
  {
    name: "Generator can search and show AC numbers",
    pass:
      generatorSource.includes("referenceNumber") &&
      generatorSource.includes("template.referenceNumber") &&
      generatorSource.includes("getEndorsementTemplateCategory(title, template.referenceNumber)"),
  },
  {
    name: "No duplicated CFR prefix or accidental duplicated required wording",
    pass:
      !templatesSource.includes("14 CFR §14 CFR") &&
      !templatesSource.includes("required training required"),
  },
  {
    name: "Generator loads active Supabase templates with local fallback",
    pass:
      generatorSource.includes("fetchActiveEndorsementTemplates") &&
      generatorSource.includes("fetchEndorsementTemplateSettings") &&
      generatorSource.includes("fallbackTemplates") &&
      generatorSource.includes("endorsementTemplatesToGeneratorMap"),
  },
  {
    name: "Endorsement template data layer validates field shape",
    pass:
      templateLibSource.includes("validateEndorsementTemplateFields") &&
      templateLibSource.includes("Fields must be a JSON array.") &&
      templateLibSource.includes("Field ${key} must include options."),
  },
  {
    name: "Endorsement template data layer validates AC numbers",
    pass:
      templateLibSource.includes("normalizeReferenceNumber") &&
      templateLibSource.includes("AC number must look like A1 through A96.") &&
      templateLibSource.includes("reference_number"),
  },
  {
    name: "Endorsement templates table allows active public reads and admin writes",
    pass:
      templateSqlSource.includes("create table if not exists public.endorsement_templates") &&
      templateSqlSource.includes("to anon, authenticated") &&
      templateSqlSource.includes("profiles.role = 'admin'"),
  },
  {
    name: "Endorsement templates table stores unique AC numbers",
    pass:
      templateSqlSource.includes("reference_number text") &&
      templateSqlSource.includes("endorsement_templates_reference_number_check") &&
      templateSqlSource.includes("endorsement_templates_reference_number_key"),
  },
  {
    name: "Endorsement source details are stored separately and editable by admins",
    pass:
      templateLibSource.includes("fetchEndorsementTemplateSettings") &&
      templateLibSource.includes("updateEndorsementTemplateSettings") &&
      templateSqlSource.includes("create table if not exists public.endorsement_template_settings") &&
      templateSqlSource.includes("endorsement_template_settings_update_admin"),
  },
  {
    name: "Individual endorsement rows do not store duplicate source details",
    pass:
      !templateSqlSource.includes("source text,") &&
      !templateSqlSource.includes("source_date text,") &&
      !seedExporterSource.includes("source_date = excluded.source_date") &&
      !seedExporterSource.includes("(key, title, body, fields, category, source, source_date"),
  },
  {
    name: "Seed exporter generates SQL from fallback template source",
    pass:
      seedExporterSource.includes("components\", \"tools-native\", \"templates.js") &&
      seedExporterSource.includes("reference_number") &&
      seedExporterSource.includes("on conflict (key) do update set"),
  },
  {
    name: "Visual wording parser round-trips every fallback template",
    pass: fallbackTemplateRows.every((template) =>
      wordingModule.serializeEndorsementWording(
        wordingModule.parseEndorsementWording(template.text)
      ) === template.text
    ),
  },
  {
    name: "Visual wording parser keeps repeated fill-ins unique for questions",
    pass:
      wordingModule.getEndorsementStatementTokens(
        "I certify {studentName} and {studentName} completed {trainingType}."
      ).join(",") === "studentName,trainingType",
  },
  {
    name: "Automatic endorsement information uses one six-field registry",
    pass:
      automaticFieldKeys.size === 6 &&
      [
        "studentName",
        "studentCertNumber",
        "instructorName",
        "instructorCertNumber",
        "instructorCertExpDate",
        "date",
      ].every((key) => automaticFieldKeys.has(key)),
  },
  {
    name: "Fallback templates do not ask users for automatic information",
    pass: fallbackTemplateRows.every((template) =>
      (template.fields ?? []).every(
        (field) => !automaticFieldKeys.has(field.key) && !legacyAutomaticFieldKeys.includes(field.key)
      )
    ),
  },
  {
    name: "Legacy pilot certificate tokens are normalized",
    pass:
      legacyAutomaticFieldKeys.every((key) => !templatesSource.includes(`{${key}}`)) &&
      wordingModule.normalizeEndorsementAutomaticFieldKey("cfiCertificateNumber") ===
        "studentCertNumber" &&
      wordingModule.normalizeEndorsementAutomaticFieldKey("pilotCertificateNumber") ===
        "studentCertNumber",
  },
  {
    name: "Admin endorsement form hides implementation fields",
    pass:
      !adminPanelSource.includes("fieldsJson") &&
      !adminPanelSource.includes("Unique short name") &&
      !adminPanelSource.includes("List order") &&
      adminPanelSource.includes("EndorsementWordingEditor"),
  },
  {
    name: "Endorsement wording uses one inline editing canvas",
    pass:
      wordingEditorComponentSource.includes("contentEditable") &&
      wordingEditorComponentSource.includes('data-fill-in') &&
      wordingEditorComponentSource.includes("serializeEditor") &&
      !wordingEditorComponentSource.includes("Paragraph {paragraphIndex + 1}") &&
      !wordingEditorComponentSource.includes("Insert fill-in here") &&
      !wordingEditorComponentSource.includes(">Earlier<") &&
      !wordingEditorComponentSource.includes(">Later<"),
  },
  {
    name: "Inline fill-ins support editing, deletion, and drag placement",
    pass:
      wordingEditorComponentSource.includes('setAttribute("draggable", "true")') &&
      wordingEditorComponentSource.includes("removeFillIn") &&
      wordingEditorComponentSource.includes("moveElement") &&
      wordingEditorComponentSource.includes("getRangeAtPoint") &&
      wordingEditorComponentSource.includes("onPointerDown"),
  },
];

const failures = checks.filter((check) => !check.pass);

if (failures.length > 0) {
  console.error("Endorsement audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure.name}`);
  }
  process.exit(1);
}

console.log(`Endorsement audit passed (${checks.length} checks).`);
