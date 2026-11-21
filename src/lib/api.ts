import { invoke } from "@tauri-apps/api/core";
import type { Rect, SystemAction } from "../types";

export const isDesktop = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktop()) throw new Error("This action needs the Command Centre desktop app.");
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(typeof e === "string" ? e : (e as Error)?.message ?? String(e));
  }
}

export interface VolumeState { level: number; muted: boolean }
export interface InstalledApp { name: string; target: string; source: "startMenu" | "store" }
export interface BackupInfo { name: string; size: number; modifiedMs: number }
export interface NowPlaying {
  available: boolean; title: string; artist: string; album: string; app: string; isSpotify: boolean; playing: boolean;
  positionMs: number; durationMs: number; shuffle: boolean | null; repeat: "none" | "list" | "track" | "unknown"; artKey: string;
}
export interface MonitorInfo { name: string; index: number; x: number; y: number; width: number; height: number; scale: number; primary: boolean }
export interface TimerInfo { id: string; label: string; atMs: number; kind: string }
export interface AwakeStatus { active: boolean; untilMs: number | null; keepDisplayOn: boolean }
export interface SpotifyPlaylist { id: string; name: string; uri: string; image: string | null; tracks: number; owner: string }
export type AiProvider = "claude" | "openai";
export interface AiStreamEvent { requestId: string; delta: string | null; done: boolean; error: string | null; stopReason: string | null }
export type MediaAction = "play_pause" | "play" | "pause" | "next" | "previous" | "shuffle" | "repeat" | "seek";
export interface SystemStats { cpu: number; memoryUsed: number; memoryTotal: number; netDown: number; netUp: number }
export interface CloseResult { wasRunning: boolean; windowsAsked: number }

export interface ModeRequest {
  mode: string;
  expanded: boolean;
  alwaysOnTop: boolean;
  floating?: Rect;
  floatingDefault: { width: number; height: number };
  sidebarSide: string;
  sidebarWidth: number;
  sidebarExpandedWidth: number;
  notchSize: { width: number; height: number };
  notchExpandedSize: { width: number; height: number };
  buttonSize: number;
  buttonExpandedSize: { width: number; height: number };
  buttonPosition?: { x: number; y: number };
  monitor?: string;
  pinnedWidth?: number;
}

export const api = {
  loadConfig: () => call<string | null>("load_config"),
  saveConfig: (contents: string) => call<void>("save_config", { contents }),
  quarantineConfig: () => call<string>("quarantine_config"),
  createBackup: (reason?: string) => call<BackupInfo | null>("create_backup", { reason }),
  listBackups: () => call<BackupInfo[]>("list_backups"),
  readBackup: (name: string) => call<string>("read_backup", { name }),
  deleteBackup: (name: string) => call<void>("delete_backup", { name }),
  exportConfigFile: (path: string, contents: string) => call<void>("export_config_file", { path, contents }),
  readImportFile: (path: string) => call<string>("read_import_file", { path }),
  configDirPath: () => call<string>("config_dir_path"),

  launchApp: (path: string, args?: string, cwd?: string, elevated?: boolean) => call<void>("launch_app", { path, args, cwd, elevated }),
  openFolder: (path: string) => call<void>("open_folder", { path }),
  openUrl: (url: string) => call<void>("open_url", { url }),
  listInstalledApps: () => call<InstalledApp[]>("list_installed_apps"),
  extractIcon: (path: string, size = 96) => call<string>("extract_icon", { path, size }),
  readIconFile: (path: string) => call<string>("read_icon_file", { path }),

  isAppRunning: (name: string) => call<boolean>("is_app_running", { name }),
  closeAppGracefully: (name: string) => call<CloseResult>("close_app_gracefully", { name }),

  getVolume: () => call<VolumeState>("get_volume"),
  setVolume: (level?: number, delta?: number) => call<VolumeState>("set_volume", { level, delta }),
  setMute: (muted?: boolean) => call<VolumeState>("set_mute", { muted }),
  getBrightness: () => call<number>("get_brightness"),
  setBrightness: (level?: number, delta?: number) => call<number>("set_brightness", { level, delta }),
  sendShortcut: (keys: string) => call<void>("send_shortcut", { keys }),
  systemAction: (action: SystemAction) => call<void>("system_action", { action }),
  nowPlaying: () => call<NowPlaying>("now_playing"),
  mediaArt: () => call<string | null>("media_art"),
  mediaControl: (action: MediaAction, value?: number) => call<boolean>("media_control", { action, value }),
  listMonitors: () => call<MonitorInfo[]>("list_monitors"),
  syncDisplayWindows: (displays: string[], seconds: string[] = []) => call<void>("sync_display_windows", { displays, seconds }),
  setAlarms: (alarms: { id: string; label: string; time: string; days: number[]; enabled: boolean }[]) => call<void>("set_alarms", { alarms }),
  startTimer: (id: string, label: string, seconds: number) => call<TimerInfo>("start_timer", { id, label, seconds }),
  snoozeAlarm: (id: string, label: string, minutes: number) => call<TimerInfo>("snooze_alarm", { id, label, minutes }),
  cancelTimer: (id: string) => call<void>("cancel_timer", { id }),
  listTimers: () => call<TimerInfo[]>("list_timers"),
  stopAlarmSound: () => call<void>("stop_alarm_sound"),
  testAlarmSound: () => call<void>("test_alarm_sound"),
  setKeepAwake: (enabled: boolean, minutes?: number, keepDisplayOn = true) => call<AwakeStatus>("set_keep_awake", { enabled, minutes, keepDisplayOn }),
  keepAwakeStatus: () => call<AwakeStatus>("keep_awake_status"),
  systemStats: () => call<SystemStats>("system_stats"),
  aiSetKey: (provider: AiProvider, key: string) => call<void>("ai_set_key", { provider, key }),
  aiDeleteKey: (provider: AiProvider) => call<void>("ai_delete_key", { provider }),
  aiKeyStatus: () => call<{ claude: boolean; openai: boolean }>("ai_key_status"),
  aiChat: (requestId: string, provider: AiProvider, model: string, system: string, messages: { role: "user" | "assistant"; content: string }[]) => call<string>("ai_chat", { requestId, provider, model, system, messages }),
  aiCancel: (requestId: string) => call<void>("ai_cancel", { requestId }),
  aiListOpenaiModels: () => call<string[]>("ai_list_openai_models"),
  setHubWindow: (show: boolean) => call<void>("set_hub_window", { show }),
  appbarSet: (side: string, width: number, monitor?: string) => call<Rect>("appbar_set", { side, width, monitor }),
  appbarRemove: () => call<void>("appbar_remove"),
  setDesktopLayer: (on: boolean) => call<void>("set_desktop_layer", { on }),
  openPanelWindow: (overlay: string, display?: string) => call<void>("open_panel_window", { overlay, display }),
  spotifyConnect: (clientId: string) => call<void>("spotify_connect", { clientId }),
  spotifyDisconnect: () => call<void>("spotify_disconnect"),
  spotifyStatus: () => call<boolean>("spotify_status"),
  spotifyPlaylists: () => call<SpotifyPlaylist[]>("spotify_playlists"),
  spotifyPlay: (uri: string) => call<"playing" | "opened">("spotify_play", { uri }),

  applyWindowMode: (req: ModeRequest) => call<Rect>("apply_window_mode", { req }),
  showMainWindow: (focus = true) => call<void>("show_main_window", { focus }),
};
