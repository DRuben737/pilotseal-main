type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

export default function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: SliderProps) {
  return (
    <label className="ui-slider">
      <div className="ui-slider-head">
        <span className="ui-slider-label">{label}</span>
        <span className="ui-slider-value">{value.toFixed(1)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
