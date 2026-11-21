import { useEffect, useRef, useState } from "react";
import { useApp } from "../app/context";
import { api, isDesktop } from "../lib/api";
import { upcoming, when } from "../lib/upcoming";
import { awakeLabel, AwakeQuick, useAwake } from "../tools/AwakePanel";
import { SpotifyPlaylists } from "../tools/SpotifyPlaylists";
import { Popover } from "./TimePicker";
import { useMedia } from "../tools/useMedia";
import type { WidgetId } from "../types";
import { Glyph } from "./Icon";
import { Clock, MediaWidget, StatsWidget, VolumeWidget } from "./Widgets";

export const WIDGET_INFO: Record<WidgetId, { label: string; icon: string; detail: string }> = {
  spotify: { label: "Spotify", icon: "music", detail: "Spotify player with album art, controls and playlists" },
  media: { label: "Music (compact)", icon: "music", detail: "Small now-playing with controls" },
  stats: { label: "System stats", icon: "cpu", detail: "CPU, memory and network" },
  volume: { label: "Volume", icon: "volume-up", detail: "Volume slider and mute" },
  clock: { label: "Clock", icon: "clock", detail: "Time and date" },
  next: { label: "Next up", icon: "briefcase", detail: "Your next class, alarm or timer" },
  note: { label: "Latest note", icon: "note", detail: "Your most recent sticky note" },
  awake: { label: "Keep awake", icon: "coffee", detail: "Keep the PC awake: pick a time from a dropdown or the dial" },
};

function SpotifyWidget() {
  const app = useApp();
  const { np, art, position, control } = useMedia(2000);
  const [lists, setLists] = useState(false);
  const listBtn = useRef<HTMLButtonElement>(null);
  const has = np?.available && (np.title || np.artist);
  const pct = np?.durationMs ? Math.min(100, (position / np.durationMs) * 100) : 0;
  return (
    <div className="widget spotify-w">
      <button className="spw-art" onClick={() => app.openPanel("spotify")} title="Open Spotify player & playlists">{art ? <img src={art} alt="" /> : <Glyph name="music" size={18} />}</button>
      <div className="media-meta">
        <strong>{has ? np!.title : "Spotify"}</strong>
        <span>{has ? np!.artist || np!.app : "Nothing playing"}</span>
        <div className="mini-bar"><i style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="media-controls">
        <button onClick={() => void control("previous")} aria-label="Previous"><Glyph name="prev" size={13} /></button>
        <button className="media-play spw-play" onClick={() => void control("play_pause")} aria-label="Play or pause"><Glyph name={np?.playing ? "pause" : "play"} size={13} /></button>
        <button onClick={() => void control("next")} aria-label="Next"><Glyph name="next" size={13} /></button>
        <button ref={listBtn} className={lists ? "on" : ""} onClick={() => setLists(!lists)} aria-label="Playlists" aria-expanded={lists} title="Your playlists"><Glyph name="chevron-down" size={13} /></button>
      </div>
      <Popover open={lists} onClose={() => setLists(false)} anchor={listBtn} width={270} className="pop-playlists" onSpace={app.requestSpace}>
        <SpotifyPlaylists compact />
        <button className="side-link" onClick={() => { setLists(false); app.openPanel("spotify"); }}>Open the full player →</button>
      </Popover>
    </div>
  );
}

function NextWidget() {
  const app = useApp();
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(t); }, []);
  const u = upcoming(now, app.config.classes, app.config.alarms, [], 1)[0];
  return (
    <button className="widget next-w" onClick={() => app.openPanel("classes")} title="Open my classes">
      <span className="next-dot" style={{ background: u?.color ?? "var(--text-faint)" }} />
      <div className="media-meta">
        <strong>{u ? u.title : "Nothing coming up"}</strong>
        <span>{u ? `${when(u, now)}${u.detail ? ` · ${u.detail}` : ""}` : "Add classes or alarms"}</span>
      </div>
    </button>
  );
}

function NoteWidget() {
  const app = useApp();
  const note = [...app.config.notes].sort((a, b) => b.updated - a.updated)[0];
  return (
    <button className="widget note-w" style={{ "--note": note?.color ?? "#f5c26b" } as React.CSSProperties} onClick={() => app.openPanel("notes")} title="Open sticky notes">
      <span>{note?.text || "Tap to write a note"}</span>
    </button>
  );
}

function AwakeWidget() {
  const app = useApp();
  const { status, setStatus } = useAwake(10_000);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} className={`widget awake-w ${status?.active ? "on" : ""} ${open ? "open" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}
        onContextMenu={(e) => { e.preventDefault(); app.openPanel("awake"); }} title="Keep awake: pick how long · Right-click: all options">
        <Glyph name="coffee" size={16} />
        <div className="media-meta"><strong>Keep awake</strong><span>{awakeLabel(status)}</span></div>
        <Glyph name="chevron-down" size={12} className="awake-caret" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} width={250} onSpace={app.requestSpace}>
        <AwakeQuick status={status} setStatus={setStatus} onDone={() => setOpen(false)} />
      </Popover>
    </>
  );
}

export function WidgetById({ id, compact }: { id: WidgetId; compact?: boolean }) {
  switch (id) {
    case "spotify": return <SpotifyWidget />;
    case "media": return <MediaWidget compact={compact} />;
    case "stats": return <StatsWidget />;
    case "volume": return <VolumeWidget />;
    case "clock": return <Clock />;
    case "next": return <NextWidget />;
    case "note": return <NoteWidget />;
    case "awake": return <AwakeWidget />;
  }
}

/** The user's chosen widgets, in their chosen order. Right-click to edit. */
export function WidgetStrip({ className, compact }: { className: string; compact?: boolean }) {
  const app = useApp();
  const ids = app.config.settings.widgets;
  if (!ids.length) return null;
  return (
    <footer className={className} onContextMenu={(e) => { e.preventDefault(); app.setOverlay({ kind: "settings", tab: "widgets" }); }} title="Right-click to choose widgets">
      {ids.map((id) => <WidgetById key={id} id={id} compact={compact} />)}
    </footer>
  );
}
