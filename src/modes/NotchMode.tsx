import { useEffect, useRef, useState } from "react";
import { useApp } from "../app/context";
import { Tile } from "../components/ButtonGrid";
import { Glyph } from "../components/Icon";
import { WidgetStrip } from "../components/WidgetStrip";
import { Fx, IconButton, RunBar } from "./shared";
import { AwakeChip } from "../tools/AwakeChip";
import { DotClock } from "../components/DotClock";
import { useMedia } from "../tools/useMedia";
import { usePageMenu } from "../components/PageTabs";
import { ContextMenu, MenuItem } from "../components/ContextMenu";

function NotchSong() {
  const { np, art } = useMedia(3000);
  if (!np?.available || !(np.title || np.artist)) return null;
  return (
    <span className="notch-song" title={`${np.title} · ${np.artist}`}>
      {art ? <img src={art} alt="" /> : <Glyph name="music" size={11} />}
      <span className={`notch-song-title ${np.playing ? "playing" : ""}`}>{np.title}</span>
      {np.playing && <span className="eq"><i /><i /><i /></span>}
    </span>
  );
}

export function NotchMode() {
  const app = useApp();
  const s = app.config.settings;
  const { page, expanded, setExpanded, running, flashStatus } = app;
  const leaveTimer = useRef<number | undefined>(undefined);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 20_000); return () => window.clearInterval(t); }, []);

  const enter = () => { window.clearTimeout(leaveTimer.current); if (s.notchExpandOnHover && !expanded) setExpanded(true); };
  const leave = () => {
    window.clearTimeout(leaveTimer.current);
    if (running || document.querySelector(".popover")) return; // a dropdown is open
    leaveTimer.current = window.setTimeout(() => setExpanded(false), 600);
  };
  const pageIdx = app.visiblePages.findIndex((p) => p.id === page.id);
  const pageMenu = usePageMenu();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  if (!expanded && s.notchStyle === "line") {
    return (
      <div className={`notch-line-wrap flash-${flashStatus}`} onMouseEnter={enter} onClick={() => setExpanded(true)} title="Command Centre: hover or click to open">
        <span className={`notch-line ${running ? "busy" : ""}`} />
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className={`notch collapsed flash-${flashStatus}`} onMouseEnter={enter} onClick={() => setExpanded(true)} title="Command Centre: hover or click to open">
        <Fx />
        {running && <span className="notch-dot busy" title={running.name} />}
        <DotClock dot={2.6} color="#fff" ghost={0.1} className="notch-clock" />
        <NotchSong />
      </div>
    );
  }

  return (
    <div className="notch open" onMouseEnter={enter} onMouseLeave={leave} style={app.notchHeight ? { height: app.notchHeight } : undefined}>
      <Fx />
      {s.showWidgets && (
        <div className="notch-widgets">
          <WidgetStrip className="notch-strip" />
        </div>
      )}
      <div className="notch-main">
        <div className="notch-head">
          <div className="notch-pages" onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY + e.deltaX; }}>
            {app.visiblePages.map((p, i) => (
              <button key={p.id} className={`chip ${i === pageIdx ? "active" : ""}`} onClick={() => app.setPage(p.id)}
                onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, items: pageMenu(p) }); }} title="Right-click to rename or delete">
                <Glyph name={p.icon} size={12} /> {p.name}
              </button>
            ))}
          </div>
          <AwakeChip />
          <IconButton icon="sparkles" label="Tools: AI chat, Spotify, notes, alarms, classes, hub" onClick={() => app.openPanel("ai")} size={14} />
          <IconButton icon="settings" label="Settings" onClick={() => app.setOverlay({ kind: "settings" })} size={14} />
          <IconButton icon="x" label="Close" onClick={() => setExpanded(false)} size={14} />
        </div>
        <div className="notch-buttons">
          {page.buttons.map((b) => (
            <div key={b.id} className="notch-item">
              <Tile button={b} compact onContext={() => app.setOverlay({ kind: "button", pageId: page.id, buttonId: b.id })} />
              {s.showLabels && <span>{b.label}</span>}
            </div>
          ))}
          <div className="notch-item">
            <button className="tile tile-compact tile-add" title="Add a button" onClick={() => app.setOverlay({ kind: "button", pageId: page.id, buttonId: null })}>
              <span className="tile-icon"><Glyph name="plus" size={18} /></span>
            </button>
            {s.showLabels && <span>Add</span>}
          </div>
        </div>
        <RunBar />
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
