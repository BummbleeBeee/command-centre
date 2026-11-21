import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ButtonIcon, Glyph, ICON_NAMES } from "../components/Icon";
import { api, isDesktop } from "../lib/api";
import type { IconRef } from "../types";

export const SWATCHES = ["#7aa8ff", "#4ea0ff", "#8ad0ff", "#6fd3a5", "#b6e37a", "#f5c26b", "#ff9a6b", "#ff7b7b", "#ff8fb1", "#c79bff", "#a9b4c8", "#e9edf5"];

export function IconPicker({ icon, color, onIcon, onColor, appPath, onError }: {
  icon: IconRef; color: string; onIcon: (i: IconRef) => void; onColor: (c: string) => void; appPath?: string; onError: (m: string) => void;
}) {
  const [tab, setTab] = useState<"builtin" | "custom">(icon.type === "builtin" ? "builtin" : "custom");
  const [busy, setBusy] = useState(false);

  const fromFile = async () => {
    const path = await open({ multiple: false, title: "Choose an icon", filters: [{ name: "Images", extensions: ["png", "svg", "ico", "jpg", "jpeg", "webp", "gif"] }] });
    if (typeof path !== "string") return;
    try { onIcon({ type: "image", data: await api.readIconFile(path) }); } catch (e) { onError((e as Error).message); }
  };
  const fromApp = async () => {
    if (!appPath) return;
    setBusy(true);
    try { onIcon({ type: "image", data: await api.extractIcon(appPath) }); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="icon-picker">
      <div className="icon-preview" style={{ "--tile-color": color } as React.CSSProperties}><span className="tile-icon"><ButtonIcon icon={icon} size={30} /></span></div>
      <div className="icon-picker-main">
        <div className="seg">
          <button className={tab === "builtin" ? "active" : ""} onClick={() => setTab("builtin")}>Built-in</button>
          <button className={tab === "custom" ? "active" : ""} onClick={() => setTab("custom")}>Custom</button>
        </div>
        {tab === "builtin" ? (
          <div className="icon-grid">
            {ICON_NAMES.map((n) => (
              <button key={n} className={icon.type === "builtin" && icon.name === n ? "active" : ""} onClick={() => onIcon({ type: "builtin", name: n })} title={n}><Glyph name={n} size={17} /></button>
            ))}
          </div>
        ) : (
          <div className="custom-icon">
            <button className="btn" disabled={!isDesktop()} onClick={() => void fromFile()}><Glyph name="upload" size={14} /> PNG / SVG / ICO file…</button>
            <button className="btn" disabled={!appPath || busy} onClick={() => void fromApp()} title={appPath ? `Extract from ${appPath}` : "Add a Launch step with a file path first"}>
              <Glyph name="rocket" size={14} /> {busy ? "Extracting…" : "Use the app's own icon"}
            </button>
            <label className="field inline">Emoji / text
              <input maxLength={3} value={icon.type === "text" ? icon.value : ""} placeholder="🎬" onChange={(e) => onIcon(e.target.value ? { type: "text", value: e.target.value } : { type: "builtin", name: "zap" })} />
            </label>
          </div>
        )}
        <div className="swatches">
          {SWATCHES.map((c) => <button key={c} className={c === color ? "active" : ""} style={{ background: c }} onClick={() => onColor(c)} aria-label={`Colour ${c}`} />)}
          <label className="swatch-custom" title="Custom colour"><input type="color" value={color} onChange={(e) => onColor(e.target.value)} /><Glyph name="palette" size={14} /></label>
        </div>
      </div>
    </div>
  );
}
