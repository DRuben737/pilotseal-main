import { EngineArt } from "./art";
import PistonEngineLive from "./PistonEngineLive";

export default function PistonEngineDemo() {
  const art = (
    <g key="o360-engine-art">
      <EngineArt />
    </g>
  );
  return <PistonEngineLive art={art} />;
}
