import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useApp } from "../app/context";
import { HotkeyInput } from "../components/HotkeyInput";
import { Glyph } from "../components/Icon";
import { describeStep } from "../engine/runner";
import type { InstalledApp } from "../lib/api";
import { isDesktop } from "../lib/api";
import { SYSTEM_ACTIONS } from "../lib/schema";
import type { Step, StepType } from "../types";
import { AppPicker } from "./AppPicker";

export const STEP_TYPES: { type: StepType; label: string; icon: string }[] = [
  { type: "launch", label: "Launch application", icon: "rocket" },
  { type: "folder", label: "Open folder", icon: "folder" },
  { type: "url", label: "Open website", icon: "globe" },
  { type: "close", label: "Close application (gracefully)", icon: "x" },
  { type: "system", label: "System control", icon: "settings" },
  { type: "volume", label: "Volume", icon: "volume-up" },
  { type: "brightness", label: "Brightness", icon: "sun" },
  { type: "shortcut", label: "Keyboard shortcut", icon: "keyboard" },
  { type: "delay", label: "Wait", icon: "clock" },
  { type: "confirm", label: "Ask for confirmation", icon: "bell" },
  { type: "if", label: "Condition (app running?)", icon: "activity" },
  { type: "page", label: "Go to page", icon: "arrow-right" },
  { type: "sequence", label: "Run saved sequence", icon: "zap" },
  { type: "awake", label: "Keep PC awake", icon: "coffee" },
  { type: "timer", label: "Start a timer", icon: "alarm" },
  { type: "panel", label: "Open a tool (Spotify, notes…)", icon: "sparkles" },
];

export function blankStep(type: StepType, id: string): Step {
  switch (type) {
    case "launch": return { id, type, path: "" };
    case "folder": return { id, type, path: "" };
    case "url": return { id, type, url: "" };
    case "close": return { id, type, process: "" };
    case "system": return { id, type, action: "show_desktop" };
    case "volume": return { id, type, mode: "up", value: 10 };
    case "brightness": return { id, type, mode: "up", value: 10 };
    case "shortcut": return { id, type, keys: "" };
    case "delay": return { id, type, ms: 1000 };
    case "confirm": return { id, type, message: "Continue?" };
    case "if": return { id, type, check: "running", process: "", otherwise: "skip", count: 1 };
    case "page": return { id, type, pageId: "" };
    case "sequence": return { id, type, sequenceId: "" };
    case "awake": return { id, type, minutes: 60 };
    case "timer": return { id, type, seconds: 600, label: "Timer" };
    case "panel": return { id, type, panel: "notes" };
  }
}

