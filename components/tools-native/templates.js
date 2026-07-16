// src/templates.js

const SIGNATURE_BLOCK = `Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`;

export const endorsementTemplateDataVersion = {
  source: "AC 61-65K Appendix A",
  sourceDate: "2025-11-14",
  updatedAt: "2026-07-16",
  sourceFile: "AC_61-65K_34-58 conv.docx",
};

const BASE_FIELD_KEYS = new Set([
  "studentName",
  "studentCertNumber",
  "date",
  "instructorName",
  "instructorCertNumber",
  "instructorCertExpDate",
]);

const FIELD_LIBRARY = {
  "aircraft": {
    "label": "Aircraft make and model",
    "type": "text",
    "required": true
  },
  "aircraftCategory": {
    "label": "Aircraft category",
    "type": "select",
    "required": true,
    "options": [
      "Airplane",
      "Helicopter",
      "Glider",
      "Powered-Lift",
      "Weight-Shift-Control",
      "Powered Parachute",
      "Lighter-Than-Air"
    ]
  },
  "airspaceName": {
    "label": "Airspace name",
    "type": "text",
    "required": true
  },
  "airportName": {
    "label": "Airport name",
    "type": "text",
    "required": true
  },
  "airportPair": {
    "label": "Airport names",
    "type": "text",
    "required": true
  },
  "annualReviewDueDate": {
    "label": "Annual review due date",
    "type": "date",
    "required": true
  },
  "categoryClass": {
    "label": "Category and class",
    "type": "select",
    "required": true,
    "options": [
      "Airplane Single-Engine Land",
      "Airplane Multi-Engine Land",
      "Airplane Single-Engine Sea",
      "Airplane Multi-Engine Sea",
      "Rotorcraft Helicopter",
      "Rotorcraft Gyroplane",
      "Glider",
      "Powered-Lift",
      "Lighter-Than-Air Airship",
      "Lighter-Than-Air Balloon",
      "Weight-Shift-Control Land",
      "Weight-Shift-Control Sea",
      "Powered Parachute Land",
      "Powered Parachute Sea"
    ]
  },
  "categoryClassModel": {
    "label": "Category, class, and aircraft",
    "type": "text",
    "required": true
  },
  "categoryClassType": {
    "label": "Category, class, or type",
    "type": "text",
    "required": true
  },
  "certificateRatingPrivilege": {
    "label": "Certificate, rating, or privilege",
    "type": "text",
    "required": true
  },
  "certificateLevel": {
    "label": "Certificate or rating",
    "type": "select",
    "required": true,
    "options": [
      "Sport Pilot",
      "Recreational Pilot",
      "Private Pilot",
      "Commercial Pilot",
      "Instrument Rating",
      "Flight Instructor",
      "Flight Instructor Instrument",
      "Flight Instructor with Sport Pilot Rating",
      "Airline Transport Pilot"
    ]
  },
  "certificateCategoryClass": {
    "label": "Category, class, or rating",
    "type": "select",
    "required": true,
    "options": [
      "Airplane Single-Engine Land",
      "Airplane Multi-Engine Land",
      "Airplane Single-Engine Sea",
      "Airplane Multi-Engine Sea",
      "Rotorcraft Helicopter",
      "Rotorcraft Gyroplane",
      "Glider",
      "Powered-Lift",
      "Lighter-Than-Air Airship",
      "Lighter-Than-Air Balloon",
      "Weight-Shift-Control Land",
      "Weight-Shift-Control Sea",
      "Powered Parachute Land",
      "Powered Parachute Sea",
      "Instrument-Airplane",
      "Instrument-Helicopter",
      "Instrument-Powered-Lift",
      "Flight Instructor Airplane Single-Engine",
      "Flight Instructor Airplane Multi-Engine",
      "Flight Instructor Rotorcraft-Helicopter",
      "Flight Instructor Rotorcraft-Gyroplane",
      "Flight Instructor Glider"
    ]
  },
  "certificateType": {
    "label": "Certificate or rating",
    "type": "select",
    "required": true,
    "options": [
      "Sport Pilot certificate with Airplane Single-Engine Land privileges",
      "Sport Pilot certificate with Glider privileges",
      "Recreational Pilot certificate with Airplane Single-Engine Land rating",
      "Private Pilot certificate with Airplane Single-Engine Land rating",
      "Private Pilot certificate with Airplane Multi-Engine Land rating",
      "Private Pilot certificate with Rotorcraft-Helicopter rating",
      "Commercial Pilot certificate with Airplane Single-Engine Land rating",
      "Commercial Pilot certificate with Airplane Multi-Engine Land rating",
      "Commercial Pilot certificate with Rotorcraft-Helicopter rating",
      "Instrument-Airplane rating",
      "Instrument-Helicopter rating",
      "Instrument-Powered-Lift rating",
      "Flight Instructor certificate with Airplane Single-Engine rating",
      "Flight Instructor certificate with Instrument-Airplane rating",
      "Flight Instructor certificate with Sport Pilot rating",
      "Airline Transport Pilot certificate with Airplane Multi-Engine Land rating"
    ]
  },
  "cfiCertificateNumber": {
    "label": "CFI certificate number",
    "type": "text",
    "required": true
  },
  "cfiKnowledgeParagraph": {
    "label": "14 CFR § 61.185(a) paragraph",
    "type": "select",
    "required": true,
    "options": [
      "(2)",
      "(3)"
    ]
  },
  "citizenshipDocument": {
    "label": "Citizenship document",
    "type": "text",
    "required": true
  },
  "citizenshipDocumentNumber": {
    "label": "Document control or sequential number",
    "type": "text",
    "required": true
  },
  "efvsOperationRule": {
    "label": "EFVS operation rule",
    "type": "select",
    "required": true,
    "options": [
      "14 CFR § 91.176(a)",
      "14 CFR § 91.176(b)",
      "14 CFR § 91.176(a) and (b)"
    ]
  },
  "eventDate": {
    "label": "Date",
    "type": "date",
    "required": true
  },
  "flightReviewAircraft": {
    "label": "Aircraft used for review",
    "type": "text",
    "required": false
  },
  "limitations": {
    "label": "Limitations",
    "type": "text",
    "required": true
  },
  "gliderLaunchMethod": {
    "label": "Launch method",
    "type": "select",
    "required": true,
    "options": [
      "ground-tow",
      "aerotow",
      "self-launch"
    ]
  },
  "groundInstructorRecencyDate": {
    "label": "Date recent experience was met",
    "type": "date",
    "required": true
  },
  "groundInstructorType": {
    "label": "Ground instructor level",
    "type": "select",
    "required": true,
    "options": [
      "Basic",
      "Advanced",
      "Instrument",
      "Master"
    ]
  },
  "institutionName": {
    "label": "Institution name",
    "type": "text",
    "required": true
  },
  "instrumentRatingCategory": {
    "label": "Instrument rating category",
    "type": "select",
    "required": true,
    "options": [
      "airplane",
      "helicopter",
      "powered-lift"
    ]
  },
  "knowledgeTestName": {
    "label": "Knowledge test",
    "type": "select",
    "required": true,
    "options": [
      "Sport Pilot Airplane",
      "Sport Pilot Gyroplane",
      "Sport Pilot Glider",
      "Sport Pilot Airship",
      "Sport Pilot Balloon",
      "Sport Pilot Weight-Shift-Control",
      "Sport Pilot Powered Parachute",
      "Recreational Pilot Airplane",
      "Recreational Pilot Helicopter",
      "Recreational Pilot Gyroplane",
      "Private Pilot Airplane",
      "Private Pilot Helicopter",
      "Private Pilot Gyroplane",
      "Private Pilot Powered-Lift",
      "Private Pilot Glider",
      "Private Pilot Airship",
      "Private Pilot Balloon",
      "Commercial Pilot Airplane",
      "Commercial Pilot Helicopter",
      "Commercial Pilot Gyroplane",
      "Commercial Pilot Powered-Lift",
      "Commercial Pilot Glider",
      "Commercial Pilot Airship",
      "Commercial Pilot Balloon",
      "Instrument Rating Airplane",
      "Instrument Rating Helicopter",
      "Instrument Rating Powered-Lift",
      "Fundamentals of Instructing",
      "Flight Instructor Airplane",
      "Flight Instructor Helicopter",
      "Flight Instructor Glider",
      "Flight Instructor Instrument Airplane",
      "Flight Instructor Instrument Helicopter",
      "Flight Instructor Instrument Powered-Lift",
      "Flight Instructor with Sport Pilot Rating",
      "Airline Transport Pilot Multiengine Airplane"
    ]
  },
  "sportPilotTestCategory": {
    "label": "Sport Pilot test type",
    "type": "select",
    "required": true,
    "options": [
      "Airplane",
      "Gyroplane",
      "Glider",
      "Airship",
      "Balloon",
      "Weight-Shift-Control",
      "Powered Parachute"
    ]
  },
  "sportPilotPracticalCategory": {
    "label": "Sport Pilot practical test type",
    "type": "select",
    "required": true,
    "options": [
      "Airplane Single-Engine Land",
      "Airplane Single-Engine Sea",
      "Rotorcraft-Gyroplane",
      "Glider",
      "Lighter-Than-Air Airship",
      "Lighter-Than-Air Balloon",
      "Weight-Shift-Control Land",
      "Weight-Shift-Control Sea",
      "Powered Parachute Land",
      "Powered Parachute Sea"
    ]
  },
  "recreationalPilotTestCategory": {
    "label": "Recreational Pilot test type",
    "type": "select",
    "required": true,
    "options": [
      "Airplane Single-Engine Land",
      "Airplane Single-Engine Sea",
      "Rotorcraft-Helicopter",
      "Rotorcraft-Gyroplane",
      "Glider",
      "Lighter-Than-Air Airship",
      "Lighter-Than-Air Balloon"
    ]
  },
  "privatePilotTestCategory": {
    "label": "Private Pilot test type",
    "type": "select",
    "required": true,
    "options": [
      "Airplane",
      "Helicopter",
      "Gyroplane",
      "Powered-Lift",
      "Glider",
      "Airship",
      "Balloon"
    ]
  },
  "privatePilotPracticalCategory": {
    "label": "Private Pilot practical test type",
    "type": "select",
    "required": true,
    "options": [
      "Airplane Single-Engine Land",
      "Airplane Multi-Engine Land",
      "Airplane Single-Engine Sea",
      "Airplane Multi-Engine Sea",
      "Rotorcraft-Helicopter",
      "Rotorcraft-Gyroplane",
      "Glider",
      "Powered-Lift",
      "Lighter-Than-Air Airship",
      "Lighter-Than-Air Balloon"
    ]
  },
  "commercialPilotTestCategory": {
    "label": "Commercial Pilot test type",
    "type": "select",
    "required": true,
    "options": [
      "Airplane",
      "Helicopter",
      "Gyroplane",
      "Powered-Lift",
      "Glider",
      "Airship",
      "Balloon"
    ]
  },
  "commercialPilotPracticalCategory": {
    "label": "Commercial Pilot practical test type",
    "type": "select",
    "required": true,
    "options": [
      "Airplane Single-Engine Land",
      "Airplane Multi-Engine Land",
      "Airplane Single-Engine Sea",
      "Airplane Multi-Engine Sea",
      "Rotorcraft-Helicopter",
      "Rotorcraft-Gyroplane",
      "Glider",
      "Powered-Lift",
      "Lighter-Than-Air Airship",
      "Lighter-Than-Air Balloon"
    ]
  },
  "flightInstructorKnowledgeTest": {
    "label": "Flight Instructor test type",
    "type": "select",
    "required": true,
    "options": [
      "Airplane",
      "Helicopter",
      "Gyroplane",
      "Glider",
      "Instrument Airplane",
      "Instrument Helicopter",
      "Instrument Powered-Lift"
    ]
  },
  "sportCfiKnowledgeTest": {
    "label": "Sport CFI test type",
    "type": "select",
    "required": true,
    "options": [
      "Airplane",
      "Gyroplane",
      "Glider",
      "Airship",
      "Balloon",
      "Weight-Shift-Control",
      "Powered Parachute"
    ]
  },
  "localConditions": {
    "label": "Conditions or limitations",
    "type": "text",
    "required": true
  },
  "pilotCertificateGrade": {
    "label": "Pilot certificate",
    "type": "text",
    "required": true
  },
  "practicalTestType": {
    "label": "Practical test",
    "type": "select",
    "required": true,
    "options": [
      "Sport Pilot Airplane Single-Engine Land practical test",
      "Sport Pilot Airplane Single-Engine Sea practical test",
      "Sport Pilot Rotorcraft-Gyroplane practical test",
      "Sport Pilot Glider practical test",
      "Sport Pilot Lighter-Than-Air Airship practical test",
      "Sport Pilot Lighter-Than-Air Balloon practical test",
      "Sport Pilot Weight-Shift-Control Land practical test",
      "Sport Pilot Weight-Shift-Control Sea practical test",
      "Sport Pilot Powered Parachute Land practical test",
      "Sport Pilot Powered Parachute Sea practical test",
      "Recreational Pilot Airplane Single-Engine Land practical test",
      "Recreational Pilot Airplane Single-Engine Sea practical test",
      "Recreational Pilot Rotorcraft-Helicopter practical test",
      "Recreational Pilot Rotorcraft-Gyroplane practical test",
      "Recreational Pilot Glider practical test",
      "Recreational Pilot Lighter-Than-Air Airship practical test",
      "Recreational Pilot Lighter-Than-Air Balloon practical test",
      "Private Pilot Airplane Single-Engine Land practical test",
      "Private Pilot Airplane Multi-Engine Land practical test",
      "Private Pilot Airplane Single-Engine Sea practical test",
      "Private Pilot Airplane Multi-Engine Sea practical test",
      "Private Pilot Rotorcraft-Helicopter practical test",
      "Private Pilot Rotorcraft-Gyroplane practical test",
      "Private Pilot Glider practical test",
      "Private Pilot Powered-Lift practical test",
      "Private Pilot Lighter-Than-Air Airship practical test",
      "Private Pilot Lighter-Than-Air Balloon practical test",
      "Commercial Pilot Airplane Single-Engine Land practical test",
      "Commercial Pilot Airplane Multi-Engine Land practical test",
      "Commercial Pilot Airplane Single-Engine Sea practical test",
      "Commercial Pilot Airplane Multi-Engine Sea practical test",
      "Commercial Pilot Rotorcraft-Helicopter practical test",
      "Commercial Pilot Rotorcraft-Gyroplane practical test",
      "Commercial Pilot Glider practical test",
      "Commercial Pilot Powered-Lift practical test",
      "Commercial Pilot Lighter-Than-Air Airship practical test",
      "Commercial Pilot Lighter-Than-Air Balloon practical test",
      "Instrument-Airplane practical test",
      "Instrument-Helicopter practical test",
      "Instrument-Powered-Lift practical test",
      "Flight Instructor Airplane Single-Engine practical test",
      "Flight Instructor Rotorcraft-Helicopter practical test",
      "Flight Instructor Instrument-Airplane practical test",
      "Flight Instructor Instrument-Helicopter practical test",
      "Flight Instructor with Sport Pilot Rating practical test"
    ]
  },
  "proficiencyCheckName": {
    "label": "Proficiency check",
    "type": "text",
    "required": true
  },
  "restrictedAtpParagraph": {
    "label": "14 CFR § 61.160 paragraph",
    "type": "select",
    "required": true,
    "options": [
      "(b)",
      "(c)",
      "(d)"
    ]
  },
  "routeDescription": {
    "label": "Route of flight",
    "type": "text",
    "required": true
  },
  "routeFrom": {
    "label": "Departure airport",
    "type": "text",
    "required": true
  },
  "routeLandings": {
    "label": "Landing airports",
    "type": "text",
    "required": true
  },
  "routeTo": {
    "label": "Arrival airport",
    "type": "text",
    "required": true
  },
  "spinAircraftCategory": {
    "label": "Aircraft category for spin training",
    "type": "select",
    "required": true,
    "options": [
      "airplane",
      "glider"
    ]
  },
  "towedVehicleDescription": {
    "label": "Towed vehicle or simulated procedure",
    "type": "text",
    "required": true
  },
  "trainingType": {
    "label": "Training type",
    "type": "select",
    "required": true,
    "options": [
      "flight",
      "ground",
      "flight and ground"
    ]
  },
  "retestTestName": {
    "label": "Failed test",
    "type": "text",
    "required": true
  },
  "typeRating": {
    "label": "Type rating",
    "type": "text",
    "required": true
  },
  "ultralightHours": {
    "label": "Credited ultralight hours",
    "type": "text",
    "required": true
  },
  "wingsLevel": {
    "label": "WINGS level",
    "type": "text",
    "required": true
  },
  "wingsPhaseNumber": {
    "label": "WINGS phase number",
    "type": "text",
    "required": true
  }
};

