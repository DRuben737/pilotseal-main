const aircraft = {
  id: "C172S",

  // FAA 官方典型数据（空重根据 POH 常见平均值，可按你飞机实际值替换）
  empty: {
    weight: 1663,  // lbs（典型 C172S 空重）
    arm: 39.5      // inch（典型空重臂距）
  },

  // 所有可加载项目的标准臂距（来自 FAA / POH Chapter 6）
  stations: [
    {
      id: "front_seats",
      name: "Pilot & Copilot",
      arm: 37.0
    },
    {
      id: "rear_seats",
      name: "Rear Passengers",
      arm: 73.0
    },
    {
      id: "fuel",
      name: "Fuel (Usable)",
      arm: 48.0,
      weightPerGallon: 6.0  // 100LL
    },
    {
      id: "baggage_1",
      name: "Baggage Area 1",
      arm: 95.0
    },
    {
      id: "baggage_2",
      name: "Baggage Area 2",
      arm: 123.0
    }
  ],

  // C172S CG 包线（Normal & Utility）
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

export default aircraft;