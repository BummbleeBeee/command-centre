import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApp } from "../app/context";
import { describeStep } from "../engine/runner";
import { SpotifyPlaylists } from "../tools/SpotifyPlaylists";
import { fmtTime, useMedia } from "../tools/useMedia";
import type { FlyoutItem, LauncherButton } from "../types";
import { ButtonIcon, Glyph } from "./Icon";

const ITEM_ICON: Record<string, string> = { url: "globe", folder: "folder", launch: "rocket", shortcut: "keyboard", system: "settings" };

/** Body of a button's dropdown: Spotify now-playing + playlists, or the user's own items. */
export function FlyoutBody({ button, onDone }: { button: LauncherButton; onDone?: () => void }) {
  const app = useApp();
  const f = button.flyout!;
  const runItem = (it: FlyoutItem) => {
    app.run({ ...button, id: `${button.id}:${it.id}`, label: it.label, steps: [it.step], sequenceId: undefined, confirm: false, flyout: undefined });
    onDone?.();
  };
  return (
    <div className="flyout-body">
      <div className="flyout-head">
        <span className="tile-icon mini" style={{ "--tile-color": button.color } as React.CSSProperties}><ButtonIcon icon={button.icon} size={22} /></span>
        <strong className="grow">{button.label}</strong>
        <button className="btn primary" onClick={() => { app.run(button); onDone?.(); }}><Glyph name="play" size={12} /> Open</button>
      </div>
      {f.kind === "spotify" ? (
        <>
          <MiniPlayer />
          <SpotifyPlaylists compact />
        </>
      ) : (
        <div className="flyout-items">
          {f.items.map((it) => (
            <button key={it.id} className="flyout-item" onClick={() => runItem(it)} title={describeStep(it.step, app.config)}>
              <Glyph name={ITEM_ICON[it.step.type] ?? "arrow-right"} size={15} />
              <span className="grow">{it.label}</span>
              <small>{describeStep(it.step, app.config).replace(/^(Open|Launch) /, "")}</small>
            </button>
          ))}
        </div>
      )}
      <button className="flyout-edit" onClick={() => { const pg = app.config.pages.find((p) => p.buttons.some((b) => b.id === button.id)); if (pg) app.setOverlay({ kind: "button", pageId: pg.id, buttonId: button.id }); onDone?.(); }}>
        <Glyph name="edit" size={12} /> Edit dropdown
      </button>
    </div>
  );
}

function MiniPlayer() {
  const { np, art, position, control } = useMedia(1500);
  const has = np?.available && (np.title || np.artist);
  const pct = np?.durationMs ? Math.min(100, (position / np.durationMs) * 100) : 0;
  return (
    <div className="mini-player">
      {art ? <img src={art} alt="" /> : <span className="sp-noart"><Glyph name="music" size={18} /></span>}
      <div className="grow" style={{ minWidth: 0 }}>
        <b>{has ? np!.title : "Nothing playing"}</b>
        <span>{has ? np!.artist : "Pick a playlist below"}</span>
        <div className="mini-bar"><i style={{ width: `${pct}%` }} /></div>
        <small>{has && np!.durationMs ? `${fmtTime(position)} / ${fmtTime(np!.durationMs)}` : ""}</small>
      </div>
      <div className="mini-controls">
        <button onClick={() => void control("previous")} aria-label="Previous"><Glyph name="prev" size={13} /></button>
        <button className="play" onClick={() => void control("play_pause")} aria-label="Play or pause"><Glyph name={np?.playing ? "pause" : "play"} size={14} /></button>
        <button onClick={() => void control("next")} aria-label="Next"><Glyph name="next" size={13} /></button>
      </div>
    </div>
  );
}

/** Vertical popover anchored next to a tile (floating panel / expanded sidebar). */
export function AppFlyout({ button, anchor, onClose }: { button: LauncherButton; anchor: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.right + 8, top: anchor.top });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = anchor.right + 8;
    if (left + r.width > window.innerWidth - 8) left = Math.max(8, anchor.left - r.width - 8);
    const top = Math.max(8, Math.min(anchor.top, window.innerHeight - r.height - 8));
    setPos({ left, top });
  }, [anchor]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", key); };
  }, [onClose]);
  return (
    <div ref={ref} className="flyout" style={pos} role="dialog" aria-label={`${button.label} menu`}>
      <FlyoutBody button={button} onDone={onClose} />
    </div>
  );
}
