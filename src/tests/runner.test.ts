import { describe, expect, it, vi } from "vitest";
import { Executor, resolveAction, runAction } from "../engine/runner";
import { defaultConfig } from "../lib/schema";
import type { ActionDef, Step, StepInit } from "../types";

function mockExec(over: Partial<Executor> = {}) {
  const calls: string[] = [];
  const exec: Executor = {
    launchApp: vi.fn(async (p: string) => { calls.push(`launch:${p}`); }),
    openFolder: vi.fn(async (p: string) => { calls.push(`folder:${p}`); }),
    openUrl: vi.fn(async (u: string) => { calls.push(`url:${u}`); }),
    closeApp: vi.fn(async (p: string) => { calls.push(`close:${p}`); return { wasRunning: true, windowsAsked: 1 }; }),
    isRunning: vi.fn(async () => false),
    systemAction: vi.fn(async (a) => { calls.push(`system:${a}`); }),
    volume: vi.fn(async (m) => { calls.push(`volume:${m}`); }),
    brightness: vi.fn(async (m) => { calls.push(`brightness:${m}`); }),
    shortcut: vi.fn(async (k) => { calls.push(`keys:${k}`); }),
    sleep: vi.fn(async (ms) => { calls.push(`sleep:${ms}`); }),
    confirm: vi.fn(async () => true),
    navigate: vi.fn((id) => { calls.push(`page:${id}`); }),
    keepAwake: vi.fn(async (m) => { calls.push(`awake:${m}`); }),
    startTimer: vi.fn(async (sec, l) => { calls.push(`timer:${sec}:${l}`); }),
    openPanel: vi.fn((p) => { calls.push(`panel:${p}`); }),
    ...over,
  };
  return { exec, calls };
}

const def = (steps: StepInit[], extra: Partial<ActionDef> = {}): ActionDef => ({
  steps: steps.map((s, i) => ({ id: String(i), ...s }) as Step), confirm: false, stopOnError: true, ...extra,
});
const config = { pages: [{ id: "p1", name: "One", icon: "grid", columns: 4, background: { type: "none" as const, value: "" }, buttons: [] }], sequences: [] };

