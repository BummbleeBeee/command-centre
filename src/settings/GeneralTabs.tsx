import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Glyph } from "../components/Icon";
import { isDesktop } from "../lib/api";
import { confirmDialog } from "../lib/executor";
import { applyRealIcons } from "../lib/realIcons";
import { GRADIENTS, presetPatch, THEME_PRESETS } from "../lib/theme";
import type { BackgroundEffect, GlassStyle } from "../types";

const GLASS: { v: GlassStyle; l: string; d: string }[] = [
  { v: "frosted", l: "Frosted", d: "Soft see-through glass" },
  { v: "clear", l: "Clear", d: "Very transparent with bright edges" },
  { v: "tinted", l: "Tinted", d: "Glass tinted with your accent colour" },
  { v: "solid", l: "Solid", d: "No transparency" },
  { v: "neon", l: "Neon", d: "Dark glass with a glowing accent edge" },
];
const EFFECTS: { v: BackgroundEffect; l: string }[] = [
  { v: "none", l: "None" }, { v: "rain", l: "Rain" }, { v: "snow", l: "Snow" }, { v: "stars", l: "Stars" }, { v: "aurora", l: "Aurora" },
  { v: "bubbles", l: "Bubbles" }, { v: "fireflies", l: "Fireflies" }, { v: "matrix", l: "Matrix" }, { v: "waves", l: "Waves" },
];
import { MODES } from "../modes/shared";
import { SWATCHES } from "../editor/IconPicker";
import type { AnimationLevel, ThemeName } from "../types";
import { Range, Toggle, useSettings } from "./SettingsView";

