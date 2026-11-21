import { useApp } from "../app/context";
import { Glyph } from "../components/Icon";
import { awakeLabel, useAwake } from "./AwakePanel";

/** Small indicator shown in the title bars while keep-awake is on. */
export function AwakeChip() {
  const app = useApp();
  const { status } = useAwake(15000);
  if (!status?.active) return null;
  return (
    <button className="awake-chip" onClick={() => app.openPanel("awake")} title={`Keep awake: ${awakeLabel(status)}`} onMouseDown={(e) => e.stopPropagation()}>
      <Glyph name="coffee" size={13} />
      <span>{status.untilMs ? awakeLabel(status).replace(" left", "") : "∞"}</span>
    </button>
  );
}
