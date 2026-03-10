const C172N = {
  id: "C172N",
  type: "C172N",

  // 与 C172S 相同的 station 配置（座位、行李、油箱）
  stations: [
    {
      id: "left_seat",
      name: "Left Seat",
      arm: 37
    },
    {
      id: "right_seat",
      name: "Right Seat",
      arm: 37
    },
    {
      id: "rear_seat",
      name: "Rear Seat",
      arm: 73
    },
    {
      id: "baggage_1",
      name: "Baggage Area 1",
      arm: 95
    },
    {
      id: "baggage_2",
      name: "Baggage Area 2",
      arm: 123
    },
    {
      id: "fuel",
      name: "Fuel (Gallons)",
      arm: 48,
      weightPerGallon: 6
    }
  ],

  // TODO: 后续有 172N 的官方 CG 包线数据时，可以在这里补充 envelopeNormal / envelopeUtility  // C172N 使用与 C172S 相同的 CG 包线
  envelopeNormal: [
    { cg: 35.0, weight: 1500 },
    { cg: 35.0, weight: 1950 },
    { cg: 41.0, weight: 2550 },
    { cg: 47.5, weight: 2550 },
    { cg: 47.5, weight: 1500 },
    { cg: 35.0, weight: 1500 }
  ],

  envelopeUtility: [
    { cg: 35.0, weight: 1500 },
    { cg: 35.0, weight: 1950 },
    { cg: 37.5, weight: 2200 },
    { cg: 40.5, weight: 2200 },
    { cg: 40.5, weight: 1500 },
    { cg: 35.0, weight: 1500 }
  ]
};

export default C172N;