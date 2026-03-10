const airplane = {
  id: "N5201H",
  type: "C172M",

  emptyWeight: 1385.5,
  emptyArm: 39.1,

  // 可选：你提供的 “Total Empty Fuel” 行
  // 这是空重 + 满油的数值，但不用于空重，只记录方便未来使用
  notes: {
    totalEmptyFuelWeight: 1385.5,
    totalEmptyFuelArm: 39.1,
    totalEmptyFuelMoment: 54084
  }
};

export default airplane;