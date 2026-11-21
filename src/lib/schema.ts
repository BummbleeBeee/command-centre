import { looksDamaged, repairLabel, repairText } from "./textRepair";
import {
  ActionDef, AiSettings, Flyout, WidgetId, Alarm, ClassEntry, Config, HubSettings, DisplayState, IconRef, LauncherButton, Note, Page, PageBackground, Profile, SCHEMA_VERSION, Sequence, Settings, Step, StepInit, SystemAction, ToolPanel,
} from "../types";

export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);

export const SYSTEM_ACTIONS: { value: SystemAction; label: string; icon: string; risky?: boolean }[] = [
  { value: "show_desktop", label: "Show desktop", icon: "monitor" },
  { value: "task_view", label: "Task view", icon: "layers" },
  { value: "file_explorer", label: "File Explorer", icon: "folder" },
  { value: "task_manager", label: "Task Manager", icon: "activity" },
  { value: "settings", label: "Windows Settings", icon: "settings" },
  { value: "action_center", label: "Quick settings", icon: "sliders" },
  { value: "snip", label: "Screen snip", icon: "scissors" },
  { value: "media_play_pause", label: "Play / pause media", icon: "play" },
  { value: "media_next", label: "Next track", icon: "next" },
  { value: "media_previous", label: "Previous track", icon: "prev" },
  { value: "volume_up", label: "Volume up", icon: "volume-up" },
  { value: "volume_down", label: "Volume down", icon: "volume-down" },
  { value: "volume_mute", label: "Mute / unmute", icon: "mute" },
  { value: "snap_left", label: "Snap window left", icon: "chevron-left" },
  { value: "snap_right", label: "Snap window right", icon: "chevron-right" },
  { value: "maximize_window", label: "Maximise window", icon: "panel" },
  { value: "minimize_window", label: "Minimise window", icon: "minus" },
  { value: "desktop_left", label: "Previous virtual desktop", icon: "layers" },
  { value: "desktop_right", label: "Next virtual desktop", icon: "layers" },
  { value: "lock", label: "Lock PC", icon: "lock", risky: true },
  { value: "sleep", label: "Sleep", icon: "moon", risky: true },
];

export const DEFAULT_SETTINGS: Settings = {
  displayMode: "floating",
  theme: "dark",
  customTheme: { background: "#141a26", surface: "#1f2738", text: "#eef2f8" },
  accent: "#7aa8ff",
  opacity: 88,
  radius: 18,
  animations: "full",
  nativeBlur: false,
  alwaysOnTop: true,
  showLabels: true,
  buttonSize: 88,
  gridGap: 10,
  toggleHotkey: "Ctrl+Alt+Space",
  hotkeysEnabled: true,
  sidebarSide: "right",
  sidebarExpandOnHover: true,
  notchExpandOnHover: true,
  showWidgets: true,
  confirmSystemActions: true,
  hideAfterLaunch: false,
  themePreset: "midnight",
  glass: "frosted",
  backdrop: "",
  effect: "none",
  effectIntensity: 50,
  widgets: ["spotify", "next", "volume", "clock"],
  showSuccessToasts: false,
  animSpeed: 1,
  easing: "smooth",
  slideIn: true,
  sidebarAutoHide: false,
  sidebarPinned: false,
  orbStyle: "light",
  notchStyle: "pill",
};

export const WIDGET_IDS: WidgetId[] = ["spotify", "media", "stats", "volume", "clock", "next", "note", "awake"];

const favourites = (): Flyout => ({
  kind: "items",
  items: [
    { id: uid(), label: "YouTube", step: { id: uid(), type: "url", url: "https://www.youtube.com" } },
    { id: uid(), label: "Gmail", step: { id: uid(), type: "url", url: "https://mail.google.com" } },
    { id: uid(), label: "GitHub", step: { id: uid(), type: "url", url: "https://github.com" } },
    { id: uid(), label: "Wikipedia", step: { id: uid(), type: "url", url: "https://www.wikipedia.org" } },
  ],
});

export const DEFAULT_HUB: HubSettings = { enabled: false, pinned: [], showMusic: true, showNotes: true, showUpcoming: true, desktopMode: false, panelSide: "auto", links: [] };
export const DEFAULT_AI: AiSettings = {
  claudeModel: "claude-opus-5-5",
  openaiModel: "gpt-4o",
  system: "You are a helpful assistant inside a Windows launcher. Answer concisely and use short paragraphs or lists.",
};

const icon = (name: string): IconRef => ({ type: "builtin", name });
const action = (steps: Step[], extra: Partial<ActionDef> = {}): ActionDef => ({ steps, confirm: false, stopOnError: true, ...extra });
const button = (label: string, iconName: string, color: string, steps: Step[], extra: Partial<LauncherButton> = {}): LauncherButton => ({
  id: uid(), label, icon: icon(iconName), color, ...action(steps), ...extra,
});

