import type { CSSProperties, ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useApp } from "../app/context";
import { Glyph } from "../components/Icon";
import { isDesktop } from "../lib/api";
import { GRADIENTS } from "../lib/theme";
import { BackgroundFx } from "../components/BackgroundFx";
import type { DisplayMode, Page } from "../types";

export const MODES: { value: DisplayMode; label: string; icon: string; detail: string }[] = [
  { value: "floating", label: "Floating panel", icon: "panel", detail: "Resizable, draggable grid" },
  { value: "sidebar", label: "Slim sidebar", icon: "sidebar", detail: "Docked vertical launcher" },
  { value: "notch", label: "Top notch", icon: "notch", detail: "Expandable top command bar" },
  { value: "button", label: "Tiny button", icon: "dot", detail: "Floating button, radial launcher" },
];

export function pageBackground(p: Page): CSSProperties {
  if (p.background.type === "gradient" && GRADIENTS[p.background.value]) return { backgroundImage: GRADIENTS[p.background.value] };
  if (p.background.type === "image") return { backgroundImage: `linear-gradient(var(--bg), var(--bg)), url("${p.background.value}")`, backgroundSize: "cover", backgroundPosition: "center" };
  return {};
}

export const hideWindow = () => { if (isDesktop()) void getCurrentWindow().hide(); };
export const resizeFrom = (dir: "SouthEast") => { if (isDesktop()) void getCurrentWindow().startResizeDragging(dir); };

/** The animated background effect chosen in Settings → Appearance. */
export function Fx() {
  const s = useApp().config.settings;
  return <BackgroundFx effect={s.effect} intensity={s.effectIntensity} animations={s.animations} />;
}

export function RunBar() {
  const { running, cancelRun } = useApp();
  if (!running) return null;
  return (
    <div className="runbar" role="status">
      <span className="spinner" />
      <span className="runbar-text"><b>{running.name}</b> · step {running.index + 1}/{running.total}{running.label ? `: ${running.label}` : ""}</span>
      <button onClick={cancelRun}>Cancel</button>
    </div>
  );
}

export function IconButton({ icon, label, onClick, active, size = 16 }: { icon: string; label: string; onClick: (e: React.MouseEvent) => void; active?: boolean; size?: number }) {
  return (
    <button className={`icon-btn ${active ? "active" : ""}`} onClick={onClick} title={label} aria-label={label} onMouseDown={(e) => e.stopPropagation()}>
      <Glyph name={icon} size={size} />
    </button>
  );
}

export function Brand({ children }: { children?: ReactNode }) {
  return (
    <div className="brand" data-tauri-drag-region>
      <span className="brand-mark" data-tauri-drag-region><Glyph name="grid" size={13} stroke={2.2} /></span>
      <span data-tauri-drag-region>Command Centre</span>
      {children}
    </div>
  );
}
