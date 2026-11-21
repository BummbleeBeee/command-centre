import { useApp } from "../app/context";
import { Glyph } from "../components/Icon";
import { uid } from "../lib/schema";
import { upcoming, when } from "../lib/upcoming";
import type { ClassEntry } from "../types";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLORS = ["#7aa8ff", "#6fd3a5", "#f5c26b", "#ff9a6b", "#ff8fb1", "#c79bff", "#8ad0ff", "#b6e37a"];

/** Weekly timetable. Classes show up in the hub circle's "upcoming" list. */
export function ClassesPanel() {
  const app = useApp();
  const classes = app.config.classes;
  const set = (id: string, p: Partial<ClassEntry>) => app.update((c) => ({ ...c, classes: c.classes.map((k) => (k.id === id ? { ...k, ...p } : k)) }));
  const toggleDay = (id: string, d: number) => app.update((c) => ({ ...c, classes: c.classes.map((k) => (k.id === id ? { ...k, days: k.days.includes(d) ? k.days.filter((x) => x !== d) : [...k.days, d].sort() } : k)) }));
  const add = () => app.update((c) => ({ ...c, classes: [...c.classes, { id: uid(), name: "New class", days: [1], start: "09:00", end: "10:00", room: "", color: COLORS[c.classes.length % COLORS.length] }] }));
  const now = new Date();
  const next = upcoming(now, classes, [], [], 3).filter((u) => u.kind === "class");
  const today = now.getDay();

  return (
    <div className="alarms">
      <section className="card">
        <div className="card-head">
          <h3><Glyph name="briefcase" size={15} /> My classes</h3>
          <button className="btn primary" onClick={add}><Glyph name="plus" size={14} /> Add class</button>
        </div>
        {next.length > 0 && <p className="small">Next: {next.map((u) => <b key={u.id} style={{ marginRight: 10 }}>{u.title} <span className="dim">{when(u, now)}</span></b>)}</p>}
        {classes.length === 0 && <p className="dim">Add your timetable (lessons, lectures, gym…). The hub circle shows what's next.</p>}
        <div className="class-list">
          {classes.map((k) => (
            <div key={k.id} className="class-row">
              <label className="class-swatch" style={{ background: k.color }} title="Colour">
                <input type="color" value={k.color} onChange={(e) => set(k.id, { color: e.target.value })} style={{ opacity: 0, width: 8, height: 36 }} />
              </label>
              <div className="alarm-mid">
                <div className="row">
                  <input className="bare alarm-label" value={k.name} onChange={(e) => set(k.id, { name: e.target.value })} placeholder="Class name" />
                  <input className="bare alarm-label dim" value={k.room} onChange={(e) => set(k.id, { room: e.target.value })} placeholder="Room / link" style={{ fontWeight: 400 }} />
                </div>
                <div className="day-pills">
                  {DAYS.map((d, i) => <button key={i} className={k.days.includes(i) ? "on" : ""} title={DAY_NAMES[i]} onClick={() => toggleDay(k.id, i)}>{d}</button>)}
                </div>
              </div>
              <input type="time" value={k.start} onChange={(e) => e.target.value && set(k.id, { start: e.target.value })} aria-label="Starts" />
              <input type="time" value={k.end} onChange={(e) => e.target.value && set(k.id, { end: e.target.value })} aria-label="Ends" />
              <span />
              <button className="icon-btn danger" onClick={() => app.update((c) => ({ ...c, classes: c.classes.filter((x) => x.id !== k.id) }))} title="Delete"><Glyph name="trash" size={13} /></button>
            </div>
          ))}
        </div>
      </section>
      {classes.length > 0 && (
        <section className="card">
          <h3><Glyph name="grid" size={15} /> This week</h3>
          <div className="week">
            {DAY_NAMES.map((n, d) => (
              <div key={d} className={`week-day ${d === today ? "today" : ""}`}>
                <b>{n}</b>
                {classes.filter((k) => k.days.includes(d)).sort((a, b) => a.start.localeCompare(b.start)).map((k) => (
                  <div key={k.id} className="week-item" style={{ background: k.color }}>{k.start} {k.name}</div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