const s = (step: StepInit): Step => ({ id: uid(), ...step } as Step);

export function defaultConfig(): Config {
  const coding: Sequence = {
    id: "seq-coding", name: "Coding Mode", icon: icon("code"), color: "#7aa8ff",
    ...action([
      s({ type: "launch", path: "", hint: "Visual Studio Code", skipIfRunning: true }),
      s({ type: "launch", path: "wt.exe", skipIfRunning: true }),
      s({ type: "delay", ms: 600 }),
      s({ type: "url", url: "https://github.com" }),
    ], { stopOnError: false }),
  };
  const photo: Sequence = {
    id: "seq-photo", name: "Photography Mode", icon: icon("camera"), color: "#c79bff",
    ...action([
      s({ type: "launch", path: "", hint: "Lightroom|Photoshop|darktable|Affinity Photo|Photos", skipIfRunning: true }),
      s({ type: "folder", path: "%USERPROFILE%\\Pictures" }),
    ], { stopOnError: false }),
  };
  const editing: Sequence = {
    id: "seq-editing", name: "Editing Mode", icon: icon("film"), color: "#ff9a6b",
    ...action([
      s({ type: "launch", path: "", hint: "DaVinci Resolve|Premiere Pro|Clipchamp", skipIfRunning: true }),
      s({ type: "folder", path: "%USERPROFILE%\\Videos" }),
    ], { stopOnError: false }),
  };
  const cleanup: Sequence = {
    id: "seq-cleanup", name: "Clean Up", icon: icon("broom"), color: "#6fd3a5",
    ...action([
      s({ type: "close", process: "Code.exe" }),
      s({ type: "close", process: "Resolve.exe" }),
      s({ type: "close", process: "WindowsTerminal.exe" }),
    ], {
      confirm: true,
      confirmMessage: "Ask VS Code, DaVinci Resolve and Terminal to close? Each app will prompt you to save unsaved work.",
      stopOnError: false,
    }),
  };

  const general: Page = {
    id: "general", name: "General", icon: "grid", columns: 4, background: { type: "none", value: "" },
    buttons: [
      button("Explorer", "folder", "#f5c26b", [s({ type: "system", action: "file_explorer" })]),
      button("Browser", "globe", "#7aa8ff", [s({ type: "url", url: "https://www.google.com" })], { flyout: favourites(), tooltip: "Browser · use the arrow for favourite sites" }),
      button("Terminal", "terminal", "#6fd3a5", [s({ type: "launch", path: "wt.exe" })]),
      button("Settings", "settings", "#a9b4c8", [s({ type: "system", action: "settings" })]),
      button("Snip", "scissors", "#ff8fb1", [s({ type: "system", action: "snip" })]),
      button("Task Manager", "activity", "#ff9a6b", [s({ type: "system", action: "task_manager" })]),
      button("Show Desktop", "monitor", "#8ad0ff", [s({ type: "system", action: "show_desktop" })]),
      button("Play / Pause", "play", "#c79bff", [s({ type: "system", action: "media_play_pause" })]),
      button("Volume −", "volume-down", "#9fb3d9", [s({ type: "volume", mode: "down", value: 10 })]),
      button("Volume +", "volume-up", "#9fb3d9", [s({ type: "volume", mode: "up", value: 10 })]),
      button("Mute", "mute", "#9fb3d9", [s({ type: "volume", mode: "toggleMute" })]),
      button("Lock", "lock", "#ff7b7b", [s({ type: "system", action: "lock" })], { tooltip: "Lock this PC" }),
    ],
  };
  const codingPage: Page = {
    id: "coding", name: "Coding", icon: "code", columns: 4, background: { type: "gradient", value: "aurora" },
    buttons: [
      button("Coding Mode", "zap", "#7aa8ff", [], { sequenceId: coding.id, tooltip: "VS Code, Terminal and GitHub" }),
      button("VS Code", "code", "#4ea0ff", [s({ type: "launch", path: "", hint: "Visual Studio Code" })]),
      button("Terminal", "terminal", "#6fd3a5", [s({ type: "launch", path: "wt.exe" })]),
      button("GitHub", "globe", "#c9d1d9", [s({ type: "url", url: "https://github.com" })]),
      button("Back", "home", "#a9b4c8", [s({ type: "page", pageId: "general" })]),
    ],
  };
  const photoPage: Page = {
    id: "photography", name: "Photography", icon: "camera", columns: 4, background: { type: "gradient", value: "dusk" },
    buttons: [
      button("Photography Mode", "zap", "#c79bff", [], { sequenceId: photo.id }),
      button("Pictures", "image", "#f5c26b", [s({ type: "folder", path: "%USERPROFILE%\\Pictures" })]),
      button("Back", "home", "#a9b4c8", [s({ type: "page", pageId: "general" })]),
    ],
  };
  const editingPage: Page = {
    id: "editing", name: "Editing", icon: "film", columns: 4, background: { type: "gradient", value: "ember" },
    buttons: [
      button("Editing Mode", "zap", "#ff9a6b", [], { sequenceId: editing.id }),
      button("Videos", "film", "#f5c26b", [s({ type: "folder", path: "%USERPROFILE%\\Videos" })]),
      button("Clean Up", "broom", "#6fd3a5", [], { sequenceId: cleanup.id }),
      button("Back", "home", "#a9b4c8", [s({ type: "page", pageId: "general" })]),
    ],
  };
  const toolsPage0 = toolsPage();
  general.buttons.push(
    button("Coding", "code", "#7aa8ff", [s({ type: "page", pageId: "coding" })], { tooltip: "Go to the Coding page" }),
    button("Photography", "camera", "#c79bff", [s({ type: "page", pageId: "photography" })], { tooltip: "Go to the Photography page" }),
    button("Editing", "film", "#ff9a6b", [s({ type: "page", pageId: "editing" })], { tooltip: "Go to the Editing page" }),
    button("Clean Up", "broom", "#6fd3a5", [], { sequenceId: cleanup.id }),
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    window: {},
    activePageId: "general",
    pages: [general, codingPage, photoPage, editingPage, toolsPage0],
    sequences: [coding, photo, editing, cleanup],
    profiles: defaultProfiles(),
    displays: {},
    alarms: [],
    notes: [],
    classes: [],
    hub: { ...DEFAULT_HUB, pinned: [general, codingPage, toolsPage0].flatMap((p) => p.buttons).filter((b) => !b.sequenceId && b.steps.some((s) => s.type === "launch" || s.type === "url" || (s.type === "system" && s.action === "file_explorer"))).slice(0, 8).map((b) => b.id) },
    ai: { ...DEFAULT_AI },
  };
}

