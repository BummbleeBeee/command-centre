import { useCallback, useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Config } from "../types";
import { api, isDesktop } from "./api";
import { ConfigError, defaultConfig, parseConfigText, serialiseConfig } from "./schema";
import { resolveAppHints } from "./resolveApps";
import { applyRealIcons } from "./realIcons";

const PREVIEW_KEY = "command-centre-preview-config";
const SYNC_EVENT = "config-sync";

export const windowLabel = (): string => (isDesktop() ? getCurrentWindow().label : "main");
export const isMainWindow = (): boolean => windowLabel() === "main";

export interface LoadOutcome { config: Config; notices: string[]; readOnly: boolean; changed: boolean }

/**
 * Loads the configuration. Only the main window performs first-run setup, migrations,
 * quarantine of a damaged file and the one-time switch to real app icons; extra monitor
 * windows just read what the main window has written.
 */
export async function loadInitialConfig(main = isMainWindow()): Promise<LoadOutcome> {
  const notices: string[] = [];
  let text: string | null = null;
  try {
    text = isDesktop() ? await api.loadConfig() : localStorage.getItem(PREVIEW_KEY);
  } catch (e) {
    // Never overwrite a config we could not read: run with defaults but do not save.
    notices.push(`Could not read the configuration file (${(e as Error).message}). Defaults are shown and changes will NOT be saved until the file can be read again.`);
    return { config: defaultConfig(), notices, readOnly: true, changed: false };
  }
  if (text) {
    try {
      const { config, warnings, upgradedFrom } = parseConfigText(text);
      let changed = upgradedFrom !== undefined;
      if (main && upgradedFrom !== undefined && upgradedFrom < 5) {
        await resolveAppHints(config).catch(() => 0);
        const n = await applyRealIcons(config).catch(() => 0);
        if (n) warnings.push(`Switched ${n} button(s) to their real app icons.`);
        changed = true;
      }
      return { config, notices: main ? [...notices, ...warnings] : notices, readOnly: false, changed };
    } catch (e) {
      const problems = e instanceof ConfigError ? e.problems.join(" ") : (e as Error).message;
      if (isDesktop() && main) {
        const moved = await api.quarantineConfig().catch(() => null);
        notices.push(`Your configuration file was invalid (${problems}). It was kept as ${moved ?? "a copy"} and defaults were loaded. You can restore a backup in Settings → Backup.`);
      }
    }
  }
  // First run: build defaults, fill in app paths found on this PC and use real app icons.
  const config = defaultConfig();
  if (main) {
    await resolveAppHints(config).catch(() => undefined);
    await applyRealIcons(config).catch(() => 0);
  }
  return { config, notices, readOnly: false, changed: main };
}

async function persist(config: Config) {
  const text = serialiseConfig(config);
  if (isDesktop()) {
    await api.saveConfig(text);
    // Keep the launcher windows on other monitors in sync.
    await emit(SYNC_EVENT, { from: windowLabel(), text }).catch(() => undefined);
  } else {
    localStorage.setItem(PREVIEW_KEY, text);
  }
}

/** Single source of truth for the configuration with debounced, atomic persistence. */
export function useConfigStore() {
  const [config, setConfig] = useState<Config | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<Config | null>(null);
  const readOnly = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    void loadInitialConfig().then(({ config, notices, readOnly: ro, changed }) => {
      readOnly.current = ro;
      latest.current = config;
      setConfig(config);
      setNotices(notices);
      if (!ro && changed) void persist(config).catch((e) => setSaveError((e as Error).message));
    });
  }, []);

  // Apply changes saved by launcher windows on other monitors.
  useEffect(() => {
    if (!isDesktop()) return;
    const me = windowLabel();
    const un = listen<{ from: string; text: string }>(SYNC_EVENT, (e) => {
      if (e.payload.from === me) return;
      try {
        const { config } = parseConfigText(e.payload.text);
        if (dirty.current) return; // our own pending edit wins; it will be broadcast shortly
        latest.current = config;
        setConfig(config);
      } catch { /* ignore malformed sync */ }
    });
    return () => { void un.then((f) => f()); };
  }, []);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!latest.current || readOnly.current || !dirty.current) return;
    try {
      await persist(latest.current);
      dirty.current = false;
      setSaveError(null);
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }, []);

  const update = useCallback((fn: (c: Config) => Config) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      if (next === prev) return prev;
      latest.current = next;
      dirty.current = true;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 350);
      return next;
    });
  }, [flush]);

  const replace = useCallback(async (next: Config) => {
    latest.current = next;
    dirty.current = true;
    setConfig(next);
    await flush();
  }, [flush]);

  useEffect(() => {
    const onUnload = () => { if (dirty.current) void flush(); };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [flush]);

  return { config, update, replace, flush, notices, dismissNotice: (i: number) => setNotices((n) => n.filter((_, j) => j !== i)), saveError };
}
