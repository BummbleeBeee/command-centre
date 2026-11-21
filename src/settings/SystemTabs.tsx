import { useEffect, useState } from "react";
import { HotkeyInput } from "../components/HotkeyInput";
import { Glyph } from "../components/Icon";
import { api, isDesktop, VolumeState } from "../lib/api";
import { SYSTEM_ACTIONS } from "../lib/schema";
import { Toggle, useSettings } from "./SettingsView";

export function ShortcutsTab() {
  const { app, s, set } = useSettings();
  const bound = app.config.pages.flatMap((p) => p.buttons.filter((b) => b.hotkey).map((b) => ({ b, p })));
  return (
    <div className="tab-body">
      <h2>Global hotkeys</h2>
      <Toggle label="Enable global hotkeys" detail="Also available from the tray menu" checked={s.hotkeysEnabled} onChange={(v) => set("hotkeysEnabled", v)} />
      <label className="field">Show / hide Command Centre
        <HotkeyInput value={s.toggleHotkey} onChange={(v) => set("toggleHotkey", v ?? "Ctrl+Alt+Space")} />
      </label>
      {app.hotkeyFailures.length > 0 && (
        <p className="warn">Could not register {app.hotkeyFailures.join(", ")}. Another app is probably using {app.hotkeyFailures.length > 1 ? "them" : "it"}. Pick a different combination.</p>
      )}
      <h2>Button hotkeys</h2>
      {bound.length === 0 && <p className="dim">No buttons have hotkeys. Edit a button to assign one.</p>}
      {bound.map(({ b, p }) => (
        <div key={b.id} className="row hotkey-row">
          <span className="grow">{b.label} <small className="dim">· {p.name}</small></span>
          {b.hotkey!.split("+").map((k) => <kbd key={k}>{k}</kbd>)}
          <button className="btn" onClick={() => app.setOverlay({ kind: "button", pageId: p.id, buttonId: b.id })}>Edit</button>
        </div>
      ))}
      <h2>In-app keys</h2>
      <ul className="keys">
        <li><kbd>Ctrl</kbd><kbd>F</kbd> or <kbd>/</kbd> search buttons (Enter runs the first match)</li>
        <li><kbd>Ctrl</kbd><kbd>1</kbd>–<kbd>9</kbd> switch page</li>
        <li><kbd>Esc</kbd> close settings, collapse notch / tiny button</li>
        <li>Right-click a button to edit, duplicate, move or delete it</li>
        <li>Drag buttons to reorder, or drop them on a page tab to move them</li>
      </ul>
    </div>
  );
}

export function SystemTab() {
  const { app } = useSettings();
  const [vol, setVol] = useState<VolumeState | null>(null);
  const [volErr, setVolErr] = useState<string | null>(null);
  const [bright, setBright] = useState<number | null>(null);
  const [brightErr, setBrightErr] = useState<string | null>(null);
  useEffect(() => {
    if (!isDesktop()) return;
    api.getVolume().then(setVol).catch((e) => setVolErr((e as Error).message));
    api.getBrightness().then(setBright).catch((e) => setBrightErr((e as Error).message));
  }, []);
  const tryAction = (a: (typeof SYSTEM_ACTIONS)[number]) => api.systemAction(a.value).catch((e) => app.toast({ kind: "error", title: a.label, detail: (e as Error).message }));
  return (
    <div className="tab-body">
      <h2>Hardware support on this PC</h2>
      <div className={`capability ${volErr ? "off" : "on"}`}>
        <Glyph name="volume-up" size={16} />
        <div className="grow"><strong>Volume</strong><small>{volErr ?? (vol ? `Default output at ${vol.level}%${vol.muted ? ", muted" : ""}` : "Checking…")}</small></div>
        {vol && <input type="range" min={0} max={100} value={vol.level} onChange={(e) => api.setVolume(Number(e.target.value)).then(setVol).catch(() => undefined)} />}
        {vol && <button className="btn" onClick={() => api.setMute().then(setVol)}>{vol.muted ? "Unmute" : "Mute"}</button>}
      </div>
      <div className={`capability ${brightErr ? "off" : "on"}`}>
        <Glyph name="sun" size={16} />
        <div className="grow"><strong>Brightness</strong><small>{brightErr ?? (bright !== null ? `Built-in display at ${bright}%` : "Checking…")}</small></div>
        {bright !== null && !brightErr && <input type="range" min={0} max={100} value={bright} onChange={(e) => { const v = Number(e.target.value); setBright(v); void api.setBrightness(v).catch((er) => setBrightErr((er as Error).message)); }} />}
      </div>
      <div className="capability on">
        <Glyph name="keyboard" size={16} />
        <div className="grow"><strong>Keyboard shortcuts &amp; media keys</strong><small>Available. Shortcuts can't be sent to apps running as administrator unless Command Centre is too.</small></div>
      </div>
      <h2>System controls</h2>
      <p className="dim">These are the only system controls buttons can trigger. Shutdown, restart and process killing are intentionally not available.</p>
      <div className="sys-grid">
        {SYSTEM_ACTIONS.filter((a) => !a.risky).map((a) => <button key={a.value} className="btn" onClick={() => void tryAction(a)}><Glyph name={a.icon} size={14} /> {a.label}</button>)}
      </div>
    </div>
  );
}

export function AboutTab() {
  const [dir, setDir] = useState<string>("");
  useEffect(() => { if (isDesktop()) api.configDirPath().then(setDir).catch(() => undefined); }, []);
  return (
    <div className="tab-body about">
      <div className="about-hero">
        <span className="brand-mark big"><Glyph name="grid" size={26} stroke={2.2} /></span>
        <div><h2>Command Centre</h2><p className="dim">Version 1.0.0 · Tauri 2 · Windows 10 &amp; 11</p></div>
      </div>
      <p>A customisable launcher with four display modes, multi-step actions and safe Windows system controls.</p>
      <h3>Where your data lives</h3>
      <p className="mono">{dir || "%APPDATA%\\com.commandcentre.app"}</p>
      <p className="dim">config.json holds everything. backups\ holds automatic daily backups and backups made before imports and restores (the newest 30 are kept).</p>
      <h3>Safety</h3>
      <ul className="dim">
        <li>Apps are never force-closed. “Close” sends a normal close request, so apps can ask you to save.</li>
        <li>Websites open only over http/https in your default browser.</li>
        <li>The interface has no direct file system or shell access. Every action goes through validated native commands.</li>
      </ul>
    </div>
  );
}
