import Decoder from "@/components/tools-native/Decoder";
import EndorsementGenerator from "@/components/tools-native/EndorsementGenerator";
import FlightBrief from "@/components/tools-native/FlightBrief";
import NightTimeCalculator from "@/components/tools-native/NightTimeCalculator";
import WeightBalanceCalculator from "@/components/tools-native/WeightBalanceCalculator";
import AoaSimulator from "@/src/aoa-simulator/components/AoaSimulator";

export const nativeToolRegistry = {
  "aoa-simulator": AoaSimulator,
  decoder: Decoder,
  "endorsement-generator": EndorsementGenerator,
  "flight-brief": FlightBrief,
  nighttime: NightTimeCalculator,
  wb: WeightBalanceCalculator,
};

export function getNativeToolComponent(slug: string) {
  return nativeToolRegistry[slug as keyof typeof nativeToolRegistry] ?? null;
}
