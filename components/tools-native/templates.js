// src/templates.js


const templates = {
"Endorsement of U.S. citizenship recommended by the Transportation Security  Administration (TSA)":`
I certify that {studentName} {studentCertNumber} has presented me a ____________(U.S. birth certificate or U.S. passport) and ______________(the relevant control or sequential number on the document, if any) establishing that {studentName} is a U.S. citizen or national in accordance with 49 CFR § 1552.3(h).  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Prerequisites for practical test": `
I certify that {studentName} {studentCertNumber} has received and logged training time within 2 calendar-months preceding the month of application in preparation for the practical test and {studentName} is prepared for the required practical test for the issuance of _____ certificate. 
Date: {date} 	          *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,


"Pre-solo Written test":`
I certify that {studentName} {studentCertNumber} has satisfactorily completed the pre-solo knowledge test of § 61.87(b) for the __________(make & model).
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 
"Pre-solo flight training":`
I certify that {studentName} {studentCertNumber} has received and logged pre-solo flight training for the maneuvers and procedures that are appropriate to the __________(make & model). I have determined {studentName} has demonstrated satisfactory proficiency and safety on the maneuvers and procedures required by § 61.87 in this or similar make and model of aircraft to be flown. 
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Pre-solo flight training at night": `
I certify that {studentName} {studentCertNumber} has received flight training at night on night flying procedures that include takeoffs, approaches, landings, and go-arounds at night at the (airport name) airport where the solo flight will be conducted; navigation training at night in the vicinity of the (airport name) airport where the solo flight will be conducted. This endorsement expires 90 calendar-days from the date the flight training at night was received.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Solo flight (first 90 calendar-day period)": `
I certify that {studentName} {studentCertNumber} has received the required training to qualify for solo flying. I have determined {studentName} meets the applicable requirements of § 61.87(n) and is proficient to make solo flights in __________(make & model).  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Solo flight (each additional 90 calendar-day period)": `
I certify that {studentName} {studentCertNumber} has received the required training to qualify for solo flying. I have determined that {studentName} meets the applicable requirements of § 61.87(p) and is proficient to make solo flights in __________(make & model).  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Solo takeoffs and landings at another airport within 25 nautical miles (NM)": `
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

"Repeated solo cross-country flights not more than 50 NM from the point of departure": ` 
I certify that {studentName} {studentCertNumber} has received the required training in both directions between ______and ______at both (airport names). I have determined that {studentName} is proficient of § 61.93(b)(2) to conduct repeated solo cross-country flights over that route, subject to the following conditions: (Limitations attached.)  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Solo flight in Class B airspace": `
I certify that {studentName} {studentCertNumber} has received the required training of §61.95(a). I have determined {studentName} is proficient to conduct solo flights in (name of Class B) airspace. (List any applicable conditions or limitations.)  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Solo flight to, from, or at an airport located in Class B airspace":` 
I certify that {studentName} {studentCertNumber} has received the required training of § 61.95(b)(1). I have determined that {studentName} is proficient to conduct solo flight operations at (name of airport). (List any applicable conditions or limitations.)  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,


"Solo flight in Class B, C, and D airspace":`  
I certify that {studentName} {studentCertNumber} has received the required training of § 61.94(a). I have determined {studentName} is proficient to conduct solo flights in (name of Class B, C, or D) airspace and authorized to operate to, from through and at (name of airport). (List any applicable conditions or limitations.)
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Solo flight to, from, or at an airport located in Class B, C, or D airspace or at an  airport having an operational control tower":` 
I certify that {studentName} {studentCertNumber} has received the required training of § 61.94(a)(1). I have determined that {studentName} is proficient to conduct solo flight operations at (name of airport located in Class B, C, or D airspace or an airport having an  operational control tower). (List any applicable conditions or limitations.)  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"PIC solo not in category/class rating":` 
I certify that {studentName} {studentCertNumber} has received the training as required by  § 61.31(d)(2) to serve as a pilot in command in a (specific category and class) of aircraft. I have determined that {studentName} is prepared to solo that __________ aircraft.  Limitations:_______________. `,

"Taking flight proficiency check for different category or class of aircraft":` 
I certify that {studentName} {studentCertNumber} has received the required training required in accordance with §§ 61.309 and 61.311 and have determined that {studentName} is prepared for the (name of) proficiency check.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Taking sport pilot checkride":` 
I certify that {studentName} {studentCertNumber} has received the training required in accordance with §§ 61.309 and 61.311 and met the aeronautical experience requirements of § 61.313. I have determined that {studentName} is prepared for the (type of) practical test.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 
"Light-sport aircraft that has a maximum speed in level flight with maximum  continuous power (VH) less than or equal to 87 Knots Calibrated Airspeed (KCAS)":` 
I certify that {studentName} {studentCertNumber} has received the required training required in  accordance with § 61.327(a) in a __________ aircraft. I have determined (him or  her) proficient Pilot in command of a light-sport aircraft that has a VH less than  or equal to 87 KCAS.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Light-sport aircraft that has a VH greater than 87 KCAS":`  
I certify that {studentName} {studentCertNumber} has received the required training required in  accordance with § 61.327(b) in a __________ aircraft. I have determined (him or  her) proficient Pilot in command of a light-sport aircraft that has a VH greater  than 87 KCAS.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 

"PVT knowledge test":`  
I certify that {studentName} {studentCertNumber} has received the required training in accordance  with § 61.105. I have determined {studentName} is prepared for the PVT  knowledge test.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Deficiencies on PVT written":`
I certify that {studentName} {studentCertNumber} has demonstrated satisfactory knowledge of the subject areas in which {studentName} was deficient on the PVT airman knowledge test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"PVT required training":`
I certify that {studentName} {studentCertNumber} has received the required training in accordance  with §61.107 and § 61.109 . I have determined {studentName} is prepared for the PVT-________ practical test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 
"2 mo for PVT": `
I certify that {studentName} {studentCertNumber} has received and logged training time within 2 calendar-months preceding the month of application in preparation for the practical test and {studentName} is prepared for the required practical test for the issuance of PVT-________ certificate. 
Date: {date} 	          *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"COM knowledge test":` 
I certify that {studentName} {studentCertNumber} has received the required training of § 61.97(b). I have determined that {studentName} is prepared for the COM knowledge test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 
"Deficiencies on COM written":`
I certify that {studentName} {studentCertNumber} has demonstrated satisfactory knowledge of the subject areas in which {studentName} was deficient on the COM airman knowledge test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"COM required training":` 
I certify that {studentName} {studentCertNumber} has received the required training of §§ 61.127  and 61.129. I have determined that {studentName} is prepared for the COM-________ practical test.  
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"2 mo for COM": `
I certify that {studentName} {studentCertNumber} has received and logged training time within 2 calendar-months preceding the month of application in preparation for the practical test and {studentName} is prepared for the required practical test for the issuance of Commercial-________ certificate. 
Date: {date} 	          *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"IR knowledge test": ` 
I certify that {studentName} {studentCertNumber} has received the required training of § 61.65(b). I have determined that {studentName} is prepared for the Instrument–(airplane helicopter) knowledge test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Deficiencies on IR written":`
I certify that {studentName} {studentCertNumber} has demonstrated satisfactory knowledge of the subject areas in which {studentName} was deficient on the Instrument airman knowledge test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"IR required training":` 
I certify that {studentName} {studentCertNumber} has received the required training of § 61.65(c) and (d). I have determined {studentName} is prepared for the Instrument–(airplane/helicopter) practical test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 
"2 mo for IR":`  
I certify that {studentName} {studentCertNumber} has received and logged the required flight  time/training of § 61.39(a) in preparation for the practical test within 2 calendar-months  preceding the date of the test and has satisfactory knowledge of the subject areas in which  {studentName} was shown to be deficient by the FAA Airman Knowledge Test Report. I have  determined {studentName} is prepared for the Instrument–(airplane/helicopter) practical test.   
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"FOI knowledge test":`  
I certify that {studentName} {studentCertNumber} has received the required fundamentals of  instruction training of § 61.185(a)(1). I have determined that {studentName} is prepared for  the Fundamentals of Instructing knowledge test. 
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Flight instructor Written test": ` 
I certify that {studentName} {studentCertNumber} has received the required training of  § 61.185(a)((2) or (3) (as appropriate to the flight instructor rating sought)). I have  determined that {studentName} is prepared for the FIA/FIH knowledge test.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Deficiencies on CFI writtens":`
I certify that {studentName} {studentCertNumber} has demonstrated satisfactory knowledge of the subject areas in which {studentName} was deficient on the ________________ airman knowledge test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"CFI required training": ` 
I certify that {studentName} {studentCertNumber} has received the required training of  § 61.187(b). I have determined that {studentName} is prepared for the CFI – (aircraft category  and class) practical test.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"CFII required training":  `
I certify that {studentName} {studentCertNumber} has received the required certificated flight instructor – instrument training of § 61.187(b)(7). I have determined {studentName} is  prepared for the certificated flight instructor – instrument – (airplane  helicopter  ) practical test. 
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Spin training":` 
I certify that {studentName} {studentCertNumber} has received the required training of § 61.183(i)  in (an airplane). I have determined that {studentName} is competent and possesses  instructional proficiency in stall awareness, spin entry, spins, and spin recovery  procedures.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 
"R-22/R-44 awareness training":` 
I certify that  {studentName} {studentCertNumber} has received the Awareness Training required by SFAR 73, section 2(a)(3)(i)–(v).  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"R-22 solo endorsement":`  
I certify that  {studentName} {studentCertNumber} meets the  experience requirements of SFAR 73, section 2(b)(3) and has been given training specified by SFAR 73, section 2(b)(3)(i–iv). {studentName} has been found proficient to  solo the R-22 helicopter. 
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,
 
"R-22 pilot-in-command endorsement":`  
I certify that  {studentName} {studentCertNumber} has been given  training specified by SFAR 73, section 2(b)(1)(ii)(A–D) for Robinson R-22 helicopters  and is proficient Pilot in command. An annual flight review must be completed by ________(date 12 calendar-months after date of this endorsement) unless the requirements of  SFAR 73, section 2(b)(1)(i) are met. 
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Flight review in an R-22":`  
I certify that  {studentName} {studentCertNumber} has satisfactorily  completed the flight review in an R-22 required by § 61.56 and SFAR 73, section 2(c)(1)  and (3), on {date} 
 *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"R-44 solo endorsement":` 
I certify that  {studentName} {studentCertNumber} meets the experience requirements of SFAR 73, section 2(b)(4) and has been given training specified by SFAR 73, section 2(b)(4)(i)–(iv). They have been found proficient to solo the R-44 helicopter.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"R-44 pilot-in-command endorsement":` 
I certify that  {studentName} {studentCertNumber} has been given training specified by SFAR 73, section 2(b)(2)(ii)(A–D) for Robinson R-44 helicopters  and is proficient Pilot in command. An annual flight review must be completed  by _________________(date 12 calendar-months after this endorsement) unless the requirements of  SFAR 73, section 2(b)(2)(i) are met.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Flight review in an R-44 helicopter":`  
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

"Retesting of a written":`
I certify that {studentName} {studentCertNumber} has received the additional ground training as required by § 61.49. I have determined that {studentName}  is proficient to pass the_______________knowledge.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Retesting of checkride":`
I certify that {studentName} {studentCertNumber} has received the additional flight training as required by § 61.49. I have determined that {studentName}  is proficient to pass the________________practical test.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Pilot in command in a complex airplane":`  
I certify that  {studentName} {studentCertNumber} , has received the required training of § 61.31(e) in a __________ complex airplane. I have determined that {studentName} is proficient in the operation and systems of a complex  airplane.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Pilot in command in a high-performance airplane":`  
I certify that  {studentName} {studentCertNumber} , has received the required training of § 61.31(f) in a __________ high performance  airplane. I have determined that {studentName} is proficient in the operation and systems of a  high-performance airplane.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Pilot in command in a pressurized aircraft capable of high-altitude  operations":` 
I certify that  {studentName} {studentCertNumber} , has received the required training of § 61.31(g) in a __________ pressurized  aircraft. I have determined that {studentName} is proficient in the operation and systems of a  pressurized aircraft.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

"Pilot in command in a tailwheel airplane":`
I certify that  {studentName} {studentCertNumber} , has received the required training of § 61.31(i) in a 			of tailwheel airplane. I have determined that {studentName} is proficient in the operation of a tailwheel  airplane.  
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,


"Night vision goggle endorsement": `
I certify that {studentName} {studentCertNumber} has received the required training in the use of night vision goggles as specified in § 61.31(j) and is proficient to operate an __________(Category and class) using such equipment.
Date: {date}           *
{instructorName}           {instructorCertNumber}          Exp. {instructorCertExpDate}`,

};

  export default templates;
