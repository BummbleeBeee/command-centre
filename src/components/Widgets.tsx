import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, isDesktop, SystemStats, VolumeState } from "../lib/api";
import { useMedia } from "../tools/useMedia";
import { useApp } from "../app/context";
import { Glyph } from "./Icon";

/** Polls only while mounted and while the document is visible, keeping idle CPU near zero. */
function usePoll<T>(fn: () => Promise<T>, ms: number, enabled = true): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (!enabled || !isDesktop()) return;
    let alive = true;
    let timer: number | undefined;
    const tick = async () => {
      const visible = document.visibilityState === "visible" && (await getCurrentWindow().isVisible().catch(() => true));
      if (visible) {
        try { const v = await fn(); if (alive) setValue(v); } catch { /* widget shows unavailable state */ }
      }
      if (alive) timer = window.setTimeout(tick, ms);
    };
    void tick();
    return () => { alive = false; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, enabled]);
  return value;
}

export function Clock({ big }: { big?: boolean }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 15_000); return () => window.clearInterval(t); }, []);
  return (
    <div className={`widget clock ${big ? "clock-big" : ""}`}>
      <strong>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
      <span>{now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}</span>
    </div>
  );
}

export function MediaWidget({ compact }: { compact?: boolean }) {
  const { np, art, control } = useMedia(2500);
  const act = (a: "media_previous" | "media_play_pause" | "media_next") => control(a === "media_previous" ? "previous" : a === "media_next" ? "next" : "play_pause");
  const has = np?.available && (np.title || np.artist);
  const app = useApp();
  return (
    <div className={`widget media ${compact ? "media-compact" : ""}`}>
      <button className="media-art" onClick={() => app.openPanel("spotify")} title="Open the Spotify player">{art ? <img src={art} alt="" draggable={false} /> : <Glyph name="music" size={compact ? 16 : 20} />}</button>
      <div className="media-meta">
        <strong>{has ? np!.title || "Unknown title" : "Nothing playing"}</strong>
        <span>{has ? [np!.artist, np!.app].filter(Boolean).join(" · ") : "Media controls"}</span>
      </div>
      <div className="media-controls">
        <button onClick={() => void act("media_previous")} aria-label="Previous"><Glyph name="prev" size={14} /></button>
        <button className="media-play" onClick={() => void act("media_play_pause")} aria-label="Play or pause"><Glyph name={np?.playing ? "pause" : "play"} size={14} /></button>
        <button onClick={() => void act("media_next")} aria-label="Next"><Glyph name="next" size={14} /></button>
      </div>
    </div>
  );
}

const fmtBytes = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB/s` : `${Math.round(b / 1e3)} KB/s`);

export function StatsWidget() {
  const st = usePoll<SystemStats>(() => api.systemStats(), 2000);
  const mem = st ? st.memoryUsed / Math.max(1, st.memoryTotal) : 0;
  return (
    <div className="widget stats">
      <div className="stat"><Glyph name="cpu" size={14} /><span>CPU</span><b>{st ? `${Math.round(st.cpu)}%` : "—"}</b><i style={{ transform: `scaleX(${(st?.cpu ?? 0) / 100})` }} /></div>
      <div className="stat"><Glyph name="layers" size={14} /><span>RAM</span><b>{st ? `${(st.memoryUsed / 1073741824).toFixed(1)} / ${(st.memoryTotal / 1073741824).toFixed(0)} GB` : "—"}</b><i style={{ transform: `scaleX(${mem})` }} /></div>
      <div className="stat net"><Glyph name="wifi" size={14} /><span>↓ {st ? fmtBytes(st.netDown) : "—"}</span><span>↑ {st ? fmtBytes(st.netUp) : "—"}</span></div>
    </div>
  );
}

/**
 * Volume slider. While dragging, changes are sent at most every 50 ms and the slider is
 * never overwritten by late replies; when idle it follows changes made elsewhere (keyboard
 * volume keys, the Windows flyout).
 */
export function VolumeWidget() {
  const [vol, setVol] = useState<VolumeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragging = useRef(false);
  const pending = useRef<number | null>(null);
  const sending = useRef(false);

  useEffect(() => {
    if (!isDesktop()) return;
    let alive = true;
    const read = () => { if (!dragging.current && !sending.current) api.getVolume().then((v) => alive && setVol(v)).catch((e) => alive && setError((e as Error).message)); };
    read();
    const t = window.setInterval(read, 2500);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const flush = async () => {
    if (sending.current || pending.current === null) return;
    sending.current = true;
    while (pending.current !== null) {
      const level = pending.current;
      pending.current = null;
      try { await api.setVolume(level); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 50));
    }
    sending.current = false;
  };
  const change = (level: number) => {
    setVol((v) => ({ level, muted: v?.muted ?? false }));
    pending.current = level;
    void flush();
  };

  if (error) return <div className="widget volume unavailable" title={error}><Glyph name="mute" size={14} /> Audio unavailable</div>;
  const level = vol?.level ?? 0;
  return (
    <div className={`widget volume ${vol?.muted ? "muted" : ""}`}>
      <button onClick={() => api.setMute().then(setVol).catch(() => undefined)} aria-label={vol?.muted ? "Unmute" : "Mute"} title={vol?.muted ? "Unmute" : "Mute"}>
        <Glyph name={vol?.muted || level === 0 ? "mute" : level < 50 ? "volume-down" : "volume-up"} size={15} />
      </button>
      <input type="range" min={0} max={100} step={1} value={level} aria-label="Volume" style={{ "--fill": `${level}%` } as React.CSSProperties}
        onPointerDown={() => { dragging.current = true; }}
        onPointerUp={() => { dragging.current = false; }}
        onKeyDown={() => { dragging.current = true; }} onKeyUp={() => { dragging.current = false; }}
        onWheel={(e) => change(Math.max(0, Math.min(100, level + (e.deltaY < 0 ? 2 : -2))))}
        onChange={(e) => change(Number(e.target.value))} />
      <b>{vol ? `${level}%` : "–"}</b>
    </div>
  );
}
