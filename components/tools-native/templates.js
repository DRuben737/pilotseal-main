// src/templates.js

const SIGNATURE_BLOCK = `Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`;

export const endorsementTemplateDataVersion = {
  source: "AC 61-65K Appendix A",
  sourceDate: "2025-11-14",
  updatedAt: "2026-07-15",
  sourceFile: "AC_61-65K_34-58.pdf",
};

const rawTemplates = {
  "TSA U.S. Citizenship": `
I certify that {studentName} has presented me a {citizenshipDocument}, document number {citizenshipDocumentNumber}, establishing that they are a U.S. citizen or national in accordance with 49 CFR § 1552.15(c).
${SIGNATURE_BLOCK}`,

  "Practical Test Prereqs": `
I certify that {studentName} has received and logged training time within 2 calendar months preceding the month of application in preparation for the practical test and they are prepared for the required practical test for the issuance of {certificateType} certificate.
${SIGNATURE_BLOCK}`,

  "Pre-Solo Written": `
I certify that {studentName} has satisfactorily completed the pre-solo knowledge test of 14 CFR § 61.87(b) for the {aircraft} aircraft.
${SIGNATURE_BLOCK}`,

  "Pre-Solo Flight Training": `
I certify that {studentName} has received and logged pre-solo flight training for the maneuvers and procedures that are appropriate to the {aircraft} aircraft. I have determined they have demonstrated satisfactory proficiency and safety on the maneuvers and procedures required by 14 CFR § 61.87 in this or similar make and model of aircraft to be flown.
${SIGNATURE_BLOCK}`,

  "Pre-Solo Night Training": `
I certify that {studentName} has received flight training at night on night flying procedures that include takeoffs, approaches, landings, and go-arounds at night at the {airportName} airport where the solo flight will be conducted; navigation training at night in the vicinity of the {airportName} airport where the solo flight will be conducted. This endorsement expires 90 calendar days from the date the flight training at night was received.
${SIGNATURE_BLOCK}`,

  "Solo Flight Initial 90 Days": `
I certify that {studentName} has received the required training to qualify for solo flying. I have determined they meet the applicable requirements of 14 CFR § 61.87(n) and are proficient to make solo flights in {aircraft}.
${SIGNATURE_BLOCK}`,

  "Solo Flight Additional 90 Days": `
I certify that {studentName} has received the required training to qualify for solo flying. I have determined that they meet the applicable requirements of 14 CFR § 61.87(p) and are proficient to make solo flights in {aircraft}.
${SIGNATURE_BLOCK}`,

  "Solo in other airport": `
I certify that {studentName} has received the required training of 14 CFR § 61.93(b)(1). I have determined that they are proficient to practice solo takeoffs and landings at {airportName}. The takeoffs and landings at {airportName} are subject to the following conditions: {localConditions}
${SIGNATURE_BLOCK}`,

  "Solo cross-country training": `
I certify that {studentName} has received the required solo cross-country training. I find they have met the applicable requirements of 14 CFR § 61.93 and are proficient to make solo cross-country flights in a {aircraft} aircraft, {aircraftCategory}.
${SIGNATURE_BLOCK}`,

  "Solo cross-country day": `
I have reviewed the cross-country planning of {routeStudentName}. I find the planning and preparation to be correct to make the solo flight from {routeFrom} to {routeTo} via {routeDescription} with landings at {routeLandings} in a {aircraft} aircraft on {eventDate}. {localConditions}
${SIGNATURE_BLOCK}`,

  "Repeated Solo XC Within 50 NM": `
I certify that {studentName} has received the required training in both directions between {routeFrom} and {routeTo} at both {airportPair}. I have determined that they are proficient of 14 CFR § 61.93(b)(2) to conduct repeated solo cross-country flights over that route, subject to the following conditions: {localConditions}
${SIGNATURE_BLOCK}`,

  "Solo in Class B": `
I certify that {studentName} has received the required training of 14 CFR § 61.95(a). I have determined they are proficient to conduct solo flights in {airspaceName} airspace. {localConditions}
${SIGNATURE_BLOCK}`,

  "Solo airport inside Class B": `
I certify that {studentName} has received the required training of 14 CFR § 61.95(b)(1). I have determined that they are proficient to conduct solo flight operations at {airportName}. {localConditions}
${SIGNATURE_BLOCK}`,

  "Solo Flight in Class B/C/D": `
I certify that {studentName} has received the required training of 14 CFR § 61.94(a). I have determined they are proficient to conduct solo flights in {airspaceName} airspace and authorized to operate to, from, through, and at {airportName}. {localConditions}
${SIGNATURE_BLOCK}`,

  "Solo Ops at Towered/Class B/C/D Airport": `
I certify that {studentName} has received the required training of 14 CFR § 61.94(a)(1). I have determined that they are proficient to conduct solo flight operations at {airportName}. {localConditions}
${SIGNATURE_BLOCK}`,

  "PIC Solo Outside Rating": `
I certify that {studentName} has received the training as required by 14 CFR § 61.31(d)(2) to serve as a pilot in command in a {categoryClass} of aircraft. I have determined that they are prepared to solo that {trainingAircraft} aircraft. Limitations: {limitations}
${SIGNATURE_BLOCK}`,

  "Sport Pilot Proficiency Check": `
I certify that {studentName} has received the required training in accordance with 14 CFR §§ 61.309 and 61.311 and have determined that they are prepared for the {proficiencyCheckName}.
${SIGNATURE_BLOCK}`,

  "Sport Pilot Practical Test": `
I certify that {studentName} has received the training required in accordance with 14 CFR §§ 61.309 and 61.311 and met the aeronautical experience requirements of 14 CFR § 61.313. I have determined that they are prepared for the {practicalTestType}.
${SIGNATURE_BLOCK}`,

  "LSA PIC VH <= 87 KCAS": `
I certify that {studentName} has received the required training in accordance with 14 CFR § 61.327(a) in a {trainingAircraft} aircraft. I have determined them proficient to act as pilot in command of an aircraft that has a VH less than or equal to 87 KCAS.
${SIGNATURE_BLOCK}`,

  "LSA PIC VH > 87 KCAS": `
I certify that {studentName} has received the required training in accordance with 14 CFR § 61.327(b) in a {trainingAircraft} aircraft. I have determined them proficient to act as pilot in command of an aircraft that has a VH greater than 87 KCAS.
${SIGNATURE_BLOCK}`,

  "Sport Pilot Night": `
I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training at night in a {categoryClass} aircraft. I have determined they meet all of the requirements of 14 CFR § 61.329(a) and are proficient to operate as a sport pilot at night.
${SIGNATURE_BLOCK}`,

  "Sport Pilot Retractable Gear PIC": `
I certify that {studentName}, {studentCertNumber}, has received the required training of 14 CFR § 61.331(a) in an aircraft with retractable landing gear. I have determined that they are proficient in the operation of an aircraft with retractable landing gear when exercising their sport pilot privileges.
${SIGNATURE_BLOCK}`,

  "Sport Pilot Controllable Pitch Propeller PIC": `
I certify that {studentName}, {studentCertNumber}, has received the required training of 14 CFR § 61.331(b) in an airplane with a controllable pitch propeller. I have determined that they are proficient in the operation of an airplane with a controllable pitch propeller when exercising their sport pilot privileges.
${SIGNATURE_BLOCK}`,

  "PVT knowledge test": `
I certify that {studentName} has received the required training in accordance with 14 CFR § 61.105. I have determined they are prepared for the {knowledgeTestName} knowledge test.
${SIGNATURE_BLOCK}`,

  "PVT Written Deficiencies": `
I certify that {studentName} has demonstrated satisfactory knowledge of the subject areas in which they were deficient on the {knowledgeTestName} airman knowledge test.
${SIGNATURE_BLOCK}`,

  "PVT Practical Test": `
I certify that {studentName} has received the required training in accordance with 14 CFR §§ 61.107 and 61.109. I have determined they are prepared for the {practicalTestType}.
${SIGNATURE_BLOCK}`,

  "PVT 2-Month Review": `
I certify that {studentName} has received and logged training time within 2 calendar months preceding the month of application in preparation for the practical test and they are prepared for the required practical test for the issuance of {practicalTestCertificate} certificate.
${SIGNATURE_BLOCK}`,

  "COM knowledge test": `
I certify that {studentName} has received the required training of 14 CFR § 61.125. I have determined that they are prepared for the {knowledgeTestName} knowledge test.
${SIGNATURE_BLOCK}`,

  "COM Written Deficiencies": `
I certify that {studentName} has demonstrated satisfactory knowledge of the subject areas in which they were deficient on the {knowledgeTestName} airman knowledge test.
${SIGNATURE_BLOCK}`,

  "COM Practical Test": `
I certify that {studentName} has received the required training of 14 CFR §§ 61.127 and 61.129. I have determined that they are prepared for the {practicalTestType}.
${SIGNATURE_BLOCK}`,

  "COM 2-Month Review": `
I certify that {studentName} has received and logged training time within 2 calendar months preceding the month of application in preparation for the practical test and they are prepared for the required practical test for the issuance of {practicalTestCertificate} certificate.
${SIGNATURE_BLOCK}`,

  "IR knowledge test": `
I certify that {studentName} has received the required training of 14 CFR § 61.65(b). I have determined that they are prepared for the {instrumentRating} knowledge test.
${SIGNATURE_BLOCK}`,

  "IR Written Deficiencies": `
I certify that {studentName} has demonstrated satisfactory knowledge of the subject areas in which they were deficient on the {knowledgeTestName} airman knowledge test.
${SIGNATURE_BLOCK}`,

  "IR Practical Test": `
I certify that {studentName} has received the required training of 14 CFR § 61.65(c) and (d). I have determined they are prepared for the {instrumentRating} practical test.
${SIGNATURE_BLOCK}`,

  "IR 2-Month Review": `
I certify that {studentName} has received and logged the required flight time/training of 14 CFR § 61.39(a) in preparation for the practical test within 2 calendar months preceding the date of the test and has satisfactory knowledge of the subject areas in which they were shown to be deficient by the FAA Airman Knowledge Test Report. I have determined they are prepared for the {instrumentRating} practical test.
${SIGNATURE_BLOCK}`,

  "FOI knowledge test": `
I certify that {studentName} has received the required fundamentals of instruction training of 14 CFR § 61.185(a)(1). I have determined that they are prepared for the Fundamentals of Instructing knowledge test.
${SIGNATURE_BLOCK}`,

  "CFI Knowledge Test": `
I certify that {studentName} has received the required training of 14 CFR § 61.185(a){cfiKnowledgeParagraph}. I have determined that they are prepared for the {flightInstructorKnowledgeTest} knowledge test.
${SIGNATURE_BLOCK}`,

  "CFI Written Deficiencies": `
I certify that {studentName} has demonstrated satisfactory knowledge of the subject areas in which they were deficient on the {knowledgeTestName} airman knowledge test.
${SIGNATURE_BLOCK}`,

  "CFI required training": `
I certify that {studentName} has received the required training of 14 CFR § 61.187(b). I have determined that they are prepared for the CFI - {categoryClass} practical test.
${SIGNATURE_BLOCK}`,

  "CFII Practical Test": `
I certify that {studentName} has received the required certificated flight instructor - instrument training of 14 CFR § 61.187(b)(7). I have determined they are prepared for the certificated flight instructor - instrument-{flightInstructorInstrumentRating} practical test.
${SIGNATURE_BLOCK}`,

  "Spin training": `
I certify that {studentName} has received the required training of 14 CFR § 61.183(i) in {aircraft}. I have determined that they are competent and possess instructional proficiency in stall awareness, spin entry, spins, and spin recovery procedures.
${SIGNATURE_BLOCK}`,

  "R-22/R-44 Awareness": `
I certify that {studentName}, Pilot Certificate No. {studentCertNumber}, has received the ground training required by SFAR 73, section 2(a)(3)(i)-(v).
${SIGNATURE_BLOCK}`,

  "R-22 solo endorsement": `
I certify that {studentName}, Pilot Certificate No. {studentCertNumber}, meets the experience requirements of SFAR 73, section 2(b)(3) and has been given training specified by SFAR 73, section 2(b)(3)(i)-(iv). They have been found proficient to solo the R-22 helicopter.
${SIGNATURE_BLOCK}`,

  "R-22 PIC": `
I certify that {studentName}, Pilot Certificate No. {studentCertNumber}, has been given training specified by SFAR 73, section 2(b)(1)(ii)(A)-(D) for Robinson R-22 helicopters and is proficient to act as pilot in command. An annual flight review must be completed by {annualReviewDueDate} unless the requirements of SFAR 73, section 2(b)(1)(i) are met.
${SIGNATURE_BLOCK}`,

  "R-22 Flight Review": `
I certify that {studentName}, Pilot Certificate No. {studentCertNumber}, has satisfactorily completed the flight review in an R-22 required by 14 CFR § 61.56 and SFAR 73, section 2(c)(1) and (3), on {eventDate}.
${SIGNATURE_BLOCK}`,

  "R-44 solo endorsement": `
I certify that {studentName}, Pilot Certificate No. {studentCertNumber}, meets the experience requirements of SFAR 73, section 2(b)(4) and has been given training specified by SFAR 73, section 2(b)(4)(i)-(iv). They have been found proficient to solo the R-44 helicopter.
${SIGNATURE_BLOCK}`,

  "R-44 PIC": `
I certify that {studentName}, Pilot Certificate No. {studentCertNumber}, has been given training specified by SFAR 73, section 2(b)(2)(ii)(A)-(D) for Robinson R-44 helicopters and is proficient to act as pilot in command. An annual flight review must be completed by {annualReviewDueDate} unless the requirements of SFAR 73, section 2(b)(2)(i) are met.
${SIGNATURE_BLOCK}`,

  "R-44 Flight Review": `
I certify that {studentName}, Pilot Certificate No. {studentCertNumber}, has satisfactorily completed the flight review in an R-44 required by 14 CFR § 61.56 and SFAR 73, section 2(c)(2) and (3), on {eventDate}.
${SIGNATURE_BLOCK}`,

  "Helicopter Touchdown Autorotation": `
I certify that {studentName} has received training in straight-in and 180-degree autorotations to include touchdown. I have determined that they are competent in instructional knowledge relating to the elements, common errors, performance, and correction of common errors related to straight-in and 180-degree autorotations.
${SIGNATURE_BLOCK}`,

  "Flight review": `
I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has satisfactorily completed a flight review of 14 CFR § 61.56(a) on {eventDate}{flightReviewAircraft}.
${SIGNATURE_BLOCK}`,

  "Instrument proficiency check": `
I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has satisfactorily completed the instrument proficiency check of 14 CFR § 61.57(d) in a {aircraft} aircraft on {eventDate}.
${SIGNATURE_BLOCK}`,

  "Ground Instructor Recency": `
I certify that {studentName} has demonstrated knowledge in the subject areas prescribed for a {groundInstructorType} ground instructor under 14 CFR § 61.213(a)(3) and (a)(4), as appropriate.
${SIGNATURE_BLOCK}`,

  "Written Retest": `
I certify that {studentName} has received the additional ground training as required by 14 CFR § 61.49. I have determined that they are proficient to pass the {knowledgeTestName} knowledge test.
${SIGNATURE_BLOCK}`,

  "Practical Test Retest": `
I certify that {studentName} has received the additional flight training as required by 14 CFR § 61.49. I have determined that they are proficient to pass the {practicalTestType}.
${SIGNATURE_BLOCK}`,

  "Complex Airplane PIC": `
I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training of 14 CFR § 61.31(e) in a {aircraft} complex airplane. I have determined that they are proficient in the operation and systems of a complex airplane.
${SIGNATURE_BLOCK}`,

  "High-Performance Airplane PIC": `
I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training of 14 CFR § 61.31(f) in a {aircraft} high-performance airplane. I have determined that they are proficient in the operation and systems of a high-performance airplane.
${SIGNATURE_BLOCK}`,

  "High-Altitude Pressurized PIC": `
I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training of 14 CFR § 61.31(g) in a {aircraft} pressurized aircraft. I have determined that they are proficient in the operation and systems of a pressurized aircraft.
${SIGNATURE_BLOCK}`,

  "Tailwheel Airplane PIC": `
I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training of 14 CFR § 61.31(i) in a {aircraft} of tailwheel airplane. I have determined that they are proficient in the operation of a tailwheel airplane.
${SIGNATURE_BLOCK}`,

  "Simplified Flight Controls PIC": `
I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training of 14 CFR § 61.31(l)(1) in a {aircraft} aircraft with simplified flight controls designation. I have determined that they are proficient in the operation of a {categoryClass} {aircraft} aircraft with simplified flight controls.
${SIGNATURE_BLOCK}`,

  "Simplified Flight Controls Initial Cadre": `
I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the required training of 14 CFR § 61.195(n)(2)(ii) in a {aircraft} aircraft with simplified flight controls designation. I have determined that they are proficient in the operation of a {categoryClass} {aircraft} aircraft with simplified flight controls.
${SIGNATURE_BLOCK}`,

  "Night Vision Goggles": `
I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the ground training required by 14 CFR § 61.31(k)(1), (i) through (v) to conduct night vision goggle operations.
${SIGNATURE_BLOCK}`,
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
  aircraft: { label: "Aircraft (make & model)", type: "text", required: true },
  aircraftCategory: {
    label: "Aircraft category",
    type: "select",
    required: true,
    options: ["Airplane", "Helicopter", "Glider", "Powered-Lift"],
    placeholder: "Used where the endorsement names the aircraft category.",
  },
  airspaceName: { label: "Airspace name", type: "text", required: true },
  airportName: { label: "Airport name", type: "text", required: true },
  airportPair: { label: "Airport names", type: "text", required: true },
  annualReviewDueDate: { label: "Annual review due date", type: "date", required: true },
  category: {
    label: "Category",
    type: "select",
    required: true,
    options: ["Airplane", "Helicopter"],
    placeholder: "Select the specific category required by the endorsement.",
  },
  categoryClass: {
    label: "Category and class",
    type: "select",
    required: true,
    options: [
      "Airplane Single-Engine Land",
      "Airplane Multi-Engine Land",
      "Airplane Single-Engine Sea",
      "Airplane Multi-Engine Sea",
      "Rotorcraft Helicopter",
      "Rotorcraft Gyroplane",
      "Glider",
      "Powered-Lift",
      "Airship",
      "Free Balloon",
      "Lighter-Than-Air",
    ],
    placeholder: "Select the exact category and class named in the endorsement.",
  },
  certificateType: {
    label: "Certificate type",
    type: "select",
    required: true,
    options: [
      "Student Pilot",
      "Sport Pilot",
      "Recreational Pilot",
      "Private Pilot",
      "Commercial Pilot",
      "Flight Instructor",
      "Ground Instructor",
      "Instrument Rating",
      "Airline Transport Pilot",
    ],
    placeholder: "Select the certificate or rating referenced in the endorsement.",
  },
  citizenshipDocument: {
    label: "Citizenship document",
    type: "select",
    required: true,
    options: ["U.S. birth certificate", "U.S. passport"],
  },
  citizenshipDocumentNumber: {
    label: "Document control or sequential number",
    type: "text",
    required: true,
    placeholder: "Used to identify the citizenship document reviewed.",
  },
  flightInstructorKnowledgeTest: {
    label: "Instructor knowledge test",
    type: "select",
    required: true,
    options: ["FIA", "FIH"],
    placeholder: "Select the exact instructor knowledge test named in the endorsement.",
  },
  cfiKnowledgeTests: {
    label: "CFI knowledge tests with deficiencies",
    type: "multi-select",
    required: true,
    options: ["FIA", "FIH", "FOI", "FII"],
    placeholder: "Select every instructor knowledge test covered by this deficiency endorsement.",
  },
  cfiKnowledgeParagraph: {
    label: "14 CFR § 61.185(a) paragraph",
    type: "select",
    required: true,
    options: ["(2)", "(3)"],
    placeholder: "Select the paragraph appropriate to the flight instructor rating sought.",
  },
  flightInstructorInstrumentRating: {
    label: "CFII category",
    type: "select",
    required: true,
    options: ["Airplane", "Helicopter", "Powered-Lift"],
    placeholder: "Select the aircraft category for the CFII practical test.",
  },
  flightReviewAircraft: {
    label: "Aircraft model",
    type: "text",
    required: false,
    placeholder: "Optional: add the aircraft make/model used for the flight review.",
  },
  classCategory: { label: "Category and class", type: "text", required: true },
  eventDate: { label: "Date", type: "date", required: true },
  groundInstructorType: {
    label: "Ground instructor type",
    type: "select",
    required: true,
    options: ["Basic", "Advanced", "Instrument"],
    placeholder: "Select the exact ground instructor type named in the endorsement.",
  },
  instrumentRating: {
    label: "Instrument rating sought",
    type: "select",
    required: true,
    options: ["Instrument-Airplane", "Instrument-Helicopter"],
    placeholder: "Select the exact instrument rating named in the endorsement.",
  },
  knowledgeTestName: {
    label: "Knowledge test",
    type: "select",
    required: true,
    options: [
      "Private Pilot Airplane",
      "Private Pilot Helicopter",
      "Commercial Pilot Airplane",
      "Commercial Pilot Helicopter",
      "Instrument Rating Airplane",
      "Instrument Rating Helicopter",
      "Fundamentals of Instructing",
      "Flight Instructor Airplane",
      "Flight Instructor Helicopter",
      "Flight Instructor Instrument Airplane",
      "Flight Instructor Instrument Helicopter",
    ],
    placeholder: "Enter the exact knowledge test name referenced in the endorsement.",
  },
  limitations: {
    label: "Limitations",
    type: "text",
    required: true,
    placeholder: "Used to complete the endorsement conditions or limitations.",
  },
  localConditions: {
    label: "Conditions or limitations",
    type: "text",
    required: true,
    placeholder: "Used to complete the conditions or limitations sentence in the endorsement.",
  },
  practicalTestCertificate: {
    label: "Certificate sought",
    type: "text",
    required: true,
    placeholder: "Used where the endorsement names the certificate being sought.",
  },
  practicalTestType: {
    label: "Practical test",
    type: "select",
    required: true,
    options: [
      "Sport Pilot practical test",
      "Private Pilot practical test",
      "Commercial Pilot practical test",
      "Instrument Rating practical test",
      "Flight Instructor practical test",
      "Flight Instructor Instrument practical test",
    ],
    placeholder: "Select the exact practical test referenced in the endorsement.",
  },
  pilotCertificateGrade: {
    label: "Grade of pilot certificate",
    type: "select",
    required: true,
    options: ["Student", "Private", "Commercial", "ATP"],
    placeholder: "Select the pilot certificate grade named in the endorsement.",
  },
  pronounSubject: {
    label: "Pronoun",
    type: "select",
    required: true,
    options: ["he", "she", "they"],
    placeholder: "Select the pronoun used in the endorsement wording.",
  },
  proficiencyCheckName: {
    label: "Proficiency check",
    type: "text",
    required: true,
    placeholder: "Used to complete the exact proficiency check name.",
  },
  routeDescription: {
    label: "Route of flight",
    type: "text",
    required: true,
    placeholder: "Used to complete the route portion of the endorsement.",
  },
  routeFrom: {
    label: "Departure airport",
    type: "text",
    required: true,
    placeholder: "Used for the route or repeated solo route in the endorsement.",
  },
  routeTo: {
    label: "Arrival airport",
    type: "text",
    required: true,
    placeholder: "Used for the route or repeated solo route in the endorsement.",
  },
  routeLandings: {
    label: "Landing airports",
    type: "text",
    required: true,
    placeholder: "List the airports where landings are planned.",
  },
  routeStudentName: {
    label: "Student name for planning review",
    type: "text",
    required: true,
    placeholder: "Used in the cross-country planning review sentence.",
  },
  tailwheelAircraftType: {
    label: "Tailwheel aircraft type",
    type: "text",
    required: true,
    placeholder: "Used to identify the tailwheel airplane type in the endorsement.",
  },
  trainingAircraft: {
    label: "Aircraft description",
    type: "text",
    required: true,
    placeholder: "Enter the make and model or aircraft description required by this endorsement.",
  },
};

