import { useEffect } from "react";
import { useApp } from "../app/context";
import { ActionEditor } from "../editor/ActionEditor";
import { SettingsView } from "../settings/SettingsView";
import { ToolsView } from "../tools/ToolsView";
import { AlarmRing } from "../tools/AlarmRing";
import { FlyoutBody } from "../components/AppFlyout";
import { Brand, Fx, IconButton, resizeFrom } from "./shared";

/** Settings and editors. In compact modes the window temporarily becomes a panel. */
export function OverlayView() {
  const app = useApp();
  const o = app.overlay!;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && (o.kind === "settings" || o.kind === "tools") && !(e.target as HTMLElement).closest("input,textarea,select")) app.setOverlay(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [o, app]);
  const flyBtn = o.kind === "flyout" ? app.config.pages.flatMap((p) => p.buttons).find((b) => b.id === o.buttonId) : undefined;
  const title = o.kind === "flyout" ? flyBtn?.label ?? "Menu" : o.kind === "settings" ? "Settings" : o.kind === "sequence" ? "Sequence" : o.kind === "tools" ? "Tools" : o.kind === "alarm" ? "Alarm" : "Button";
  if (o.kind === "alarm") return <AlarmRing id={o.id} label={o.label} kind={o.alarmKind} />;
  return (
    <main className="panel floating overlay">
      <Fx />
      <header className="titlebar" data-tauri-drag-region>
        <IconButton icon="chevron-left" label="Back" onClick={() => app.setOverlay(null)} />
        <Brand><span className="crumb" data-tauri-drag-region>/ {title}</span></Brand>
        <div className="window-actions">
          <IconButton icon="x" label="Close" onClick={() => app.setOverlay(null)} />
        </div>
      </header>
      {o.kind === "flyout" ? (flyBtn?.flyout ? <div className="settings-body flyout-page"><FlyoutBody button={flyBtn} onDone={() => app.setOverlay(null)} /></div> : null) : o.kind === "settings" ? <SettingsView initialTab={o.tab} /> : o.kind === "tools" ? <ToolsView initialTab={o.tab} /> : <ActionEditor key={o.kind === "button" ? `b-${o.buttonId ?? "new"}-${o.pageId}` : `s-${o.kind === "sequence" ? o.sequenceId ?? "new" : "x"}`} />}
      <div className="resize-corner" onMouseDown={() => resizeFrom("SouthEast")} aria-hidden="true" />
    </main>
  );
}
