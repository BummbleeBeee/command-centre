import type { ActionDef, Config, LauncherButton, Step, SystemAction, ToolPanel } from "../types";

/** Everything the engine needs from the outside world, injected for testability. */
export interface Executor {
  launchApp(path: string, args?: string, cwd?: string, elevated?: boolean): Promise<void>;
  openFolder(path: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  closeApp(process: string): Promise<{ wasRunning: boolean; windowsAsked: number }>;
  isRunning(process: string): Promise<boolean>;
  systemAction(action: SystemAction): Promise<void>;
  volume(mode: string, value?: number): Promise<void>;
  brightness(mode: string, value?: number): Promise<void>;
  shortcut(keys: string): Promise<void>;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  confirm(message: string): Promise<boolean>;
  navigate(pageId: string): void;
  keepAwake(minutes: number): Promise<void>;
  startTimer(seconds: number, label: string): Promise<void>;
  openPanel(panel: ToolPanel): void;
}

export type StepStatus = "ok" | "skipped" | "failed" | "cancelled";
export interface StepLog { stepId: string; label: string; status: StepStatus; message?: string }
export interface RunResult { status: "completed" | "completed-with-errors" | "failed" | "cancelled"; log: StepLog[] }
export interface RunOptions {
  config: Pick<Config, "sequences" | "pages">;
  exec: Executor;
  signal?: AbortSignal;
  onStep?: (index: number, total: number, label: string) => void;
  riskyNeedsConfirm?: (action: SystemAction) => boolean;
}

const MAX_DEPTH = 5;

export function describeStep(step: Step, config?: Pick<Config, "sequences" | "pages">): string {
  switch (step.type) {
    case "launch": return `${step.path || !step.fallbackUrl ? "Launch" : "Open"} ${baseName(step.path) || step.hint?.split("|")[0] || "application"}`;
    case "folder": return `Open folder ${baseName(step.path) || step.path}`;
    case "url": return `Open ${step.url.replace(/^https?:\/\//, "")}`;
    case "close": return `Ask ${step.process} to close`;
    case "system": return `System: ${step.action.replace(/_/g, " ")}`;
    case "volume": return step.mode === "set" ? `Set volume to ${step.value}%` : `Volume ${step.mode}`;
    case "brightness": return step.mode === "set" ? `Set brightness to ${step.value}%` : `Brightness ${step.mode}`;
    case "shortcut": return `Press ${step.keys}`;
    case "delay": return `Wait ${step.ms >= 1000 ? `${(step.ms / 1000).toFixed(1)} s` : `${step.ms} ms`}`;
    case "page": return `Go to page ${config?.pages.find((p) => p.id === step.pageId)?.name ?? "?"}`;
    case "sequence": return `Run ${config?.sequences.find((q) => q.id === step.sequenceId)?.name ?? "sequence"}`;
    case "confirm": return `Ask: ${step.message}`;
    case "awake": return step.minutes === 0 ? "Turn keep-awake off" : step.minutes < 0 ? "Keep PC awake until turned off" : `Keep PC awake for ${fmtMinutes(step.minutes)}`;
    case "timer": return `Start ${fmtMinutes(step.seconds / 60)} timer${step.label ? ` (${step.label})` : ""}`;
    case "panel": return `Open ${({ spotify: "Spotify", notes: "sticky notes", alarms: "alarms & timers", awake: "keep awake", ai: "AI chat", classes: "classes", hub: "hub circle" } as const)[step.panel]}`;
    case "if": return `If ${step.process} is ${step.check === "running" ? "running" : "not running"}, else ${step.otherwise === "stop" ? "stop" : `skip ${step.count}`}`;
  }
}

export function fmtMinutes(m: number): string {
  if (m < 1) return `${Math.round(m * 60)} s`;
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60), rest = Math.round(m % 60);
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function baseName(p: string): string {
  return p.replace(/^shell:AppsFolder\\/i, "").split(/[\\/]/).pop()?.replace(/\.(exe|lnk|url)$/i, "").split("!")[0] ?? "";
}

/** The definition a button actually runs (its linked sequence, or its own steps). */
export function resolveAction(button: LauncherButton, config: Pick<Config, "sequences">): ActionDef & { name: string } {
  const seq = button.sequenceId ? config.sequences.find((q) => q.id === button.sequenceId) : undefined;
  return seq ? { ...seq, name: seq.name } : { ...button, name: button.label };
}

class Cancelled extends Error {}

async function runStep(step: Step, opts: RunOptions, depth: number, nested: RunResult["log"]): Promise<void> {
  const { exec } = opts;
  switch (step.type) {
    case "launch":
      if (!step.path.trim() && step.fallbackUrl) return exec.openUrl(step.fallbackUrl);
      if (!step.path.trim()) throw new Error(`No application path set${step.hint ? ` (looking for ${step.hint.split("|").join(" / ")})` : ""}. Edit this button to choose the app.`);
      if (step.skipIfRunning && (await exec.isRunning(baseName(step.path) + ".exe").catch(() => false))) throw new SkipStep("already running");
      return exec.launchApp(step.path, step.args, step.cwd, step.elevated);
    case "folder":
      if (!step.path.trim()) throw new Error("No folder selected.");
      return exec.openFolder(step.path);
    case "url":
      if (!step.url.trim()) throw new Error("No web address set.");
      return exec.openUrl(step.url);
    case "close": {
      if (!step.process.trim()) throw new Error("No application selected to close.");
      const r = await exec.closeApp(step.process);
      if (!r.wasRunning) throw new SkipStep("not running");
      return;
    }
    case "system":
      if (opts.riskyNeedsConfirm?.(step.action) && !(await exec.confirm(`Run "${step.action.replace(/_/g, " ")}" now?`))) throw new Cancelled();
      return exec.systemAction(step.action);
    case "volume": return exec.volume(step.mode, step.value);
    case "brightness": return exec.brightness(step.mode, step.value);
    case "shortcut":
      if (!step.keys.trim()) throw new Error("No keyboard shortcut set.");
      return exec.shortcut(step.keys);
    case "delay": return exec.sleep(step.ms, opts.signal ?? new AbortController().signal);
    case "page":
      if (!opts.config.pages.some((p) => p.id === step.pageId)) throw new Error("That page no longer exists.");
      exec.navigate(step.pageId);
      return;
    case "confirm":
      if (!(await exec.confirm(step.message))) throw new Cancelled();
      return;
    case "sequence": {
      const seq = opts.config.sequences.find((q) => q.id === step.sequenceId);
      if (!seq) throw new Error("The linked sequence no longer exists.");
      if (depth >= MAX_DEPTH) throw new Error("Sequences are nested too deeply (possible loop).");
      const inner = await runAction(seq, opts, depth + 1);
      nested.push(...inner.log);
      if (inner.status === "cancelled") throw new Cancelled();
      if (inner.status === "failed") throw new Error(`"${seq.name}" failed.`);
      return;
    }
    case "awake": return exec.keepAwake(step.minutes);
    case "timer": return exec.startTimer(step.seconds, step.label);
    case "panel":
      exec.openPanel(step.panel);
      return;
    case "if":
      // Handled by the loop (needs control over the step index).
      return;
  }
}

class SkipStep extends Error {}

export async function runAction(def: ActionDef, opts: RunOptions, depth = 0): Promise<RunResult> {
  const log: StepLog[] = [];
  const { exec } = opts;
  if (depth === 0 && def.confirm) {
    const ok = await exec.confirm(def.confirmMessage || "Run this action?");
    if (!ok) return { status: "cancelled", log };
  }
  const steps = def.steps.filter((s) => s.enabled !== false);
  let hadError = false;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const label = describeStep(step, opts.config);
    if (opts.signal?.aborted) {
      log.push({ stepId: step.id, label, status: "cancelled" });
      return { status: "cancelled", log };
    }
    opts.onStep?.(i, steps.length, label);
    if (step.type === "if") {
      let running = false;
      try { running = await exec.isRunning(step.process); } catch { running = false; }
      const pass = step.check === "running" ? running : !running;
      if (pass) {
        log.push({ stepId: step.id, label, status: "ok", message: "condition met" });
      } else if (step.otherwise === "stop") {
        log.push({ stepId: step.id, label, status: "ok", message: "condition not met: stopping" });
        break;
      } else {
        log.push({ stepId: step.id, label, status: "ok", message: `condition not met: skipping ${step.count}` });
        for (let k = 1; k <= step.count && i + 1 < steps.length; k++) {
          i++;
          log.push({ stepId: steps[i].id, label: describeStep(steps[i], opts.config), status: "skipped", message: "condition" });
        }
      }
      continue;
    }
    const nested: StepLog[] = [];
    try {
      await runStep(step, opts, depth, nested);
      log.push(...nested, { stepId: step.id, label, status: "ok" });
    } catch (e) {
      log.push(...nested);
      if (e instanceof SkipStep) {
        log.push({ stepId: step.id, label, status: "skipped", message: e.message });
        continue;
      }
      if (e instanceof Cancelled || opts.signal?.aborted) {
        log.push({ stepId: step.id, label, status: "cancelled" });
        return { status: "cancelled", log };
      }
      const message = (e as Error).message || String(e);
      log.push({ stepId: step.id, label, status: "failed", message });
      hadError = true;
      if (def.stopOnError && !step.continueOnError) return { status: "failed", log };
    }
  }
  return { status: hadError ? "completed-with-errors" : "completed", log };
}

export const realSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); reject(new Error("cancelled")); }, { once: true });
  });
