import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";
import { AppContext, AppApi, Overlay, Toast, useApp } from "../app/context";
import { DotClock } from "../components/DotClock";
import { BackgroundFx } from "../components/BackgroundFx";
import { ButtonIcon, Glyph } from "../components/Icon";
import { Toasts } from "../components/Toasts";
import { resolveAction, runAction } from "../engine/runner";
import { api, isDesktop, MonitorInfo, TimerInfo } from "../lib/api";
import { DurationPicker } from "../components/TimePicker";
import { AwakeQuick, useAwake } from "./AwakePanel";
import { HubLinks, HubTools } from "./HubTools";
import { createExecutor } from "../lib/executor";
import { uid } from "../lib/schema";
import { useConfigStore } from "../lib/store";
import { applyTheme } from "../lib/theme";
import { upcoming, when } from "../lib/upcoming";
import type { Config, LauncherButton, ToolPanel } from "../types";
import { AiChat } from "./AiChat";
import { SpotifyPlaylists } from "./SpotifyPlaylists";
import { fmtTime, useMedia } from "./useMedia";

const ORB = 64;
const WIN = { width: 1000, height: 600 };
const R_OUT = 226;
const R_IN = 146;

type Segment = "apps" | "music" | "notes" | "next" | "tools" | "ai";
const SEGMENTS: { id: Segment; label: string; icon: string }[] = [
  { id: "apps", label: "Apps", icon: "grid" },
  { id: "music", label: "Music", icon: "music" },
  { id: "notes", label: "Notes", icon: "note" },
  { id: "next", label: "Up next", icon: "briefcase" },
  { id: "tools", label: "Tools", icon: "sliders" },
  { id: "ai", label: "AI", icon: "sparkles" },
];

/** Root of the detachable hub window (`index.html?hub=1`). */
export function HubRoot() {
  const store = useConfigStore();
  if (!store.config) return <div className="boot" />;
  return <Hub config={store.config} update={store.update} replace={store.replace} />;
}

