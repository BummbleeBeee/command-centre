import { ReactNode, useEffect, useRef, useState } from "react";
import { useApp } from "../app/context";
import { Glyph } from "../components/Icon";
import { Knob } from "../components/TimePicker";
import { api, isDesktop, VolumeState } from "../lib/api";
import { uid } from "../lib/schema";
import type { useConfigStore } from "../lib/store";
import type { Config, SystemAction, ToolPanel } from "../types";

type Update = ReturnType<typeof useConfigStore>["update"];

/** Turns "github.com" into "https://github.com"; returns null for anything that isn't a web address. */
export function normalizeUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch { return null; }
}

/** A readable name for a link: "github.com/user" → "github". */
export function linkName(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").split(".")[0] || url; } catch { return url; }
}

function LinkIcon({ url }: { url: string }) {
  const [bad, setBad] = useState(false);
  let origin = "";
  try { origin = new URL(url).origin; } catch { /* shown as a globe */ }
  if (bad || !origin) return <Glyph name="globe" size={18} />;
  return <img src={`${origin}/favicon.ico`} alt="" onError={() => setBad(true)} />;
}

/** Websites under the hub's apps: click to open, add with a name and address, remove in edit mode. */
export function HubLinks({ config, update }: { config: Config; update: Update }) {
  const app = useApp();
  const links = config.hub.links;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const fixed = normalizeUrl(url);
  const save = () => {
    if (!fixed) return;
    update((c) => ({ ...c, hub: { ...c.hub, links: [...c.hub.links, { id: uid(), name: name.trim() || linkName(fixed), url: fixed }].slice(0, 24) } }));
    setName(""); setUrl(""); setAdding(false);
  };
  const open = (u: string) => void api.openUrl(u).catch((e: Error) => app.toast({ kind: "error", title: "Couldn't open the link", detail: e.message }));
  return (
    <div className="hub-links">
      <div className="row">
        <h4 className="grow"><Glyph name="globe" size={13} /> Links</h4>
        {links.length > 0 && <button className={`icon-btn ${editing ? "on" : ""}`} title={editing ? "Done" : "Edit links"} onClick={() => setEditing(!editing)}><Glyph name={editing ? "check" : "edit"} size={12} /></button>}
        <button className="icon-btn" title="Add a website" onClick={() => setAdding(!adding)}><Glyph name={adding ? "x" : "plus"} size={12} /></button>
      </div>
      {adding && (
        <form className="link-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Website, e.g. youtube.com" aria-label="Website address" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={fixed ? `Name (${linkName(fixed)})` : "Name (optional)"} aria-label="Link name" />
          <button className="btn primary" disabled={!fixed}>Add link</button>
        </form>
      )}
      {links.length === 0 && !adding && <button className="side-link" onClick={() => setAdding(true)}>+ Add websites you open often</button>}
      <div className="link-list">
        {links.map((l) => (
          <div key={l.id} className="link-item-wrap">
            <button className="link-item" onClick={() => (editing ? undefined : open(l.url))} title={l.url}>
              <span className="link-ico"><LinkIcon url={l.url} /></span>
              <span className="link-text"><b>{l.name}</b><small>{l.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</small></span>
            </button>
            {editing && <button className="side-unpin" aria-label={`Remove ${l.name}`} onClick={() => update((c) => ({ ...c, hub: { ...c.hub, links: c.hub.links.filter((x) => x.id !== l.id) } }))}><Glyph name="x" size={10} stroke={2.6} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Volume as a round knob: follows the system volume and sets it while you turn it. */
function VolumeKnob() {
  const [v, setV] = useState<VolumeState | null>(null);
  const dragging = useRef(0);
  const pending = useRef<number | null>(null);
  const timer = useRef<number>();
  useEffect(() => {
    if (!isDesktop()) return;
    const tick = () => { if (Date.now() > dragging.current) void api.getVolume().then(setV).catch(() => undefined); };
    tick();
    const t = window.setInterval(tick, 2500);
    return () => window.clearInterval(t);
  }, []);
  const send = (level: number) => {
    dragging.current = Date.now() + 1500;
    pending.current = level;
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      const l = pending.current;
      if (l != null) void api.setVolume(l).then((s) => { if (Date.now() > dragging.current - 1200) setV(s); }).catch(() => undefined);
    }, 60);
  };
  if (!v) return <div className="tool-knob dim small">{isDesktop() ? "Reading volume…" : "Volume needs the desktop app"}</div>;
  return (
    <div className="tool-knob">
      <Knob value={v.level} min={0} max={100} step={2} label="Volume" size={112} color={v.muted ? "var(--text-faint)" : undefined}
        onChange={(l) => { setV({ ...v, level: l }); send(l); }} onCommit={(l) => send(l)}>
        <b>{v.muted ? "Muted" : `${v.level}%`}</b><small>Volume</small>
      </Knob>
      <button className={`btn small ${v.muted ? "primary" : ""}`} onClick={() => void api.setMute(!v.muted).then(setV)}>
        <Glyph name={v.muted ? "mute" : "volume-up"} size={12} /> {v.muted ? "Unmute" : "Mute"}
      </button>
    </div>
  );
}

function BrightnessKnob() {
  const [b, setB] = useState<number | null>(null);
  const t = useRef<number>();
  useEffect(() => { if (isDesktop()) void api.getBrightness().then(setB).catch(() => setB(null)); }, []);
  if (b == null) return null; // desktop monitors usually don't allow it
  return (
    <div className="tool-knob">
      <Knob value={b} min={0} max={100} step={5} label="Brightness" size={112} color="#f5c26b"
        onChange={(l) => { setB(l); window.clearTimeout(t.current); t.current = window.setTimeout(() => void api.setBrightness(l).catch(() => undefined), 120); }}>
        <b>{b}%</b><small>Brightness</small>
      </Knob>
    </div>
  );
}

const QUICK: { label: string; icon: string; panel?: ToolPanel; action?: SystemAction }[] = [
  { label: "Notes", icon: "note", panel: "notes" },
  { label: "Alarms", icon: "alarm", panel: "alarms" },
  { label: "Classes", icon: "briefcase", panel: "classes" },
  { label: "Spotify", icon: "music", panel: "spotify" },
  { label: "AI chat", icon: "sparkles", panel: "ai" },
  { label: "Screenshot", icon: "scissors", action: "snip" },
  { label: "Show desktop", icon: "monitor", action: "show_desktop" },
  { label: "Task Manager", icon: "activity", action: "task_manager" },
  { label: "Lock", icon: "lock", action: "lock" },
];

/** The hub's Tools section: volume knob, keep awake, quick tools and hub options. */
export function HubTools({ config, update, openPanel, awake }: { config: Config; update: Update; openPanel: (p: ToolPanel) => void; awake: ReactNode }) {
  const app = useApp();
  const hub = config.hub;
  const set = (p: Partial<typeof hub>) => update((c) => ({ ...c, hub: { ...c.hub, ...p } }));
  return (
    <div className="hub-tools">
      <div className="tool-knobs"><VolumeKnob /><BrightnessKnob /></div>
      <div className="hub-tool-card">{awake}</div>
      <div className="tool-grid">
        {QUICK.map((q) => (
          <button key={q.label} className="side-app tool" onClick={() => {
            if (q.panel) openPanel(q.panel);
            else if (q.action && isDesktop()) void api.systemAction(q.action).catch((e: Error) => app.toast({ kind: "error", title: q.label, detail: e.message }));
          }}><Glyph name={q.icon} size={18} /><span>{q.label}</span></button>
        ))}
      </div>
      <label className="switch compact-row">
        <span><strong>Stay on desktop</strong><small>Always there, but below your open apps</small></span>
        <input type="checkbox" checked={hub.desktopMode} onChange={(e) => set({ desktopMode: e.target.checked })} /><i />
      </label>
      <div className="row small">
        <span className="grow dim">Panel opens</span>
        <div className="seg">
          {(["auto", "left", "right"] as const).map((sd) => <button key={sd} className={hub.panelSide === sd ? "active" : ""} onClick={() => set({ panelSide: sd })}>{sd === "auto" ? "Auto" : sd === "left" ? "Left" : "Right"}</button>)}
        </div>
      </div>
    </div>
  );
}
