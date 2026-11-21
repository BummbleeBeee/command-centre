import type { Config, Step } from "../types";
import { api, InstalledApp, isDesktop } from "./api";

let cache: Promise<InstalledApp[]> | null = null;

/** Cached list of Start-menu and Store apps (scanned once per session). */
export function installedApps(refresh = false): Promise<InstalledApp[]> {
  if (!isDesktop()) return Promise.resolve([]);
  if (!cache || refresh) cache = api.listInstalledApps().catch(() => []);
  return cache;
}

/** Finds the best installed app for a hint such as "DaVinci Resolve|Premiere Pro". */
export function matchApp(apps: InstalledApp[], hint: string): InstalledApp | undefined {
  for (const term of hint.split("|").map((t) => t.trim().toLowerCase()).filter(Boolean)) {
    const exact = apps.find((a) => a.name.toLowerCase() === term);
    if (exact) return exact;
    const starts = apps.find((a) => a.name.toLowerCase().startsWith(term));
    if (starts) return starts;
    const contains = apps.find((a) => a.name.toLowerCase().includes(term));
    if (contains) return contains;
  }
  return undefined;
}

/** Fills empty launch steps that carry a `hint` with real paths found on this PC. */
export async function resolveAppHints(config: Config): Promise<number> {
  const apps = await installedApps();
  if (!apps.length) return 0;
  let filled = 0;
  const fix = (steps: Step[]) => {
    for (const st of steps) {
      if (st.type === "launch" && !st.path && st.hint) {
        const hit = matchApp(apps, st.hint);
        if (hit) { st.path = hit.target; filled++; }
      }
    }
  };
  config.sequences.forEach((q) => fix(q.steps));
  config.pages.forEach((p) => p.buttons.forEach((b) => fix(b.steps)));
  return filled;
}
