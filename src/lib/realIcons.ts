import type { Config, LauncherButton, Step } from "../types";
import { api, isDesktop } from "./api";
import { installedApps, matchApp } from "./resolveApps";

const APPS = {
  settings: "sys:settings",
  explorer: "sys:file_explorer",
  taskManager: "sys:task_manager",
  snip: "sys:snip",
  sound: "%WINDIR%\\System32\\SndVol.exe",
  keyboard: "%WINDIR%\\System32\\osk.exe",
  clock: "shell:AppsFolder\\Microsoft.WindowsAlarms_8wekyb3d8bbwe!App",
  stickyNotes: "shell:AppsFolder\\Microsoft.MicrosoftStickyNotes_8wekyb3d8bbwe!App",
  calendar: "shell:AppsFolder\\microsoft.windowscommunicationsapps_8wekyb3d8bbwe!microsoft.windowslive.calendar",
  music: "shell:AppsFolder\\Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic",
  photos: "shell:AppsFolder\\Microsoft.Windows.Photos_8wekyb3d8bbwe!App",
};

interface Ctx { config: Config; spotify?: string; claude?: string; chatgpt?: string; depth: number }

/** Candidate image sources for one step, best first (empty = no app image for it). */
function stepTargets(st: Step, ctx: Ctx): string[] {
  switch (st.type) {
    case "launch": return st.path.trim() ? [st.path.trim()] : st.fallbackUrl ? ["browser:"] : [];
    case "folder": return st.path.trim() ? [st.path.trim()] : [];
    case "url": return ["browser:"];
    case "close": return [APPS.taskManager];
    case "volume": return [APPS.sound];
    case "brightness": case "awake": return [APPS.settings];
    case "shortcut": return [APPS.keyboard];
    case "timer": return [APPS.clock];
    case "system":
      switch (st.action) {
        case "file_explorer": case "show_desktop": case "task_view": return [APPS.explorer];
        case "task_manager": return [APPS.taskManager];
        case "snip": return [APPS.snip];
        case "volume_up": case "volume_down": case "volume_mute": return [APPS.sound];
        case "media_play_pause": case "media_next": case "media_previous": return [ctx.spotify, APPS.music].filter(Boolean) as string[];
        case "snap_left": case "snap_right": case "maximize_window": case "minimize_window": case "desktop_left": case "desktop_right": return [APPS.explorer];
        default: return [APPS.settings];
      }
    case "panel":
      switch (st.panel) {
        case "spotify": return [ctx.spotify, APPS.music].filter(Boolean) as string[];
        case "notes": return [APPS.stickyNotes];
        case "alarms": return [APPS.clock];
        case "classes": return [APPS.calendar, APPS.clock];
        case "ai": return [ctx.claude, ctx.chatgpt, "browser:"].filter(Boolean) as string[];
        case "awake": return [APPS.settings];
        default: return [];
      }
    case "page": {
      if (ctx.depth > 2) return [];
      const page = ctx.config.pages.find((p) => p.id === st.pageId);
      for (const b of page?.buttons ?? []) {
        if (b.steps.some((x) => x.type === "page")) continue;
        const t = buttonTargets(b, { ...ctx, depth: ctx.depth + 1 });
        if (t.length) return t;
      }
      return [];
    }
    default: return [];
  }
}

function buttonTargets(b: LauncherButton, ctx: Ctx): string[] {
  const steps = b.sequenceId ? ctx.config.sequences.find((q) => q.id === b.sequenceId)?.steps ?? [] : b.steps;
  for (const st of steps) {
    if (st.enabled === false) continue;
    const t = stepTargets(st, ctx);
    if (t.length) return t;
  }
  return [];
}

/** First image source for a button (kept for callers that only need one). */
export function iconTargetFor(b: LauncherButton, config?: Config): string | null {
  const ctx: Ctx = { config: config ?? ({ pages: [], sequences: [] } as unknown as Config), depth: 0 };
  return buttonTargets(b, ctx)[0] ?? null;
}

/**
 * Gives buttons the real image of the app they open (or the matching Windows app for system
 * actions). With `onlyBuiltin` (default) icons the user picked themselves are never touched.
 */
export async function applyRealIcons(config: Config, onlyBuiltin = true): Promise<number> {
  if (!isDesktop()) return 0;
  const apps = await installedApps().catch(() => []);
  const ctx: Ctx = {
    config, depth: 0,
    spotify: matchApp(apps, "Spotify")?.target,
    claude: matchApp(apps, "Claude")?.target,
    chatgpt: matchApp(apps, "ChatGPT")?.target,
  };
  const cache = new Map<string, string | null>();
  const image = async (t: string) => {
    if (!cache.has(t)) cache.set(t, await api.extractIcon(t, 96).catch(() => null));
    return cache.get(t) ?? null;
  };
  let changed = 0;
  for (const page of config.pages) {
    for (const b of page.buttons) {
      if (onlyBuiltin && b.icon.type !== "builtin") continue;
      for (const t of buttonTargets(b, ctx)) {
        const data = await image(t);
        if (data) { b.icon = { type: "image", data }; changed++; break; }
      }
    }
  }
  for (const q of config.sequences) {
    if (onlyBuiltin && q.icon.type !== "builtin") continue;
    for (const st of q.steps) {
      const t = stepTargets(st, ctx)[0];
      const data = t ? await image(t) : null;
      if (data) { q.icon = { type: "image", data }; break; }
    }
  }
  return changed;
}