export function GeneralTab() {
  const { app, s, set } = useSettings();
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [autostartError, setAutostartError] = useState<string | null>(null);
  useEffect(() => { if (isDesktop()) isEnabled().then(setAutostart).catch((e) => setAutostartError(String(e))); }, []);

  const toggleAutostart = async (on: boolean) => {
    try {
      if (on) {
        if (!(await confirmDialog("Start Command Centre automatically when you sign in to Windows? You can turn this off any time here or in Windows Settings → Apps → Startup.", "Launch at startup", "Enable"))) return;
        await enable();
      } else {
        await disable();
      }
      setAutostart(await isEnabled());
      setAutostartError(null);
    } catch (e) { setAutostartError(String(e)); }
  };

  return (
    <div className="tab-body">
      <h2>Display mode</h2>
      <p className="dim">Applies to the “{app.profile.name}” profile{app.monitors.length > 1 ? " on this monitor" : ""}. Your buttons, pages and sequences stay the same in every mode. Use Settings → Monitors to give each monitor its own profile.</p>
      <div className="mode-cards">
        {MODES.map((m) => (
          <button key={m.value} className={`mode-card ${app.profile.displayMode === m.value ? "active" : ""}`}
            onClick={() => { app.updateProfile((p) => ({ ...p, displayMode: m.value })); if (m.value !== "floating") app.setOverlay(null); }}>
            <div className={`mode-art art-${m.value}`}><i /><i /><i /><i /></div>
            <strong>{m.label}</strong><small>{m.detail}</small>
          </button>
        ))}
      </div>
      <div className="row second-mode">
        <span className="grow"><strong>Also show on this monitor</strong><br /><small className="dim">Run two at once, e.g. the notch and the sidebar</small></span>
        <div className="seg">
          <button className={!app.ds?.secondMode || app.ds.secondMode === app.profile.displayMode ? "active" : ""} onClick={() => app.updateDisplay((d) => ({ ...d, secondMode: undefined }))}>Nothing</button>
          {MODES.filter((m) => m.value !== app.profile.displayMode).map((m) => (
            <button key={m.value} className={app.ds?.secondMode === m.value ? "active" : ""} onClick={() => app.updateDisplay((d) => ({ ...d, secondMode: m.value }))}>{m.label}</button>
          ))}
        </div>
      </div>

      <PanelSize />
      <h2>Behaviour</h2>
      <Toggle label="Floating panel always on top" detail="Sidebar, notch and tiny button are always on top" checked={s.alwaysOnTop} onChange={(v) => set("alwaysOnTop", v)} />
      <Toggle label="Hide panel after launching" detail="Floating panel hides to the tray after an action succeeds" checked={s.hideAfterLaunch} onChange={(v) => set("hideAfterLaunch", v)} />
      <Toggle label="Expand sidebar on hover" checked={s.sidebarExpandOnHover} onChange={(v) => set("sidebarExpandOnHover", v)} />
      <Toggle label="Expand notch on hover" detail="Otherwise click the notch to open it" checked={s.notchExpandOnHover} onChange={(v) => set("notchExpandOnHover", v)} />
      <Toggle label="Confirm Lock and Sleep" detail="Ask before running risky system controls" checked={s.confirmSystemActions} onChange={(v) => set("confirmSystemActions", v)} />
      <Toggle label="Show “Done” messages" detail="Pop-ups after an action succeeds. Errors are always shown." checked={s.showSuccessToasts} onChange={(v) => set("showSuccessToasts", v)} />
      <h2>Notch</h2>
      <div className="row">
        <span>Collapsed look</span>
        <div className="seg">
          <button className={s.notchStyle === "pill" ? "active" : ""} onClick={() => set("notchStyle", "pill")}>Pill with dot clock</button>
          <button className={s.notchStyle === "line" ? "active" : ""} onClick={() => set("notchStyle", "line")}>Just a line</button>
        </div>
      </div>
      <h2>Sidebar</h2>
      <div className="row">
        <span>Side on this monitor</span>
        <div className="seg">
          <button className={app.sidebarSide === "left" ? "active" : ""} onClick={() => app.updateDisplay((d) => ({ ...d, sidebarSide: "left" }))}>Left</button>
          <button className={app.sidebarSide === "right" ? "active" : ""} onClick={() => app.updateDisplay((d) => ({ ...d, sidebarSide: "right" }))}>Right</button>
        </div>
        <small className="dim">Other monitors: Settings → Monitors</small>
      </div>
      <Toggle label="Collapse into an edge dock" detail="When you're not using it, the sidebar shrinks to a thin strip at the screen edge. Hover it to open." checked={s.sidebarAutoHide} onChange={(v) => set("sidebarAutoHide", v)} />
      <Toggle label="Pin the sidebar" detail="Reserves its strip of the screen like the taskbar, so windows and maximised apps sit beside it instead of underneath" checked={s.sidebarPinned} onChange={(v) => set("sidebarPinned", v)} />
      <Toggle label="Launch at Windows startup" detail={autostartError ?? (autostart === null ? "Checking…" : "Registers Command Centre in your user startup list")} checked={!!autostart} disabled={autostart === null} onChange={(v) => void toggleAutostart(v)} />
    </div>
  );
}

