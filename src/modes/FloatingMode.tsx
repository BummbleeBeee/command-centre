import { useEffect, useRef, useState } from "react";
import { useApp } from "../app/context";
import { ButtonGrid } from "../components/ButtonGrid";
import { ContextMenu, MenuItem } from "../components/ContextMenu";
import { Glyph } from "../components/Icon";
import { PageTabs } from "../components/PageTabs";
import { WidgetStrip } from "../components/WidgetStrip";
import { AwakeChip } from "../tools/AwakeChip";
import { Fx, Brand, hideWindow, IconButton, MODES, pageBackground, resizeFrom, RunBar } from "./shared";

export function FloatingMode() {
  const app = useApp();
  const s = app.config.settings;
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key.toLowerCase() === "f") || (e.key === "/" && document.activeElement?.tagName !== "INPUT")) { e.preventDefault(); search.current?.focus(); }
      if (e.ctrlKey && /^[1-9]$/.test(e.key)) { const p = app.visiblePages[Number(e.key) - 1]; if (p) app.setPage(p.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app]);

  const modeMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({
      x: r.left, y: r.bottom + 6,
      items: MODES.map((m) => ({ label: m.label, icon: m.icon, disabled: m.value === app.profile.displayMode, onSelect: () => app.updateProfile((p) => ({ ...p, displayMode: m.value })) })),
    });
  };

  return (
    <main className="panel floating" style={pageBackground(app.page)}>
      <Fx />
      <header className="titlebar" data-tauri-drag-region>
        <Brand />
        <label className="search" onMouseDown={(e) => e.stopPropagation()}>
          <Glyph name="search" size={14} />
          <input ref={search} className="bare" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search buttons" aria-label="Search buttons"
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              if (e.key === "Enter" && query) {
                const hit = app.config.pages.flatMap((p) => p.buttons).find((b) => b.label.toLowerCase().includes(query.toLowerCase()));
                if (hit) { app.run(hit); setQuery(""); }
              }
            }} />
          {!query && <kbd>Ctrl F</kbd>}
        </label>
        <div className="window-actions">
          <AwakeChip />
          <IconButton icon="sparkles" label="Tools: AI chat, Spotify, notes, alarms, classes, hub" onClick={() => app.openPanel("ai")} />
          <IconButton icon={MODES.find((m) => m.value === app.profile.displayMode)!.icon} label="Switch display mode" onClick={modeMenu} />
          <IconButton icon="settings" label="Settings" onClick={() => app.setOverlay({ kind: "settings" })} />
          <IconButton icon="minus" label="Hide to tray" onClick={hideWindow} />
        </div>
      </header>
      {!query && <PageTabs />}
      <div className="panel-body">
        <ButtonGrid filter={query} />
      </div>
      {s.showWidgets && <WidgetStrip className="dock" compact />}
      <RunBar />
      <div className="resize-corner" onMouseDown={() => resizeFrom("SouthEast")} aria-hidden="true" />
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </main>
  );
}
