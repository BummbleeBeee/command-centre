import { useEffect, useState } from "react";
import { useApp } from "../app/context";
import { Glyph } from "../components/Icon";
import { api } from "../lib/api";

/** Full-panel "ringing" screen shown when an alarm or timer goes off. */
export function AlarmRing({ id, label, kind }: { id: string; label: string; kind: string }) {
  const app = useApp();
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(t); }, []);
  const stop = () => { void api.stopAlarmSound().catch(() => undefined); app.setOverlay(null); };
  const snooze = (m: number) => {
    void api.snoozeAlarm(id.replace(/-snooze$/, ""), label, m).catch(() => undefined);
    app.toast({ kind: "info", title: `Snoozed for ${m} minutes` });
    app.setOverlay(null);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") stop(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  return (
    <main className="panel floating ring" data-tauri-drag-region>
      <div className="ring-body" data-tauri-drag-region>
        <span className="ring-icon"><Glyph name={kind === "timer" ? "clock" : "alarm"} size={54} stroke={1.6} /></span>
        <p className="ring-kind">{kind === "timer" ? "Timer finished" : "Alarm"}</p>
        <h1 className="ring-time">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</h1>
        <p className="ring-label">{label || "Command Centre"}</p>
        <div className="row ring-actions">
          <button className="btn" onClick={() => snooze(5)}>Snooze 5 min</button>
          <button className="btn" onClick={() => snooze(10)}>Snooze 10 min</button>
          <button className="btn primary big" onClick={stop} autoFocus>Stop</button>
        </div>
      </div>
    </main>
  );
}
