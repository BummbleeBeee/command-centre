import type { Alarm, ClassEntry } from "../types";

export interface Upcoming { id: string; kind: "class" | "alarm" | "timer"; title: string; detail: string; at: number; end?: number; color: string; now?: boolean }

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** Next classes (including one in progress), alarms and timers, soonest first. Pure for tests. */
export function upcoming(now: Date, classes: ClassEntry[], alarms: Alarm[], timers: { id: string; label: string; atMs: number }[], limit = 4): Upcoming[] {
  const out: Upcoming[] = [];
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  for (let d = 0; d < 8; d++) {
    const date = new Date(dayStart); date.setDate(dayStart.getDate() + d);
    const dow = date.getDay();
    for (const c of classes) {
      if (!c.days.includes(dow)) continue;
      const start = date.getTime() + toMin(c.start) * 60000;
      const end = date.getTime() + toMin(c.end) * 60000;
      if (end <= now.getTime()) continue;
      out.push({ id: `${c.id}@${d}`, kind: "class", title: c.name, detail: c.room, at: start, end, color: c.color, now: start <= now.getTime() });
    }
    for (const a of alarms) {
      if (!a.enabled || (a.days.length && !a.days.includes(dow))) continue;
      const at = date.getTime() + toMin(a.time) * 60000;
      if (at <= now.getTime()) continue;
      out.push({ id: `${a.id}@${d}`, kind: "alarm", title: a.label || "Alarm", detail: "", at, color: "#ff8fb1" });
    }
  }
  for (const t of timers) out.push({ id: t.id, kind: "timer", title: t.label, detail: "", at: t.atMs, color: "#ff9a6b" });
  return out.sort((x, y) => (x.now === y.now ? x.at - y.at : x.now ? -1 : 1)).slice(0, limit);
}

/** "Now · until 10:30", "in 25 min", "14:00", "Tue 09:00". */
export function when(u: Upcoming, now: Date): string {
  const t = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (u.now && u.end) return `now · until ${t(u.end)}`;
  const mins = Math.round((u.at - now.getTime()) / 60000);
  if (mins < 60) return `in ${Math.max(1, mins)} min`;
  const sameDay = new Date(u.at).toDateString() === now.toDateString();
  if (sameDay) return t(u.at);
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (new Date(u.at).toDateString() === tomorrow.toDateString()) return `tomorrow ${t(u.at)}`;
  return `${new Date(u.at).toLocaleDateString([], { weekday: "short" })} ${t(u.at)}`;
}
