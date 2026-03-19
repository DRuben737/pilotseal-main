"use client";

import {
  createContext,
  useContext,
  useEffect,
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

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

type ToolState = {
  brief: ToolSlice;
  wb: ToolSlice;
  decoder: ToolSlice;
  setBrief: Setter<ToolSlice>;
  setWb: Setter<ToolSlice>;
  setDecoder: Setter<ToolSlice>;
};

const DEFAULT_BRIEF = {
  studentName: "",
  instructorName: "",
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
  withinLimitsConfirmed: false,
  mxNow: "",
  mxDue: "",
  staticChecked: {
    "static-dual-flight": false,
    "static-training-pre-solo": false,
    "static-solo-student": false,
    "static-dpe-check": false,
    "static-first-fly-fi": false,
    "static-different-model": false,
    "static-last-flight-30": false,
    "static-acft-time-40": false,
    "static-fi-dual-200": false,
  },
  dynamicChecked: {
    "dynamic-night-ops": false,
    "dynamic-last-night-30": false,
    "dynamic-svfr": false,
    "dynamic-gust-spread": false,
    "dynamic-other-fi-cancel": false,
    "dynamic-max-fuel-flight": false,
    "full-down-auto": false,
    "dynamic-stall-training": false,
    "dynamic-spin-training": false,
  },
  imsafe: 0,
  otherRisks: 0,
  riskComments: "",
  currentStep: 0,
};

const DEFAULT_WB = {
  selectedTail: "",
  inputs: {
    left_seat: "",
    right_seat: "",
    rear_seat: "",
    baggage_1: "",
    baggage_2: "",
    fuel: "",
  },
  result: null,
};

const DEFAULT_DECODER = {
  input: "",
  activeCategory: "All",
};

const ToolStateContext = createContext<ToolState | null>(null);

function loadSlice<T extends ToolSlice>(key: string, fallback: T) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as T;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...fallback, ...parsed };
    }

    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function ToolProvider({ children }: { children: ReactNode }) {
  const [brief, setBrief] = useState<ToolSlice>(() =>
    loadSlice("tool_brief", DEFAULT_BRIEF)
  );
  const [wb, setWb] = useState<ToolSlice>(() => loadSlice("tool_wb", DEFAULT_WB));
  const [decoder, setDecoder] = useState<ToolSlice>(() =>
    loadSlice("tool_decoder", DEFAULT_DECODER)
  );

  useEffect(() => {
    window.localStorage.setItem("tool_brief", JSON.stringify(brief));
  }, [brief]);

  useEffect(() => {
    window.localStorage.setItem("tool_wb", JSON.stringify(wb));
  }, [wb]);

  useEffect(() => {
    window.localStorage.setItem("tool_decoder", JSON.stringify(decoder));
  }, [decoder]);

  const value = useMemo(
    () => ({
      brief,
      wb,
      decoder,
      setBrief,
      setWb,
      setDecoder,
    }),
    [brief, wb, decoder]
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
