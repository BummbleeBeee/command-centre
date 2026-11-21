export const SCHEMA_VERSION = 7;

export type DisplayMode = "floating" | "sidebar" | "notch" | "button";
export type ThemeName = "dark" | "light" | "custom";
export type AnimationLevel = "full" | "reduced" | "off";
export type GlassStyle = "frosted" | "clear" | "tinted" | "solid" | "neon";
export type WidgetId = "media" | "spotify" | "stats" | "volume" | "clock" | "next" | "note" | "awake";
export type Easing = "smooth" | "snappy" | "bouncy" | "linear";
export type BackgroundEffect = "none" | "rain" | "snow" | "stars" | "aurora" | "bubbles" | "fireflies" | "matrix" | "waves";

export type SystemAction =
  | "lock" | "sleep" | "show_desktop" | "task_manager" | "settings" | "snip" | "file_explorer"
  | "media_play_pause" | "media_next" | "media_previous" | "volume_up" | "volume_down" | "volume_mute"
  | "task_view" | "action_center" | "snap_left" | "snap_right" | "maximize_window" | "minimize_window"
  | "desktop_left" | "desktop_right";

export type IconRef =
  | { type: "builtin"; name: string }
  | { type: "image"; data: string }
  | { type: "text"; value: string };

interface StepBase { id: string; enabled?: boolean; continueOnError?: boolean }

export type Step =
  | (StepBase & { type: "launch"; path: string; args?: string; cwd?: string; elevated?: boolean; skipIfRunning?: boolean; hint?: string; fallbackUrl?: string })
  | (StepBase & { type: "folder"; path: string })
  | (StepBase & { type: "url"; url: string })
  | (StepBase & { type: "close"; process: string })
  | (StepBase & { type: "system"; action: SystemAction })
  | (StepBase & { type: "volume"; mode: "set" | "up" | "down" | "mute" | "unmute" | "toggleMute"; value?: number })
  | (StepBase & { type: "brightness"; mode: "set" | "up" | "down"; value?: number })
  | (StepBase & { type: "shortcut"; keys: string })
  | (StepBase & { type: "delay"; ms: number })
  | (StepBase & { type: "page"; pageId: string })
  | (StepBase & { type: "sequence"; sequenceId: string })
  | (StepBase & { type: "confirm"; message: string })
  | (StepBase & { type: "if"; check: "running" | "notRunning"; process: string; otherwise: "skip" | "stop"; count: number })
  /** minutes > 0: keep the PC awake that long; -1: until turned off; 0: turn keep-awake off. */
  | (StepBase & { type: "awake"; minutes: number })
  | (StepBase & { type: "timer"; seconds: number; label: string })
  | (StepBase & { type: "panel"; panel: ToolPanel });

export type ToolPanel = "spotify" | "notes" | "alarms" | "awake" | "ai" | "classes" | "hub";

export type StepType = Step["type"];

/** Shared by buttons and reusable sequences. */
export interface ActionDef {
  steps: Step[];
  confirm: boolean;
  confirmMessage?: string;
  stopOnError: boolean;
}

export interface LauncherButton extends ActionDef {
  id: string;
  label: string;
  tooltip?: string;
  icon: IconRef;
  color: string;
  hotkey?: string;
  /** When set, the button runs this reusable sequence instead of its own steps. */
  sequenceId?: string;
  /** Optional dropdown panel opened from the button's arrow (Spotify playlists or your own items). */
  flyout?: Flyout;
}

export interface FlyoutItem { id: string; label: string; step: Step }
export interface Flyout { kind: "items" | "spotify"; items: FlyoutItem[] }

export interface Sequence extends ActionDef {
  id: string;
  name: string;
  icon: IconRef;
  color: string;
}

export interface PageBackground { type: "none" | "gradient" | "image"; value: string }

export interface Page {
  id: string;
  name: string;
  icon: string;
  columns: number;
  background: PageBackground;
  buttons: LauncherButton[];
}

export interface Rect { x: number; y: number; width: number; height: number }

