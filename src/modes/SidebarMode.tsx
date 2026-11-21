import { useRef, useState } from "react";
import { edit, useApp } from "../app/context";
import { buttonMenu } from "../components/ButtonActions";
import { usePageMenu } from "../components/PageTabs";
import { DND_TYPE, Tile } from "../components/ButtonGrid";
import { ContextMenu, MenuItem } from "../components/ContextMenu";
import { DotClock } from "../components/DotClock";
import { Glyph } from "../components/Icon";
import { useMedia } from "../tools/useMedia";
import { Fx, hideWindow, IconButton, pageBackground, RunBar } from "./shared";

/** Song playing, shown under the dot clock (art only when collapsed). */
function SideMusic({ expanded }: { expanded: boolean }) {
  const app = useApp();
  const { np, art, control } = useMedia(3000);
  if (!np?.available || !(np.title || np.artist)) return null;
  return (
    <div className={`sb-music ${expanded ? "wide" : ""}`} title={`${np.title} · ${np.artist}`}>
      <button className="sb-music-art" onClick={() => app.openPanel("spotify")}>{art ? <img src={art} alt="" /> : <Glyph name="music" size={14} />}</button>
      {expanded && <div className="sb-music-meta"><b>{np.title}</b><span>{np.artist}</span></div>}
      {expanded && <button className="icon-btn" onClick={() => void control("play_pause")} aria-label="Play or pause"><Glyph name={np.playing ? "pause" : "play"} size={13} /></button>}
    </div>
  );
}

export function SidebarMode() {
  const app = useApp();
  const s = app.config.settings;
  const { page, expanded, setExpanded } = app;
  const leaveTimer = useRef<number | undefined>(undefined);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [stayOpen, setStayOpen] = useState(false);
  const pageMenu = usePageMenu();
  const side = app.sidebarSide;

  const enter = () => {
    window.clearTimeout(leaveTimer.current);
    app.setSidebarRevealed(true);
    if (s.sidebarExpandOnHover && !expanded) setExpanded(true);
  };
  const leave = () => {
    if (stayOpen || menu) return;
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => { setExpanded(false); app.setSidebarRevealed(false); }, 450);
  };

  // Auto-hide: the sidebar collapses into a thin dock at the screen edge.
  if (app.sidebarHidden) {
    return (
      <div className={`sb-strip side-${side}`} onMouseEnter={enter} onClick={enter} title="Command Centre: hover to open">
        <span /><span /><span />
      </div>
    );
  }

  const pageIndex = app.visiblePages.findIndex((p) => p.id === page.id);
  const cyclePage = (dir: number) => {
    const pages = app.visiblePages;
    app.setPage(pages[(pageIndex + dir + pages.length) % pages.length].id);
  };
  const flipSide = () => app.updateDisplay((d) => ({ ...d, sidebarSide: side === "left" ? "right" : "left" }));
  const togglePin = () => app.update((c) => ({ ...c, settings: { ...c.settings, sidebarPinned: !c.settings.sidebarPinned } }));

  return (
    <aside className={`panel sidebar side-${side} ${expanded ? "expanded" : ""} ${app.pinned ? "pinned" : ""}`} style={pageBackground(page)}
      onMouseEnter={enter} onMouseLeave={leave}
      onWheel={(e) => { if (e.shiftKey) cyclePage(e.deltaY > 0 ? 1 : -1); }}>
      <Fx />
      <div className="sb-head" onDoubleClick={() => setExpanded(!expanded)} title={expanded ? "Double-click to collapse" : "Double-click to expand"}>
        <DotClock dot={expanded ? 4 : 2.4} className="sb-dots" />
        <SideMusic expanded={expanded} />
      </div>

      <nav className="sb-pages icons" aria-label="Pages">
        {app.visiblePages.map((p) => (
          <button key={p.id} className={`sb-page ${p.id === page.id ? "active" : ""}`} onClick={() => app.setPage(p.id)} title={`${p.name} · right-click to rename or delete`}
            onContextMenu={(e) => { e.preventDefault(); if (!expanded) { app.setOverlay({ kind: "settings", tab: "pages" }); return; } setMenu({ x: e.clientX, y: e.clientY, items: pageMenu(p) }); }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(DND_TYPE)) e.preventDefault(); }}
            onDrop={(e) => { const id = e.dataTransfer.getData(DND_TYPE); if (id) app.update((c) => edit.moveButton(c, id, p.id)); }}>
            <Glyph name={p.icon} size={15} />
          </button>
        ))}
      </nav>

      <div className="sb-divider" />

      <div className="sb-buttons">
        {page.buttons.map((b, i) => (
          <div key={b.id} className="sb-row"
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND_TYPE, b.id)}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(DND_TYPE)) e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData(DND_TYPE);
              if (!id) return;
              app.update((c) => { const from = page.buttons.findIndex((x) => x.id === id); return edit.moveButton(c, id, page.id, from >= 0 && from < i ? i - 1 : i); });
            }}>
            <Tile button={b} compact onContext={(e) => {
              if (!expanded) { app.setOverlay({ kind: "button", pageId: page.id, buttonId: b.id }); return; }
              setMenu({ x: e.clientX, y: e.clientY, items: buttonMenu(app, b, page.id) });
            }} />
            {expanded && <button className="sb-label" onClick={() => app.run(b)} title={b.tooltip || b.label}>{b.label}</button>}
          </div>
        ))}
        <div className="sb-row">
          <button className="tile tile-compact tile-add" title="Add a button" onClick={() => app.setOverlay({ kind: "button", pageId: page.id, buttonId: null })}>
            <span className="tile-icon"><Glyph name="plus" size={18} /></span>
          </button>
          {expanded && <span className="sb-label dim">Add button</span>}
        </div>
      </div>

      <RunBar />
      <div className={`sb-bottom ${expanded ? "wide" : ""}`}>
        <IconButton icon="sparkles" label="Tools: AI chat, Spotify, notes, alarms, classes, hub" onClick={() => app.openPanel("ai")} />
        <IconButton icon="settings" label="Settings" onClick={() => app.setOverlay({ kind: "settings" })} />
        {expanded && <>
          <IconButton icon="arrow-right" label={`Move sidebar to the ${side === "left" ? "right" : "left"} edge (this monitor)`} onClick={flipSide} />
          <IconButton icon="pin" active={app.pinned} label={app.pinned ? "Unpin: give the screen space back" : "Pin: reserve this strip of the screen like the taskbar"} onClick={togglePin} />
          <IconButton icon="eye" active={stayOpen} label={stayOpen ? "Let it collapse again" : "Keep it expanded"} onClick={() => setStayOpen(!stayOpen)} />
          <IconButton icon="minus" label="Hide to tray" onClick={hideWindow} />
        </>}
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}
