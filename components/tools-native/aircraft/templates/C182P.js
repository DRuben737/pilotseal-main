const C182P = {
  id: "C182P",
  type: "C182P",

  stations: [
    {
      id: "left_seat",
      name: "Front Left Seat",
      arm: 37
    },
    {
      id: "right_seat",
      name: "Front Right Seat",
      arm: 37
    },
    {
      id: "rear_seat",
      name: "Rear Seats",
      arm: 74.1
    },

    // ⭐ 固定滑油（不会出现在 UI 输入中）
    {
      id: "oil",
      name: "Oil (Fixed)",
      arm: -13.6,
      fixedWeight: 22            // <--- 使用固定重量，不让用户输入
    },

    {
      id: "baggage_1",
      name: "Baggage Area 1",
      arm: 96.7
    },
    {
      id: "baggage_2",
      name: "Baggage Area 2",
      arm: 114.3
    },

    // ⭐ Fuel
    {
      id: "fuel",
      name: "Fuel (Gallons)",
      arm: 48,
      weightPerGallon: 6
    }
  ],

  // ⭐ C182P CG Envelope (Normal Category)
  envelopeNormal: [
    { cg: 33,   weight: 1800 },
    { cg: 33,   weight: 2260 },
    { cg: 39.5, weight: 2950 },
    { cg: 48.5, weight: 2950 },
    { cg: 48.5,   weight: 1800 }   // 自动闭合
  ],

  // ⭐ C182P Utility Category (若无则留空)
  envelopeUtility: []
};

export default C182P;