const REPLACEMENTS = [
  [/_{3,}\(U\.S\. birth certificate or U\.S\. passport\)/g, "{citizenshipDocument}"],
  [/_+\(the relevant control or sequential number on the document, if any\)/g, "{citizenshipDocumentNumber}"],
  [/issuance of _____ certificate/gi, "issuance of {certificateType} certificate"],
  [/for the __________\(make\s*&\s*model\)/gi, "for the {aircraft}"],
  [/to the __________\(make\s*&\s*model\)/gi, "to the {aircraft}"],
  [/in __________\(make\s*&\s*model\)/gi, "in {aircraft}"],
  [/in a __________\(make\s*&\s*model\)/gi, "in a {aircraft}"],
  [/\(airport name\)/gi, "{airportName}"],
  [/\(name of airport\)/gi, "{airportName}"],
  [/\(name of Class B, C, or D\)/gi, "{airspaceName}"],
  [/\(name of Class B\)/gi, "{airspaceName}"],
  [/\(List any applicable conditions or limitations\.\)/gi, "{localConditions}"],
  [/\(Limitations attached\.\)/gi, "{localConditions}"],
  [/Limitations:_{3,}\.?/gi, "Limitations: {limitations}."],
  [/\(aircraft  category\)/gi, "{aircraftCategory}"],
  [/\(specific category and class\)/gi, "{categoryClass}"],
  [/\(name of\) proficiency check/gi, "{proficiencyCheckName} proficiency check"],
  [/\(type of\) practical test/gi, "{practicalTestType} practical test"],
  [/PVT-_{3,}/g, "PVT-{categoryClass}"],
  [/COM-_{3,}/g, "COM-{categoryClass}"],
  [/Commercial-_{3,}/g, "Commercial-{categoryClass}"],
  [/Instrument–\(airplane helicopter\)/g, "{instrumentRating}"],
  [/Instrument–\(airplane\/helicopter\)/g, "{instrumentRating}"],
  [/CFI – \(aircraft category  and class\)/g, "CFI – {categoryClass}"],
  [/instrument – \(airplane  helicopter  \)/gi, "instrument – {flightInstructorInstrumentRating}"],
  [/FIA\/FIH knowledge test/gi, "{flightInstructorKnowledgeTest} knowledge test"],
  [/on the __+ airman knowledge test/gi, "on the {knowledgeTestName} airman knowledge test"],
  [/\(an airplane\)/gi, "{aircraft}"],
  [/by ________\(date 12 calendar-months after date of this endorsement\)/gi, "by {annualReviewDueDate}"],
  [/by _________________\(date 12 calendar-months after this endorsement\)/gi, "by {annualReviewDueDate}"],
  [/\(make  and model\) aircraft on \(date\)/gi, "{aircraft} aircraft on {eventDate}"],
  [/in a \(make\s+and model\) aircraft on \(date\)/gi, "in a {aircraft} aircraft on {eventDate}"],
  [/the required practical test for the issuance of PVT-_{3,} certificate/gi, "the required practical test for the issuance of {practicalTestCertificate} certificate"],
  [/the required practical test for the issuance of Commercial-_{3,} certificate/gi, "the required practical test for the issuance of {practicalTestCertificate} certificate"],
  [/in a __________ aircraft/gi, "in a {trainingAircraft} aircraft"],
  [/solo that __________ aircraft/gi, "solo that {trainingAircraft} aircraft"],
  [/in a __________ complex airplane/gi, "in a {aircraft} complex airplane"],
  [/in a __________ high performance\s+airplane/gi, "in a {aircraft} high performance airplane"],
  [/in a __________ pressurized\s+aircraft/gi, "in a {aircraft} pressurized aircraft"],
  [/operate an __________\(Category and class\)/gi, "operate an {categoryClass}"],
  [/in a\s+of tailwheel airplane/gi, "in a {tailwheelAircraftType} tailwheel airplane"],
  [/\[basic, advanced, instrument\]/gi, "{groundInstructorType}"],
  [/the_{3,}knowledge/gi, "the {knowledgeTestName} knowledge"],
  [/the_{3,}practical test/gi, "the {practicalTestType} practical test"],
];

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
    placeholder: "Required to complete the selected endorsement wording.",
  };
}

