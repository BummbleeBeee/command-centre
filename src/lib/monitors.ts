import type { Config, Rect } from "../types";
import type { MonitorInfo } from "./api";

/**
 * Windows sometimes renames monitors (e.g. DISPLAY5 → DISPLAY10). Moves saved settings from a
 * name that no longer exists to a new monitor at the same position and size, and records
 * every monitor's bounds. Returns null when nothing needs to change. Pure for tests.
 */
export function reconcileDisplays(displays: Config["displays"], monitors: MonitorInfo[]): Config["displays"] | null {
  if (!monitors.length) return null;
  const names = new Set(monitors.map((m) => m.name));
  const next = { ...displays };
  let changed = false;
  for (const m of monitors) {
    const bounds = { x: m.x, y: m.y, width: m.width, height: m.height };
    if (!next[m.name]) {
      const orphan = Object.entries(next).find(([n, d]) => !names.has(n) && d.bounds && d.bounds.x === m.x && d.bounds.y === m.y && d.bounds.width === m.width && d.bounds.height === m.height)
        ?? Object.entries(next).find(([n, d]) => !names.has(n) && d.bounds && d.bounds.x === m.x && d.bounds.y === m.y);
      if (orphan) { next[m.name] = { ...orphan[1], bounds }; delete next[orphan[0]]; changed = true; continue; }
      // Older settings have no saved position: if exactly one saved monitor vanished and
      // exactly one new monitor appeared, they are the same screen.
      const orphans = Object.keys(next).filter((n) => !names.has(n));
      const newcomers = monitors.filter((x) => !next[x.name]);
      if (orphans.length === 1 && newcomers.length === 1 && newcomers[0].name === m.name) {
        next[m.name] = { ...next[orphans[0]], bounds };
        delete next[orphans[0]];
        changed = true;
        continue;
      }
    }
    const cur = next[m.name];
    if (cur && JSON.stringify(cur.bounds) !== JSON.stringify(bounds)) { next[m.name] = { ...cur, bounds }; changed = true; }
  }
  return changed ? next : null;
}

/** Which monitors get a launcher: the enabled ones, or the primary monitor if none is enabled. */
export function enabledMonitors(c: Config, monitors: MonitorInfo[]): string[] {
  const on = monitors.filter((m) => c.displays[m.name]?.enabled).map((m) => m.name);
  if (on.length) return on;
  const primary = monitors.find((m) => m.primary) ?? monitors[0];
  return primary ? [primary.name] : [];
}

/**
 * Settings/Tools window: centred on the monitor it was opened from, keeping the user's last
 * size but never larger than 90% of that screen (and never a remembered maximised size).
 */
export function panelRect(saved: Rect | undefined, m: MonitorInfo | undefined): Rect | undefined {
  if (!m) return undefined;
  const width = Math.round(Math.min(saved?.width ?? 760 * m.scale, m.width * 0.9));
  const height = Math.round(Math.min(saved?.height ?? 600 * m.scale, m.height * 0.9));
  return { x: Math.round(m.x + (m.width - width) / 2), y: Math.round(m.y + (m.height - height) / 2), width, height };
}

