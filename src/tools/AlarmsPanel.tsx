import { useEffect, useState } from "react";
import { useApp } from "../app/context";
import { Glyph } from "../components/Icon";
import { fmtMinutes } from "../engine/runner";
import { api, isDesktop, TimerInfo } from "../lib/api";
import { uid } from "../lib/schema";
import type { Alarm } from "../types";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PRESETS = [1, 5, 10, 15, 25, 30, 45, 60];

export function describeDays(days: number[]): string {
  if (!days.length || days.length === 7) return "Every day";
  const s = [...days].sort().join(",");
  if (s === "1,2,3,4,5") return "Weekdays";
  if (s === "0,6") return "Weekends";
  return [...days].sort().map((d) => DAY_NAMES[d]).join(", ");
}

function remaining(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function AlarmsPanel() {
  const app = useApp();
  const [timers, setTimers] = useState<TimerInfo[]>([]);
  const [now, setNow] = useState(Date.now());
  const [custom, setCustom] = useState(20);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktop()) return;
    let alive = true;
    const tick = () => { setNow(Date.now()); void api.listTimers().then((t) => alive && setTimers(t)).catch(() => undefined); };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const setAlarm = (id: string, p: Partial<Alarm>) => app.update((c) => ({ ...c, alarms: c.alarms.map((a) => (a.id === id ? { ...a, ...p } : a)) }));
  const addAlarm = () => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const time = `${String(d.getHours()).padStart(2, "0")}:00`;
    app.update((c) => ({ ...c, alarms: [...c.alarms, { id: uid(), label: "Alarm", time, days: [], enabled: true, once: false }] }));
  };
  const startTimer = async (minutes: number) => {
    try {
      setError(null);
      await api.startTimer(uid(), label.trim() || `${fmtMinutes(minutes)} timer`, Math.round(minutes * 60));
      setTimers(await api.listTimers());
      app.toast({ kind: "success", title: `Timer started: ${fmtMinutes(minutes)}` });
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="alarms">
      <section className="card">
        <div className="card-head">
          <h3><Glyph name="alarm" size={15} /> Alarms</h3>
          <div className="row">
            <button className="btn" disabled={!isDesktop()} onClick={() => api.testAlarmSound().catch((e) => setError((e as Error).message))}><Glyph name="volume-up" size={14} /> Test sound</button>
            <button className="btn primary" onClick={addAlarm}><Glyph name="plus" size={14} /> New alarm</button>
          </div>
        </div>
        <p className="dim small">Alarms ring with sound and a Windows notification, even while Command Centre is hidden in the tray. The app needs to be running (turn on Launch at startup in Settings → General).</p>
        {app.config.alarms.length === 0 && <p className="dim">No alarms yet.</p>}
        {app.config.alarms.map((a) => (
          <div key={a.id} className={`alarm-row ${a.enabled ? "" : "off"}`}>
            <input type="time" value={a.time} onChange={(e) => e.target.value && setAlarm(a.id, { time: e.target.value })} className="alarm-time" />
            <div className="grow alarm-mid">
              <input className="bare alarm-label" value={a.label} onChange={(e) => setAlarm(a.id, { label: e.target.value })} placeholder="Label" />
              <div className="day-pills">
                {DAYS.map((d, i) => (
                  <button key={i} className={a.days.includes(i) ? "on" : ""} title={DAY_NAMES[i]}
                    onClick={() => app.update((c) => ({ ...c, alarms: c.alarms.map((x) => (x.id === a.id ? { ...x, days: x.days.includes(i) ? x.days.filter((y) => y !== i) : [...x.days, i].sort() } : x)) }))}>{d}</button>
                ))}
                <small className="dim">{describeDays(a.days)}</small>
                <label className="checks small"><input type="checkbox" checked={a.once} onChange={(e) => setAlarm(a.id, { once: e.target.checked })} /> once</label>
              </div>
            </div>
            <label className="switch compact"><input type="checkbox" checked={a.enabled} onChange={(e) => setAlarm(a.id, { enabled: e.target.checked })} /><i /></label>
            <button className="icon-btn danger" onClick={() => app.update((c) => ({ ...c, alarms: c.alarms.filter((x) => x.id !== a.id) }))} title="Delete alarm"><Glyph name="trash" size={13} /></button>
          </div>
        ))}
      </section>

      <section className="card">
        <h3><Glyph name="clock" size={15} /> Timers</h3>
        <div className="row wrap">
          {PRESETS.map((m) => <button key={m} className="btn" disabled={!isDesktop()} onClick={() => void startTimer(m)}>{fmtMinutes(m)}</button>)}
        </div>
        <div className="row wrap">
          <input type="number" min={1} max={10080} value={custom} onChange={(e) => setCustom(Math.max(1, Number(e.target.value)))} style={{ width: 80 }} />
          <span>minutes</span>
          <input className="grow" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" />
          <button className="btn primary" disabled={!isDesktop()} onClick={() => void startTimer(custom)}>Start</button>
        </div>
        {error && <p className="warn">{error}</p>}
        {timers.length > 0 && (
          <div className="timer-list">
            {timers.map((t) => (
              <div key={t.id} className="timer-row">
                <span className="timer-left">{remaining(t.atMs - now)}</span>
                <span className="grow">{t.label}{t.kind === "alarm" ? " (snoozed)" : ""}</span>
                <button className="btn" onClick={() => void api.cancelTimer(t.id).then(() => setTimers((l) => l.filter((x) => x.id !== t.id)))}>Cancel</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
