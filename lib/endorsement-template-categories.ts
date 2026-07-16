export const ENDORSEMENT_TEMPLATE_CATEGORY_ORDER = [
  "TSA / Citizenship",
  "Student Solo",
  "Solo Cross-Country & Airspace",
  "Checkride / Common Requirements",
  "Checkride / Private Pilot",
  "Checkride / Commercial Pilot",
  "Checkride / Instrument Rating",
  "Checkride / ATP",
  "Checkride / Flight Instructor",
  "Checkride / Sport CFI",
  "Checkride / Add-on & Type Ratings",
  "Checkride / Retest",
  "Checkride / Recreational Pilot",
  "Checkride / Sport Pilot",
  "Flight Review, IPC & Currency",
  "Aircraft Operating Privileges",
  "Add-on Ratings & Type Ratings",
  "Flight Instructor",
  "Robinson Helicopter SFAR 73",
  "Glider, Towing & Ultralight",
  "NVG, EFVS & Special Systems",
];

export function getEndorsementTemplateCategory(title: string, referenceNumber?: string | null) {
  const number = Number(String(referenceNumber ?? "").replace(/^A/i, ""));

  if (number >= 1 && number <= 96) {
    if (number === 14) return "TSA / Citizenship";
    if ((number >= 3 && number <= 8) || number === 34) return "Student Solo";
    if ([9, 10, 11, 12, 13, 15, 16, 23, 35].includes(number)) return "Solo Cross-Country & Airspace";
    if ([1, 2].includes(number)) return "Checkride / Common Requirements";
    if ([17, 18, 19, 20, 21, 22].includes(number)) return "Checkride / Sport Pilot";
    if ([29, 30].includes(number)) return "Checkride / Recreational Pilot";
    if ([36, 37].includes(number)) return "Checkride / Private Pilot";
    if ([38, 39].includes(number)) return "Checkride / Commercial Pilot";
    if ([42, 43, 44].includes(number)) return "Checkride / Instrument Rating";
    if ([40, 41].includes(number)) return "Checkride / ATP";
    if ([45, 46, 47, 48].includes(number)) return "Checkride / Flight Instructor";
    if ([51, 52, 53, 54, 55, 56].includes(number)) return "Checkride / Sport CFI";
    if ([77].includes(number)) return "Checkride / Retest";
    if ([78, 79, 80, 81, 82].includes(number)) return "Checkride / Add-on & Type Ratings";
    if ([24, 25, 26, 27, 28, 31, 32, 72, 73, 74, 75, 76, 95, 96].includes(number)) {
      return "Aircraft Operating Privileges";
    }
    if ([33, 59, 69, 70, 71].includes(number)) return "Flight Review, IPC & Currency";
    if (number >= 60 && number <= 68) return "Robinson Helicopter SFAR 73";
    if ([83, 84, 85, 87].includes(number)) return "Glider, Towing & Ultralight";
    if ([49, 50, 57, 58].includes(number)) return "Flight Instructor";
    if ([86].includes(number)) return "Checkride / Common Requirements";
    if (number >= 88 && number <= 94) return "NVG, EFVS & Special Systems";
  }

  const normalizedTitle = String(title || "").trim();
  if (/solo|pre-solo/i.test(normalizedTitle)) return "Student Solo";
  if (/TSA|citizenship/i.test(normalizedTitle)) return "TSA / Citizenship";
  if (/knowledge|practical|checkride|test/i.test(normalizedTitle)) return "Checkride / Common Requirements";
  if (/flight instructor|CFI|CFII|spin/i.test(normalizedTitle)) return "Flight Instructor";
  if (/flight review|IPC|currency|WINGS|recurrent/i.test(normalizedTitle)) return "Flight Review, IPC & Currency";
  if (/retest/i.test(normalizedTitle)) return "Checkride / Retest";
  if (/R-22|R-44|Robinson/i.test(normalizedTitle)) return "Robinson Helicopter SFAR 73";
  if (/glider|ultralight|towing/i.test(normalizedTitle)) return "Glider, Towing & Ultralight";
  if (/NVG|EFVS|night vision/i.test(normalizedTitle)) return "NVG, EFVS & Special Systems";
  return "Aircraft Operating Privileges";
}
