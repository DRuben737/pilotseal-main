type StatProps = {
  label: string;
  value: string;
  accentClassName?: string;
};

export default function Stat({ label, value, accentClassName = "" }: StatProps) {
  return (
    <div className="ui-stat">
      <span className="ui-stat-label">{label}</span>
      <span className={`ui-stat-value ${accentClassName}`.trim()}>{value}</span>
    </div>
  );
}