export const TOOLS_PAGE_ID = "tools-ai";

/** "Tools & AI" page: Claude, ChatGPT, Spotify, notes, alarms, timers and keep-awake. */
export function toolsPage(): Page {
  return {
    id: TOOLS_PAGE_ID, name: "Tools & AI", icon: "sparkles", columns: 4, background: { type: "gradient", value: "ocean" },
    buttons: [
      button("Claude", "sparkles", "#d97757", [s({ type: "launch", path: "", hint: "Claude", fallbackUrl: "https://claude.ai/new" })], { tooltip: "Open Claude (desktop app if installed, otherwise claude.ai)" }),
      button("ChatGPT", "chat", "#74aa9c", [s({ type: "launch", path: "", hint: "ChatGPT", fallbackUrl: "https://chatgpt.com" })], { tooltip: "Open ChatGPT (desktop app if installed, otherwise chatgpt.com)" }),
      button("Ask AI", "sparkles", "#c79bff", [s({ type: "panel", panel: "ai" })], { tooltip: "Type one question and send it to Claude, ChatGPT or both" }),
      button("Spotify", "music", "#1ed760", [s({ type: "panel", panel: "spotify" })], { tooltip: "Spotify player · use the arrow for playlists", flyout: { kind: "spotify", items: [] } }),
      button("Sticky notes", "edit", "#f5c26b", [s({ type: "panel", panel: "notes" })]),
      button("Alarms & timers", "bell", "#ff8fb1", [s({ type: "panel", panel: "alarms" })]),
      button("Timer 25 min", "clock", "#ff9a6b", [s({ type: "timer", seconds: 1500, label: "Focus timer" })], { tooltip: "Starts a 25-minute timer" }),
      button("Keep awake 1 h", "coffee", "#8ad0ff", [s({ type: "awake", minutes: 60 })], { tooltip: "Stops the PC and screen sleeping for 1 hour" }),
      button("Keep awake", "coffee", "#6fd3a5", [s({ type: "panel", panel: "awake" })], { tooltip: "Choose how long to keep the PC awake" }),
      button("Sleep normally", "moon", "#a9b4c8", [s({ type: "awake", minutes: 0 })], { tooltip: "Turn keep-awake off" }),
    ],
  };
}

export function defaultProfiles(): Profile[] {
  return [
    { id: "main", name: "Main", displayMode: "floating", sidebarSide: "right", pageIds: [] },
    { id: "compact", name: "Compact", displayMode: "button", sidebarSide: "right", pageIds: [] },
    { id: "side", name: "Side launcher", displayMode: "sidebar", sidebarSide: "left", pageIds: [] },
  ];
}

