import Decoder from "@/components/tools-native/Decoder";
import EndorsementGenerator from "@/components/tools-native/EndorsementGenerator";
import FlightInformationDisplay from "@/components/tools-native/FlightInformationDisplay";
import FlightBrief from "@/components/tools-native/FlightBrief";
import NightTimeCalculator from "@/components/tools-native/NightTimeCalculator";
import WeightBalanceCalculator from "@/components/tools-native/WeightBalanceCalculator";

export const nativeToolRegistry = {
  decoder: Decoder,
  "endorsement-generator": EndorsementGenerator,
  fids: FlightInformationDisplay,
  "flight-brief": FlightBrief,
  nighttime: NightTimeCalculator,
  wb: WeightBalanceCalculator,
};

export function getNativeToolComponent(slug: string) {
  return nativeToolRegistry[slug as keyof typeof nativeToolRegistry] ?? null;
}