function polar(r: number, a: number) { return [Math.cos(a) * r, Math.sin(a) * r]; }
/** SVG path of one ring section (annular sector), angles in radians. */
export function sectorPath(a0: number, a1: number, rOut = R_OUT, rIn = R_IN): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(rOut, a0), [x1, y1] = polar(rOut, a1), [x2, y2] = polar(rIn, a1), [x3, y3] = polar(rIn, a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${rOut},${rOut} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)} A${rIn},${rIn} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)} Z`;
}

function Hub({ config, update, replace }: { config: Config; update: ReturnType<typeof useConfigStore>["update"]; replace: (c: Config) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [seg, setSeg] = useState<Segment | null>(null);
  const [now, setNow] = useState(new Date());
  const [timers, setTimers] = useState<TimerInfo[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const suppress = useRef(0);
  const shown = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const down = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const s = config.settings;
  const desktop = config.hub.desktopMode;
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  useEffect(() => { if (isDesktop()) void api.listMonitors().then(setMonitors).catch(() => undefined); }, [open]);
  const side = hubPanelSide(config.hub.panelSide, config.hub.position, monitors);

  useEffect(() => { applyTheme(s, "button"); }, [s]);
  useEffect(() => { if (!open) setSeg(null); }, [open]);
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), open ? 1000 : 15000); return () => window.clearInterval(t); }, [open]);
  useEffect(() => {
    if (!open || !isDesktop()) return;
    const tick = () => void api.listTimers().then(setTimers).catch(() => undefined);
    tick();
    const t = window.setInterval(tick, 5000);
    return () => window.clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (!isDesktop()) return;
    suppress.current = Date.now() + 800;
    void api.applyWindowMode({
      mode: "button", expanded: open, alwaysOnTop: !desktop || open, floatingDefault: { width: 600, height: 500 },
      sidebarSide: "right", sidebarWidth: 78, sidebarExpandedWidth: 250, notchSize: { width: 1, height: 1 }, notchExpandedSize: { width: 1, height: 1 },
      buttonSize: ORB, buttonExpandedSize: WIN, buttonPosition: config.hub.position,
    }).then(() => { if (!shown.current) { shown.current = true; return api.showMainWindow(false); } })
      // Desktop mode: below every app while closed; on top while you're using it.
      .then(() => api.setDesktopLayer(desktop && !open)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, desktop]);

  useEffect(() => {
    if (!isDesktop()) return;
    const w = getCurrentWindow();
    let t: number | undefined;
    const un = w.onMoved(() => {
      window.clearTimeout(t);
      t = window.setTimeout(async () => {
        if (Date.now() < suppress.current || openRef.current) return;
        const p = await w.outerPosition();
        if (p.x > -10000) update((c) => ({ ...c, hub: { ...c.hub, position: { x: p.x, y: p.y } } }));
      }, 400);
    });
    const unFocus = w.onFocusChanged(({ payload }) => { if (!payload) setOpen(false); });
    return () => { void un.then((f) => f()); void unFocus.then((f) => f()); };
  }, [update]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((l) => [...l.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), 4000);
  }, []);
  const openPanel = useCallback((panel: ToolPanel) => { void emit("hub-open-panel", panel); setOpen(false); }, []);
  const exec = useMemo(() => createExecutor(() => undefined, openPanel), [openPanel]);
  const run = useCallback(async (b: LauncherButton) => {
    const def = resolveAction(b, config);
    const res = await runAction(def, { config, exec, riskyNeedsConfirm: (a) => config.settings.confirmSystemActions && (a === "lock" || a === "sleep") });
    if (res.status === "failed" || res.status === "completed-with-errors") {
      void message(res.log.filter((l) => l.status === "failed").map((l) => `${l.label}: ${l.message}`).join("\n"), { title: def.name, kind: "error" });
    } else if (res.status === "completed" && !def.steps.every((st) => st.type === "panel")) setOpen(false);
  }, [config, exec]);

  // A small app context so the shared tool components (AI chat, notes, playlists) work here too.
  const ctx: AppApi = {
    config, update, replace, page: config.pages[0], setPage: () => undefined, run: (b) => void run(b), running: null, cancelRun: () => undefined,
    overlay: null, setOverlay: (o: Overlay) => { if (o) { void emit("hub-overlay", o); setOpen(false); } },
    expanded: true, setExpanded: () => undefined, toast, hotkeyFailures: [], flashStatus: "idle", reapplyGeometry: () => undefined,
    display: "", isMain: false, monitors: [], profile: config.profiles[0], visiblePages: config.pages, updateProfile: () => undefined,
    updateDisplay: () => undefined, openPanel, openFlyout: () => setSeg("music"),
    sidebarSide: "right", sidebarHidden: false, setSidebarRevealed: () => undefined, pinned: false,
  };

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (!open) {
    return (
      <button className={`hub-orb orb-${s.orbStyle}`} title="Command Centre hub: click to open, drag to move, right-click for settings"
        onMouseDown={(e) => { if (e.button === 0) { down.current = { x: e.screenX, y: e.screenY }; dragged.current = false; } }}
        onMouseMove={(e) => {
          if (!down.current || dragged.current) return;
          if (Math.hypot(e.screenX - down.current.x, e.screenY - down.current.y) > 4) { dragged.current = true; down.current = null; if (isDesktop()) void getCurrentWindow().startDragging(); }
        }}
        onMouseUp={() => { if (!dragged.current && down.current) setOpen(true); down.current = null; }}
        onContextMenu={(e) => { e.preventDefault(); openPanel("hub"); }}>
        <DotClock dot={2.1} color={s.orbStyle === "light" ? "#111" : "#fff"} ghost={0.08} />
        <small>{now.toLocaleDateString([], { weekday: "short" })}</small>
      </button>
    );
  }

  const n = SEGMENTS.length;
  const gap = 0.035;
  const next = upcoming(now, config.classes, config.alarms, timers, 1)[0];
  return (
    <AppContext.Provider value={ctx}>
      <div className="hub-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        onKeyDown={(e) => { if (e.key === "Escape") { if (seg) setSeg(null); else setOpen(false); } }} tabIndex={-1}>
        <div className={`hub-stage stage-${side}`}>
          <div className={`hub-side side-${side} ${seg ? "open" : ""}`} aria-hidden={!seg}>
            {seg && <SidePanel seg={seg} config={config} timers={timers} now={now} onRun={(b) => void run(b)} openPanel={openPanel} update={update} />}
          </div>
          <div className="hub-circle">
            <BackgroundFx effect={s.effect} intensity={s.effectIntensity} animations={s.animations} />
            <svg className="hub-ring" viewBox={`${-R_OUT - 2} ${-R_OUT - 2} ${R_OUT * 2 + 4} ${R_OUT * 2 + 4}`} aria-label="Hub sections">
              {SEGMENTS.map((g, i) => {
                const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 - Math.PI / n + gap;
                const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2 - Math.PI / n - gap;
                return <path key={g.id} d={sectorPath(a0, a1)} className={`hub-sector ${seg === g.id ? "active" : ""}`} onClick={() => setSeg(seg === g.id ? null : g.id)}><title>{g.label}</title></path>;
              })}
            </svg>
            {SEGMENTS.map((g, i) => {
              const a = (i / n) * Math.PI * 2 - Math.PI / 2;
              const [x, y] = polar((R_OUT + R_IN) / 2, a);
              return (
                <button key={g.id} className={`hub-seg-label ${seg === g.id ? "active" : ""}`} style={{ "--x": `${x}px`, "--y": `${y}px` } as CSSProperties} onClick={() => setSeg(seg === g.id ? null : g.id)}>
                  <Glyph name={g.icon} size={18} /><span>{g.label}</span>
                </button>
              );
            })}
            <div className="hub-core">
              <div className="hub-time">{time}</div>
              <div className="hub-date">{now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}</div>
              {next && <div className="hub-core-next" onClick={() => setSeg("next")}><i style={{ background: next.color }} />{next.title} · {when(next, now)}</div>}
              <CoreMusic onOpen={() => setSeg("music")} />
            </div>
          </div>
        </div>
        <Toasts toasts={toasts} onDismiss={(id) => setToasts((l) => l.filter((t) => t.id !== id))} />
      </div>
    </AppContext.Provider>
  );
}

function CoreMusic({ onOpen }: { onOpen: () => void }) {
  const { np, art } = useMedia(3000);
  if (!np?.available || !(np.title || np.artist)) return null;
  return (
    <button className="hub-core-music" onClick={onOpen} title="Open music">
      {art ? <img src={art} alt="" /> : <Glyph name="music" size={12} />}
      <span>{np.title}</span>
    </button>
  );
}

function SidePanel({ seg, config, timers, now, onRun, openPanel, update }: {
  seg: Segment; config: Config; timers: TimerInfo[]; now: Date; onRun: (b: LauncherButton) => void; openPanel: (p: ToolPanel) => void;
  update: ReturnType<typeof useConfigStore>["update"];
}) {
  const title = SEGMENTS.find((x) => x.id === seg)!.label;
  return (
    <div className="side-inner">
      <h3>{title}</h3>
      {seg === "apps" && <><HubApps config={config} onRun={onRun} update={update} /><HubLinks config={config} update={update} /></>}
      {seg === "music" && <><HubPlayer /><SpotifyPlaylists compact /></>}
      {seg === "notes" && (
        <>
          <button className="btn" onClick={() => update((c) => ({ ...c, notes: [{ id: uid(), text: "", color: "#f5c26b", updated: Date.now() }, ...c.notes] }))}><Glyph name="plus" size={12} /> New note</button>
          <div className="side-notes">
            {[...config.notes].sort((a, b) => b.updated - a.updated).slice(0, 8).map((n) => (
              <textarea key={n.id} className="side-note" style={{ "--note": n.color } as CSSProperties} value={n.text} placeholder="Write something…"
                onChange={(e) => update((c) => ({ ...c, notes: c.notes.map((x) => (x.id === n.id ? { ...x, text: e.target.value, updated: Date.now() } : x)) }))} />
            ))}
          </div>
          <button className="side-link" onClick={() => openPanel("notes")}>All notes →</button>
        </>
      )}
      {seg === "next" && (
        <>
          <div className="side-up">
            {upcoming(now, config.classes, config.alarms, timers, 8).map((u) => (
              <div key={u.id} className="hub-up"><i style={{ background: u.color }} /><b>{u.kind === "alarm" ? "⏰ " : u.kind === "timer" ? "⏱ " : ""}{u.title}{u.detail ? <span className="dim"> · {u.detail}</span> : null}</b><span>{when(u, now)}</span></div>
            ))}
            {upcoming(now, config.classes, config.alarms, timers, 1).length === 0 && <p className="dim small">Nothing coming up.</p>}
          </div>
          <TimerPicker timers={timers} />
          <div className="row"><button className="side-link" onClick={() => openPanel("classes")}>My classes →</button><button className="side-link" onClick={() => openPanel("alarms")}>Alarms →</button></div>
        </>
      )}
      {seg === "tools" && <HubTools config={config} update={update} openPanel={openPanel} awake={<HubAwake />} />}
      {seg === "ai" && <AiChat compact />}
    </div>
  );
}

/** Which side the hub's side panel opens on: the one with room, unless the user picked a side. */
export function hubPanelSide(pref: "auto" | "left" | "right", pos: { x: number; y: number } | undefined, monitors: MonitorInfo[]): "left" | "right" {
  if (pref !== "auto") return pref;
  if (!pos) return "left"; // default corner is bottom-right
  const m = monitors.find((x) => pos.x >= x.x && pos.x < x.x + x.width) ?? monitors.find((x) => x.primary);
  if (!m) return "right";
  return pos.x + ORB / 2 > m.x + m.width / 2 ? "left" : "right";
}

/** Start a timer from presets or the dial; running timers can be cancelled. */
function TimerPicker({ timers }: { timers: TimerInfo[] }) {
  const app = useApp();
  const [list, setList] = useState(timers);
  useEffect(() => setList(timers), [timers]);
  const start = async (m: number) => {
    if (!isDesktop()) return;
    try {
      const t = await api.startTimer(uid(), `${m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`} timer`, m * 60);
      setList((l) => [...l, t]);
    } catch (e) { app.toast({ kind: "error", title: "Timer", detail: (e as Error).message }); }
  };
  const running = list.filter((t) => t.kind === "timer");
  return (
    <div className="hub-timer">
      <b className="small">New timer</b>
      <DurationPicker presets={[5, 10, 25, 60]} initial={15} action="Start timer" onPick={(m) => void start(m)} />
      {running.map((t) => (
        <div key={t.id} className="hub-up"><i style={{ background: "var(--accent)" }} /><b>⏱ {t.label}</b>
          <span>{new Date(t.atMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          <button className="icon-btn" title="Cancel timer" onClick={() => void api.cancelTimer(t.id).then(() => setList((l) => l.filter((x) => x.id !== t.id)))}><Glyph name="x" size={11} /></button>
        </div>
      ))}
    </div>
  );
}

function HubAwake() {
  const { status, setStatus } = useAwake(5000);
  return <AwakeQuick status={status} setStatus={setStatus} />;
}

/** Pinned apps with in-place editing: unpin, add from all buttons, right-click to edit. */
function HubApps({ config, onRun, update }: { config: Config; onRun: (b: LauncherButton) => void; update: ReturnType<typeof useConfigStore>["update"] }) {
  const app = useApp();
  const [editing, setEditing] = useState(false);
  const all = config.pages.flatMap((p) => p.buttons.map((b) => ({ b, pageId: p.id })));
  const pinned = config.hub.pinned.map((id) => all.find((x) => x.b.id === id)).filter((x): x is { b: LauncherButton; pageId: string } => !!x);
  const setPins = (ids: string[]) => update((c) => ({ ...c, hub: { ...c.hub, pinned: ids.slice(0, 12) } }));
  const editBtn = (x: { b: LauncherButton; pageId: string }) => app.setOverlay({ kind: "button", pageId: x.pageId, buttonId: x.b.id });
  return (
    <>
      <div className="side-grid">
        {pinned.map((x) => (
          <div key={x.b.id} className="side-app-wrap">
            <button className="side-app" onClick={() => (editing ? editBtn(x) : onRun(x.b))} onContextMenu={(e) => { e.preventDefault(); editBtn(x); }} title={editing ? `Edit ${x.b.label}` : `${x.b.tooltip || x.b.label} · right-click to edit`}>
              <ButtonIcon icon={x.b.icon} size={32} /><span>{x.b.label}</span>
            </button>
            {editing && <button className="side-unpin" onClick={() => setPins(config.hub.pinned.filter((i) => i !== x.b.id))} aria-label={`Unpin ${x.b.label}`}><Glyph name="x" size={10} stroke={2.6} /></button>}
          </div>
        ))}
      </div>
      <div className="row">
        <button className={`btn ${editing ? "primary" : ""}`} onClick={() => setEditing(!editing)}><Glyph name={editing ? "check" : "edit"} size={12} /> {editing ? "Done" : "Edit apps"}</button>
      </div>
      {editing && (
        <>
          <small className="dim">Tap to pin ({pinned.length}/12). Tap a pinned app to edit it.</small>
          <div className="side-grid">
            {all.filter((x) => !config.hub.pinned.includes(x.b.id)).map((x) => (
              <button key={x.b.id} className="side-app add" disabled={pinned.length >= 12} onClick={() => setPins([...config.hub.pinned, x.b.id])} title={`Pin ${x.b.label}`}>
                <ButtonIcon icon={x.b.icon} size={24} /><span>{x.b.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function HubPlayer() {
  const { np, art, position, control } = useMedia(1500);
  const has = np?.available && (np.title || np.artist);
  const pct = np?.durationMs ? Math.min(100, (position / np.durationMs) * 100) : 0;
  return (
    <div className="hub-player">
      <div className="hub-player-art">{art ? <img src={art} alt="" /> : <Glyph name="music" size={28} />}</div>
      <b>{has ? np!.title : "Nothing playing"}</b>
      <span>{has ? np!.artist : "Pick a playlist below"}</span>
      <div className="mini-bar"><i style={{ width: `${pct}%` }} /></div>
      <small>{has && np!.durationMs ? `${fmtTime(position)} / ${fmtTime(np!.durationMs)}` : ""}</small>
      <div className="mini-controls">
        <button className={np?.shuffle ? "on" : ""} onClick={() => void control("shuffle")} aria-label="Shuffle"><Glyph name="shuffle" size={13} /></button>
        <button onClick={() => void control("previous")} aria-label="Previous"><Glyph name="prev" size={14} /></button>
        <button className="play" onClick={() => void control("play_pause")} aria-label="Play or pause"><Glyph name={np?.playing ? "pause" : "play"} size={15} /></button>
        <button onClick={() => void control("next")} aria-label="Next"><Glyph name="next" size={14} /></button>
        <button className={np?.repeat === "list" || np?.repeat === "track" ? "on" : ""} onClick={() => void control("repeat")} aria-label="Repeat"><Glyph name="repeat" size={13} /></button>
      </div>
    </div>
  );
}
