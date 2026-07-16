import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "components", "tools-native", "templates.js");
const categoryHelperPath = path.join(root, "lib", "endorsement-template-categories.ts");

function slugifyTemplateKey(title) {
  return title
    .toLowerCase()
    .replace(/<=/g, "lte")
    .replace(/>=/g, "gte")
    .replace(/</g, "lt")
    .replace(/>/g, "gt")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function createUniqueTemplateKey(title, usedKeys) {
  const baseKey = slugifyTemplateKey(title);
  let key = baseKey;
  let suffix = 2;

  while (usedKeys.has(key)) {
    key = `${baseKey}-${suffix}`;
    suffix += 1;
  }

  usedKeys.add(key);
  return key;
}

function sqlString(value) {
  if (value == null || value === "") {
    return "null";
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

const source = await fs.readFile(sourcePath, "utf8");
const categoryHelperSource = await fs.readFile(categoryHelperPath, "utf8");
const tempPath = path.join(os.tmpdir(), `pilotseal-templates-${Date.now()}.mjs`);
const tempCategoryPath = path.join(os.tmpdir(), `pilotseal-template-categories-${Date.now()}.mjs`);
const chunkSizeArg = process.argv.find((arg) => arg.startsWith("--chunk-size="));
const chunkSize = chunkSizeArg ? Number.parseInt(chunkSizeArg.split("=")[1], 10) : 0;

await fs.writeFile(tempPath, source, "utf8");
await fs.writeFile(
  tempCategoryPath,
  ts.transpileModule(categoryHelperSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  "utf8"
);

try {
  const templateModule = await import(pathToFileURL(tempPath).href);
  const categoryModule = await import(pathToFileURL(tempCategoryPath).href);
  const templates = templateModule.default;
  const getCategory = categoryModule.getEndorsementTemplateCategory;
  const usedKeys = new Set();
  const rows = Object.entries(templates).map(([title, template], index) => {
    const templateKey = template.key || createUniqueTemplateKey(title, usedKeys);
    usedKeys.add(templateKey);

    return {
      key: templateKey,
      reference_number: template.referenceNumber ?? null,
      title,
      body: template.text,
      fields: template.fields ?? [],
      category: template.category ?? getCategory(title, template.referenceNumber),
      status: "active",
      sort_order: Number.isFinite(Number(template.sortOrder)) ? Number(template.sortOrder) : index,
    };
  });

  const rowSql = rows.map((row) =>
    [
      "  (",
      [
        sqlString(row.key),
        sqlString(row.reference_number),
        sqlString(row.title),
        sqlString(row.body),
        sqlJson(row.fields),
        sqlString(row.category),
        sqlString(row.status),
        row.sort_order,
      ].join(", "),
      ")",
    ].join("")
  );
  const chunks =
    Number.isFinite(chunkSize) && chunkSize > 0
      ? Array.from({ length: Math.ceil(rowSql.length / chunkSize) }, (_, index) =>
          rowSql.slice(index * chunkSize, index * chunkSize + chunkSize)
        )
      : [rowSql];

  console.log("-- Generated from components/tools-native/templates.js");
  console.log("-- Apply supabase/endorsement_templates.sql before running this seed.");

  chunks.forEach((chunk, index) => {
    if (chunks.length > 1) {
      console.log(`-- chunk ${index + 1} of ${chunks.length}`);
    }
    console.log("insert into public.endorsement_templates");
    console.log("  (key, reference_number, title, body, fields, category, status, sort_order)");
    console.log("values");
    console.log(chunk.join(",\n"));
    console.log("on conflict (key) do update set");
    console.log("  reference_number = excluded.reference_number,");
    console.log("  title = excluded.title,");
    console.log("  body = excluded.body,");
    console.log("  fields = excluded.fields,");
    console.log("  category = excluded.category,");
    console.log("  status = excluded.status,");
    console.log("  sort_order = excluded.sort_order;");
  });
} finally {
  await fs.rm(tempPath, { force: true });
  await fs.rm(tempCategoryPath, { force: true });
}