describe("action engine", () => {
  it("runs steps sequentially in order", async () => {
    const { exec, calls } = mockExec();
    const res = await runAction(def([
      { type: "launch", path: "C:\\a.exe" }, { type: "delay", ms: 200 }, { type: "folder", path: "C:\\pics" },
      { type: "url", url: "https://x.dev" }, { type: "shortcut", keys: "Ctrl+S" }, { type: "page", pageId: "p1" },
    ]), { config, exec });
    expect(res.status).toBe("completed");
    expect(calls).toEqual(["launch:C:\\a.exe", "sleep:200", "folder:C:\\pics", "url:https://x.dev", "keys:Ctrl+S", "page:p1"]);
  });

  it("stops at the first error by default and reports which step failed", async () => {
    const { exec, calls } = mockExec({ openFolder: vi.fn(async () => { throw new Error("Folder not found: X"); }) });
    const res = await runAction(def([{ type: "folder", path: "X" }, { type: "url", url: "https://a.b" }]), { config, exec });
    expect(res.status).toBe("failed");
    expect(res.log[0]).toMatchObject({ status: "failed", message: "Folder not found: X" });
    expect(calls).toEqual([]);
  });

  it("continues past errors when stopOnError is off", async () => {
    const { exec, calls } = mockExec({ openFolder: vi.fn(async () => { throw new Error("nope"); }) });
    const res = await runAction(def([{ type: "folder", path: "X" }, { type: "url", url: "https://a.b" }], { stopOnError: false }), { config, exec });
    expect(res.status).toBe("completed-with-errors");
    expect(calls).toEqual(["url:https://a.b"]);
  });

  it("honours per-step continueOnError", async () => {
    const { exec, calls } = mockExec({ openFolder: vi.fn(async () => { throw new Error("nope"); }) });
    const res = await runAction(def([{ type: "folder", path: "X", continueOnError: true }, { type: "url", url: "https://a.b" }]), { config, exec });
    expect(res.status).toBe("completed-with-errors");
    expect(calls).toEqual(["url:https://a.b"]);
  });

  it("asks for confirmation first and does nothing when declined", async () => {
    const { exec, calls } = mockExec({ confirm: vi.fn(async () => false) });
    const res = await runAction(def([{ type: "close", process: "Code.exe" }], { confirm: true, confirmMessage: "Sure?" }), { config, exec });
    expect(res.status).toBe("cancelled");
    expect(exec.confirm).toHaveBeenCalledWith("Sure?");
    expect(calls).toEqual([]);
  });

  it("a confirm step cancels the remaining steps when declined", async () => {
    const { exec, calls } = mockExec({ confirm: vi.fn(async () => false) });
    const res = await runAction(def([{ type: "url", url: "https://a.b" }, { type: "confirm", message: "Go on?" }, { type: "url", url: "https://c.d" }]), { config, exec });
    expect(res.status).toBe("cancelled");
    expect(calls).toEqual(["url:https://a.b"]);
  });

  it("conditional step skips the next N steps when the condition is not met", async () => {
    const { exec, calls } = mockExec({ isRunning: vi.fn(async () => false) });
    const res = await runAction(def([
      { type: "if", check: "running", process: "Code.exe", otherwise: "skip", count: 2 },
      { type: "url", url: "https://skip1" }, { type: "url", url: "https://skip2" }, { type: "url", url: "https://run" },
    ]), { config, exec });
    expect(res.status).toBe("completed");
    expect(calls).toEqual(["url:https://run"]);
    expect(res.log.filter((l) => l.status === "skipped")).toHaveLength(2);
  });

  it("conditional step can stop the sequence", async () => {
    const { exec, calls } = mockExec({ isRunning: vi.fn(async () => true) });
    await runAction(def([{ type: "if", check: "notRunning", process: "Resolve.exe", otherwise: "stop", count: 1 }, { type: "url", url: "https://never" }]), { config, exec });
    expect(calls).toEqual([]);
  });

  it("skips launch when the app is already running and skipIfRunning is set", async () => {
    const { exec, calls } = mockExec({ isRunning: vi.fn(async () => true) });
    const res = await runAction(def([{ type: "launch", path: "C:\\Apps\\Code.exe", skipIfRunning: true }]), { config, exec });
    expect(exec.isRunning).toHaveBeenCalledWith("Code.exe");
    expect(res.log[0].status).toBe("skipped");
    expect(calls).toEqual([]);
  });

  it("graceful close of a non-running app is a skip, not an error", async () => {
    const { exec } = mockExec({ closeApp: vi.fn(async () => ({ wasRunning: false, windowsAsked: 0 })) });
    const res = await runAction(def([{ type: "close", process: "Resolve.exe" }]), { config, exec });
    expect(res.status).toBe("completed");
    expect(res.log[0]).toMatchObject({ status: "skipped", message: "not running" });
  });

  it("explains unconfigured launch steps instead of failing silently", async () => {
    const { exec } = mockExec();
    const res = await runAction(def([{ type: "launch", path: "", hint: "DaVinci Resolve|Premiere Pro" }]), { config, exec });
    expect(res.status).toBe("failed");
    expect(res.log[0].message).toMatch(/DaVinci Resolve \/ Premiere Pro/);
  });

  it("risky system actions need confirmation", async () => {
    const { exec, calls } = mockExec({ confirm: vi.fn(async () => false) });
    const res = await runAction(def([{ type: "system", action: "lock" }]), { config, exec, riskyNeedsConfirm: (a) => a === "lock" });
    expect(res.status).toBe("cancelled");
    expect(calls).toEqual([]);
  });

  it("runs nested sequences and guards against infinite recursion", async () => {
    const { exec, calls } = mockExec();
    const seqConfig = {
      pages: config.pages,
      sequences: [
        { id: "inner", name: "Inner", icon: { type: "builtin" as const, name: "zap" }, color: "#fff", ...def([{ type: "url", url: "https://inner" }]) },
        { id: "loop", name: "Loop", icon: { type: "builtin" as const, name: "zap" }, color: "#fff", ...def([{ type: "sequence", sequenceId: "loop" }]) },
      ],
    };
    const ok = await runAction(def([{ type: "sequence", sequenceId: "inner" }, { type: "url", url: "https://outer" }]), { config: seqConfig, exec });
    expect(ok.status).toBe("completed");
    expect(calls).toEqual(["url:https://inner", "url:https://outer"]);
    const loop = await runAction(def([{ type: "sequence", sequenceId: "loop" }]), { config: seqConfig, exec });
    expect(loop.status).toBe("failed");
  });

  it("can be cancelled mid-run", async () => {
    const ac = new AbortController();
    const { exec, calls } = mockExec({ sleep: vi.fn(async () => { ac.abort(); throw new Error("cancelled"); }) });
    const res = await runAction(def([{ type: "delay", ms: 5000 }, { type: "url", url: "https://never" }]), { config, exec, signal: ac.signal });
    expect(res.status).toBe("cancelled");
    expect(calls).toEqual([]);
  });

  it("runs keep-awake, timer and tool-panel steps", async () => {
    const { exec, calls } = mockExec();
    const res = await runAction(def([{ type: "awake", minutes: 60 }, { type: "timer", seconds: 1500, label: "Focus" }, { type: "panel", panel: "notes" }, { type: "awake", minutes: 0 }]), { config, exec });
    expect(res.status).toBe("completed");
    expect(calls).toEqual(["awake:60", "timer:1500:Focus", "panel:notes", "awake:0"]);
  });

  it("falls back to the website when an app like Claude is not installed", async () => {
    const { exec, calls } = mockExec();
    const res = await runAction(def([{ type: "launch", path: "", hint: "Claude", fallbackUrl: "https://claude.ai/new" }]), { config, exec });
    expect(res.status).toBe("completed");
    expect(calls).toEqual(["url:https://claude.ai/new"]);
  });

  it("disabled steps are not run", async () => {
    const { exec, calls } = mockExec();
    await runAction(def([{ type: "url", url: "https://off", enabled: false }, { type: "url", url: "https://on" }]), { config, exec });
    expect(calls).toEqual(["url:https://on"]);
  });

  it("buttons linked to a sequence run the sequence", () => {
    const c = defaultConfig();
    const btn = c.pages[0].buttons.find((b) => b.sequenceId)!;
    const action = resolveAction(btn, c);
    expect(action.name).toBe(c.sequences.find((q) => q.id === btn.sequenceId)!.name);
  });

  it("Clean Up preset only requests graceful closes and asks first", async () => {
    const c = defaultConfig();
    const cleanup = c.sequences.find((q) => q.name === "Clean Up")!;
    const { exec, calls } = mockExec();
    const res = await runAction(cleanup, { config: c, exec });
    expect(exec.confirm).toHaveBeenCalledTimes(1);
    expect(res.status).toBe("completed");
    expect(calls.every((x) => x.startsWith("close:"))).toBe(true);
  });
});
