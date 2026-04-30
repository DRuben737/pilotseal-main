import Decoder from "@/components/tools-native/Decoder";
import EndorsementGenerator from "@/components/tools-native/EndorsementGenerator";
import FlightBrief from "@/components/tools-native/FlightBrief";
import FlightComputer from "@/components/tools-native/FlightComputer";
import NightTimeCalculator from "@/components/tools-native/NightTimeCalculator";
import WeightBalanceCalculator from "@/components/tools-native/WeightBalanceCalculator";

export const nativeToolRegistry = {
  decoder: Decoder,
  "endorsement-generator": EndorsementGenerator,
  "flight-brief": FlightBrief,
  "flight-computer": FlightComputer,
  nighttime: NightTimeCalculator,
  wb: WeightBalanceCalculator,
};

export function getNativeToolComponent(slug: string) {
  return nativeToolRegistry[slug as keyof typeof nativeToolRegistry] ?? null;
}
