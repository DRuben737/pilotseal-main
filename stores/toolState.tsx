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

function loadPersistedValue<T>(key: string, fallback: T) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function ToolProvider({ children }: { children: ReactNode }) {
  const [brief, setBrief] = useState<ToolSlice>(DEFAULT_BRIEF);
  const [wb, setWb] = useState<ToolSlice>(DEFAULT_WB);
  const [briefWb, setBriefWb] = useState<ToolSlice>(DEFAULT_WB);
  const [decoder, setDecoder] = useState<ToolSlice>(DEFAULT_DECODER);
  const [selectedAircraft, setSelectedAircraft] = useState<SelectedAircraft>(null);
  const [briefSelectedAircraft, setBriefSelectedAircraft] = useState<SelectedAircraft>(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setBrief(loadSlice("tool_brief", DEFAULT_BRIEF));
    setWb(loadSlice("tool_wb", DEFAULT_WB));
    setBriefWb(loadSlice("tool_brief_wb", DEFAULT_WB));
    setDecoder(loadSlice("tool_decoder", DEFAULT_DECODER));
    setSelectedAircraft(loadPersistedValue("selected_aircraft", null));
    setBriefSelectedAircraft(loadPersistedValue("selected_brief_aircraft", null));
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    window.localStorage.setItem("tool_brief", JSON.stringify(brief));
  }, [brief, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    window.localStorage.setItem("tool_wb", JSON.stringify(wb));
  }, [wb, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    window.localStorage.setItem("tool_brief_wb", JSON.stringify(briefWb));
  }, [briefWb, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    window.localStorage.setItem("tool_decoder", JSON.stringify(decoder));
  }, [decoder, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    window.localStorage.setItem("selected_aircraft", JSON.stringify(selectedAircraft));
  }, [selectedAircraft, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    window.localStorage.setItem(
      "selected_brief_aircraft",
      JSON.stringify(briefSelectedAircraft)
    );
  }, [briefSelectedAircraft, hasHydrated]);

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