function titleCaseFromKey(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase())
    .trim();
}

function fallbackField(key) {
  return {
    key,
    label: titleCaseFromKey(key),
    type: key.toLowerCase().includes("date") ? "date" : "text",
    required: true,
    placeholder: "Needed to complete this endorsement.",
  };
}

function inferFields(text) {
  const placeholders = Array.from(new Set(text.match(/\{([^}]+)\}/g) ?? []))
    .map((token) => token.slice(1, -1))
    .filter((key) => !BASE_FIELD_KEYS.has(key));

  return placeholders.map((key) => ({
    key,
    ...(FIELD_LIBRARY[key] ?? fallbackField(key)),
  }));
}

export const endorsementTemplateDefinitions = [
  {
    title: "Practical Test Prereqs",
    key: "practical-test-prereqs",
    referenceNumber: "A1",
    category: "Checkride / Common Requirements",
    sortOrder: 1,
    text: `I certify that {studentName} has received and logged training time within 2 calendar months preceding the month of application in preparation for the practical test and they are prepared for the required practical test for the issuance of a {certificateLevel} certificate or rating, {certificateCategoryClass}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Knowledge Test Deficiency Review",
    key: "knowledge-test-deficiency-review",
    referenceNumber: "A2",
    category: "Checkride / Common Requirements",
    sortOrder: 2,
    text: `I certify that {studentName} has demonstrated satisfactory knowledge of the subject areas in which they were deficient on the {knowledgeTestName} airman knowledge test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Pre-Solo Written",
    key: "pre-solo-written",
    referenceNumber: "A3",
    category: "Student Solo",
    sortOrder: 3,
    text: `I certify that {studentName} has satisfactorily completed the pre-solo knowledge test of 14 CFR § 61.87(b) for the {aircraft} aircraft.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Pre-Solo Flight Training",
    key: "pre-solo-flight-training",
    referenceNumber: "A4",
    category: "Student Solo",
    sortOrder: 4,
    text: `I certify that {studentName} has received and logged pre-solo flight training for the maneuvers and procedures that are appropriate to the {aircraft} aircraft. I have determined they have demonstrated satisfactory proficiency and safety on the maneuvers and procedures required by 14 CFR § 61.87 in this or similar make and model of aircraft to be flown.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Pre-Solo Night Training",
    key: "pre-solo-night-training",
    referenceNumber: "A5",
    category: "Student Solo",
    sortOrder: 5,
    text: `I certify that {studentName} has received flight training at night on night flying procedures that include takeoffs, approaches, landings, and go-arounds at night at the {airportName} airport where the solo flight will be conducted; navigation training at night in the vicinity of the {airportName} airport where the solo flight will be conducted. This endorsement expires 90 calendar days from the date the flight training at night was received.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Solo Flight Initial 90 Days",
    key: "solo-flight-initial-90-days",
    referenceNumber: "A6",
    category: "Student Solo",
    sortOrder: 6,
    text: `I certify that {studentName} has received the required training to qualify for solo flying. I have determined they meet the applicable requirements of 14 CFR § 61.87(n) and are proficient to make solo flights in {aircraft}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Solo Flight Additional 90 Days",
    key: "solo-flight-additional-90-days",
    referenceNumber: "A7",
    category: "Student Solo",
    sortOrder: 7,
    text: `I certify that {studentName} has received the required training to qualify for solo flying. I have determined that they meet the applicable requirements of 14 CFR § 61.87(p) and are proficient to make solo flights in {aircraft}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Solo Takeoffs and Landings at Another Airport",
    key: "solo-takeoffs-and-landings-at-another-airport",
    referenceNumber: "A8",
    category: "Student Solo",
    sortOrder: 8,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.93(b)(1). I have determined that they are proficient to practice solo takeoffs and landings at {airportName}. The takeoffs and landings at {airportName} are subject to the following conditions: {localConditions}
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Solo Cross-Country Training",
    key: "solo-cross-country-training",
    referenceNumber: "A9",
    category: "Solo Cross-Country & Airspace",
    sortOrder: 9,
    text: `I certify that {studentName} has received the required solo cross-country training. I find they have met the applicable requirements of 14 CFR § 61.93 and are proficient to make solo cross-country flights in a {aircraft} aircraft, {aircraftCategory}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Solo Cross-Country Plan Review",
    key: "solo-cross-country-plan-review",
    referenceNumber: "A10",
    category: "Solo Cross-Country & Airspace",
    sortOrder: 10,
    text: `I have reviewed the cross-country planning of {studentName}. I find the planning and preparation to be correct to make the solo flight from {routeFrom} to {routeTo} via {routeDescription} with landings at {routeLandings} in a {aircraft} aircraft on {eventDate}. {localConditions}
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Repeated Solo XC Within 50 NM",
    key: "repeated-solo-xc-within-50-nm",
    referenceNumber: "A11",
    category: "Solo Cross-Country & Airspace",
    sortOrder: 11,
    text: `I certify that {studentName} has received the required training in both directions between {routeFrom} and {routeTo} at both {airportPair}. I have determined that they are proficient of 14 CFR § 61.93(b)(2) to conduct repeated solo cross-country flights over that route, subject to the following conditions: {localConditions}
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Solo in Class B",
    key: "solo-in-class-b",
    referenceNumber: "A12",
    category: "Solo Cross-Country & Airspace",
    sortOrder: 12,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.95(a). I have determined they are proficient to conduct solo flights in {airspaceName} airspace. {localConditions}
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Solo Airport Inside Class B",
    key: "solo-airport-inside-class-b",
    referenceNumber: "A13",
    category: "Solo Cross-Country & Airspace",
    sortOrder: 13,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.95(b)(1). I have determined that they are proficient to conduct solo flight operations at {airportName}. {localConditions}
${SIGNATURE_BLOCK}`,
  },
  {
    title: "TSA U.S. Citizenship",
    key: "tsa-u-s-citizenship",
    referenceNumber: "A14",
    category: "TSA / Citizenship",
    sortOrder: 14,
    text: `I certify that {studentName} has presented me a {citizenshipDocument}, {citizenshipDocumentNumber} establishing that they are a U.S. citizen or national in accordance with 49 CFR § 1552.7(a).
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Solo Flight in Class B/C/D",
    key: "solo-flight-in-class-b-c-d",
    referenceNumber: "A15",
    category: "Solo Cross-Country & Airspace",
    sortOrder: 15,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.94(a). I have determined they are proficient to conduct solo flights in {airspaceName} airspace and authorized to operate to, from, through, and at {airportName}. {localConditions}
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Solo Ops at Towered/Class B/C/D Airport",
    key: "solo-ops-at-towered-class-b-c-d-airport",
    referenceNumber: "A16",
    category: "Solo Cross-Country & Airspace",
    sortOrder: 16,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.94(a)(1). I have determined that they are proficient to conduct solo flight operations at {airportName}. {localConditions}
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport Pilot Knowledge Test",
    key: "sport-pilot-knowledge-test",
    referenceNumber: "A17",
    category: "Checkride / Sport Pilot",
    sortOrder: 17,
    text: `I certify that {studentName} has received the required aeronautical knowledge training of 14 CFR § 61.309. I have determined that they are prepared for the Sport Pilot {sportPilotTestCategory} knowledge test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport Pilot Proficiency Check",
    key: "sport-pilot-proficiency-check",
    referenceNumber: "A18",
    category: "Checkride / Sport Pilot",
    sortOrder: 18,
    text: `I certify that {studentName} has received the required training in accordance with 14 CFR §§ 61.309 and 61.311 and have determined that they are prepared for the {proficiencyCheckName} proficiency check.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport Pilot Proficiency Check Completion",
    key: "sport-pilot-proficiency-check-completion",
    referenceNumber: "A19",
    category: "Checkride / Sport Pilot",
    sortOrder: 19,
    text: `I certify that {studentName} has met the requirements of 14 CFR §§ 61.309 and 61.311, and I have determined them proficient to act as pilot in command of {categoryClass} aircraft.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport Pilot Practical Test",
    key: "sport-pilot-practical-test",
    referenceNumber: "A20",
    category: "Checkride / Sport Pilot",
    sortOrder: 20,
    text: `I certify that {studentName} has received the training required in accordance with 14 CFR §§ 61.309 and 61.311 and met the aeronautical experience requirements of 14 CFR § 61.313. I have determined that they are prepared for the Sport Pilot {sportPilotPracticalCategory} practical test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport Pilot Practical Test Completion",
    key: "sport-pilot-practical-test-completion",
    referenceNumber: "A21",
    category: "Checkride / Sport Pilot",
    sortOrder: 21,
    text: `I certify that {studentName} has met the requirements of 14 CFR §§ 61.309, 61.311, and 61.313, and I have determined them proficient to act as pilot in command of {categoryClass} aircraft.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport Pilot Simplified Controls Practical Test Completion",
    key: "sport-pilot-simplified-controls-practical-test-completion",
    referenceNumber: "A22",
    category: "Checkride / Sport Pilot",
    sortOrder: 22,
    text: `I certify that {studentName} has successfully completed the practical test in {categoryClassModel} with simplified flight controls designation and is authorized to act as pilot in command in {categoryClass} limited to {aircraft} with simplified flight controls designation.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport Pilot Towered Airspace Privileges",
    key: "sport-pilot-towered-airspace-privileges",
    referenceNumber: "A23",
    category: "Solo Cross-Country & Airspace",
    sortOrder: 23,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.325. I have determined they are proficient to conduct operations in Class B, C, or D airspace; at an airport located in Class B, C, or D airspace; or to, from, through, or at an airport having an operational control tower.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "LSA PIC VH <= 87 KCAS",
    key: "lsa-pic-vh-lte-87-kcas",
    referenceNumber: "A24",
    category: "Aircraft Operating Privileges",
    sortOrder: 24,
    text: `I certify that {studentName} has received the required training in accordance with 14 CFR § 61.327(a) in a {aircraft} aircraft. I have determined them proficient to act as pilot in command of an aircraft that has a V H less than or equal to 87 KCAS.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "LSA PIC VH > 87 KCAS",
    key: "lsa-pic-vh-gt-87-kcas",
    referenceNumber: "A25",
    category: "Aircraft Operating Privileges",
    sortOrder: 25,
    text: `I certify that {studentName} has received the required training in accordance with 14 CFR § 61.327(b) in a {aircraft} aircraft. I have determined them proficient to act as pilot in command of an aircraft that has a V H greater than 87 KCAS.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport Pilot Night",
    key: "sport-pilot-night",
    referenceNumber: "A26",
    category: "Aircraft Operating Privileges",
    sortOrder: 26,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training at night in a {categoryClass} aircraft. I have determined they meet all of the requirements of 14 CFR § 61.329(a) and are proficient to operate as a sport pilot at night.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport Pilot Retractable Gear PIC",
    key: "sport-pilot-retractable-gear-pic",
    referenceNumber: "A27",
    category: "Aircraft Operating Privileges",
    sortOrder: 27,
    text: `I certify that {studentName}, {studentCertNumber}, has received the required training of 14 CFR § 61.331(a) in an aircraft with retractable landing gear. I have determined that they are proficient in the operation of an aircraft with retractable landing gear when exercising their sport pilot privileges.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport Pilot Controllable Pitch Propeller PIC",
    key: "sport-pilot-controllable-pitch-propeller-pic",
    referenceNumber: "A28",
    category: "Aircraft Operating Privileges",
    sortOrder: 28,
    text: `I certify that {studentName}, {studentCertNumber}, has received the required training of 14 CFR § 61.331(b) in an airplane with a controllable pitch propeller. I have determined that they are proficient in the operation of an airplane with a controllable pitch propeller when exercising their sport pilot privileges.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Recreational Pilot Knowledge Test",
    key: "recreational-pilot-knowledge-test",
    referenceNumber: "A29",
    category: "Checkride / Recreational Pilot",
    sortOrder: 29,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.97(b). I have determined that they are prepared for the Recreational Pilot {recreationalPilotTestCategory} knowledge test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Recreational Pilot Practical Test",
    key: "recreational-pilot-practical-test",
    referenceNumber: "A30",
    category: "Checkride / Recreational Pilot",
    sortOrder: 30,
    text: `I certify that {studentName} has received the required training of 14 CFR §§ 61.98(b) and 61.99. I have determined that they are prepared for the Recreational Pilot {recreationalPilotTestCategory} practical test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Recreational Pilot Within 50 NM",
    key: "recreational-pilot-within-50-nm",
    referenceNumber: "A31",
    category: "Aircraft Operating Privileges",
    sortOrder: 31,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.101(b). I have determined that they are competent to operate at the {airportName}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Recreational Pilot Beyond 50 NM",
    key: "recreational-pilot-beyond-50-nm",
    referenceNumber: "A32",
    category: "Aircraft Operating Privileges",
    sortOrder: 32,
    text: `I certify that {studentName} has received the required cross-country training of 14 CFR § 61.101(c). I have determined that they are proficient in cross-country flying of 14 CFR part 61 subpart E.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Recreational Pilot Recency",
    key: "recreational-pilot-recency",
    referenceNumber: "A33",
    category: "Flight Review, IPC & Currency",
    sortOrder: 33,
    text: `I certify that {studentName} has received the required 180-day recurrent training of 14 CFR § 61.101(g) in a {aircraft} aircraft. I have determined them proficient to act as pilot in command of that aircraft.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Recreational Pilot Solo for Additional Certificate or Rating",
    key: "recreational-pilot-solo-for-additional-certificate-or-rating",
    referenceNumber: "A34",
    category: "Student Solo",
    sortOrder: 34,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.87 in a {aircraft} aircraft. I have determined they are prepared to conduct a solo flight on {eventDate} under the following conditions: {localConditions}
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Recreational Pilot Towered Airspace Privileges",
    key: "recreational-pilot-towered-airspace-privileges",
    referenceNumber: "A35",
    category: "Solo Cross-Country & Airspace",
    sortOrder: 35,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.101(d). I have determined they are proficient to conduct operations in Class B, C, or D airspace; at an airport located in Class B, C, or D airspace; or to, from, through, or at an airport having an operational control tower.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "PVT Knowledge Test",
    key: "pvt-knowledge-test",
    referenceNumber: "A36",
    category: "Checkride / Private Pilot",
    sortOrder: 36,
    text: `I certify that {studentName} has received the required training in accordance with 14 CFR § 61.105. I have determined they are prepared for the Private Pilot {privatePilotTestCategory} knowledge test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "PVT Practical Test",
    key: "pvt-practical-test",
    referenceNumber: "A37",
    category: "Checkride / Private Pilot",
    sortOrder: 37,
    text: `I certify that {studentName} has received the required training in accordance with 14 CFR §§ 61.107 and 61.109. I have determined they are prepared for the Private Pilot {privatePilotPracticalCategory} practical test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "COM Knowledge Test",
    key: "com-knowledge-test",
    referenceNumber: "A38",
    category: "Checkride / Commercial Pilot",
    sortOrder: 38,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.125. I have determined that they are prepared for the Commercial Pilot {commercialPilotTestCategory} knowledge test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "COM Practical Test",
    key: "com-practical-test",
    referenceNumber: "A39",
    category: "Checkride / Commercial Pilot",
    sortOrder: 39,
    text: `I certify that {studentName} has received the required training of 14 CFR §§ 61.127 and 61.129. I have determined that they are prepared for the Commercial Pilot {commercialPilotPracticalCategory} practical test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Restricted ATP AMEL Institutional Certification",
    key: "restricted-atp-amel-institutional-certification",
    referenceNumber: "A40",
    category: "Checkride / ATP",
    sortOrder: 40,
    text: `The {institutionName} certifies that the recipient of this degree has successfully completed all of the aviation coursework requirements of 14 CFR § 61.160{restrictedAtpParagraph} and therefore meets the academic eligibility requirements of 14 CFR § 61.160{restrictedAtpParagraph}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "ATP CTP Graduation Certificate",
    key: "atp-ctp-graduation-certificate",
    referenceNumber: "A41",
    category: "Checkride / ATP",
    sortOrder: 41,
    text: `The applicant named above has successfully completed the Airline Transport Pilot Certification Training Program as required by 14 CFR § 61.156, and therefore has met the prerequisite required by 14 CFR § 61.35(a)(2) for the Airline Transport Pilot Multiengine Airplane Knowledge Test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "IR Knowledge Test",
    key: "ir-knowledge-test",
    referenceNumber: "A42",
    category: "Checkride / Instrument Rating",
    sortOrder: 42,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.65(b). I have determined that they are prepared for the Instrument–{instrumentRatingCategory} knowledge test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "IR Practical Test",
    key: "ir-practical-test",
    referenceNumber: "A43",
    category: "Checkride / Instrument Rating",
    sortOrder: 43,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.65(c) and (d). I have determined they are prepared for the Instrument–{instrumentRatingCategory} practical test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "IR Practical Test Prereqs",
    key: "ir-practical-test-prereqs",
    referenceNumber: "A44",
    category: "Checkride / Instrument Rating",
    sortOrder: 44,
    text: `I certify that {studentName} has received and logged the required flight time/training of 14 CFR § 61.39(a) in preparation for the practical test within 2 calendar months preceding the date of the test and has satisfactory knowledge of the subject areas in which they were shown to be deficient by the FAA Airman Knowledge Test Report. I have determined they are prepared for the Instrument–{instrumentRatingCategory} practical test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "FOI Knowledge Test",
    key: "foi-knowledge-test",
    referenceNumber: "A45",
    category: "Checkride / Flight Instructor",
    sortOrder: 45,
    text: `I certify that {studentName} has received the required fundamentals of instruction training of 14 CFR § 61.185(a)(1). I have determined that they are prepared for the Fundamentals of Instructing knowledge test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "CFI Knowledge Test",
    key: "cfi-knowledge-test",
    referenceNumber: "A46",
    category: "Checkride / Flight Instructor",
    sortOrder: 46,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.185(a){cfiKnowledgeParagraph}. I have determined that they are prepared for the Flight Instructor {flightInstructorKnowledgeTest} knowledge test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "CFI Required Training",
    key: "cfi-required-training",
    referenceNumber: "A47",
    category: "Checkride / Flight Instructor",
    sortOrder: 47,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.187(b). I have determined that they are prepared for the certificated flight instructor – {categoryClass} practical test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "CFII Practical Test",
    key: "cfii-practical-test",
    referenceNumber: "A48",
    category: "Checkride / Flight Instructor",
    sortOrder: 48,
    text: `I certify that {studentName} has received the required certificated flight instructor - instrument training of 14 CFR § 61.187(b)(7). I have determined they are prepared for the certificated flight instructor - instrument–{instrumentRatingCategory} practical test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Spin Training",
    key: "spin-training",
    referenceNumber: "A49",
    category: "Flight Instructor",
    sortOrder: 49,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.183(i) in {spinAircraftCategory}. I have determined that they are competent and possess instructional proficiency in stall awareness, spin entry, spins, and spin recovery procedures.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Helicopter Touchdown Autorotation",
    key: "helicopter-touchdown-autorotation",
    referenceNumber: "A50",
    category: "Flight Instructor",
    sortOrder: 50,
    text: `I certify that {studentName} has received training in straight-in autorotations in a single engine helicopter and autorotation with turns in a single engine helicopter to include touchdown. I have determined that they are competent in instructional knowledge relating to the elements, common errors, performance, and correction of common errors related to straight-in autorotations in a single engine helicopter and autorotation with turns in a single engine helicopter.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport CFI FOI Knowledge Test",
    key: "sport-cfi-foi-knowledge-test",
    referenceNumber: "A51",
    category: "Checkride / Sport CFI",
    sortOrder: 51,
    text: `I certify that {studentName} has received the required training in accordance with 14 CFR § 61.405(a)(1). I have determined that they are prepared for the Fundamentals of Instructing knowledge test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport CFI Knowledge Test",
    key: "sport-cfi-knowledge-test",
    referenceNumber: "A52",
    category: "Checkride / Sport CFI",
    sortOrder: 52,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.405(a)(2). I have determined that they are prepared for the Flight Instructor with Sport Pilot Rating {sportCfiKnowledgeTest} knowledge test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport CFI Additional Category/Class Proficiency Check",
    key: "sport-cfi-additional-category-class-proficiency-check",
    referenceNumber: "A53",
    category: "Checkride / Sport CFI",
    sortOrder: 53,
    text: `I certify that {studentName} has received the required training in accordance with 14 CFR §§ 61.409 and 61.419 and have determined that they are prepared for a proficiency check for the flight instructor with a sport pilot rating in a {categoryClass}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport CFI Additional Category/Class Completion",
    key: "sport-cfi-additional-category-class-completion",
    referenceNumber: "A54",
    category: "Checkride / Sport CFI",
    sortOrder: 54,
    text: `I certify that {studentName} has successfully completed a proficiency check in accordance with 14 CFR §§ 61.409 and 61.419. I have determined that they are proficient and authorized for the additional {categoryClass} flight instructor privilege.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport CFI Practical Test",
    key: "sport-cfi-practical-test",
    referenceNumber: "A55",
    category: "Checkride / Sport CFI",
    sortOrder: 55,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.409 and met the aeronautical experience requirements of 14 CFR § 61.411. I have determined that they are prepared for the flight instructor with a sport pilot rating practical test in a {categoryClass}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport CFI Practical Test Completion",
    key: "sport-cfi-practical-test-completion",
    referenceNumber: "A56",
    category: "Checkride / Sport CFI",
    sortOrder: 56,
    text: `I certify that {studentName} has met the requirements in accordance with 14 CFR §§ 61.409 and 61.411 and successfully completed the practical test. I have determined that they are proficient and authorized for the {categoryClass} flight instructor privilege.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport CFI Instrument Reference Training Privilege",
    key: "sport-cfi-instrument-reference-training-privilege",
    referenceNumber: "A57",
    category: "Flight Instructor",
    sortOrder: 57,
    text: `I certify that I have given {studentName} 3 hours of flight training and 1 hour of ground instruction specific to providing flight training on control and maneuvering an airplane solely by reference to the instruments in accordance with 14 CFR § 61.412. I have determined that they are proficient and authorized to provide training on control and maneuvering an airplane solely by reference to the flight instruments to this instructor’s sport pilot candidate, who intends to operate an aircraft with a V H greater than 87 KCAS on a cross-country flight.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Sport CFI Spin Training",
    key: "sport-cfi-spin-training",
    referenceNumber: "A58",
    category: "Flight Instructor",
    sortOrder: 58,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.405(b)(1)(ii). I have determined that they are competent and possess instructional proficiency in stall awareness, spin entry, spins, and spin recovery procedures.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Ground Instructor Recency",
    key: "ground-instructor-recency",
    referenceNumber: "A59",
    category: "Flight Review, IPC & Currency",
    sortOrder: 59,
    text: `I certify that {studentName} has demonstrated knowledge in the subject areas prescribed for a {groundInstructorType} ground instructor under 14 CFR § 61.213(a)(3) and (a)(4), as appropriate.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "R-22/R-44 Awareness",
    key: "r-22-r-44-awareness",
    referenceNumber: "A60",
    category: "Robinson Helicopter SFAR 73",
    sortOrder: 60,
    text: `I certify that {studentName}, Pilot Certificate No. {studentCertNumber} has received the ground training required by SFAR 73, section 2(a)(3)(i)–(v).
${SIGNATURE_BLOCK}`,
  },
  {
    title: "R-22 Solo Endorsement",
    key: "r-22-solo-endorsement",
    referenceNumber: "A61",
    category: "Robinson Helicopter SFAR 73",
    sortOrder: 61,
    text: `I certify that {studentName}, Pilot Certificate No. {studentCertNumber} meets the experience requirements of SFAR 73, section 2(b)(3) and has been given training specified by SFAR 73, section 2(b)(3)(i)–(iv). They have been found proficient to solo the R-22 helicopter.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "R-22 PIC",
    key: "r-22-pic",
    referenceNumber: "A62",
    category: "Robinson Helicopter SFAR 73",
    sortOrder: 62,
    text: `I certify that {studentName}, Pilot Certificate No. {studentCertNumber} has been given training specified by SFAR 73, section 2(b)(1)(ii)(A)–(D) for Robinson R-22 helicopters and is proficient to act as pilot in command. An annual flight review must be completed by {annualReviewDueDate} unless the requirements of SFAR 73, section 2(b)(1)(i) are met.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "R-22 Flight Instructor Endorsement",
    key: "r-22-flight-instructor-endorsement",
    referenceNumber: "A63",
    category: "Robinson Helicopter SFAR 73",
    sortOrder: 63,
    text: `I certify that {studentName}, holder of CFI Certificate No. {cfiCertificateNumber}, meets the experience requirements and has completed the flight training specified by SFAR 73, section 2(b)(5)(i)–(ii) and (iii)(A)–(D), and has demonstrated an ability to provide instruction on the general subject areas of SFAR 73, section 2(a)(3) and the flight training identified in SFAR 73, section 2(b)(5)(iii) in a Robinson R-22 helicopter.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "R-22 Flight Review",
    key: "r-22-flight-review",
    referenceNumber: "A64",
    category: "Robinson Helicopter SFAR 73",
    sortOrder: 64,
    text: `I certify that {studentName}, Pilot Certificate No. {studentCertNumber} has satisfactorily completed the flight review in an R-22 required by 14 CFR § 61.56 and SFAR 73, section 2(c)(1) and (3), on {eventDate}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "R-44 Solo Endorsement",
    key: "r-44-solo-endorsement",
    referenceNumber: "A65",
    category: "Robinson Helicopter SFAR 73",
    sortOrder: 65,
    text: `I certify that {studentName}, Pilot Certificate No. {studentCertNumber} meets the experience requirements of SFAR 73, section 2(b)(4) and has been given training specified by SFAR 73, section 2(b)(4)(i)–(iv). They have been found proficient to solo the R-44 helicopter.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "R-44 PIC",
    key: "r-44-pic",
    referenceNumber: "A66",
    category: "Robinson Helicopter SFAR 73",
    sortOrder: 66,
    text: `I certify that {studentName}, Pilot Certificate No. {studentCertNumber} has been given training specified by SFAR 73, section 2(b)(2)(ii)(A)–(D) for Robinson R-44 helicopters and is proficient to act as pilot in command. An annual flight review must be completed by {annualReviewDueDate} unless the requirements of SFAR 73, section 2(b)(2)(i) are met.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "R-44 Flight Instructor Endorsement",
    key: "r-44-flight-instructor-endorsement",
    referenceNumber: "A67",
    category: "Robinson Helicopter SFAR 73",
    sortOrder: 67,
    text: `I certify that {studentName}, holder of CFI Certificate No. {cfiCertificateNumber}, meets the experience requirements and has completed the flight training specified by SFAR 73, section 2(b)(5)(i)–(ii) and (iii)(A)–(D), and has demonstrated an ability to provide instruction on the general subject areas of SFAR 73, section 2(a)(3) and the flight training identified in SFAR 73, section 2(b)(5)(iii) in a Robinson R-44 helicopter.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "R-44 Flight Review",
    key: "r-44-flight-review",
    referenceNumber: "A68",
    category: "Robinson Helicopter SFAR 73",
    sortOrder: 68,
    text: `I certify that {studentName}, Pilot Certificate No. {studentCertNumber} has satisfactorily completed the flight review in an R-44 required by 14 CFR § 61.56 and SFAR 73, section 2(c)(2) and (3), on {eventDate}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Flight Review",
    key: "flight-review",
    referenceNumber: "A69",
    category: "Flight Review, IPC & Currency",
    sortOrder: 69,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has satisfactorily completed a flight review of 14 CFR § 61.56(a) on {eventDate}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "WINGS Phase Completion",
    key: "wings-phase-completion",
    referenceNumber: "A70",
    category: "Flight Review, IPC & Currency",
    sortOrder: 70,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has satisfactorily completed Level: {wingsLevel}, PHASE NO. {wingsPhaseNumber} OF A WINGS PROGRAM ON {eventDate}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Instrument Proficiency Check",
    key: "instrument-proficiency-check",
    referenceNumber: "A71",
    category: "Flight Review, IPC & Currency",
    sortOrder: 71,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has satisfactorily completed the instrument proficiency check of 14 CFR § 61.57(d) in a {aircraft} aircraft on {eventDate}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Complex Airplane PIC",
    key: "complex-airplane-pic",
    referenceNumber: "A72",
    category: "Aircraft Operating Privileges",
    sortOrder: 72,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training of 14 CFR § 61.31(e) in a {aircraft} complex airplane. I have determined that they are proficient in the operation and systems of a complex airplane.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "High-Performance Airplane PIC",
    key: "high-performance-airplane-pic",
    referenceNumber: "A73",
    category: "Aircraft Operating Privileges",
    sortOrder: 73,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training of 14 CFR § 61.31(f) in a {aircraft} high-performance airplane. I have determined that they are proficient in the operation and systems of a high-performance airplane.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "High-Altitude Pressurized PIC",
    key: "high-altitude-pressurized-pic",
    referenceNumber: "A74",
    category: "Aircraft Operating Privileges",
    sortOrder: 74,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training of 14 CFR § 61.31(g) in a {aircraft} pressurized aircraft. I have determined that they are proficient in the operation and systems of a pressurized aircraft.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Tailwheel Airplane PIC",
    key: "tailwheel-airplane-pic",
    referenceNumber: "A75",
    category: "Aircraft Operating Privileges",
    sortOrder: 75,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training of 14 CFR § 61.31(i) in a {aircraft} of tailwheel airplane. I have determined that they are proficient in the operation of a tailwheel airplane.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "PIC Solo Outside Rating",
    key: "pic-solo-outside-rating",
    referenceNumber: "A76",
    category: "Aircraft Operating Privileges",
    sortOrder: 76,
    text: `I certify that {studentName} has received the training as required by 14 CFR § 61.31(d)(2) to serve as a pilot in command in a {categoryClass} of aircraft. I have determined that they are prepared to solo that {aircraft} aircraft. Limitations: {limitations}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Retest After Failed Test",
    key: "retest-after-failed-test",
    referenceNumber: "A77",
    category: "Checkride / Retest",
    sortOrder: 77,
    text: `I certify that {studentName} has received the additional {trainingType} training as required by 14 CFR § 61.49. I have determined that they are proficient to pass the {retestTestName}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Additional Category/Class Rating",
    key: "additional-category-class-rating",
    referenceNumber: "A78",
    category: "Checkride / Add-on & Type Ratings",
    sortOrder: 78,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training for an additional {categoryClass}. I have determined that they are prepared for the {practicalTestType} for the addition of a {categoryClassType} type rating.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Type Rating Only",
    key: "type-rating-only",
    referenceNumber: "A79",
    category: "Checkride / Add-on & Type Ratings",
    sortOrder: 79,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.63(d)(2) for an addition of a {typeRating} type rating.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Type Rating with Additional Category/Class",
    key: "type-rating-with-additional-category-class",
    referenceNumber: "A80",
    category: "Checkride / Add-on & Type Ratings",
    sortOrder: 80,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.63(d)(2) for an addition of a {categoryClassType} type rating. I have determined that they are prepared for the {practicalTestType} for the addition of a {categoryClassType} type rating.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "ATP Type Rating Only",
    key: "atp-type-rating-only",
    referenceNumber: "A81",
    category: "Checkride / Add-on & Type Ratings",
    sortOrder: 81,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.157(b)(2) for an addition of a {typeRating} type rating.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "ATP Type Rating with Additional Category/Class",
    key: "atp-type-rating-with-additional-category-class",
    referenceNumber: "A82",
    category: "Checkride / Add-on & Type Ratings",
    sortOrder: 82,
    text: `I certify that {studentName} has received the required training of 14 CFR § 61.157(b)(2) for an addition of a {categoryClassType} type rating.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Glider Launch Procedures",
    key: "glider-launch-procedures",
    referenceNumber: "A83",
    category: "Glider, Towing & Ultralight",
    sortOrder: 83,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training in a glider {aircraft} for {gliderLaunchMethod} procedure. I have determined that they are proficient in {gliderLaunchMethod} procedure.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Glider or Ultralight Towing Experience",
    key: "glider-or-ultralight-towing-experience",
    referenceNumber: "A84",
    category: "Glider, Towing & Ultralight",
    sortOrder: 84,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has accomplished at least three flights in an aircraft while towing {towedVehicleDescription}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Glider or Ultralight Towing Ground and Flight",
    key: "glider-or-ultralight-towing-ground-and-flight",
    referenceNumber: "A85",
    category: "Glider, Towing & Ultralight",
    sortOrder: 85,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required ground and flight training in {towedVehicleDescription}. I have determined that they are proficient in the techniques and procedures essential to the safe towing of {towedVehicleDescription}, including airspeed limitations, emergency procedures, signals used, and maximum angles of bank.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Home-Study Curriculum Review",
    key: "home-study-curriculum-review",
    referenceNumber: "A86",
    category: "Checkride / Common Requirements",
    sortOrder: 86,
    text: `I certify I have reviewed the home-study curriculum of {studentName}. I have determined that they are prepared for the {knowledgeTestName} knowledge test.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Ultralight Aeronautical Experience Credit",
    key: "ultralight-aeronautical-experience-credit",
    referenceNumber: "A87",
    category: "Glider, Towing & Ultralight",
    sortOrder: 87,
    text: `I certify that I have reviewed the records of {studentName}, as required by 14 CFR § 61.52(c). I have determined that they may use {ultralightHours} aeronautical experience obtained in an ultralight vehicle to meet the requirements for {certificateRatingPrivilege}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "NVG Ground Training",
    key: "nvg-ground-training",
    referenceNumber: "A88",
    category: "NVG, EFVS & Special Systems",
    sortOrder: 88,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the ground training required by 14 CFR § 61.31(k)(1), (i) through (v) to conduct night vision goggle operations.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "NVG PIC",
    key: "nvg-pic",
    referenceNumber: "A89",
    category: "NVG, EFVS & Special Systems",
    sortOrder: 89,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the flight training on night vision goggle operations required by 14 CFR § 61.31(k)(2), (i) through (iv). I find them proficient in the use of night vision goggles.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "NVG Instructor Authorization",
    key: "nvg-instructor-authorization",
    referenceNumber: "A90",
    category: "NVG, EFVS & Special Systems",
    sortOrder: 90,
    text: `I certify that {studentName}, holder of CFI Certificate No. {cfiCertificateNumber}, meets the night vision goggle instructor requirements of 14 CFR § 61.195(k) and is authorized to perform the night vision goggle pilot-in-command qualification and recent flight experience requirements under 14 CFR §§ 61.31(k) and 61.57(f) and (g). This endorsement does not provide the authority to endorse another flight instructor as a night vision goggle instructor.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "EFVS Ground Training",
    key: "efvs-ground-training",
    referenceNumber: "A91",
    category: "NVG, EFVS & Special Systems",
    sortOrder: 91,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has satisfactorily completed the ground training required by 14 CFR § 61.66(a) appropriate to the {aircraftCategory} category of aircraft.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "EFVS Flight Training",
    key: "efvs-flight-training",
    referenceNumber: "A92",
    category: "NVG, EFVS & Special Systems",
    sortOrder: 92,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the flight training required by 14 CFR § 61.66(b) and is proficient in the use of EFVS in the {aircraftCategory} category of aircraft for EFVS operations conducted under {efvsOperationRule}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "EFVS Ground and Flight Training",
    key: "efvs-ground-and-flight-training",
    referenceNumber: "A93",
    category: "NVG, EFVS & Special Systems",
    sortOrder: 93,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has satisfactorily completed the ground training required by 14 CFR § 61.66(a) and has received the flight training required by 14 CFR § 61.66(b) for EFVS operations and is proficient in the use of EFVS in the {aircraftCategory} category of aircraft for EFVS operations conducted under {efvsOperationRule}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "EFVS Supplementary Training",
    key: "efvs-supplementary-training",
    referenceNumber: "A94",
    category: "NVG, EFVS & Special Systems",
    sortOrder: 94,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has satisfactorily completed the required ground and flight training required by 14 CFR § 61.66(c) for EFVS operations and is proficient in the use of EFVS in the {aircraftCategory} category of aircraft for EFVS operations conducted under {efvsOperationRule}.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Simplified Flight Controls PIC",
    key: "simplified-flight-controls-pic",
    referenceNumber: "A95",
    category: "Aircraft Operating Privileges",
    sortOrder: 95,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training of 14 CFR § 61.31(l)(1) in a {aircraft} aircraft with simplified flight controls designation. I have determined that {studentName} is proficient in the operation of an {categoryClassModel} aircraft with simplified flight controls.
${SIGNATURE_BLOCK}`,
  },
  {
    title: "Simplified Flight Controls Initial Cadre",
    key: "simplified-flight-controls-initial-cadre",
    referenceNumber: "A96",
    category: "Aircraft Operating Privileges",
    sortOrder: 96,
    text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training of 14 CFR § 61.195(n)(2)(ii) in a {aircraft} aircraft with simplified flight controls designation. I have determined that {studentName} is proficient in the operation of an {categoryClassModel} aircraft with simplified flight controls.
${SIGNATURE_BLOCK}`,
  },
];

const templates = Object.fromEntries(
  endorsementTemplateDefinitions.map((template) => [
    template.title,
    {
      text: template.text,
      fields: inferFields(template.text),
      category: template.category,
      sortOrder: template.sortOrder,
      referenceNumber: template.referenceNumber,
      key: template.key,
    },
  ])
);

export default templates;
