import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const templatesPath = path.join(root, "components", "tools-native", "templates.js");
const generatorPath = path.join(root, "components", "tools-native", "EndorsementGenerator.js");

const templatesSource = fs.readFileSync(templatesPath, "utf8");
const generatorSource = fs.readFileSync(generatorPath, "utf8");

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
      templatesSource.includes("citizenshipDocument: {") &&
      templatesSource.includes("citizenshipDocumentNumber: {") &&
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
    name: "Instrument rating endorsements include powered-lift",
    pass: templatesSource.includes('"Instrument-Powered-Lift"'),
  },
  {
    name: "Blank-template sizing recognizes citizenship document number",
    pass: generatorSource.includes("'citizenshipDocumentNumber'"),
  },
  {
    name: "No duplicated CFR prefix or accidental duplicated required wording",
    pass:
      !templatesSource.includes("14 CFR §14 CFR") &&
      !templatesSource.includes("required training required"),
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
