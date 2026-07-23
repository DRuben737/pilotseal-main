"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToolValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | Record<string, string>
  | Record<string, boolean>
  | Record<string, unknown>;

type ToolSlice = Record<string, ToolValue>;
type SelectedAircraft = Record<string, unknown> | null;

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

type ToolState = {
  brief: ToolSlice;
  wb: ToolSlice;
  briefWb: ToolSlice;
  decoder: ToolSlice;
  selectedAircraft: SelectedAircraft;
  briefSelectedAircraft: SelectedAircraft;
  setBrief: Setter<ToolSlice>;
  setWb: Setter<ToolSlice>;
  setBriefWb: Setter<ToolSlice>;
  setDecoder: Setter<ToolSlice>;
  setSelectedAircraft: Setter<SelectedAircraft>;
  setBriefSelectedAircraft: Setter<SelectedAircraft>;
};

const DEFAULT_BRIEF = {
  studentName: "",
  instructorName: "",
  selectedStudentId: "",
  selectedInstructorId: "",
  flightRules: "VFR",
  flightDate: "",
  etd: "",
  eta: "",
  aircraftId: "",
  fuel: "",
  fuelTime: "",
  routeMode: "local",
  departure: "",
  arrival: "",
  stops: [""],
  lessonPractice: "",
  weatherLoading: false,
  weatherError: "",
  metarByIcaoData: {},
  tafByIcao: {},
  airsigmetSummary: "",
  fieldElevation: "",
  outsideTemp: "",
  daResult: "",
  weatherNotes: "",
  notamLoading: false,
  notamError: "",
  notamByIcao: {},
  notamAirportOpen: {},
  notamCategoryOpen: {},
  grossWeight: "",
  wbCg: "",
  withinLimitsConfirmed: false,
  mxNow: "",
  mxDue: "",
  meterType: "hobbs",
  meterObservedAt: "",
  plannedMeterIncrease: "",
  flightBriefDraftId: "",
  finalizedFlightBriefId: "",
  staticChecked: {
    "static-student-under-50-type": false,
    "static-training-pre-solo": false,
    "static-cfi-under-100-instruction": false,
    "static-last-dual-30": false,
    "static-last-night-30": false,
    "static-solo-flight": false,
    "static-last-solo-30": false,
    "static-prior-mx": false,
    "static-inspection-under-20": false,
    "static-secondary-aircraft-type": false,
    "static-first-different-cfi": false,
    "static-stage-check": false,
  },
  dynamicChecked: {
    "dynamic-dusk-ops": false,
    "dynamic-svfr-dual": false,
    "dynamic-visibility-within-1sm": false,
    "dynamic-clouds-within-200": false,
    "dynamic-wind-gust-personal-min": false,
    "dynamic-high-da-gw": false,
    "dynamic-frontal-passage": false,
    "dynamic-deteriorating-wx": false,
    "dynamic-class-bc-solo": false,
    "dynamic-night-flight": false,
    "dynamic-fuel-90": false,
    "dynamic-other-cfis-cancel-wx": false,
    "dynamic-full-down-auto-heli": false,
    "dynamic-stalls-airplane": false,
    "dynamic-spins-airplane": false,
    "dynamic-single-engine-out-me": false,
  },
  imsafe: 0,
  cfiStress: 0,
  otherRiskLabel: "",
  otherRisks: 0,
  riskComments: "",
  currentStep: 0,
};

const DEFAULT_WB = {
  selectedTail: "",
  selectedPersonId: "",
  inputs: {
    pilot_weight: "",
    passenger_weight: "",
    bag_weight: "",
    fuel_gallons: "",
  },
  result: null,
  status: "",
};

const DEFAULT_DECODER = {
  input: "",
  mode: "auto",
  activeCategory: "All",
};

const ToolStateContext = createContext<ToolState | null>(null);

export function ToolProvider({ children }: { children: ReactNode }) {
  const [brief, setBrief] = useState<ToolSlice>(DEFAULT_BRIEF);
  const [wb, setWb] = useState<ToolSlice>(DEFAULT_WB);
  const [briefWb, setBriefWb] = useState<ToolSlice>(DEFAULT_WB);
  const [decoder, setDecoder] = useState<ToolSlice>(DEFAULT_DECODER);
  const [selectedAircraft, setSelectedAircraft] = useState<SelectedAircraft>(null);
  const [briefSelectedAircraft, setBriefSelectedAircraft] = useState<SelectedAircraft>(null);

  const value = useMemo(
    () => ({
      brief,
      wb,
      briefWb,
      decoder,
      selectedAircraft,
      briefSelectedAircraft,
      setBrief,
      setWb,
      setBriefWb,
      setDecoder,
      setSelectedAircraft,
      setBriefSelectedAircraft,
    }),
    [brief, wb, briefWb, decoder, selectedAircraft, briefSelectedAircraft]
  );

  return <ToolStateContext.Provider value={value}>{children}</ToolStateContext.Provider>;
}

export function useToolState() {
  const context = useContext(ToolStateContext);

  if (!context) {
    throw new Error("useToolState must be used within a ToolProvider.");
  }

  return context;
}