export function AppearanceTab() {
  const { app, s, set } = useSettings();
  const useRealIcons = async (all: boolean) => {
    if (all && !(await confirmDialog("Replace every button icon (including ones you picked) with the app's real icon where one exists?", "Real app icons", "Replace"))) return;
    const copy = structuredClone(app.config);
    const n = await applyRealIcons(copy, !all);
    app.update((c) => ({ ...c, pages: copy.pages }));
    app.toast({ kind: n ? "success" : "info", title: n ? `Updated ${n} icon(s)` : "No app icons to update", detail: n ? undefined : "Buttons that run sequences, pages or volume keep their symbols." });
  };
  return (
    <div className="tab-body">
      <h2>Colour themes</h2>
      <div className="preset-grid">
        {THEME_PRESETS.map((p) => (
          <button key={p.id} className={`preset ${s.themePreset === p.id && s.theme === "custom" ? "active" : ""}`}
            onClick={() => app.update((c) => ({ ...c, settings: { ...c.settings, ...presetPatch(p) } }))}
            style={{ background: `${p.backdrop && GRADIENTS[p.backdrop] ? GRADIENTS[p.backdrop] + ", " : ""}${p.bg}`, color: p.text }}>
            <span className="preset-dots"><i style={{ background: p.accent }} /><i style={{ background: p.surface }} /><i style={{ background: p.text }} /></span>
            <strong>{p.name}</strong>
          </button>
        ))}
      </div>
      <h2>Glass style</h2>
      <div className="seg">
        {GLASS.map((g) => <button key={g.v} className={s.glass === g.v ? "active" : ""} title={g.d} onClick={() => set("glass", g.v)}>{g.l}</button>)}
      </div>
      <h2>Animated background</h2>
      <div className="fx-grid">
        {EFFECTS.map((e) => (
          <button key={e.v} className={`fx-card ${s.effect === e.v ? "active" : ""}`} onClick={() => set("effect", e.v)}>
            <span className={`fx-thumb fx-${e.v}`} /><strong>{e.l}</strong>
          </button>
        ))}
      </div>
      {s.effect !== "none" && <Range label="Effect strength" value={s.effectIntensity} min={10} max={100} unit="%" onChange={(v) => set("effectIntensity", v)} />}
      {s.effect !== "none" && s.animations === "off" && <p className="warn small">Animations are off below, so the effect is paused.</p>}
      <h2>Panel tint</h2>
      <div className="row wrap bg-row">
        <button className={`bg-chip ${!s.backdrop ? "active" : ""}`} onClick={() => set("backdrop", "")}>None</button>
        {Object.entries(GRADIENTS).map(([k, g]) => <button key={k} className={`bg-chip ${s.backdrop === k ? "active" : ""}`} style={{ backgroundImage: g }} onClick={() => set("backdrop", k)}>{k}</button>)}
      </div>
      <h2>Base theme</h2>
      <div className="seg">
        {(["dark", "light", "custom"] as ThemeName[]).map((t) => <button key={t} className={s.theme === t ? "active" : ""} onClick={() => app.update((c) => ({ ...c, settings: { ...c.settings, theme: t, themePreset: "" } }))}>{t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>
      {s.theme === "custom" && (
        <div className="row color-row">
          {(["background", "surface", "text"] as const).map((k) => (
            <label key={k} className="color-field"><input type="color" value={s.customTheme[k]} onChange={(e) => set("customTheme", { ...s.customTheme, [k]: e.target.value })} />{k}</label>
          ))}
        </div>
      )}
      <h2>Accent colour</h2>
      <div className="swatches big">
        {SWATCHES.map((c) => <button key={c} className={c === s.accent ? "active" : ""} style={{ background: c }} onClick={() => set("accent", c)} aria-label={c} />)}
        <label className="swatch-custom"><input type="color" value={s.accent} onChange={(e) => set("accent", e.target.value)} /><Glyph name="palette" size={14} /></label>
      </div>
      <h2>Surface</h2>
      <Range label="Opacity" value={s.opacity} min={35} max={100} unit="%" onChange={(v) => set("opacity", v)} />
      <Range label="Corner radius" value={s.radius} min={0} max={32} unit="px" onChange={(v) => set("radius", v)} />
      <Toggle label="Windows acrylic blur" detail="Native blur behind the floating panel and sidebar (looks best with square-ish corners)" checked={s.nativeBlur} onChange={(v) => set("nativeBlur", v)} />
      <h2>Buttons</h2>
      <Range label="Button size" value={s.buttonSize} min={56} max={140} unit="px" onChange={(v) => set("buttonSize", v)} />
      <Range label="Grid spacing" value={s.gridGap} min={2} max={32} unit="px" onChange={(v) => set("gridGap", v)} />
      <Toggle label="Show button labels" checked={s.showLabels} onChange={(v) => set("showLabels", v)} />
      <div className="row wrap">
        <button className="btn" disabled={!isDesktop()} onClick={() => void useRealIcons(false)}><Glyph name="image" size={14} /> Use real app icons</button>
        <button className="btn" disabled={!isDesktop()} onClick={() => void useRealIcons(true)}>Replace all icons with real app icons…</button>
      </div>
      <p className="dim small">Fetches each app's own icon from Windows (Explorer, your browser, VS Code, Store apps, folders…). The first button keeps any icons you chose yourself.</p>
      <Toggle label="Show widgets" detail="Media, system stats, volume and clock" checked={s.showWidgets} onChange={(v) => set("showWidgets", v)} />
      <h2>Animations</h2>
      <div className="seg">
        {(["full", "reduced", "off"] as AnimationLevel[]).map((a) => <button key={a} className={s.animations === a ? "active" : ""} onClick={() => set("animations", a)}>{a[0].toUpperCase() + a.slice(1)}</button>)}
      </div>
      <h2>Motion</h2>
      <Range label={`Animation speed: ${s.animSpeed <= 0.75 ? "fast" : s.animSpeed >= 1.4 ? "slow & smooth" : "normal"}`} value={s.animSpeed} min={0.4} max={2.5} step={0.1} unit="×" onChange={(v) => set("animSpeed", Math.round(v * 10) / 10)} />
      <div className="row wrap">
        <span>Easing</span>
        <div className="seg">
          {(["smooth", "snappy", "bouncy", "linear"] as const).map((e) => <button key={e} className={s.easing === e ? "active" : ""} onClick={() => set("easing", e)}>{e === "smooth" ? "Smooth ease-out" : e[0].toUpperCase() + e.slice(1)}</button>)}
        </div>
      </div>
      <Toggle label="Slide in" detail="The sidebar slides in from its edge, the notch drops down, menus glide in" checked={s.slideIn} onChange={(v) => set("slideIn", v)} />
      <p className="dim small">Available page backgrounds: {Object.keys(GRADIENTS).join(", ")}. Set them per page under Pages.</p>
    </div>
  );
}

/** Typed width/height for the floating panel (it can also be resized by dragging its edges). */
function PanelSize() {
  const { app } = useSettings();
  const dpr = window.devicePixelRatio || 1;
  const f = app.config.window.floating;
  const [w, setW] = useState(f ? Math.round(f.width / dpr) : 700);
  const [h, setH] = useState(f ? Math.round(f.height / dpr) : 560);
  const apply = () => {
    const width = Math.round(Math.min(1800, Math.max(360, w)) * dpr);
    const height = Math.round(Math.min(1400, Math.max(300, h)) * dpr);
    app.update((c) => ({ ...c, window: { ...c.window, floating: { x: c.window.floating?.x ?? 0, y: c.window.floating?.y ?? 0, width, height } } }));
    window.setTimeout(app.reapplyGeometry, 50);
  };
  const reset = () => {
    app.update((c) => ({ ...c, window: { ...c.window, floating: undefined, buttonPosition: undefined } }));
    setW(700); setH(560);
    window.setTimeout(app.reapplyGeometry, 50);
  };
  return (
    <>
      <h2>Floating panel size</h2>
      <div className="row wrap">
        <label className="field inline">Width <input type="number" min={360} max={1800} value={w} onChange={(e) => setW(Number(e.target.value))} style={{ width: 90 }} /></label>
        <label className="field inline">Height <input type="number" min={300} max={1400} value={h} onChange={(e) => setH(Number(e.target.value))} style={{ width: 90 }} /></label>
        <button className="btn" onClick={apply}>Apply</button>
        <button className="btn" onClick={reset} title="Centre the panel and move the tiny button back to its default corner">Reset positions</button>
      </div>
      <p className="dim small">Limits: 360×300 to 1800×1400. You can also drag the panel's edges; position and size are remembered.</p>
    </>
  );
}
