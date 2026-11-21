import { createContext, useContext } from "react";
import type { Config, DisplayState, LauncherButton, Page, Profile, ToolPanel } from "../types";
import type { MonitorInfo } from "../lib/api";

export type Overlay =
  | { kind: "settings"; tab?: string }
  | { kind: "button"; pageId: string; buttonId: string | null }
  | { kind: "sequence"; sequenceId: string | null }
  | { kind: "tools"; tab?: ToolPanel }
  | { kind: "alarm"; id: string; label: string; alarmKind: string }
  | { kind: "flyout"; buttonId: string }
  | null;

export interface RunState { buttonId: string; name: string; index: number; total: number; label: string }
export interface Toast { id: number; kind: "info" | "success" | "error"; title: string; detail?: string }

export interface AppApi {
  config: Config;
  update: (fn: (c: Config) => Config) => void;
  replace: (c: Config) => Promise<void>;
  page: Page;
  setPage: (id: string) => void;
  run: (button: LauncherButton) => void;
  running: RunState | null;
  cancelRun: () => void;
  overlay: Overlay;
  setOverlay: (o: Overlay) => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  toast: (t: Omit<Toast, "id">) => void;
  hotkeyFailures: string[];
  flashStatus: "idle" | "ok" | "error";
  /** Re-applies the native window geometry (after editing size/position settings). */
  reapplyGeometry: () => void;
  /** Windows name of the monitor this launcher window is on. */
  display: string;
  isMain: boolean;
  monitors: MonitorInfo[];
  /** Profile used on this monitor (mode + pages). */
  profile: Profile;
  /** Pages this monitor's profile shows. */
  visiblePages: Page[];
  updateProfile: (fn: (p: Profile) => Profile) => void;
  updateDisplay: (fn: (d: DisplayState) => DisplayState) => void;
  openPanel: (panel: ToolPanel) => void;
  /** Opens a button's dropdown next to the tile (or full-panel in compact modes). */
  openFlyout: (button: LauncherButton, anchor: DOMRect) => void;
  /** Effective sidebar side on this monitor (per-monitor override or the profile's). */
  sidebarSide: "left" | "right";
  /** Sidebar is collapsed into the thin edge dock (auto-hide). */
  sidebarHidden: boolean;
  setSidebarRevealed: (v: boolean) => void;
  /** Sidebar is pinned (its screen strip is reserved). */
  pinned: boolean;
  /** This monitor's saved state (second mode, sidebar side…). */
  ds?: import("../types").DisplayState;
  /** True in the window that shows the monitor's second mode. */
  isSecond?: boolean;
  /** Notch only: grow the window downward by this many px so a dropdown fits (0 = back to normal). */
  requestSpace?: (px: number) => void;
  /** Notch only: the notch's own height while extra space is reserved below it. */
  notchHeight?: number;
}

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}

/** Immutable helpers for editing the configuration. */
export const edit = {
  page(c: Config, pageId: string, fn: (p: Page) => Page): Config {
    return { ...c, pages: c.pages.map((p) => (p.id === pageId ? fn(p) : p)) };
  },
  findButton(c: Config, buttonId: string): { page: Page; button: LauncherButton; index: number } | null {
    for (const page of c.pages) {
      const index = page.buttons.findIndex((b) => b.id === buttonId);
      if (index >= 0) return { page, button: page.buttons[index], index };
    }
    return null;
  },
  moveButton(c: Config, buttonId: string, toPageId: string, toIndex?: number): Config {
    const found = edit.findButton(c, buttonId);
    if (!found) return c;
    const pages = c.pages.map((p) => ({ ...p, buttons: p.buttons.filter((b) => b.id !== buttonId) }));
    return {
      ...c,
      pages: pages.map((p) => {
        if (p.id !== toPageId) return p;
        const list = [...p.buttons];
        list.splice(toIndex ?? list.length, 0, found.button);
        return { ...p, buttons: list };
      }),
    };
  },
};
