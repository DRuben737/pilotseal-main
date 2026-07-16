export const ENDORSEMENT_TEMPLATE_CATEGORY_ORDER = [
  "Solo Endorsements",
  "Other Solo",
  "Solo Cross-Country",
  "Private Pilot",
  "Instrument Rating",
  "Commercial Pilot",
  "CFI",
  "CFII",
  "Sport Pilot",
  "Add Category / Class",
  "Additional Category / Class",
  "Retest / Recurrent / IPC",
  "Aircraft & Operating Endorsements",
  "Other PIC",
];

const explicitCategoryMap: Record<string, string | null> = {
  "TSA U.S. Citizenship": null,
  "Practical Test Prereqs": "Retest / Recurrent / IPC",
  "Pre-Solo Written": "Solo Endorsements",
  "Pre-Solo Flight Training": "Solo Endorsements",
  "Pre-Solo Night Training": "Other Solo",
  "Solo Flight Initial 90 Days": "Solo Endorsements",
  "Solo Flight Additional 90 Days": "Solo Endorsements",
  "Solo in other airport": "Other Solo",
  "Solo airport inside Class B": "Other Solo",
  "Solo in Class B": "Other Solo",
  "Solo Flight in Class B/C/D": "Other Solo",
  "Solo Ops at Towered/Class B/C/D Airport": "Other Solo",
  "Solo cross-country training": "Solo Cross-Country",
  "Solo cross-country plan review": "Solo Cross-Country",
  "Solo cross-country day": "Solo Cross-Country",
  "Repeated Solo XC Within 50 NM": "Solo Cross-Country",
  "PIC Solo Outside Rating": "Add Category / Class",
  "PVT addon- deficiency": "Add Category / Class",
  "PVT addon-checkride": "Add Category / Class",
  "IR addon": "Add Category / Class",
  "COM addon": "Add Category / Class",
  "Sport Pilot Proficiency Check": "Sport Pilot",
  "Sport Pilot Practical Test": "Sport Pilot",
  "LSA PIC VH <= 87 KCAS": "Sport Pilot",
  "LSA PIC VH > 87 KCAS": "Sport Pilot",
  "Sport Pilot Night": "Sport Pilot",
  "Sport Pilot Retractable Gear PIC": "Sport Pilot",
  "Sport Pilot Controllable Pitch Propeller PIC": "Sport Pilot",
  "PVT knowledge test": "Private Pilot",
  "PVT Written Deficiencies": "Private Pilot",
  "PVT Practical Test": "Private Pilot",
  "PVT 2-Month Review": "Private Pilot",
  "COM knowledge test": "Commercial Pilot",
  "COM Written Deficiencies": "Commercial Pilot",
  "COM Practical Test": "Commercial Pilot",
  "COM 2-Month Review": "Commercial Pilot",
  "IR knowledge test": "Instrument Rating",
  "IR Written Deficiencies": "Instrument Rating",
  "IR Practical Test": "Instrument Rating",
  "IR 2-Month Review": "Instrument Rating",
  "FOI knowledge test": "CFI",
  "CFI Knowledge Test": "CFI",
  "CFI Knowledge Test Deficiencies": "CFI",
  "CFII Written Deficiency": "CFII",
  "CFI required training": "CFI",
  "Spin training": "CFI",
  "Helicopter Touchdown Autorotation": "CFI",
  "CFII Practical Test": "CFII",
  "Flight review": "Retest / Recurrent / IPC",
  "Instrument proficiency check": "Retest / Recurrent / IPC",
  "Ground Instructor Recency": "Retest / Recurrent / IPC",
  "Written Retest": "Retest / Recurrent / IPC",
  "Practical Test Retest": "Retest / Recurrent / IPC",
  "R-22/R-44 Awareness": "Solo Endorsements",
  "R-22 solo endorsement": "Solo Endorsements",
  "R-22 PIC": "Other PIC",
  "R-22 Flight Review": "Retest / Recurrent / IPC",
  "R-44 solo endorsement": "Solo Endorsements",
  "R-44 PIC": "Other PIC",
  "R-44 Flight Review": "Retest / Recurrent / IPC",
  "Complex Airplane PIC": "Other PIC",
  "High-Performance Airplane PIC": "Other PIC",
  "High-Altitude Pressurized PIC": "Other PIC",
  "Tailwheel Airplane PIC": "Other PIC",
  "Simplified Flight Controls PIC": "Other PIC",
  "Simplified Flight Controls Initial Cadre": "Other PIC",
  "Night Vision Goggles": "Other PIC",
  "NVG ground training": "Other PIC",
  "NVG PIC": "Other PIC",
};

export function getEndorsementTemplateCategory(title: string) {
  const normalizedTitle = String(title || "").trim().replace(/\s+/g, " ");

  if (
    /pre-solo night training/i.test(normalizedTitle) ||
    /solo airport inside class b/i.test(normalizedTitle) ||
    /solo in class b/i.test(normalizedTitle) ||
    /solo in other airport/i.test(normalizedTitle)
  ) {
    return "Other Solo";
  }

  if (explicitCategoryMap[normalizedTitle]) {
    return explicitCategoryMap[normalizedTitle];
  }

  if (normalizedTitle in explicitCategoryMap && explicitCategoryMap[normalizedTitle] === null) {
    return null;
  }

  if (/additional category|additional class|category\/class|category and class/i.test(normalizedTitle)) {
    return "Additional Category / Class";
  }

  return "Aircraft & Operating Endorsements";
}
