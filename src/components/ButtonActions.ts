import { edit, AppApi } from "../app/context";
import { confirmDialog } from "../lib/executor";
import { uid } from "../lib/schema";
import type { LauncherButton } from "../types";
import type { MenuItem } from "./ContextMenu";

export function duplicateButton(app: AppApi, b: LauncherButton) {
  app.update((c) => {
    const f = edit.findButton(c, b.id);
    if (!f) return c;
    const copy: LauncherButton = { ...structuredClone(b), id: uid(), label: `${b.label} copy`, hotkey: undefined, steps: b.steps.map((st) => ({ ...st, id: uid() })) };
    return edit.page(c, f.page.id, (p) => { const list = [...p.buttons]; list.splice(f.index + 1, 0, copy); return { ...p, buttons: list }; });
  });
}

export async function deleteButton(app: AppApi, b: LauncherButton) {
  if (!(await confirmDialog(`Delete the button "${b.label}"? This cannot be undone (automatic backups are kept daily).`, "Delete button", "Delete"))) return;
  app.update((c) => ({ ...c, pages: c.pages.map((p) => ({ ...p, buttons: p.buttons.filter((x) => x.id !== b.id) })) }));
}

export function buttonMenu(app: AppApi, b: LauncherButton, pageId: string): MenuItem[] {
  return [
    { label: "Run", icon: "play", onSelect: () => app.run(b) },
    { label: "Edit…", icon: "edit", onSelect: () => app.setOverlay({ kind: "button", pageId, buttonId: b.id }) },
    { label: "Duplicate", icon: "copy", onSelect: () => duplicateButton(app, b) },
    {
      label: "Move to page", icon: "arrow-right",
      submenu: app.config.pages.map((p) => ({ label: p.name, icon: p.icon, disabled: p.id === pageId, onSelect: () => app.update((c) => edit.moveButton(c, b.id, p.id)) })),
    },
    { label: "Delete", icon: "trash", danger: true, onSelect: () => void deleteButton(app, b) },
  ];
}
