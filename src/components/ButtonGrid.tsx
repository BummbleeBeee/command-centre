import { CSSProperties, DragEvent, useState } from "react";
import { edit, useApp } from "../app/context";
import type { LauncherButton } from "../types";
import { buttonMenu } from "./ButtonActions";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { ButtonIcon, Glyph } from "./Icon";

export const DND_TYPE = "application/x-cc-button";

export function Tile({ button, compact, onContext, dragProps, dropHint, style }: {
  button: LauncherButton; compact?: boolean; onContext?: (e: React.MouseEvent) => void;
  dragProps?: Record<string, unknown>; dropHint?: boolean; style?: CSSProperties;
}) {
  const app = useApp();
  const isRunning = app.running?.buttonId === button.id;
  const progress = isRunning && app.running ? (app.running.index + 1) / Math.max(1, app.running.total) : 0;
  return (
    <button
      className={`tile ${compact ? "tile-compact" : ""} ${isRunning ? "is-running" : ""} ${dropHint ? "drop-hint" : ""}`}
      style={{ "--tile-color": button.color, ...style } as CSSProperties}
      title={button.tooltip || button.label + (button.hotkey ? `  (${button.hotkey})` : "")}
      onClick={() => app.run(button)}
      onContextMenu={(e) => { e.preventDefault(); onContext?.(e); }}
      aria-label={button.label}
      {...dragProps}
    >
      <span className="tile-icon"><ButtonIcon icon={button.icon} size={compact ? 20 : 24} /></span>
      {!compact && <span className="tile-label">{button.label}</span>}
      {button.sequenceId && !compact && <span className="tile-badge" title="Runs a multi-step sequence"><Glyph name="zap" size={10} stroke={2.4} /></span>}
      {isRunning && <span className="tile-progress" style={{ transform: `scaleX(${progress})` }} />}
      {button.flyout && (
        <span className="tile-more" role="button" title={button.flyout.kind === "spotify" ? "Playlists & player" : "More"}
          onClick={(e) => { e.stopPropagation(); app.openFlyout(button, (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()); }}
          onMouseDown={(e) => e.stopPropagation()}>
          <Glyph name="chevron-down" size={compact ? 10 : 12} stroke={2.4} />
        </span>
      )}
    </button>
  );
}

export function ButtonGrid({ filter = "" }: { filter?: string }) {
  const app = useApp();
  const { page } = app;
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const q = filter.trim().toLowerCase();
  const buttons = q ? app.config.pages.flatMap((p) => p.buttons).filter((b) => b.label.toLowerCase().includes(q) || b.tooltip?.toLowerCase().includes(q)) : page.buttons;

  const drop = (e: DragEvent, targetIndex: number) => {
    e.preventDefault();
    const id = e.dataTransfer.getData(DND_TYPE);
    setOverIndex(null);
    setDragId(null);
    if (!id) return;
    app.update((c) => {
      const from = c.pages.find((p) => p.id === page.id)?.buttons.findIndex((b) => b.id === id) ?? -1;
      const to = from >= 0 && from < targetIndex ? targetIndex - 1 : targetIndex;
      return edit.moveButton(c, id, page.id, to);
    });
  };

  const style = { gridTemplateColumns: `repeat(${page.columns}, minmax(0, 1fr))` } as CSSProperties;
  return (
    <>
      <section className="grid" style={style} aria-label={`${page.name} buttons`}>
        {buttons.map((b, i) => (
          <Tile
            key={b.id}
            button={b}
            dropHint={overIndex === i && dragId !== b.id}
            onContext={(e) => setMenu({ x: e.clientX, y: e.clientY, items: buttonMenu(app, b, edit.findButton(app.config, b.id)?.page.id ?? page.id) })}
            dragProps={q ? {} : {
              draggable: true,
              onDragStart: (e: DragEvent) => { e.dataTransfer.setData(DND_TYPE, b.id); e.dataTransfer.effectAllowed = "move"; setDragId(b.id); },
              onDragEnd: () => { setDragId(null); setOverIndex(null); },
              onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes(DND_TYPE)) { e.preventDefault(); setOverIndex(i); } },
              onDrop: (e: DragEvent) => drop(e, i),
            }}
          />
        ))}
        {!q && (
          <button className={`tile tile-add ${overIndex === buttons.length ? "drop-hint" : ""}`} title="Add a button"
            onClick={() => app.setOverlay({ kind: "button", pageId: page.id, buttonId: null })}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(DND_TYPE)) { e.preventDefault(); setOverIndex(buttons.length); } }}
            onDrop={(e) => drop(e, buttons.length)}>
            <span className="tile-icon"><Glyph name="plus" size={22} /></span>
            <span className="tile-label">Add</span>
          </button>
        )}
        {q && buttons.length === 0 && <p className="empty">No buttons match “{filter}”.</p>}
      </section>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </>
  );
}
