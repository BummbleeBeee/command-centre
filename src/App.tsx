import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";
import { AppContext, AppApi, Overlay, RunState, Toast } from "./app/context";
import { resolveAction, runAction, RunResult } from "./engine/runner";
import { api, isDesktop, ModeRequest, MonitorInfo } from "./lib/api";
import { createExecutor } from "./lib/executor";
import { applyHotkeys } from "./lib/hotkeys";
import { isMainWindow, useConfigStore, windowLabel } from "./lib/store";
import type { Config, DisplayMode, DisplayState, LauncherButton, Profile, ToolPanel } from "./types";
import { FloatingMode } from "./modes/FloatingMode";
import { SidebarMode } from "./modes/SidebarMode";
import { NotchMode } from "./modes/NotchMode";
import { TinyButtonMode } from "./modes/TinyButtonMode";
import { OverlayView } from "./modes/OverlayView";
import { Toasts } from "./components/Toasts";
import { AppFlyout } from "./components/AppFlyout";
import { applyTheme } from "./lib/theme";
import { NOTCH, notchExpandedSize } from "./lib/notch";
import { enabledMonitors, panelRect, reconcileDisplays, secondMonitors } from "./lib/monitors";
import { HubRoot } from "./tools/HubView";

const IS_HUB = new URLSearchParams(window.location.search).has("hub");

export default function App() {
  return IS_HUB ? <HubRoot /> : <Launcher />;
}

function Launcher() {
  const store = useConfigStore();
  if (!store.config) return <div className="boot" />;
  return <Shell store={store as ReturnType<typeof useConfigStore> & { config: Config }} />;
}

const URL_DISPLAY = new URLSearchParams(window.location.search).get("display");
/** This window shows the monitor's second mode (e.g. the notch beside a sidebar). */
const URL_SECOND = new URLSearchParams(window.location.search).get("second") === "1";
const URL_PANEL = (() => { try { const p = new URLSearchParams(window.location.search).get("panel"); return p ? (JSON.parse(p) as Overlay) : null; } catch { return null; } })();