const TEMPLATE_FIELD_OVERRIDES = {
  "PIC Solo Outside Rating": {
    categoryClass: {
      label: "Authorized category and class",
      placeholder: "Select the category and class the student is being endorsed to solo as PIC.",
    },
  },
  "PVT Practical Test": {
    categoryClass: {
      label: "Private pilot category and class",
      placeholder: "Select the category and class for the private pilot practical test.",
    },
  },
  "PVT 2-Month Review": {
    categoryClass: {
      label: "Private pilot category and class",
      placeholder: "Select the category and class for the private pilot practical test review.",
    },
  },
  "COM Practical Test": {
    categoryClass: {
      label: "Commercial pilot category and class",
      placeholder: "Select the category and class for the commercial pilot practical test.",
    },
  },
  "COM 2-Month Review": {
    categoryClass: {
      label: "Commercial pilot category and class",
      placeholder: "Select the category and class for the commercial pilot practical test review.",
    },
  },
  "CFI required training": {
    categoryClass: {
      label: "Flight instructor category and class",
      placeholder: "Select the category and class for the flight instructor practical test.",
    },
  },
  "CFII Practical Test": {
    flightInstructorInstrumentRating: {
      label: "CFII category",
      placeholder: "Select the aircraft category for the CFII practical test.",
    },
  },
};