// ------------------------------------------------------------------ validation

export class ConfigError extends Error {
  constructor(public problems: string[]) {
    super(problems.join("\n"));
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number, min: number, max: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
const color = (v: unknown, d: string): string => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d);

function cleanIcon(v: unknown): IconRef {
  if (isObj(v)) {
    if (v.type === "builtin" && typeof v.name === "string") return { type: "builtin", name: v.name };
    if (v.type === "image" && typeof v.data === "string" && v.data.startsWith("data:image/")) return { type: "image", data: v.data };
    if (v.type === "text" && typeof v.value === "string") return { type: "text", value: v.value.slice(0, 3) };
  }
  if (typeof v === "string" && v.length > 0 && v.length <= 3) return { type: "text", value: v };
  return { type: "builtin", name: "zap" };
}

const ACTIONS = SYSTEM_ACTIONS.map((a) => a.value);

function cleanStep(v: unknown, where: string, warnings: string[]): Step | null {
  if (!isObj(v)) {
    warnings.push(`${where}: ignored a step that is not an object.`);
    return null;
  }
  const base = { id: str(v.id) || uid(), enabled: bool(v.enabled, true), continueOnError: bool(v.continueOnError, false) };
  switch (v.type) {
    case "launch":
      return { ...base, type: "launch", path: str(v.path), args: str(v.args) || undefined, cwd: str(v.cwd) || undefined, elevated: bool(v.elevated, false), skipIfRunning: bool(v.skipIfRunning, false), hint: str(v.hint) || undefined, fallbackUrl: str(v.fallbackUrl) || undefined };
    case "folder": return { ...base, type: "folder", path: str(v.path) };
    case "url": return { ...base, type: "url", url: str(v.url) };
    case "close": return { ...base, type: "close", process: str(v.process) };
    case "system":
      if (!ACTIONS.includes(v.action as SystemAction)) {
        warnings.push(`${where}: removed unsupported system control "${String(v.action)}".`);
        return null;
      }
      return { ...base, type: "system", action: v.action as SystemAction };
    case "volume": return { ...base, type: "volume", mode: oneOf(v.mode, ["set", "up", "down", "mute", "unmute", "toggleMute"] as const, "toggleMute"), value: num(v.value, 10, 0, 100) };
    case "brightness": return { ...base, type: "brightness", mode: oneOf(v.mode, ["set", "up", "down"] as const, "up"), value: num(v.value, 10, 0, 100) };
    case "shortcut": return { ...base, type: "shortcut", keys: str(v.keys) };
    case "delay": return { ...base, type: "delay", ms: num(v.ms, 500, 0, 600_000) };
    case "page": return { ...base, type: "page", pageId: str(v.pageId) };
    case "sequence": return { ...base, type: "sequence", sequenceId: str(v.sequenceId) };
    case "confirm": return { ...base, type: "confirm", message: str(v.message, "Continue?") };
    case "if": return { ...base, type: "if", check: oneOf(v.check, ["running", "notRunning"] as const, "running"), process: str(v.process), otherwise: oneOf(v.otherwise, ["skip", "stop"] as const, "skip"), count: num(v.count, 1, 1, 50) };
    case "awake": return { ...base, type: "awake", minutes: num(v.minutes, 60, -1, 10080) };
    case "timer": return { ...base, type: "timer", seconds: num(v.seconds, 300, 1, 604800), label: str(v.label, "Timer") };
    case "panel": return { ...base, type: "panel", panel: oneOf(v.panel, ["spotify", "notes", "alarms", "awake", "ai", "classes", "hub"] as const, "notes") as ToolPanel };
    default:
      warnings.push(`${where}: removed unknown step type "${String(v.type)}".`);
      return null;
  }
}

function cleanAction(v: Obj, where: string, warnings: string[]): ActionDef {
  const steps = Array.isArray(v.steps) ? v.steps.map((x, i) => cleanStep(x, `${where} step ${i + 1}`, warnings)).filter((x): x is Step => !!x) : [];
  return { steps, confirm: bool(v.confirm, false), confirmMessage: str(v.confirmMessage) || undefined, stopOnError: bool(v.stopOnError, true) };
}

function cleanFlyout(v: unknown, where: string, warnings: string[]): Flyout | undefined {
  if (!isObj(v)) return undefined;
  const kind = oneOf(v.kind, ["items", "spotify"] as const, "items");
  const items = (Array.isArray(v.items) ? v.items : []).filter(isObj).map((it, i) => {
    const step = cleanStep(it.step, `${where} dropdown item ${i + 1}`, warnings);
    return step ? { id: str(it.id) || uid(), label: str(it.label, "Item").slice(0, 60), step } : null;
  }).filter((x): x is Flyout["items"][number] => !!x).slice(0, 40);
  return kind === "items" && items.length === 0 ? undefined : { kind, items };
}

/** Name for a button whose saved label was damaged beyond repair, based on what it does. */
function labelFromAction(steps: Step[]): string {
  const st = steps[0];
  if (st?.type === "volume") return st.mode === "down" ? "Volume −" : st.mode === "up" ? "Volume +" : "Mute";
  if (st?.type === "brightness") return st.mode === "down" ? "Brightness −" : "Brightness +";
  return "Untitled";
}

function cleanButton(v: unknown, where: string, warnings: string[]): LauncherButton | null {
  if (!isObj(v)) return null;
  const action = cleanAction(v, where, warnings);
  const rawLabel = str(v.label, "Untitled");
  let label = repairLabel(rawLabel, labelFromAction(action.steps));
  if (looksDamaged(repairText(rawLabel)) && action.steps[0]?.type === "volume") label = labelFromAction(action.steps);
  if (label !== rawLabel) warnings.push(`Repaired the damaged name of a button (now “${label}”).`);
  return {
    flyout: cleanFlyout(v.flyout, where, warnings),
    id: str(v.id) || uid(),
    label: label.slice(0, 60),
    tooltip: str(v.tooltip) ? repairLabel(str(v.tooltip), "") || undefined : undefined,
    icon: cleanIcon(v.icon),
    color: color(v.color, "#7aa8ff"),
    hotkey: str(v.hotkey) || undefined,
    sequenceId: str(v.sequenceId) || undefined,
    ...cleanAction(v, where, warnings),
  };
}

function cleanBackground(v: unknown): PageBackground {
  if (!isObj(v)) return { type: "none", value: "" };
  const type = oneOf(v.type, ["none", "gradient", "image"] as const, "none");
  const value = str(v.value);
  if (type === "image" && !value.startsWith("data:image/")) return { type: "none", value: "" };
  return { type, value };
}

function cleanSettings(v: unknown): Settings {
  const o = isObj(v) ? v : {};
  const d = DEFAULT_SETTINGS;
  const ct = isObj(o.customTheme) ? o.customTheme : {};
  return {
    displayMode: oneOf(o.displayMode, ["floating", "sidebar", "notch", "button"] as const, d.displayMode),
    theme: oneOf(o.theme, ["dark", "light", "custom"] as const, d.theme),
    customTheme: { background: color(ct.background, d.customTheme.background), surface: color(ct.surface, d.customTheme.surface), text: color(ct.text, d.customTheme.text) },
    accent: color(o.accent, d.accent),
    opacity: num(o.opacity, d.opacity, 35, 100),
    radius: num(o.radius, d.radius, 0, 32),
    animations: oneOf(o.animations, ["full", "reduced", "off"] as const, d.animations),
    nativeBlur: bool(o.nativeBlur, d.nativeBlur),
    alwaysOnTop: bool(o.alwaysOnTop, d.alwaysOnTop),
    showLabels: bool(o.showLabels, d.showLabels),
    buttonSize: num(o.buttonSize, d.buttonSize, 56, 140),
    gridGap: num(o.gridGap, d.gridGap, 2, 32),
    toggleHotkey: str(o.toggleHotkey, d.toggleHotkey),
    hotkeysEnabled: bool(o.hotkeysEnabled, d.hotkeysEnabled),
    sidebarSide: oneOf(o.sidebarSide, ["left", "right"] as const, d.sidebarSide),
    sidebarExpandOnHover: bool(o.sidebarExpandOnHover, d.sidebarExpandOnHover),
    notchExpandOnHover: bool(o.notchExpandOnHover, d.notchExpandOnHover),
    showWidgets: bool(o.showWidgets, d.showWidgets),
    confirmSystemActions: bool(o.confirmSystemActions, d.confirmSystemActions),
    hideAfterLaunch: bool(o.hideAfterLaunch, d.hideAfterLaunch),
    themePreset: str(o.themePreset, d.themePreset),
    glass: oneOf(o.glass, ["frosted", "clear", "tinted", "solid", "neon"] as const, d.glass),
    backdrop: str(o.backdrop, d.backdrop),
    effect: oneOf(o.effect, ["none", "rain", "snow", "stars", "aurora", "bubbles", "fireflies", "matrix", "waves"] as const, d.effect),
    effectIntensity: num(o.effectIntensity, d.effectIntensity, 10, 100),
    widgets: Array.isArray(o.widgets) ? [...new Set(o.widgets.filter((w): w is WidgetId => WIDGET_IDS.includes(w as WidgetId)))] : [...d.widgets],
    showSuccessToasts: bool(o.showSuccessToasts, d.showSuccessToasts),
    animSpeed: num(o.animSpeed, d.animSpeed, 0.4, 2.5),
    easing: oneOf(o.easing, ["smooth", "snappy", "bouncy", "linear"] as const, d.easing),
    slideIn: bool(o.slideIn, d.slideIn),
    sidebarAutoHide: bool(o.sidebarAutoHide, d.sidebarAutoHide),
    sidebarPinned: bool(o.sidebarPinned, d.sidebarPinned),
    orbStyle: oneOf(o.orbStyle, ["light", "dark"] as const, d.orbStyle),
    notchStyle: oneOf(o.notchStyle, ["pill", "line"] as const, d.notchStyle),
  };
}

/** Validates a v3 object, repairing what it safely can and reporting what it changed. */
export function validateV3(raw: Obj): { config: Config; warnings: string[] } {
  const warnings: string[] = [];
  if (!Array.isArray(raw.pages)) throw new ConfigError(["The file has no \"pages\" list."]);
  const sequences: Sequence[] = (Array.isArray(raw.sequences) ? raw.sequences : []).filter(isObj).map((q, i) => ({
    id: str(q.id) || uid(),
    name: str(q.name, `Sequence ${i + 1}`),
    icon: cleanIcon(q.icon),
    color: color(q.color, "#7aa8ff"),
    ...cleanAction(q, `Sequence "${str(q.name)}"`, warnings),
  }));
  const pages: Page[] = raw.pages.filter(isObj).map((p, i) => ({
    id: str(p.id) || uid(),
    name: repairLabel(str(p.name, `Page ${i + 1}`), `Page ${i + 1}`).slice(0, 40),
    icon: str(p.icon, "grid"),
    columns: num(p.columns, 4, 1, 10),
    background: cleanBackground(p.background),
    buttons: (Array.isArray(p.buttons) ? p.buttons : [])
      .map((b, j) => cleanButton(b, `Page "${str(p.name)}" button ${j + 1}`, warnings))
      .filter((b): b is LauncherButton => !!b),
  }));
  if (pages.length === 0) throw new ConfigError(["The configuration must contain at least one page."]);
  const seen = new Set<string>();
  for (const p of pages) {
    if (seen.has(p.id)) { warnings.push(`Duplicate page id "${p.id}" was renamed.`); p.id = uid(); }
    seen.add(p.id);
  }
  const seqIds = new Set(sequences.map((q) => q.id));
  for (const p of pages) for (const b of p.buttons) {
    if (b.sequenceId && !seqIds.has(b.sequenceId)) {
      warnings.push(`Button "${b.label}" referred to a missing sequence; it now runs its own steps.`);
      b.sequenceId = undefined;
    }
  }
  const win = isObj(raw.window) ? raw.window : {};
  const rect = isObj(win.floating) && ["x", "y", "width", "height"].every((k) => typeof (win.floating as Obj)[k] === "number")
    ? (win.floating as unknown as Config["window"]["floating"]) : undefined;
  const panelRect = isObj(win.panel) && ["x", "y", "width", "height"].every((k) => typeof (win.panel as Obj)[k] === "number") ? (win.panel as unknown as Config["window"]["panel"]) : undefined;
  const bp = isObj(win.buttonPosition) && typeof win.buttonPosition.x === "number" && typeof win.buttonPosition.y === "number"
    ? { x: win.buttonPosition.x as number, y: win.buttonPosition.y as number } : undefined;
  const active = str(raw.activePageId);
  const settings = cleanSettings(raw.settings);
  const pageIds = new Set(pages.map((p) => p.id));
  let profiles: Profile[] = (Array.isArray(raw.profiles) ? raw.profiles : []).filter(isObj).map((p, i) => ({
    id: str(p.id) || uid(),
    name: str(p.name, `Profile ${i + 1}`).slice(0, 40),
    displayMode: oneOf(p.displayMode, ["floating", "sidebar", "notch", "button"] as const, "floating"),
    sidebarSide: oneOf(p.sidebarSide, ["left", "right"] as const, "right"),
    pageIds: (Array.isArray(p.pageIds) ? p.pageIds : []).filter((x): x is string => typeof x === "string" && pageIds.has(x)),
  }));
  if (profiles.length === 0) {
    profiles = defaultProfiles();
    profiles[0] = { ...profiles[0], displayMode: settings.displayMode, sidebarSide: settings.sidebarSide };
  }
  const profileIds = new Set(profiles.map((p) => p.id));
  const displays: Record<string, DisplayState> = {};
  if (isObj(raw.displays)) {
    for (const [name, d] of Object.entries(raw.displays)) {
      if (!isObj(d) || !name) continue;
      const fr = isObj(d.floating) && ["x", "y", "width", "height"].every((k) => typeof (d.floating as Obj)[k] === "number") ? (d.floating as unknown as DisplayState["floating"]) : undefined;
      const bpos = isObj(d.buttonPosition) && typeof d.buttonPosition.x === "number" && typeof d.buttonPosition.y === "number" ? { x: d.buttonPosition.x as number, y: d.buttonPosition.y as number } : undefined;
      displays[name] = {
        enabled: bool(d.enabled, true),
        profileId: profileIds.has(str(d.profileId)) ? str(d.profileId) : profiles[0].id,
        activePageId: pageIds.has(str(d.activePageId)) ? str(d.activePageId) : undefined,
        sidebarSide: d.sidebarSide === "left" || d.sidebarSide === "right" ? d.sidebarSide : undefined,
        bounds: isObj(d.bounds) && ["x", "y", "width", "height"].every((k) => typeof (d.bounds as Obj)[k] === "number") ? (d.bounds as unknown as DisplayState["bounds"]) : undefined,
        floating: fr,
        buttonPosition: bpos,
      };
    }
  }
  const alarms: Alarm[] = (Array.isArray(raw.alarms) ? raw.alarms : []).filter(isObj).map((a) => ({
    id: str(a.id) || uid(),
    label: str(a.label).slice(0, 80),
    time: /^\d{1,2}:\d{2}$/.test(str(a.time)) ? str(a.time).padStart(5, "0") : "07:00",
    days: (Array.isArray(a.days) ? a.days : []).filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6),
    enabled: bool(a.enabled, true),
    once: bool(a.once, false),
  }));
  const notes: Note[] = (Array.isArray(raw.notes) ? raw.notes : []).filter(isObj).map((n) => ({
    id: str(n.id) || uid(),
    text: repairText(str(n.text)).slice(0, 20000),
    color: color(n.color, "#f5c26b"),
    updated: typeof n.updated === "number" ? n.updated : Date.now(),
  }));
  const allButtonIds = new Set(pages.flatMap((p) => p.buttons.map((b) => b.id)));
  const classes: ClassEntry[] = (Array.isArray(raw.classes) ? raw.classes : []).filter(isObj).map((k) => ({
    id: str(k.id) || uid(),
    name: str(k.name, "Class").slice(0, 60),
    days: (Array.isArray(k.days) ? k.days : []).filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6),
    start: /^\d{1,2}:\d{2}$/.test(str(k.start)) ? str(k.start).padStart(5, "0") : "09:00",
    end: /^\d{1,2}:\d{2}$/.test(str(k.end)) ? str(k.end).padStart(5, "0") : "10:00",
    room: str(k.room).slice(0, 40),
    color: color(k.color, "#7aa8ff"),
  }));
  const h = isObj(raw.hub) ? raw.hub : {};
  const hpos = isObj(h.position) && typeof h.position.x === "number" && typeof h.position.y === "number" ? { x: h.position.x as number, y: h.position.y as number } : undefined;
  const hub: HubSettings = {
    enabled: bool(h.enabled, DEFAULT_HUB.enabled),
    pinned: (Array.isArray(h.pinned) ? h.pinned : []).filter((x): x is string => typeof x === "string" && allButtonIds.has(x)).slice(0, 12),
    position: hpos,
    showMusic: bool(h.showMusic, true),
    showNotes: bool(h.showNotes, true),
    showUpcoming: bool(h.showUpcoming, true),
    desktopMode: bool(h.desktopMode, false),
    panelSide: h.panelSide === "left" || h.panelSide === "right" ? h.panelSide : "auto",
    links: (Array.isArray(h.links) ? h.links : []).filter(isObj).map((l) => ({ id: str(l.id, "") || uid(), name: str(l.name, "").slice(0, 60), url: str(l.url, "").trim().slice(0, 2000) })).filter((l) => /^https?:\/\//i.test(l.url)).slice(0, 24),
  };
  const a = isObj(raw.ai) ? raw.ai : {};
  const ai: AiSettings = {
    claudeModel: str(a.claudeModel, DEFAULT_AI.claudeModel).trim() || DEFAULT_AI.claudeModel,
    openaiModel: str(a.openaiModel, DEFAULT_AI.openaiModel).trim() || DEFAULT_AI.openaiModel,
    system: str(a.system, DEFAULT_AI.system).slice(0, 4000),
  };
  return {
    config: {
      schemaVersion: SCHEMA_VERSION,
      settings,
      window: { floating: rect, buttonPosition: bp, panel: panelRect },
      activePageId: pages.some((p) => p.id === active) ? active : pages[0].id,
      pages,
      sequences,
      profiles,
      displays,
      alarms,
      notes,
      classes,
      hub,
      ai,
    },
    warnings,
  };
}

