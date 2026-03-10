const aircraftTemplate = {
  id: "C172M",

  // FAA POH —— 所有站位的固定 arm
  stations: [
    { id: "left_seat",  name: "Left Seat (Fwd)",  arm: 37.0 },
    { id: "right_seat", name: "Right Seat (Fwd)", arm: 37.0 },
    { id: "rear_seat",  name: "Rear Seat",        arm: 73.0 },
    { id: "baggage_1",  name: "Baggage Area 1",   arm: 95.0 },
    { id: "baggage_2",  name: "Baggage Area 2",   arm: 123.0 },
    { id: "fuel",       name: "Usable Fuel",      arm: 48.0, weightPerGallon: 6.0 }
  ],

  // Normal Category (FAA CG envelope)
  envelopeNormal: [
    { cg: 35.0, weight: 1500 },
    { cg: 35.0, weight: 1950 },
    { cg: 38.5, weight: 2300 },
    { cg: 47.1, weight: 2300 },
    { cg: 47.1, weight: 1500 },
    { cg: 35.0, weight: 1500 }   // closed polygon
  ],

  // Utility Category (FAA CG envelope)
  envelopeUtility: [
    { cg: 35.0, weight: 1500 },
    { cg: 35.0, weight: 1950 },
    { cg: 35.5, weight: 2000 },
    { cg: 40.5, weight: 2000 },
    { cg: 40.5, weight: 1500 },
    { cg: 35.0, weight: 1500 }   // closed polygon
  ]
};

export default aircraftTemplate;