import { Glyph } from "../components/Icon";
import { WIDGET_INFO } from "../components/WidgetStrip";
import { WIDGET_IDS } from "../lib/schema";
import type { WidgetId } from "../types";
import { Toggle, useSettings } from "./SettingsView";

/** Choose which widgets show in the panel dock and the notch, and their order. */
export function WidgetsTab() {
  const { s, set } = useSettings();
  const on = s.widgets;
  const off = WIDGET_IDS.filter((w) => !on.includes(w));
  const move = (i: number, dir: -1 | 1) => { const l = [...on]; const j = i + dir; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; set("widgets", l); };
  const row = (id: WidgetId, i: number | null) => (
    <div key={id} className={`row widget-row ${i === null ? "off" : ""}`}>
      <Glyph name={WIDGET_INFO[id].icon} size={16} />
      <div className="grow"><strong>{WIDGET_INFO[id].label}</strong> <small className="dim">· {WIDGET_INFO[id].detail}</small></div>
      {i !== null && <>
        <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move left"><Glyph name="chevron-left" size={13} /></button>
        <button className="icon-btn" disabled={i === on.length - 1} onClick={() => move(i, 1)} title="Move right"><Glyph name="chevron-right" size={13} /></button>
      </>}
      <label className="switch compact"><input type="checkbox" checked={i !== null} onChange={(e) => set("widgets", e.target.checked ? [...on, id] : on.filter((x) => x !== id))} /><i /></label>
    </div>
  );
  return (
    <div className="tab-body">
      <h2>Widgets</h2>
      <p className="dim">Shown along the bottom of the floating panel and inside the notch, left to right. Tip: right-click the widget bar to come here.</p>
      <Toggle label="Show widgets" checked={s.showWidgets} onChange={(v) => set("showWidgets", v)} />
      {on.map((id, i) => row(id, i))}
      {off.length > 0 && <h2>Hidden</h2>}
      {off.map((id) => row(id, null))}
    </div>
  );
}
