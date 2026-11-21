import { useState } from "react";
import { edit, useApp } from "../app/context";
import { confirmDialog } from "../lib/executor";
import { uid } from "../lib/schema";
import type { Page } from "../types";
import { DND_TYPE } from "./ButtonGrid";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { Glyph } from "./Icon";

export function usePageActions() {
  const app = useApp();
  const add = () => {
    const id = uid();
    app.update((c) => ({ ...c, activePageId: id, pages: [...c.pages, { id, name: `Page ${c.pages.length + 1}`, icon: "grid", columns: 4, background: { type: "none", value: "" }, buttons: [] }] }));
    return id;
  };
  const duplicate = (p: Page) => {
    const id = uid();
    const copy: Page = { ...structuredClone(p), id, name: `${p.name} copy`, buttons: p.buttons.map((b) => ({ ...structuredClone(b), id: uid(), hotkey: undefined })) };
    app.update((c) => { const i = c.pages.findIndex((x) => x.id === p.id); const pages = [...c.pages]; pages.splice(i + 1, 0, copy); return { ...c, pages, activePageId: id }; });
  };
  const remove = async (p: Page) => {
    if (app.config.pages.length <= 1) { app.toast({ kind: "info", title: "Keep at least one page" }); return; }
    if (!(await confirmDialog(`Delete the page "${p.name}" and its ${p.buttons.length} button(s)?`, "Delete page", "Delete"))) return;
    app.update((c) => {
      const pages = c.pages.filter((x) => x.id !== p.id);
      return { ...c, pages, activePageId: c.activePageId === p.id ? pages[0].id : c.activePageId };
    });
  };
  const move = (p: Page, dir: -1 | 1) => app.update((c) => {
    const i = c.pages.findIndex((x) => x.id === p.id);
    const j = i + dir;
    if (j < 0 || j >= c.pages.length) return c;
    const pages = [...c.pages];
    [pages[i], pages[j]] = [pages[j], pages[i]];
    return { ...c, pages };
  });
  const rename = (p: Page, name: string) => app.update((c) => edit.page(c, p.id, (x) => ({ ...x, name: name.trim() || x.name })));
  return { add, duplicate, remove, move, rename };
}

/** Right-click menu for a page, used by tabs, notch chips, sidebar pages and the radial menu. */
export function usePageMenu() {
  const app = useApp();
  const actions = usePageActions();
  return (p: Page, onRename?: () => void): MenuItem[] => [
    { label: "Rename…", icon: "edit", onSelect: () => (onRename ? onRename() : app.setOverlay({ kind: "settings", tab: "pages" })) },
    { label: "Duplicate", icon: "copy", onSelect: () => actions.duplicate(p) },
    { label: "Move left", icon: "chevron-left", onSelect: () => actions.move(p, -1) },
    { label: "Move right", icon: "chevron-right", onSelect: () => actions.move(p, 1) },
    { label: "New page", icon: "plus", onSelect: () => actions.add() },
    { label: "Manage all pages…", icon: "settings", onSelect: () => app.setOverlay({ kind: "settings", tab: "pages" }) },
    { label: `Delete “${p.name}”`, icon: "trash", danger: true, onSelect: () => void actions.remove(p) },
  ];
}

export function PageTabs() {
  const app = useApp();
  const actions = usePageActions();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);

  const menuFor = usePageMenu();
  const pageMenu = (p: Page): MenuItem[] => menuFor(p, () => setRenaming(p.id));

  return (
    <nav className="tabs" aria-label="Pages">
      {app.visiblePages.map((p) => (
        renaming === p.id ? (
          <input key={p.id} className="tab-rename" autoFocus defaultValue={p.name}
            onBlur={(e) => { actions.rename(p, e.target.value); setRenaming(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} />
        ) : (
          <button key={p.id} className={`tab ${p.id === app.page.id ? "active" : ""} ${dropOn === p.id ? "drop-hint" : ""}`}
            onClick={() => app.setPage(p.id)}
            onDoubleClick={() => setRenaming(p.id)}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, items: pageMenu(p) }); }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(DND_TYPE)) { e.preventDefault(); setDropOn(p.id); } }}
            onDragLeave={() => setDropOn(null)}
            onDrop={(e) => { e.preventDefault(); setDropOn(null); const id = e.dataTransfer.getData(DND_TYPE); if (id) app.update((c) => edit.moveButton(c, id, p.id)); }}
            title="Click to open · double-click to rename · right-click for options · drop a button here to move it">
            <Glyph name={p.icon} size={14} /> {p.name}
          </button>
        )
      ))}
      <button className="tab tab-add" onClick={() => actions.add()} title="New page"><Glyph name="plus" size={14} /></button>
      <button className="tab tab-add" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 4, items: menuFor(app.page, () => setRenaming(app.page.id)) }); }} title="Rename, duplicate or delete this page"><Glyph name="edit" size={13} /></button>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </nav>
  );
}
