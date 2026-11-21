import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useApp } from "../app/context";
import { Glyph } from "../components/Icon";
import { fmtMinutes } from "../engine/runner";
import { api, AwakeStatus, isDesktop } from "../lib/api";
import { DurationPicker } from "../components/TimePicker";

const PRESETS = [15, 30, 60, 120, 240, 480];

export function useAwake(pollMs = 5000) {
  const [status, setStatus] = useState<AwakeStatus | null>(null);
  const refresh = useCallback(() => { if (isDesktop()) void api.keepAwakeStatus().then(setStatus).catch(() => undefined); }, []);
  useEffect(() => {
    refresh();
    if (!isDesktop()) return;
    const t = window.setInterval(refresh, pollMs);
    const un = listen("keep-awake-changed", refresh);
    return () => { window.clearInterval(t); void un.then((f) => f()); };
  }, [refresh, pollMs]);
  return { status, setStatus, refresh };
}

export function awakeLabel(s: AwakeStatus | null, now = Date.now()): string {
  if (!s?.active) return "Off";
  if (s.untilMs == null) return "On until you turn it off";
  const mins = Math.max(0, (s.untilMs - now) / 60000);
  return `${fmtMinutes(Math.ceil(mins))} left`;
}

/** Compact keep-awake controls: status, presets, a dial for any time, and turn off. */
export function AwakeQuick({ status, setStatus, onDone }: { status: AwakeStatus | null; setStatus: (s: AwakeStatus) => void; onDone?: () => void }) {
  const app = useApp();
  const set = async (enabled: boolean, minutes?: number) => {
    if (!isDesktop()) return;
    try { setStatus(await api.setKeepAwake(enabled, minutes)); onDone?.(); }
    catch (e) { app.toast({ kind: "error", title: "Keep awake", detail: (e as Error).message }); }
  };
  return (
    <div className="awake-quick">
      <div className={`awake-quick-head ${status?.active ? "on" : ""}`}>
        <Glyph name="coffee" size={15} />
        <div className="grow"><b>Keep awake</b><small>{awakeLabel(status)}{status?.untilMs ? ` · until ${new Date(status.untilMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</small></div>
        {status?.active && <button className="btn danger small" onClick={() => void set(false)}>Turn off</button>}
      </div>
      <DurationPicker presets={[30, 60, 120, 240]} initial={90} action="Keep awake" onPick={(m) => void set(true, m)}
        extra={<button className="chip" onClick={() => void set(true)}>Until off</button>} />
    </div>
  );
}

export function AwakePanel() {
  const app = useApp();
  const { status, setStatus } = useAwake(1000);
  const [custom, setCustom] = useState(90);
  const [display, setDisplay] = useState(true);
  const set = async (enabled: boolean, minutes?: number) => {
    try {
      setStatus(await api.setKeepAwake(enabled, minutes, display));
      app.toast({ kind: "success", title: enabled ? `Keeping the PC awake${minutes ? ` for ${fmtMinutes(minutes)}` : " until you turn it off"}` : "Keep awake is off" });
    } catch (e) { app.toast({ kind: "error", title: "Keep awake", detail: (e as Error).message }); }
  };
  return (
    <div className="awake">
      <div className={`awake-hero ${status?.active ? "on" : ""}`}>
        <span className="awake-icon"><Glyph name="coffee" size={34} /></span>
        <div>
          <h3>Keep awake {status?.active ? "is on" : "is off"}</h3>
          <p className="dim">{status?.active
            ? `${awakeLabel(status)}${status.untilMs ? ` · until ${new Date(status.untilMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}. ${status.keepDisplayOn ? "Screen stays on too." : "Screen may turn off; the PC won't sleep."}`
            : "Your PC sleeps normally. Turn this on during downloads, renders, presentations or long calls."}</p>
        </div>
        {status?.active && <button className="btn danger" onClick={() => void set(false)}>Turn off</button>}
      </div>
      <div className="awake-presets">
        {PRESETS.map((m) => <button key={m} className="btn" disabled={!isDesktop()} onClick={() => void set(true, m)}>{fmtMinutes(m)}</button>)}
        <button className="btn" disabled={!isDesktop()} onClick={() => void set(true)}>Until I turn it off</button>
      </div>
      <div className="row wrap">
        <span>Custom:</span>
        <input type="number" min={1} max={10080} value={custom} onChange={(e) => setCustom(Math.max(1, Number(e.target.value)))} style={{ width: 90 }} />
        <span>minutes</span>
        <button className="btn primary" disabled={!isDesktop()} onClick={() => void set(true, custom)}>Start</button>
      </div>
      <label className="switch"><span><strong>Keep the screen on too</strong><small>Off = only stop the PC from sleeping (screen can still turn off)</small></span>
        <input type="checkbox" checked={display} onChange={(e) => setDisplay(e.target.checked)} /><i /></label>
      <p className="dim small">Uses the Windows power API (the same way video players stay awake). It turns itself off when the time is up or when Command Centre quits.</p>
    </div>
  );
}