function Shell({ store }: { store: ReturnType<typeof useConfigStore> & { config: Config } }) {
  const { config, update, replace } = store;
  const s = config.settings;
  const isMain = isMainWindow();
  /** The separate Settings/Tools window opened beside a sidebar / notch / tiny button. */
  const isPanel = isDesktop() && windowLabel() === "panel";
  const [overlay, setOverlayRaw] = useState<Overlay>(isPanel ? URL_PANEL : null);
  const [sidebarRevealed, setSidebarRevealed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState<RunState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [flashStatus, setFlash] = useState<"idle" | "ok" | "error">("idle");
  const [hotkeyFailures, setHotkeyFailures] = useState<string[]>([]);
  const [geometryNonce, setGeometryNonce] = useState(0);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [flyout, setFlyout] = useState<{ buttonId: string; anchor: DOMRect } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  // ------------------------------------------------------------ which monitor / profile is this window?
  useEffect(() => {
    if (!isDesktop()) return;
    const load = () => api.listMonitors().then((m) => setMonitors((old) => (JSON.stringify(old) === JSON.stringify(m) ? old : m))).catch(() => undefined);
    void load();
    if (!isMain) return;
    const t = window.setInterval(load, 10_000); // notices monitors being plugged in or removed
    return () => window.clearInterval(t);
  }, [isMain]);

  const assigned = useMemo(() => enabledMonitors(config, monitors), [config, monitors]);
  const display = URL_DISPLAY ?? assigned[0] ?? "";
  const displayRef = useRef(display);
  displayRef.current = display;
  const ds: DisplayState = config.displays[display] ?? { enabled: true, profileId: config.profiles[0].id };
  const profile: Profile = config.profiles.find((p) => p.id === ds.profileId) ?? config.profiles[0];
  const visiblePages = profile.pageIds.length ? config.pages.filter((p) => profile.pageIds.includes(p.id)) : config.pages;
  const pagesShown = visiblePages.length ? visiblePages : config.pages;
  const page = pagesShown.find((p) => p.id === ds.activePageId) ?? pagesShown.find((p) => p.id === config.activePageId) ?? pagesShown[0];

  // Follow monitors that Windows renamed, and remember where each monitor is.
  useEffect(() => {
    if (!isDesktop() || !isMain || !monitors.length) return;
    const fixed = reconcileDisplays(configRef.current.displays, monitors);
    if (fixed) update((c) => ({ ...c, displays: fixed }));
  }, [monitors, isMain, update]);

  // Main window opens/closes one launcher window per additional enabled monitor.
  const seconds = secondMonitors(config, assigned);
  const extraKey = JSON.stringify([assigned.slice(1), seconds]);
  useEffect(() => {
    if (!isDesktop() || !isMain || !monitors.length) return;
    void api.syncDisplayWindows(assigned.slice(1), seconds).catch((e) => toast({ kind: "error", title: "Monitors", detail: (e as Error).message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraKey, isMain, monitors.length]);

  const updateDisplay = useCallback((fn: (d: DisplayState) => DisplayState) => {
    const name = displayRef.current;
    if (!name) return;
    update((c) => {
      const cur = c.displays[name] ?? { enabled: true, profileId: c.profiles[0].id };
      return { ...c, displays: { ...c.displays, [name]: fn(cur) } };
    });
  }, [update]);
  const updateProfile = useCallback((fn: (p: Profile) => Profile) => {
    const id = profile.id;
    update((c) => ({ ...c, profiles: c.profiles.map((p) => (p.id === id ? fn(p) : p)) }));
  }, [update, profile.id]);

  /** The mode this window shows when no screen is open over it. */
  const baseMode: DisplayMode = URL_SECOND ? ds.secondMode ?? "button" : profile.displayMode;
  const mode: DisplayMode = isPanel || overlay ? "floating" : baseMode;
  const sidebarSide = ds.sidebarSide ?? profile.sidebarSide;
  const pinned = mode === "sidebar" && s.sidebarPinned;
  const sidebarHidden = mode === "sidebar" && s.sidebarAutoHide && !pinned && !sidebarRevealed && !expanded;
  // In compact modes, settings/tools/editors open in their own window so the launcher stays open.
  const setOverlay = useCallback((o: Overlay) => {
    if (!isPanel && o && isDesktop() && baseMode !== "floating") {
      void api.openPanelWindow(JSON.stringify(o), displayRef.current || undefined).catch(() => setOverlayRaw(o));
      return;
    }
    setOverlayRaw(o);
  }, [isPanel, baseMode]);
  useEffect(() => {
    if (!isPanel) return;
    if (overlay === null) {
      // Save first: edits are written with a short delay, and closing the window would drop them.
      void store.flush().finally(() => window.setTimeout(() => void getCurrentWindow().destroy(), 150));
      return;
    }
    const un = listen<string>("panel-overlay", (e) => { try { setOverlayRaw(JSON.parse(e.payload) as Overlay); } catch { /* ignore */ } });
    return () => { void un.then((f) => f()); };
  }, [isPanel, overlay]);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.kind === "error" ? 9000 : 3500);
  }, []);

  useEffect(() => { store.notices.forEach((n) => toast({ kind: "info", title: "Configuration", detail: n })); }, [store.notices, toast]);
  useEffect(() => { if (store.saveError) toast({ kind: "error", title: "Could not save settings", detail: store.saveError }); }, [store.saveError, toast]);

  const setPage = useCallback((id: string) => {
    updateDisplay((d) => ({ ...d, activePageId: id }));
    update((c) => (c.activePageId === id ? c : { ...c, activePageId: id }));
  }, [update, updateDisplay]);

  // ------------------------------------------------------------ window geometry
  const suppressMovesUntil = useRef(0);
  const shown = useRef(false);
  const [extraSpace, setExtraSpace] = useState(0);
  const requestSpace = useCallback((px: number) => setExtraSpace(Math.max(0, Math.min(500, Math.ceil(px)))), []);
  useEffect(() => { if (!expanded) setExtraSpace(0); }, [expanded]);
  const notchBase = notchExpandedSize(page.buttons.length, s.showWidgets && s.widgets, pagesShown.map((p) => p.name));
  const notchExpanded = { ...notchBase, height: notchBase.height + extraSpace };
  const notchCollapsed = s.notchStyle === "line" ? { width: 220, height: 10 } : NOTCH.collapsed;
  // Only geometry that matters for the current mode may re-trigger a resize (avoids snapping the panel back).
  const geometryKey = mode === "notch" ? `${notchExpanded.width}x${notchExpanded.height}|${notchCollapsed.width}` : mode === "sidebar" ? `${sidebarSide}|${sidebarHidden}|${pinned}` : "";
  const ready = !isDesktop() || !!display || monitors.length > 0;
  useEffect(() => {
    if (!isDesktop() || !ready) return;
    const c = configRef.current;
    const d = c.displays[displayRef.current];
    const first = isMain; // the legacy single-window position belongs to the main window
    const req: ModeRequest = {
      mode,
      expanded,
      alwaysOnTop: c.settings.alwaysOnTop,
      floating: isPanel ? panelRect(c.window.panel, monitors.find((m) => m.name === displayRef.current)) : URL_SECOND ? d?.secondFloating : d?.floating ?? (first ? c.window.floating : undefined),
      floatingDefault: isPanel ? { width: 760, height: 600 } : { width: 700, height: 560 },
      sidebarSide,
      sidebarWidth: sidebarHidden ? 12 : 78,
      sidebarExpandedWidth: 250,
      notchSize: notchCollapsed,
      notchExpandedSize: notchExpanded,
      buttonSize: 62,
      buttonExpandedSize: { width: 360, height: 360 },
      buttonPosition: URL_SECOND ? d?.secondButtonPosition : d?.buttonPosition ?? (first ? c.window.buttonPosition : undefined),
      monitor: displayRef.current || undefined,
      pinnedWidth: pinned && expanded ? 78 : undefined,
    };
    suppressMovesUntil.current = Date.now() + 800;
    const place = pinned && !expanded
      ? api.appbarSet(sidebarSide, 78, displayRef.current || undefined)
      : api.applyWindowMode(req);
    place
      .then(() => {
        if (!shown.current) {
          shown.current = true;
          return api.showMainWindow(isMain || isPanel);
        }
      })
      .catch((e) => toast({ kind: "error", title: "Window mode", detail: (e as Error).message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, expanded, geometryKey, s.alwaysOnTop, geometryNonce, display, ready, toast]);

  useEffect(() => { setExpanded(false); }, [baseMode, overlay]);
  // Give the reserved strip back when the sidebar is unpinned or another mode is chosen.
  useEffect(() => { if (isDesktop() && !pinned && !isPanel) void api.appbarRemove().catch(() => undefined); }, [pinned, isPanel]);

  // Remember floating bounds and tiny-button position (per monitor) after the user moves/resizes.
  useEffect(() => {
    if (!isDesktop()) return;
    const w = getCurrentWindow();
    let t: number | undefined;
    const save = () => {
      window.clearTimeout(t);
      t = window.setTimeout(async () => {
        if (Date.now() < suppressMovesUntil.current) return;
        const pos = await w.outerPosition();
        if (pos.x < -10000 || pos.y < -10000) return; // minimised
        if (await w.isMaximized().catch(() => false)) return; // never remember a maximised size
        if (modeRef.current === "floating") {
          const size = await w.outerSize();
          const rect = { x: pos.x, y: pos.y, width: size.width, height: size.height };
          if (windowLabel() === "panel") update((c) => ({ ...c, window: { ...c.window, panel: rect } }));
          else updateDisplay((d) => (URL_SECOND ? { ...d, secondFloating: rect } : { ...d, floating: rect }));
        } else if (modeRef.current === "button" && !expandedRef.current) {
          updateDisplay((d) => (URL_SECOND ? { ...d, secondButtonPosition: { x: pos.x, y: pos.y } } : { ...d, buttonPosition: { x: pos.x, y: pos.y } }));
        }
      }, 450);
    };
    const unMoved = w.onMoved(save);
    const unResized = w.onResized(save);
    return () => { void unMoved.then((f) => f()); void unResized.then((f) => f()); window.clearTimeout(t); };
  }, [updateDisplay]);

  // Collapse the notch / tiny button when the user clicks elsewhere.
  useEffect(() => {
    if (!isDesktop()) return;
    const un = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused && (modeRef.current === "button" || modeRef.current === "notch")) setExpanded(false);
    });
    return () => { void un.then((f) => f()); };
  }, []);

  // ------------------------------------------------------------ appearance
  useEffect(() => { applyTheme(s, mode); }, [s, mode]);
  useEffect(() => {
    if (!isDesktop()) return;
    const w = getCurrentWindow();
    const blur = s.nativeBlur && (mode === "floating" || mode === "sidebar");
    (blur ? w.setEffects({ effects: [Effect.Acrylic] }) : w.clearEffects()).catch(() => undefined);
  }, [s.nativeBlur, mode]);

  // ------------------------------------------------------------ running actions
  const openPanel = useCallback((panel: ToolPanel) => setOverlay({ kind: "tools", tab: panel }), [setOverlay]);
  const executor = useMemo(() => createExecutor((id) => setPage(id), openPanel), [setPage, openPanel]);

  const report = useCallback((name: string, res: RunResult, quiet = false) => {
    const failures = res.log.filter((l) => l.status === "failed");
    const collapsedSmall = (modeRef.current === "button" || modeRef.current === "notch") && !expandedRef.current;
    if (res.status === "completed") {
      setFlash("ok");
      if (quiet || !configRef.current.settings.showSuccessToasts) { window.setTimeout(() => setFlash("idle"), 1400); return; }
      const skipped = res.log.filter((l) => l.status === "skipped").length;
      toast({ kind: "success", title: name, detail: skipped ? `Done (${skipped} step${skipped > 1 ? "s" : ""} skipped)` : "Done" });
    } else if (res.status === "cancelled") {
      toast({ kind: "info", title: name, detail: "Cancelled" });
    } else {
      setFlash("error");
      const detail = failures.map((f) => `${f.label}: ${f.message}`).join("\n");
      toast({ kind: "error", title: res.status === "failed" ? `${name} stopped` : `${name} finished with errors`, detail });
      if (collapsedSmall && isDesktop()) void message(detail, { title: `${name}: problem`, kind: "error" });
    }
    window.setTimeout(() => setFlash("idle"), 1400);
  }, [toast]);

  const run = useCallback(async (button: LauncherButton) => {
    if (abortRef.current) {
      toast({ kind: "info", title: "Please wait", detail: "Another action is still running." });
      return;
    }
    const c = configRef.current;
    const def = resolveAction(button, c);
    if (def.steps.length === 0) {
      toast({ kind: "info", title: def.name, detail: "This button has no steps yet. Right-click it to edit." });
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning({ buttonId: button.id, name: def.name, index: 0, total: def.steps.length, label: "" });
    try {
      const res = await runAction(def, {
        config: c,
        exec: executor,
        signal: ac.signal,
        onStep: (index, total, label) => setRunning((r) => (r ? { ...r, index, total, label } : r)),
        riskyNeedsConfirm: (a) => configRef.current.settings.confirmSystemActions && (a === "lock" || a === "sleep"),
      });
      const stays = def.steps.every((st) => st.type === "page" || st.type === "panel");
      report(def.name, res, stays);
      if (res.status === "completed" && !stays) {
        if (modeRef.current === "button" || modeRef.current === "notch") setExpanded(false);
        if (configRef.current.settings.hideAfterLaunch && modeRef.current === "floating" && isDesktop()) void getCurrentWindow().hide();
      }
    } finally {
      abortRef.current = null;
      setRunning(null);
    }
  }, [executor, report, toast]);

  const cancelRun = useCallback(() => abortRef.current?.abort(), []);

  // ------------------------------------------------------------ hotkeys, tray and alarms
  const toggleVisible = useCallback(async () => {
    if (!isDesktop()) return;
    const w = getCurrentWindow();
    const visible = await w.isVisible();
    if (modeRef.current === "button" || modeRef.current === "notch") {
      await api.showMainWindow(isMain);
      setExpanded((e) => !(visible && e));
      return;
    }
    if (visible) await w.hide();
    else await api.showMainWindow(isMain);
  }, [isMain]);

  useEffect(() => {
    if (!isDesktop()) return;
    const un = listen("cc-toggle", () => void toggleVisible());
    return () => { void un.then((f) => f()); };
  }, [toggleVisible]);

  const hotkeySignature = JSON.stringify([
    s.hotkeysEnabled, s.toggleHotkey,
    config.pages.flatMap((p) => p.buttons.filter((b) => b.hotkey).map((b) => [b.id, b.hotkey])),
  ]);
  useEffect(() => {
    if (!isMain) return; // global hotkeys are owned by the main window
    const c = configRef.current;
    if (!c.settings.hotkeysEnabled) { void applyHotkeys([]).then(() => setHotkeyFailures([])); return; }
    const bindings = [
      { accelerator: c.settings.toggleHotkey, run: () => void emit("cc-toggle") },
      ...c.pages.flatMap((p) => p.buttons.filter((b) => b.hotkey).map((b) => ({
        accelerator: b.hotkey!, run: () => { const fresh = configRef.current.pages.flatMap((x) => x.buttons).find((x) => x.id === b.id); if (fresh) void run(fresh); },
      }))),
    ];
    void applyHotkeys(bindings).then(setHotkeyFailures);
  }, [hotkeySignature, run, isMain]);

  // The detachable hub circle is its own window, opened/closed by the main window.
  useEffect(() => {
    if (!isDesktop() || !isMain) return;
    void api.setHubWindow(config.hub.enabled).catch((e) => toast({ kind: "error", title: "Hub circle", detail: (e as Error).message }));
  }, [config.hub.enabled, isMain, toast]);

  // Alarms live in the Rust scheduler so they ring even while every window is hidden.
  const alarmKey = JSON.stringify(config.alarms);
  useEffect(() => {
    if (!isDesktop() || !isMain) return;
    void api.setAlarms(configRef.current.alarms.map(({ id, label, time, days, enabled }) => ({ id, label, time, days, enabled }))).catch(() => undefined);
  }, [alarmKey, isMain]);

  useEffect(() => {
    if (!isDesktop() || !isMain) return;
    const subs = [
      listen<string>("tray-mode", (e) => {
        setOverlay(null);
        updateProfile((p) => ({ ...p, displayMode: e.payload as DisplayMode }));
      }),
      listen("tray-open-settings", () => setOverlay({ kind: "settings" })),
      listen("tray-toggle-hub", () => update((c) => ({ ...c, hub: { ...c.hub, enabled: !c.hub.enabled } }))),
      listen<ToolPanel>("hub-open-panel", (e) => { setOverlay({ kind: "tools", tab: e.payload }); void api.showMainWindow(true); }),
      listen<Overlay>("hub-overlay", (e) => { setOverlay(e.payload); void api.showMainWindow(true); }),
      listen("tray-toggle-hotkeys", () => {
        const next = !configRef.current.settings.hotkeysEnabled;
        update((c) => ({ ...c, settings: { ...c.settings, hotkeysEnabled: next } }));
        toast({ kind: "info", title: next ? "Global hotkeys resumed" : "Global hotkeys paused" });
      }),
      listen<{ id: string; label: string; kind: string }>("alarm-fired", (e) => {
        const { id, label, kind } = e.payload;
        setOverlay({ kind: "alarm", id, label, alarmKind: kind });
        void api.showMainWindow(true);
        // One-time alarms switch themselves off after ringing.
        update((c) => (c.alarms.some((a) => a.id === id && a.once) ? { ...c, alarms: c.alarms.map((a) => (a.id === id ? { ...a, enabled: false } : a)) } : c));
      }),
    ];
    return () => subs.forEach((p) => void p.then((f) => f()));
  }, [update, updateProfile, toast, isMain]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (overlay) return; // overlays handle their own Escape
      if (modeRef.current === "button" || modeRef.current === "notch") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay]);

  const ctx: AppApi = {
    config, update, replace, page, setPage, run: (b) => void run(b), running, cancelRun, overlay, setOverlay,
    expanded, setExpanded, toast, hotkeyFailures, flashStatus,
    reapplyGeometry: () => setGeometryNonce((n) => n + 1),
    display, isMain, monitors, profile, visiblePages: pagesShown, updateProfile, updateDisplay, openPanel,
    sidebarSide, sidebarHidden, setSidebarRevealed, pinned,
    ds, isSecond: URL_SECOND,
    requestSpace: mode === "notch" ? requestSpace : undefined,
    notchHeight: mode === "notch" && extraSpace ? notchBase.height : undefined,
    openFlyout: (b, anchor) => {
      if (mode === "floating" || (mode === "sidebar" && expanded)) setFlyout({ buttonId: b.id, anchor });
      else setOverlay({ kind: "flyout", buttonId: b.id });
    },
  };
  const flyButton = flyout ? config.pages.flatMap((p) => p.buttons).find((b) => b.id === flyout.buttonId && b.flyout) : undefined;

  return (
    <AppContext.Provider value={ctx}>
      <div className={`app mode-${mode} ${expanded ? "is-expanded" : "is-collapsed"}`} onContextMenu={(e) => e.preventDefault()}>
        {overlay ? <OverlayView /> : mode === "floating" ? <FloatingMode /> : mode === "sidebar" ? <SidebarMode /> : mode === "notch" ? <NotchMode /> : <TinyButtonMode />}
        {flyButton && flyout && !overlay && <AppFlyout button={flyButton} anchor={flyout.anchor} onClose={() => setFlyout(null)} />}
        {(mode === "floating" || mode === "sidebar" || expanded) && <Toasts toasts={toasts} onDismiss={(id) => setToasts((l) => l.filter((t) => t.id !== id))} />}
      </div>
    </AppContext.Provider>
  );
}