function applyFieldOverrides(templateTitle, fields) {
  const overrides = TEMPLATE_FIELD_OVERRIDES[templateTitle];
  if (!overrides) {
    return fields;
  }

  return fields.map((field) => ({
    ...field,
    ...(overrides[field.key] ?? {}),
  }));
}

function replaceLegacyBlanks(text) {
  let nextText = text.trim();
  let extraFieldIndex = 1;

  REPLACEMENTS.forEach(([pattern, replacement]) => {
    nextText = nextText.replace(pattern, replacement);
  });

  nextText = nextText
    .replace(/planning of\s+\./i, "planning of {routeStudentName}.")
    .replace(/from ______ to _______ via_______ \(route of flight\)/i, "from {routeFrom} to {routeTo} via {routeDescription}")
    .replace(/with landings at \(names of the airports\)/i, "with landings at {routeLandings}")
    .replace(/in a__________\(make & model\)/i, "in a {aircraft}")
    .replace(/between ______and ______at both \(airport names\)/i, "between {routeFrom} and {routeTo} at both {airportPair}")
    .replace(/on ______\(date\)/i, "on {eventDate}")
    .replace(/_{3,}/g, () => `{extraDetail${extraFieldIndex++}}`)
    .replace(/\(fill here\)/gi, "{extraDetail}");

  return nextText;
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

const templates = Object.fromEntries(
  Object.entries(rawTemplates).map(([title, text]) => {
    const normalizedText = replaceLegacyBlanks(text);
    return [
      title,
      {
        text: normalizedText,
        fields: applyFieldOverrides(title, inferFields(normalizedText)),
      },
    ];
  })
);

delete templates["CFI Written Deficiencies"];
templates["CFI Knowledge Test Deficiencies"] = {
  text: `I certify that {studentName} has demonstrated satisfactory knowledge of the subject areas in which they were deficient on the {cfiKnowledgeTests}.
${SIGNATURE_BLOCK}`,
  fields: [{ key: "cfiKnowledgeTests", ...FIELD_LIBRARY.cfiKnowledgeTests }],
};

templates["CFII Written Deficiency"] = {
  ...templates["CFI Knowledge Test Deficiencies"],
};

templates["CFII Practical Test"] = {
  text: `I certify that {studentName} has received the required certificated flight instructor - instrument training of 14 CFR § 61.187(b)(7). I have determined they are prepared for the certificated flight instructor - instrument-{flightInstructorInstrumentRating} practical test.
${SIGNATURE_BLOCK}`,
  fields: [
    {
      key: "flightInstructorInstrumentRating",
      ...FIELD_LIBRARY.flightInstructorInstrumentRating,
    },
  ],
};

templates["PVT addon- deficiency"] = {
  ...templates["PVT Written Deficiencies"],
};

templates["PVT addon-checkride"] = {
  ...templates["PVT Practical Test"],
};

templates["IR addon"] = {
  ...templates["IR Practical Test"],
};

templates["COM addon"] = {
  ...templates["COM Practical Test"],
};

templates["NVG ground training"] = {
  text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the ground training required by 14 CFR § 61.31(k)(1), (i) through (v) to conduct night vision goggle operations.
${SIGNATURE_BLOCK}`,
  fields: [
    {
      key: "pilotCertificateGrade",
      ...FIELD_LIBRARY.pilotCertificateGrade,
    },
  ],
};

templates["NVG PIC"] = {
  text: `I certify that {studentName}, {pilotCertificateGrade}, {studentCertNumber}, has received the flight training on night vision goggle operations required by 14 CFR § 61.31(k)(2), (i) through (iv). I find them proficient in the use of night vision goggles.
${SIGNATURE_BLOCK}`,
  fields: [
    {
      key: "pilotCertificateGrade",
      ...FIELD_LIBRARY.pilotCertificateGrade,
    },
  ],
};

export default templates;