/** Converts the Phase-1 prototype formats (version 1 and 2) to schema 3. */
function migrateLegacy(raw: Obj): Obj {
  const version = raw.version as number;
  const legacyItem = (it: Obj) => {
    const steps = Array.isArray(it.action)
      ? (it.action as Obj[]).map((st) => {
          switch (st.kind) {
            case "launch": return { type: "launch", path: str(st.target), args: Array.isArray(st.args) ? st.args.join(" ") : undefined };
            case "folder": return { type: "folder", path: str(st.target) };
            case "website": return { type: "url", url: str(st.target) };
            case "close": return { type: "close", process: str(st.target) };
            case "delay": return { type: "delay", ms: typeof st.delayMs === "number" ? st.delayMs : 1000 };
            default: return null;
          }
        }).filter(Boolean)
      : [];
    return { id: it.id, label: str(it.name, "Untitled"), tooltip: str(it.description) || undefined, icon: str(it.icon), color: it.accent, steps, confirm: false, stopOnError: true };
  };
  const pages = version === 1
    ? [{ id: "general", name: "General", columns: raw.gridColumns, buttons: (Array.isArray(raw.items) ? raw.items : []).filter(isObj).map(legacyItem) }]
    : (Array.isArray(raw.pages) ? raw.pages : []).filter(isObj).map((p) => ({ id: p.id, name: p.name, columns: p.columns, buttons: (Array.isArray(p.items) ? p.items : []).filter(isObj).map(legacyItem) }));
  const opacity = typeof raw.opacity === "number" ? raw.opacity : undefined;
  return {
    schemaVersion: 3,
    settings: {
      displayMode: raw.displayMode, alwaysOnTop: raw.alwaysOnTop, theme: raw.theme, accent: raw.accent, opacity,
      animations: raw.animation === false ? "off" : "full", toggleHotkey: raw.globalHotkey,
    },
    activePageId: raw.activePageId,
    pages,
    sequences: [],
  };
}