export interface Settings {
  displayMode: DisplayMode;
  theme: ThemeName;
  customTheme: { background: string; surface: string; text: string };
  accent: string;
  opacity: number;
  radius: number;
  animations: AnimationLevel;
  nativeBlur: boolean;
  alwaysOnTop: boolean;
  showLabels: boolean;
  buttonSize: number;
  gridGap: number;
  toggleHotkey: string;
  hotkeysEnabled: boolean;
  sidebarSide: "left" | "right";
  sidebarExpandOnHover: boolean;
  notchExpandOnHover: boolean;
  showWidgets: boolean;
  confirmSystemActions: boolean;
  hideAfterLaunch: boolean;
  /** Last applied colour preset id ("" = hand-tuned). */
  themePreset: string;
  glass: GlassStyle;
  /** Gradient tint behind every panel (key of GRADIENTS or ""). */
  backdrop: string;
  effect: BackgroundEffect;
  /** 10–100: particle density / speed of the background effect. */
  effectIntensity: number;
  /** Widgets in the bottom dock and the notch, in order. */
  widgets: WidgetId[];
  /** Pop-ups after successful actions (errors always show). */
  showSuccessToasts: boolean;
  /** Animation duration multiplier: 0.5 = fast … 2 = slow and smooth. */
  animSpeed: number;
  easing: Easing;
  /** Slide the sidebar / notch / panels in when they appear. */
  slideIn: boolean;
  /** Sidebar collapses into a thin dock at the screen edge until you hover it. */
  sidebarAutoHide: boolean;
  /** Pinned sidebar reserves its strip of the screen (like the taskbar). */
  sidebarPinned: boolean;
  /** Small hub circle look: light (black dot clock) or dark. */
  orbStyle: "light" | "dark";
  /** Collapsed notch look: the dot-clock pill, or just a thin line at the top edge. */
  notchStyle: "pill" | "line";
}

/** A profile decides how a launcher looks on a monitor: its mode and which pages it shows. */
export interface Profile {
  id: string;
  name: string;
  displayMode: DisplayMode;
  sidebarSide: "left" | "right";
  /** Page ids shown with this profile. Empty = all pages. */
  pageIds: string[];
}

/** Per-monitor state, keyed by the monitor's Windows name (e.g. "\\.\DISPLAY2"). */
export interface DisplayState {
  enabled: boolean;
  profileId: string;
  activePageId?: string;
  /** Overrides the profile's sidebar side on this monitor. */
  sidebarSide?: "left" | "right";
  /** Where this monitor was last seen (lets settings follow a monitor Windows renames). */
  bounds?: Rect;
  floating?: Rect;
  buttonPosition?: { x: number; y: number };
  /** A second mode shown on this monitor at the same time (e.g. a notch beside the sidebar). */
  secondMode?: DisplayMode;
  secondFloating?: Rect;
  secondButtonPosition?: { x: number; y: number };
}

export interface Alarm {
  id: string;
  label: string;
  /** "HH:MM" 24-hour local time. */
  time: string;
  /** 0 = Sunday … 6 = Saturday. Empty = every day. */
  days: number[];
  enabled: boolean;
  /** Disable automatically after it rings once. */
  once: boolean;
}

export interface Note { id: string; text: string; color: string; updated: number }

/** A weekly class / lesson shown in the hub and the Classes tool. */
export interface ClassEntry {
  id: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  room: string;
  color: string;
}

export interface HubSettings {
  enabled: boolean;
  /** Button ids pinned around the hub circle. */
  pinned: string[];
  position?: { x: number; y: number };
  showMusic: boolean;
  showNotes: boolean;
  showUpcoming: boolean;
  /** Stay on the desktop: always visible, but below every open app. */
  desktopMode: boolean;
  /** Which side the hub's side panel opens on ("auto" = whichever side has room). */
  panelSide: "auto" | "left" | "right";
  /** Websites shown under the hub's apps. */
  links: HubLink[];
}

export interface HubLink { id: string; name: string; url: string }

export interface AiSettings {
  claudeModel: string;
  openaiModel: string;
  system: string;
}

export interface Config {
  schemaVersion: number;
  settings: Settings;
  /** Legacy single-window geometry (schema 3); used as a fallback for the first monitor. */
  window: { floating?: Rect; buttonPosition?: { x: number; y: number }; panel?: Rect };
  activePageId: string;
  pages: Page[];
  sequences: Sequence[];
  profiles: Profile[];
  displays: Record<string, DisplayState>;
  alarms: Alarm[];
  notes: Note[];
  classes: ClassEntry[];
  hub: HubSettings;
  ai: AiSettings;
}

/** A step without its id (distributes over the Step union). */
export type StepInit = Step extends infer T ? (T extends Step ? Omit<T, "id"> : never) : never;
