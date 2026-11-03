import {
  AIRCRAFT_PERFORMANCE_SPEED_KEYS,
  type AircraftPerformanceSpeedKey,
  type AircraftPerformanceSpeedUnit,
} from "@/lib/aircraft";

export type AircraftPerformanceSpeedDraft = Record<AircraftPerformanceSpeedKey, string>;

export const emptyAircraftPerformanceSpeedDraft = (): AircraftPerformanceSpeedDraft =>
  Object.fromEntries(AIRCRAFT_PERFORMANCE_SPEED_KEYS.map((key) => [key, ""])) as AircraftPerformanceSpeedDraft;

const speedNames: Record<AircraftPerformanceSpeedKey, string> = {
  Vx: "Best angle climb",
  Vy: "Best rate climb",
  Vr: "Rotation",
  Vg: "Best glide",
  Va: "Maneuvering",
  Vs0: "Stall, landing config",
  Vs1: "Stall, clean config",
  Vfe: "Max flap extended",
  Vno: "Max structural cruise",
  Vne: "Never exceed",
  Vmc: "Minimum control",
  Vyse: "Best single-engine climb",
};

export default function AircraftPerformanceSpeedsEditor({
  unit,
  values,
  onUnitChange,
  onValueChange,
  inputClassName,
  invalidKeys = [],
}: {
  unit: AircraftPerformanceSpeedUnit;
  values: AircraftPerformanceSpeedDraft;
  onUnitChange: (unit: AircraftPerformanceSpeedUnit) => void;
  onValueChange: (key: AircraftPerformanceSpeedKey, value: string) => void;
  inputClassName: string | ((key: AircraftPerformanceSpeedKey) => string);
  invalidKeys?: AircraftPerformanceSpeedKey[];
}) {
  return (
    <section className="border border-slate-300 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-slate-800 px-2 py-1 text-white">
        <h3 className="text-[11px] font-bold uppercase tracking-wide">Reference speeds</h3>
        <label className="flex items-center gap-2 text-[11px] font-semibold">
          Unit
          <select
            aria-label="Reference speed unit"
            className="h-7 rounded border border-white/30 bg-slate-700 px-2 text-xs text-white"
            value={unit}
            onChange={(event) => onUnitChange(event.target.value as AircraftPerformanceSpeedUnit)}
          >
            <option value="KIAS">KIAS</option>
            <option value="MPH">MPH</option>
          </select>
        </label>
      </div>
      <div className="max-w-full overflow-x-auto">
        <table aria-label="Aircraft reference speeds" className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-600">
              {AIRCRAFT_PERFORMANCE_SPEED_KEYS.map((key) => (
                <th key={key} className="border-b border-r border-slate-300 px-2 py-1.5 font-semibold last:border-r-0">
                  <span className="block text-slate-900">{key}</span>
                  <span className="block whitespace-nowrap text-[10px] font-normal">{speedNames[key]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {AIRCRAFT_PERFORMANCE_SPEED_KEYS.map((key) => (
                <td key={key} className="border-r border-slate-300 p-0 last:border-r-0">
                  <input
                    aria-label={`${key} ${speedNames[key]} in ${unit}`}
                    aria-invalid={invalidKeys.includes(key)}
                    className={typeof inputClassName === "function" ? inputClassName(key) : inputClassName}
                    inputMode="decimal"
                    min="0"
                    step="any"
                    type="number"
                    value={values[key]}
                    onChange={(event) => onValueChange(key, event.target.value)}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
