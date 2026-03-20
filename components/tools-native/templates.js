// src/templates.js


const rawTemplates = {
"TSA U.S. Citizenship":`
I certify that {studentName} {studentCertNumber} has presented me a ____________(U.S. birth certificate or U.S. passport) and ______________(the relevant control or sequential number on the document, if any) establishing that {studentName} is a U.S. citizen or national in accordance with 49 CFR § 1552.3(h).  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Practical Test Prereqs": `
I certify that {studentName} {studentCertNumber} has received and logged training time within 2 calendar-months preceding the month of application in preparation for the practical test and {studentName} is prepared for the required practical test for the issuance of _____ certificate. 
Date: {date} 	          *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,


"Pre-Solo Written":`
I certify that {studentName} {studentCertNumber} has satisfactorily completed the pre-solo knowledge test of § 61.87(b) for the __________(make & model).
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 
"Pre-Solo Flight Training":`
I certify that {studentName} {studentCertNumber} has received and logged pre-solo flight training for the maneuvers and procedures that are appropriate to the __________(make & model). I have determined {studentName} has demonstrated satisfactory proficiency and safety on the maneuvers and procedures required by § 61.87 in this or similar make and model of aircraft to be flown. 
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Pre-Solo Night Training": `
I certify that {studentName} {studentCertNumber} has received flight training at night on night flying procedures that include takeoffs, approaches, landings, and go-arounds at night at the (airport name) airport where the solo flight will be conducted; navigation training at night in the vicinity of the (airport name) airport where the solo flight will be conducted. This endorsement expires 90 calendar-days from the date the flight training at night was received.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Solo Flight Initial 90 Days": `
I certify that {studentName} {studentCertNumber} has received the required training to qualify for solo flying. I have determined {studentName} meets the applicable requirements of § 61.87(n) and is proficient to make solo flights in __________(make & model).  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Solo Flight Additional 90 Days": `
I certify that {studentName} {studentCertNumber} has received the required training to qualify for solo flying. I have determined that {studentName} meets the applicable requirements of § 61.87(p) and is proficient to make solo flights in __________(make & model).  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Solo T/O & Landing Within 25 NM": `
I certify that {studentName} {studentCertNumber} has received the required training of § 61.93(b)(1). I have determined that {studentName} is proficient to practice solo takeoffs and landings at (airport name). The takeoffs and landings at (airport name) are subject to the following conditions: (List any applicable conditions or limitations.)  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Solo cross-country training":`
I certify that {studentName} {studentCertNumber} has received the required solo cross-country training. I find {studentName} has met the applicable requirements of § 61.93, and is proficient to make solo cross-country flights in a __________(make & model), (aircraft  category).  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Solo cross-country day": `
I have reviewed the cross-country planning of                    . I find the planning and preparation to be correct to make the solo flight from ______ to _______ via_______ (route of flight) with landings at (names of the airports) in a__________(make & model) on ______(date). (limitations attached.) 
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Repeated Solo XC Within 50 NM": ` 
I certify that {studentName} {studentCertNumber} has received the required training in both directions between ______and ______at both (airport names). I have determined that {studentName} is proficient of § 61.93(b)(2) to conduct repeated solo cross-country flights over that route, subject to the following conditions: (Limitations attached.)  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Solo flight in Class B airspace": `
I certify that {studentName} {studentCertNumber} has received the required training of §61.95(a). I have determined {studentName} is proficient to conduct solo flights in (name of Class B) airspace. (List any applicable conditions or limitations.)  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Solo Ops at Class B Airport":` 
I certify that {studentName} {studentCertNumber} has received the required training of § 61.95(b)(1). I have determined that {studentName} is proficient to conduct solo flight operations at (name of airport). (List any applicable conditions or limitations.)  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,


"Solo Flight in Class B/C/D":`  
I certify that {studentName} {studentCertNumber} has received the required training of § 61.94(a). I have determined {studentName} is proficient to conduct solo flights in (name of Class B, C, or D) airspace and authorized to operate to, from through and at (name of airport). (List any applicable conditions or limitations.)
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Solo Ops at Towered/Class B/C/D Airport":` 
I certify that {studentName} {studentCertNumber} has received the required training of § 61.94(a)(1). I have determined that {studentName} is proficient to conduct solo flight operations at (name of airport located in Class B, C, or D airspace or an airport having an  operational control tower). (List any applicable conditions or limitations.)  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"PIC Solo Outside Rating":` 
I certify that {studentName} {studentCertNumber} has received the training as required by  § 61.31(d)(2) to serve as a pilot in command in a (specific category and class) of aircraft. I have determined that {studentName} is prepared to solo that __________ aircraft.  Limitations:_______________. `,

"Sport Pilot Proficiency Check":` 
I certify that {studentName} {studentCertNumber} has received the required training required in accordance with §§ 61.309 and 61.311 and have determined that {studentName} is prepared for the (name of) proficiency check.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Sport Pilot Practical Test":` 
I certify that {studentName} {studentCertNumber} has received the training required in accordance with §§ 61.309 and 61.311 and met the aeronautical experience requirements of § 61.313. I have determined that {studentName} is prepared for the (type of) practical test.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 
"LSA PIC VH <= 87 KCAS":` 
I certify that {studentName} {studentCertNumber} has received the required training required in  accordance with § 61.327(a) in a __________ aircraft. I have determined (him or  her) proficient Pilot in command of a light-sport aircraft that has a VH less than  or equal to 87 KCAS.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"LSA PIC VH > 87 KCAS":`  
I certify that {studentName} {studentCertNumber} has received the required training required in  accordance with § 61.327(b) in a __________ aircraft. I have determined (him or  her) proficient Pilot in command of a light-sport aircraft that has a VH greater  than 87 KCAS.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 

"PVT knowledge test":`  
I certify that {studentName} {studentCertNumber} has received the required training in accordance  with § 61.105. I have determined {studentName} is prepared for the PVT  knowledge test.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"PVT Written Deficiencies":`
I certify that {studentName} {studentCertNumber} has demonstrated satisfactory knowledge of the subject areas in which {studentName} was deficient on the PVT airman knowledge test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"PVT Practical Test":`
I certify that {studentName} {studentCertNumber} has received the required training in accordance  with §61.107 and § 61.109 . I have determined {studentName} is prepared for the PVT-________ practical test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 
"PVT 2-Month Review": `
I certify that {studentName} {studentCertNumber} has received and logged training time within 2 calendar-months preceding the month of application in preparation for the practical test and {studentName} is prepared for the required practical test for the issuance of PVT-________ certificate. 
Date: {date} 	          *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"COM knowledge test":` 
I certify that {studentName} {studentCertNumber} has received the required training of § 61.97(b). I have determined that {studentName} is prepared for the COM knowledge test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 
"COM Written Deficiencies":`
I certify that {studentName} {studentCertNumber} has demonstrated satisfactory knowledge of the subject areas in which {studentName} was deficient on the COM airman knowledge test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"COM Practical Test":` 
I certify that {studentName} {studentCertNumber} has received the required training of §§ 61.127  and 61.129. I have determined that {studentName} is prepared for the COM-________ practical test.  
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"COM 2-Month Review": `
I certify that {studentName} {studentCertNumber} has received and logged training time within 2 calendar-months preceding the month of application in preparation for the practical test and {studentName} is prepared for the required practical test for the issuance of Commercial-________ certificate. 
Date: {date} 	          *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"IR knowledge test": ` 
I certify that {studentName} {studentCertNumber} has received the required training of § 61.65(b). I have determined that {studentName} is prepared for the Instrument–(airplane helicopter) knowledge test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"IR Written Deficiencies":`
I certify that {studentName} {studentCertNumber} has demonstrated satisfactory knowledge of the subject areas in which {studentName} was deficient on the Instrument airman knowledge test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"IR Practical Test":` 
I certify that {studentName} {studentCertNumber} has received the required training of § 61.65(c) and (d). I have determined {studentName} is prepared for the Instrument–(airplane/helicopter) practical test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 
"IR 2-Month Review":`  
I certify that {studentName} {studentCertNumber} has received and logged the required flight  time/training of § 61.39(a) in preparation for the practical test within 2 calendar-months  preceding the date of the test and has satisfactory knowledge of the subject areas in which  {studentName} was shown to be deficient by the FAA Airman Knowledge Test Report. I have  determined {studentName} is prepared for the Instrument–(airplane/helicopter) practical test.   
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"FOI knowledge test":`  
I certify that {studentName} {studentCertNumber} has received the required fundamentals of  instruction training of § 61.185(a)(1). I have determined that {studentName} is prepared for  the Fundamentals of Instructing knowledge test. 
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"CFI Knowledge Test": ` 
I certify that {studentName} {studentCertNumber} has received the required training of  § 61.185(a)((2) or (3) (as appropriate to the flight instructor rating sought)). I have  determined that {studentName} is prepared for the FIA/FIH knowledge test.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"CFI Written Deficiencies":`
I certify that {studentName} {studentCertNumber} has demonstrated satisfactory knowledge of the subject areas in which {studentName} was deficient on the ________________ airman knowledge test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"CFI required training": ` 
I certify that {studentName} {studentCertNumber} has received the required training of  § 61.187(b). I have determined that {studentName} is prepared for the CFI – (aircraft category  and class) practical test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"CFII Practical Test":  `
I certify that {studentName} {studentCertNumber} has received the required certificated flight instructor – instrument training of § 61.187(b)(7). I have determined {studentName} is  prepared for the certificated flight instructor – instrument – (airplane  helicopter  ) practical test. 
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Spin training":` 
I certify that {studentName} {studentCertNumber} has received the required training of § 61.183(i)  in (an airplane). I have determined that {studentName} is competent and possesses  instructional proficiency in stall awareness, spin entry, spins, and spin recovery  procedures.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 
"R-22/R-44 Awareness":` 
I certify that  {studentName} {studentCertNumber} has received the Awareness Training required by SFAR 73, section 2(a)(3)(i)–(v).  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"R-22 solo endorsement":`  
I certify that  {studentName} {studentCertNumber} meets the  experience requirements of SFAR 73, section 2(b)(3) and has been given training specified by SFAR 73, section 2(b)(3)(i–iv). {studentName} has been found proficient to  solo the R-22 helicopter. 
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 
"R-22 PIC":`  
I certify that  {studentName} {studentCertNumber} has been given  training specified by SFAR 73, section 2(b)(1)(ii)(A–D) for Robinson R-22 helicopters  and is proficient Pilot in command. An annual flight review must be completed by ________(date 12 calendar-months after date of this endorsement) unless the requirements of  SFAR 73, section 2(b)(1)(i) are met. 
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"R-22 Flight Review":`  
I certify that  {studentName} {studentCertNumber} has satisfactorily  completed the flight review in an R-22 required by § 61.56 and SFAR 73, section 2(c)(1)  and (3), on {date} 
 *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"R-44 solo endorsement":` 
I certify that  {studentName} {studentCertNumber} meets the experience requirements of SFAR 73, section 2(b)(4) and has been given training specified by SFAR 73, section 2(b)(4)(i)–(iv). They have been found proficient to solo the R-44 helicopter.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"R-44 PIC":` 
I certify that  {studentName} {studentCertNumber} has been given training specified by SFAR 73, section 2(b)(2)(ii)(A–D) for Robinson R-44 helicopters  and is proficient Pilot in command. An annual flight review must be completed  by _________________(date 12 calendar-months after this endorsement) unless the requirements of  SFAR 73, section 2(b)(2)(i) are met.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"R-44 Flight Review":`  
I certify that  {studentName} {studentCertNumber} has satisfactorily completed the flight review in an R-44 required by 14 CFR, § 61.56 and SFAR 73,  section 2(c)(2) and (3), on {date} 
 *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Helicopter Touchdown Autorotation":` 
I certify that {studentName} {studentCertNumber} has received training in straight-in and  180-degree autorotations to include touchdown. I have determined that {studentName} is  competent in instructional knowledge relating to the elements, common errors,  performance, and correction of common errors related to straight-in and 180-degree  autorotations.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Flight review":` 
I certify that  {studentName} {studentCertNumber} , has satisfactorily completed a flight review of § 61.56(a) on {date} . 
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Instrument proficiency check":`  
I certify that  {studentName} {studentCertNumber} , has satisfactorily completed the instrument proficiency check of § 61.57(d) in a (make  and model) aircraft on (date).  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Ground Instructor Recency": `
I certify that {studentName} {studentCertNumber}  has demonstrated knowledge in the subject areas prescribed for a [basic, advanced, instrument] ground instructor under § 61.213(a)(3) and (a)(4), as appropriate.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Written Retest":`
I certify that {studentName} {studentCertNumber} has received the additional ground training as required by § 61.49. I have determined that {studentName}  is proficient to pass the_______________knowledge.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Practical Test Retest":`
I certify that {studentName} {studentCertNumber} has received the additional flight training as required by § 61.49. I have determined that {studentName}  is proficient to pass the________________practical test.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Complex Airplane PIC":`  
I certify that  {studentName} {studentCertNumber} , has received the required training of § 61.31(e) in a __________ complex airplane. I have determined that {studentName} is proficient in the operation and systems of a complex  airplane.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"High-Performance Airplane PIC":`  
I certify that  {studentName} {studentCertNumber} , has received the required training of § 61.31(f) in a __________ high performance  airplane. I have determined that {studentName} is proficient in the operation and systems of a  high-performance airplane.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"High-Altitude Pressurized PIC":` 
I certify that  {studentName} {studentCertNumber} , has received the required training of § 61.31(g) in a __________ pressurized  aircraft. I have determined that {studentName} is proficient in the operation and systems of a  pressurized aircraft.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Tailwheel Airplane PIC":`
I certify that  {studentName} {studentCertNumber} , has received the required training of § 61.31(i) in a 			of tailwheel airplane. I have determined that {studentName} is proficient in the operation of a tailwheel  airplane.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,


"Night Vision Goggles": `
I certify that {studentName} {studentCertNumber} has received the required training in the use of night vision goggles as specified in § 61.31(j) and is proficient to operate an __________(Category and class) using such equipment.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

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
  flightInstructorInstrumentRating: {
    label: "CFII category",
    type: "select",
    required: true,
    options: ["Airplane", "Helicopter"],
    placeholder: "Select the aircraft category for the CFII practical test.",
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
  "Night Vision Goggles": {
    categoryClass: {
      label: "NVG aircraft category and class",
      placeholder: "Select the category and class the pilot is approved to operate with night vision goggles.",
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
  text: `I certify that {studentName} {studentCertNumber} has demonstrated satisfactory knowledge of the subject areas in which {studentName} was deficient on the {cfiKnowledgeTests}.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
  fields: [{ key: "cfiKnowledgeTests", ...FIELD_LIBRARY.cfiKnowledgeTests }],
};

export default templates;