export function StepCard({ step, index, total, onChange, onRemove, onMove, onDuplicate, onAppPicked, excludeSequenceId }: {
  step: Step; index: number; total: number; onChange: (s: Step) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void; onAppPicked?: (app: InstalledApp) => void; excludeSequenceId?: string;
}) {
  const app = useApp();
  const [picking, setPicking] = useState(false);
  const [open_, setOpen] = useState(true);
  const meta = STEP_TYPES.find((t) => t.type === step.type)!;
  const set = (patch: Partial<Step>) => onChange({ ...step, ...patch } as Step);

  const browseFile = async () => {
    const p = await open({ multiple: false, title: "Choose an application or shortcut", filters: [{ name: "Programs & shortcuts", extensions: ["exe", "lnk", "url", "bat", "cmd", "appref-ms", "msc"] }, { name: "All files", extensions: ["*"] }] });
    if (typeof p === "string") set({ path: p } as Partial<Step>);
  };
  const browseFolder = async () => {
    const p = await open({ directory: true, multiple: false, title: "Choose a folder" });
    if (typeof p === "string") set({ path: p } as Partial<Step>);
  };

  return (
    <div className={`step ${step.enabled === false ? "disabled" : ""}`}>
      <div className="step-head">
        <span className="step-num">{index + 1}</span>
        <Glyph name={meta.icon} size={15} />
        <button className="step-title" onClick={() => setOpen(!open_)}>{describeStep(step, app.config)}</button>
        <div className="step-tools">
          <button className="icon-btn" disabled={index === 0} onClick={() => onMove(-1)} title="Move up"><Glyph name="chevron-left" size={13} style={{ transform: "rotate(90deg)" }} /></button>
          <button className="icon-btn" disabled={index === total - 1} onClick={() => onMove(1)} title="Move down"><Glyph name="chevron-down" size={13} /></button>
          <button className="icon-btn" onClick={onDuplicate} title="Duplicate step"><Glyph name="copy" size={13} /></button>
          <button className="icon-btn" onClick={() => set({ enabled: step.enabled === false })} title={step.enabled === false ? "Enable step" : "Disable step"}><Glyph name={step.enabled === false ? "eye" : "check"} size={13} /></button>
          <button className="icon-btn danger" onClick={onRemove} title="Remove step"><Glyph name="trash" size={13} /></button>
        </div>
      </div>
      {open_ && (
        <div className="step-body">
          {step.type === "launch" && (
            <>
              <div className="row">
                <input className="grow" value={step.path} placeholder={step.hint ? `Not found yet: ${step.hint.split("|")[0]}` : "C:\\Path\\App.exe, a shortcut, or a command like wt.exe"} onChange={(e) => set({ path: e.target.value })} />
                <button className="btn" onClick={() => setPicking(true)} disabled={!isDesktop()}>Find app</button>
                <button className="btn" onClick={() => void browseFile()} disabled={!isDesktop()}>Browse</button>
              </div>
              <div className="row">
                <input className="grow" value={step.args ?? ""} placeholder="Command-line arguments (optional)" onChange={(e) => set({ args: e.target.value || undefined })} />
                <input className="grow" value={step.cwd ?? ""} placeholder="Start in folder (optional)" onChange={(e) => set({ cwd: e.target.value || undefined })} />
              </div>
              <div className="row checks">
                <label><input type="checkbox" checked={!!step.skipIfRunning} onChange={(e) => set({ skipIfRunning: e.target.checked })} /> Skip if already running</label>
                <label title="Windows will ask for permission (UAC)"><input type="checkbox" checked={!!step.elevated} onChange={(e) => set({ elevated: e.target.checked })} /> Run as administrator</label>
              </div>
            </>
          )}
          {step.type === "folder" && (
            <div className="row">
              <input className="grow" value={step.path} placeholder="C:\\Users\\you\\Pictures or %USERPROFILE%\\Videos" onChange={(e) => set({ path: e.target.value })} />
              <button className="btn" onClick={() => void browseFolder()} disabled={!isDesktop()}>Browse</button>
            </div>
          )}
          {step.type === "url" && <input value={step.url} placeholder="https://example.com" onChange={(e) => set({ url: e.target.value })} />}
          {step.type === "close" && (
            <>
              <input value={step.process} placeholder="Process name, e.g. Code.exe, Resolve.exe, chrome.exe" onChange={(e) => set({ process: e.target.value })} />
              <small className="dim">Sends a normal close request (like clicking ✕). The app can ask to save your work. Nothing is force-killed.</small>
            </>
          )}
          {step.type === "system" && (
            <select value={step.action} onChange={(e) => set({ action: e.target.value as never })}>
              {SYSTEM_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          )}
          {(step.type === "volume" || step.type === "brightness") && (
            <div className="row">
              <select value={step.mode} onChange={(e) => set({ mode: e.target.value as never })}>
                <option value="up">Increase by</option>
                <option value="down">Decrease by</option>
                <option value="set">Set to</option>
                {step.type === "volume" && <><option value="toggleMute">Toggle mute</option><option value="mute">Mute</option><option value="unmute">Unmute</option></>}
              </select>
              {["up", "down", "set"].includes(step.mode) && (
                <><input type="range" min={0} max={100} value={step.value ?? 10} onChange={(e) => set({ value: Number(e.target.value) })} /><b>{step.value ?? 10}%</b></>
              )}
            </div>
          )}
          {step.type === "shortcut" && (
            <>
              <HotkeyInput value={step.keys || undefined} onChange={(v) => set({ keys: v ?? "" })} global={false} placeholder="Click and press the shortcut to send" />
              <small className="dim">Sent to the app you were using before clicking Command Centre.</small>
            </>
          )}
          {step.type === "delay" && (
            <div className="row"><input type="number" min={0} max={600} step={0.1} value={step.ms / 1000} onChange={(e) => set({ ms: Math.round(Number(e.target.value) * 1000) })} /> <span>seconds</span></div>
          )}
          {step.type === "confirm" && <input value={step.message} onChange={(e) => set({ message: e.target.value })} placeholder="Question to ask before continuing" />}
          {step.type === "if" && (
            <div className="row wrap">
              <span>If</span>
              <input value={step.process} placeholder="App.exe" onChange={(e) => set({ process: e.target.value })} />
              <select value={step.check} onChange={(e) => set({ check: e.target.value as never })}><option value="running">is running</option><option value="notRunning">is not running</option></select>
              <span>continue, otherwise</span>
              <select value={step.otherwise} onChange={(e) => set({ otherwise: e.target.value as never })}><option value="skip">skip the next</option><option value="stop">stop the sequence</option></select>
              {step.otherwise === "skip" && <><input type="number" min={1} max={50} value={step.count} onChange={(e) => set({ count: Math.max(1, Number(e.target.value)) })} style={{ width: 60 }} /><span>step(s)</span></>}
            </div>
          )}
          {step.type === "page" && (
            <select value={step.pageId} onChange={(e) => set({ pageId: e.target.value })}>
              <option value="">Choose a page…</option>
              {app.config.pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {step.type === "sequence" && (
            <select value={step.sequenceId} onChange={(e) => set({ sequenceId: e.target.value })}>
              <option value="">Choose a sequence…</option>
              {app.config.sequences.filter((q) => q.id !== excludeSequenceId).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          )}
          {step.type === "awake" && (
            <div className="row wrap">
              <select value={step.minutes === 0 ? "off" : step.minutes < 0 ? "forever" : "for"} onChange={(e) => set({ minutes: e.target.value === "off" ? 0 : e.target.value === "forever" ? -1 : 60 })}>
                <option value="for">Keep awake for</option>
                <option value="forever">Keep awake until turned off</option>
                <option value="off">Turn keep-awake off</option>
              </select>
              {step.minutes > 0 && <><input type="number" min={1} max={10080} value={step.minutes} onChange={(e) => set({ minutes: Math.max(1, Number(e.target.value)) })} style={{ width: 80 }} /><span>minutes</span></>}
            </div>
          )}
          {step.type === "timer" && (
            <div className="row wrap">
              <input type="number" min={1} max={10080} value={Math.round(step.seconds / 60)} onChange={(e) => set({ seconds: Math.max(1, Number(e.target.value)) * 60 })} style={{ width: 80 }} /><span>minutes, label</span>
              <input className="grow" value={step.label} onChange={(e) => set({ label: e.target.value })} placeholder="Timer" />
            </div>
          )}
          {step.type === "panel" && (
            <select value={step.panel} onChange={(e) => set({ panel: e.target.value as never })}>
              <option value="spotify">Spotify player</option>
              <option value="notes">Sticky notes</option>
              <option value="alarms">Alarms &amp; timers</option>
              <option value="awake">Keep awake</option>
              <option value="ai">AI chat (Claude &amp; ChatGPT)</option>
              <option value="classes">My classes</option>
              <option value="hub">Hub circle settings</option>
            </select>
          )}
          {step.type === "launch" && step.fallbackUrl && !step.path && <small className="dim">App not installed: opens {step.fallbackUrl} instead.</small>}
          {!["delay", "confirm", "if", "page", "panel"].includes(step.type) && (
            <label className="checks"><input type="checkbox" checked={!!step.continueOnError} onChange={(e) => set({ continueOnError: e.target.checked })} /> Continue even if this step fails</label>
          )}
        </div>
      )}
      {picking && <AppPicker onClose={() => setPicking(false)} onPick={(a) => { set({ path: a.target } as Partial<Step>); setPicking(false); onAppPicked?.(a); }} />}
    </div>
  );
}
