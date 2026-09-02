"use client";

const PILOT_LEVELS = ["Student", "Private", "Commercial", "ATP"] as const;

const PRIVILEGE_RATINGS = [
  "ASEL",
  "AMEL",
  "ASES",
  "AMES",
  "Rotorcraft-Helicopter",
  "Rotorcraft-Gyroplane",
  "Glider",
  "Balloon",
  "Powered Lift",
] as const;

export function availableLowerPrivilegeLevels(level: string) {
  const levelIndex = PILOT_LEVELS.indexOf(level as (typeof PILOT_LEVELS)[number]);
  if (levelIndex <= 1) return [];
  return PILOT_LEVELS.slice(1, levelIndex);
}

export function normalizeLowerPrivileges(values: string[], level: string) {
  const allowedLevels = new Set(availableLowerPrivilegeLevels(level));
  return values.filter((value) => {
    const [privilegeLevel, rating] = value.split(" — ");
    return allowedLevels.has(privilegeLevel as "Private" | "Commercial")
      && PRIVILEGE_RATINGS.includes(rating as (typeof PRIVILEGE_RATINGS)[number]);
  });
}

export default function PilotPrivilegePicker({
  level,
  value,
  onChange,
}: {
  level: string;
  value: string[];
  onChange: (privileges: string[]) => void;
}) {
  const lowerLevels = availableLowerPrivilegeLevels(level);

  if (!level) {
    return <p className="pilot-privilege-help">Select the primary certificate level first.</p>;
  }

  if (lowerLevels.length === 0) {
    return <p className="pilot-privilege-help">This level has no lower certificate privileges to add.</p>;
  }

  function togglePrivilege(privilege: string) {
    onChange(value.includes(privilege)
      ? value.filter((item) => item !== privilege)
      : [...value, privilege]);
  }

  return (
    <div className="pilot-privilege-grid">
      {lowerLevels.map((privilegeLevel) => (
        <div className="pilot-privilege-row" key={privilegeLevel}>
          <span className="pilot-privilege-level">{privilegeLevel}</span>
          <div className="rating-picker" role="group" aria-label={`${privilegeLevel} pilot privileges`}>
            {PRIVILEGE_RATINGS.map((rating) => {
              const privilege = `${privilegeLevel} — ${rating}`;
              const selected = value.includes(privilege);
              return (
                <button
                  key={privilege}
                  type="button"
                  className={`rating-picker-option ${selected ? "rating-picker-option-active" : ""}`}
                  aria-pressed={selected}
                  onClick={() => togglePrivilege(privilege)}
                >
                  {rating}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <small className="pilot-privilege-help">
        Example: for ATP Rotorcraft-Helicopter with Private ASEL privileges, select ATP above,
        Rotorcraft-Helicopter under Ratings, and ASEL in the Private row here.
      </small>
    </div>
  );
}
