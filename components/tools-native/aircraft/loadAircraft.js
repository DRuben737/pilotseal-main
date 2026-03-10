import C172M from "./templates/C172M";
import C172N from "./templates/C172n";
import C172S from "./templates/C172S";
import C152 from "./templates/C152";
import C182P from "./templates/C182P";

import N5201H from "./airplane/N5201H";
import N5355Q from "./airplane/N5355Q";
import N5520X from "./airplane/N5520X";
import N6758H from "./airplane/N6758H";
import N5094L from "./airplane/N5094L";
import N1891G from "./airplane/N1891G";

import { computeWeightAndBalance } from "../lib/weightBalance";




const templates = {
  C172M,
  C172S,
  C152,
  C172N,
  C182P
};

const airplanes = {
  N5355Q,
  N5094L,
  N5201H,
  N6758H,
  N5520X,
  N1891G
};

export function listAirplanes() {
  return Object.keys(airplanes);
}

// ⭐ 新增函数：根据呼号返回飞机信息（含 type）
export function getAirplaneInfo(tailNumber) {
  return airplanes[tailNumber];
}

export function loadAircraft(tailNumber) {
  const airplane = airplanes[tailNumber];
  if (!airplane) throw new Error(`Airplane ${tailNumber} not found.`);

  const template = templates[airplane.type];

  return {
    ...template,
    empty: {
      weight: airplane.emptyWeight,
      arm: airplane.emptyArm,
    }
  };
}
export function computeZeroFuel(aircraft, userInput) {
  const zeroFuelInput = { ...userInput };

  // 找到所有 fuel 类型的 station，并把 fuel 清零
  aircraft.stations.forEach(station => {
    if (station.weightPerGallon) {
      zeroFuelInput[station.id] = 0;
    }
  });

  // 返回不含燃油的 W&B 结果
  return computeWeightAndBalance(aircraft, zeroFuelInput);
}

export default loadAircraft;