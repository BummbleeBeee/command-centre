import { ask } from "@tauri-apps/plugin-dialog";
import type { Executor } from "../engine/runner";
import { realSleep } from "../engine/runner";
import { api, isDesktop } from "./api";
import { uid } from "./schema";
import type { ToolPanel } from "../types";

/** Native confirmation dialog: it works in every display mode, even the 60 px button. */
export async function confirmDialog(message: string, title = "Command Centre", okLabel = "Continue"): Promise<boolean> {
  if (!isDesktop()) return window.confirm(message);
  return ask(message, { title, kind: "warning", okLabel, cancelLabel: "Cancel" });
}

export function createExecutor(navigate: (pageId: string) => void, openPanel: (panel: ToolPanel) => void = () => undefined): Executor {
  return {
    launchApp: (path, args, cwd, elevated) => api.launchApp(path, args, cwd, elevated),
    openFolder: (path) => api.openFolder(path),
    openUrl: (url) => api.openUrl(url),
    closeApp: (process) => api.closeAppGracefully(process),
    isRunning: (process) => api.isAppRunning(process),
    systemAction: (action) => api.systemAction(action),
    volume: async (mode, value = 10) => {
      switch (mode) {
        case "set": await api.setVolume(value); break;
        case "up": await api.setVolume(undefined, value); break;
        case "down": await api.setVolume(undefined, -value); break;
        case "mute": await api.setMute(true); break;
        case "unmute": await api.setMute(false); break;
        default: await api.setMute(undefined);
      }
    },
    brightness: async (mode, value = 10) => {
      if (mode === "set") await api.setBrightness(value);
      else await api.setBrightness(undefined, mode === "up" ? value : -value);
    },
    shortcut: (keys) => api.sendShortcut(keys),
    sleep: realSleep,
    confirm: (message) => confirmDialog(message),
    navigate,
    openPanel,
    keepAwake: async (minutes) => {
      if (minutes === 0) await api.setKeepAwake(false);
      else await api.setKeepAwake(true, minutes < 0 ? undefined : minutes);
    },
    startTimer: async (seconds, label) => { await api.startTimer(uid(), label || "Timer", seconds); },
  };
}