export function migrate(raw: unknown): { config: Config; warnings: string[]; upgradedFrom?: number } {
  if (!isObj(raw)) throw new ConfigError(["The file does not contain a Command Centre configuration object."]);
  let obj = raw;
  const warnings: string[] = [];
  if (typeof obj.schemaVersion !== "number") {
    if (obj.version === 1 || obj.version === 2) {
      obj = migrateLegacy(obj);
      warnings.push(`Upgraded a version ${String(raw.version)} configuration to schema ${SCHEMA_VERSION}.`);
    } else {
      throw new ConfigError(["This file is not a Command Centre configuration (no schemaVersion)."]);
    }
  }
  const v = obj.schemaVersion as number;
  if (v > SCHEMA_VERSION) throw new ConfigError([`This configuration was made by a newer Command Centre (schema ${v}). Please update the app.`]);
  if (v < 3 && !warnings.length) throw new ConfigError([`Unsupported schema version ${v}.`]);
  const result = validateV3(obj);
  if (v < 4 && !result.config.pages.some((p) => p.id === TOOLS_PAGE_ID)) {
    result.config.pages.push(toolsPage());
    warnings.push("Added the new “Tools & AI” page (Claude, ChatGPT, Spotify, notes, alarms, keep awake).");
  }
  if (v < 7 && result.config.settings.widgets[0] === "media" && !result.config.settings.widgets.includes("spotify")) {
    result.config.settings.widgets = ["spotify", ...result.config.settings.widgets.filter((w) => w !== "media")];
  }
  if (v < 6) {
    for (const b of result.config.pages.flatMap((p) => p.buttons)) {
      if (b.flyout) continue;
      if (b.steps.some((s) => s.type === "panel" && s.panel === "spotify") || /spotify/i.test(b.label)) b.flyout = { kind: "spotify", items: [] };
      else if (b.label === "Browser" && b.steps[0]?.type === "url") b.flyout = favourites();
    }
  }
  if (v < 5) {
    // Pre-pin the apps the hub circle starts with: the first few real apps.
    const apps = result.config.pages.flatMap((p) => p.buttons).filter((b) => !b.sequenceId && b.steps.some((s) => s.type === "launch" || s.type === "url" || (s.type === "system" && s.action === "file_explorer")));
    if (!result.config.hub.pinned.length) result.config.hub.pinned = apps.slice(0, 8).map((b) => b.id);
  }
  return { config: result.config, warnings: [...warnings, ...result.warnings], upgradedFrom: v < SCHEMA_VERSION ? v : undefined };
}

export function parseConfigText(text: string): { config: Config; warnings: string[]; upgradedFrom?: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ""));
  } catch (e) {
    throw new ConfigError([`The file is not valid JSON: ${(e as Error).message}`]);
  }
  return migrate(raw);
}

export function serialiseConfig(config: Config): string {
  return JSON.stringify(config, null, 2);
}
