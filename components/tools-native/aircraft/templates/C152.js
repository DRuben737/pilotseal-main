

const C152 = {
  id: "C152",
  type: "C152",

  // 这里先只定义包线，后续可以按需要补充各个站位（座位、行李、油箱等）
  stations: [
    {
      id: "left_seat",
      name: "Left Seat",
      arm: 39
    },
    {
      id: "right_seat",
      name: "Right Seat",
      arm: 39
    },
    {
      id: "baggage_1",
      name: "Baggage Area 1",
      arm: 64
    },
    {
      id: "baggage_2",
      name: "Baggage Area 2",
      arm: 84
    },
    {
      id: "fuel",
      name: "Fuel (Gallons)",
      arm: 42,          // Standard C152 fuel arm (POH)
      weightPerGallon: 6
    }
  ],

  // C152 CG 包线（Normal Category）
  // 数据格式：{ cg: 英寸, weight: 磅 }
  envelopeNormal: [
    { cg: 31.0,  weight: 1350 },
    { cg: 31.0,  weight: 1000 },
    { cg: 36.5,  weight: 1000 },
    { cg: 36.5,  weight: 1670 },
    { cg: 32.7,  weight: 1670 },
    { cg: 31.0,  weight: 1350 }
  ]
};

export default C152;