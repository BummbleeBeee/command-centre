import { CSSProperties, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useApp } from "../app/context";
import { ButtonIcon, Glyph } from "../components/Icon";
import { isDesktop } from "../lib/api";
import { Fx } from "./shared";

const PER_RING = 8;
const RADIUS = 122;

export function TinyButtonMode() {
  const app = useApp();
  const { page, expanded, setExpanded, running, flashStatus } = app;
  const [hover, setHover] = useState<string | null>(null);
  const [ring, setRing] = useState(0);
  const down = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  useEffect(() => { setRing(0); }, [page.id, expanded]);

  if (!expanded) {
    return (
      <button
        className={`orb ${running ? "busy" : ""} flash-${flashStatus}`}
        title="Command Centre: click to open, drag to move, right-click for settings"
        onMouseDown={(e) => { if (e.button === 0) { down.current = { x: e.screenX, y: e.screenY }; dragged.current = false; } }}
        onMouseMove={(e) => {
          if (!down.current || dragged.current) return;
          if (Math.hypot(e.screenX - down.current.x, e.screenY - down.current.y) > 4) {
            dragged.current = true;
            down.current = null;
            if (isDesktop()) void getCurrentWindow().startDragging();
          }
        }}
        onMouseUp={() => { if (!dragged.current && down.current) setExpanded(true); down.current = null; }}
        onContextMenu={(e) => { e.preventDefault(); app.setOverlay({ kind: "settings" }); }}
        aria-label="Open Command Centre"
      >
        <Glyph name="grid" size={22} stroke={2.1} />
      </button>
    );
  }

  const rings = Math.max(1, Math.ceil(page.buttons.length / PER_RING));
  const items = page.buttons.slice(ring * PER_RING, ring * PER_RING + PER_RING);
  const hovered = items.find((b) => b.id === hover);
  const pages = app.visiblePages;
  const pageIdx = pages.findIndex((p) => p.id === page.id);
  const step = (dir: number) => {
    if (rings > 1 && ring + dir >= 0 && ring + dir < rings) { setRing(ring + dir); return; }
    app.setPage(pages[(pageIdx + dir + pages.length) % pages.length].id);
  };

  return (
    <div className="radial-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) setExpanded(false); }}>
      <div className="radial" onWheel={(e) => step(e.deltaY > 0 ? 1 : -1)}>
        <Fx />
        {items.map((b, i) => {
          const angle = (i / Math.max(items.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const style = { "--x": `${Math.cos(angle) * RADIUS}px`, "--y": `${Math.sin(angle) * RADIUS}px`, "--tile-color": b.color, "--i": i } as CSSProperties;
          return (
            <button key={b.id} className={`radial-item ${running?.buttonId === b.id ? "is-running" : ""}`} style={style}
              onMouseEnter={() => setHover(b.id)} onMouseLeave={() => setHover(null)}
              onClick={() => app.run(b)}
              onContextMenu={(e) => { e.preventDefault(); app.setOverlay({ kind: "button", pageId: page.id, buttonId: b.id }); }}
              aria-label={b.label} title={b.tooltip || b.label}>
              <ButtonIcon icon={b.icon} size={22} />
            </button>
          );
        })}
        {items.length < PER_RING && (
          <button className="radial-item radial-add" style={{ "--x": "0px", "--y": `${RADIUS}px` } as CSSProperties}
            hidden={items.length > 0} onClick={() => app.setOverlay({ kind: "button", pageId: page.id, buttonId: null })} aria-label="Add a button">
            <Glyph name="plus" size={20} />
          </button>
        )}
        <div className="radial-centre">
          {running ? (
            <><span className="spinner" /><strong>{running.name}</strong><small>step {running.index + 1}/{running.total}</small></>
          ) : hovered ? (
            <><strong>{hovered.label}</strong><small>{hovered.tooltip || "Click to run"}</small></>
          ) : (
            <>
              <div className="radial-nav">
                <button onClick={() => step(-1)} aria-label="Previous"><Glyph name="chevron-left" size={14} /></button>
                <strong onContextMenu={(e) => { e.preventDefault(); app.setOverlay({ kind: "settings", tab: "pages" }); }} title="Right-click to manage pages">{page.name}</strong>
                <button onClick={() => step(1)} aria-label="Next"><Glyph name="chevron-right" size={14} /></button>
              </div>
              <small>{rings > 1 ? `${ring + 1} / ${rings}` : `${page.buttons.length} buttons`}</small>
              <div className="radial-tools">
                <button onClick={() => app.setOverlay({ kind: "button", pageId: page.id, buttonId: null })} title="Add button"><Glyph name="plus" size={14} /></button>
                <button onClick={() => app.openPanel("ai")} title="Tools: AI chat, Spotify, notes, alarms, classes, hub"><Glyph name="sparkles" size={14} /></button>
                <button onClick={() => app.setOverlay({ kind: "settings" })} title="Settings"><Glyph name="settings" size={14} /></button>
                <button onClick={() => setExpanded(false)} title="Close"><Glyph name="x" size={14} /></button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
