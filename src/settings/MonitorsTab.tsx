import { useEffect, useState } from "react";
import { enabledMonitors } from "../lib/monitors";
import { Glyph } from "../components/Icon";
import { api, isDesktop, MonitorInfo } from "../lib/api";
import { confirmDialog } from "../lib/executor";
import { uid } from "../lib/schema";
import { MODES } from "../modes/shared";
import type { Config, DisplayMode, Profile } from "../types";
import { useSettings } from "./SettingsView";

/** Pretty monitor title: "Monitor 2" plus its Windows name. */
const title = (m: MonitorInfo) => `Monitor ${m.index + 1}`;

export function MonitorsTab() {
  const { app } = useSettings();
  const [monitors, setMonitors] = useState<MonitorInfo[]>(app.monitors);
  useEffect(() => { if (isDesktop()) void api.listMonitors().then(setMonitors).catch(() => undefined); }, []);
  const c = app.config;
  const active = new Set(enabledMonitors(c, monitors));

  const setEnabled = (name: string, on: boolean) => {
    const next = new Set(active);
    if (on) next.add(name); else next.delete(name);
    if (next.size === 0) { app.toast({ kind: "info", title: "Keep at least one monitor", detail: "Command Centre needs to show on at least one monitor." }); return; }
    app.update((cfg: Config) => {
      const displays = { ...cfg.displays };
      for (const m of monitors) {
        const cur = displays[m.name] ?? { enabled: false, profileId: cfg.profiles[0].id };
        displays[m.name] = { ...cur, enabled: next.has(m.name) };
      }
      return { ...cfg, displays };
    });
  };
  const setProfile = (name: string, profileId: string) => app.update((cfg) => ({
    ...cfg, displays: { ...cfg.displays, [name]: { ...(cfg.displays[name] ?? { enabled: active.has(name) }), profileId } },
  }));
  const profileOf = (name: string) => c.profiles.find((p) => p.id === c.displays[name]?.profileId) ?? c.profiles[0];

  // Scale the real monitor layout into the map.
  const minX = Math.min(...monitors.map((m) => m.x), 0), minY = Math.min(...monitors.map((m) => m.y), 0);
  const maxX = Math.max(...monitors.map((m) => m.x + m.width), 1), maxY = Math.max(...monitors.map((m) => m.y + m.height), 1);
  const W = 560, H = 190;
  const k = Math.min(W / (maxX - minX), H / (maxY - minY));

  return (
    <div className="tab-body">
      <h2>Monitors</h2>
      <p className="dim">Click a monitor to show or hide Command Centre on it. Each monitor can use a different profile (its own mode and pages). Your buttons are shared.</p>
      {monitors.length === 0 ? <p className="dim">{isDesktop() ? "Detecting monitors…" : "Monitor detection needs the desktop app."}</p> : (
        <div className="monitor-map" style={{ height: (maxY - minY) * k + 16 }}>
          {monitors.map((m) => {
            const on = active.has(m.name);
            return (
              <button key={m.name} className={`monitor ${on ? "on" : ""} ${m.name === app.display ? "here" : ""}`}
                style={{ left: (m.x - minX) * k, top: (m.y - minY) * k, width: m.width * k - 6, height: m.height * k - 6 }}
                onClick={() => setEnabled(m.name, !on)} title={on ? "Click to hide Command Centre on this monitor" : "Click to show Command Centre on this monitor"}>
                <strong>{m.index + 1}</strong>
                <span>{on ? profileOf(m.name).name : "Off"}</span>
                <small>{m.width}×{m.height}{m.primary ? " · primary" : ""}</small>
                {m.name === app.display && <em>this window</em>}
              </button>
            );
          })}
        </div>
      )}
      {monitors.map((m) => (
        <div key={m.name} className={`row monitor-row ${active.has(m.name) ? "" : "off"}`}>
          <Glyph name="monitor" size={16} />
          <div className="grow"><strong>{title(m)}</strong> <small className="dim">{m.name} · {m.width}×{m.height} · {Math.round(m.scale * 100)}%{m.primary ? " · primary" : ""}</small></div>
          <select value={profileOf(m.name).id} onChange={(e) => setProfile(m.name, e.target.value)} disabled={!active.has(m.name)} aria-label={`Profile for ${title(m)}`}>
            {c.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}: {MODES.find((x) => x.value === p.displayMode)?.label}</option>)}
          </select>
          <select value={c.displays[m.name]?.sidebarSide ?? "profile"} disabled={!active.has(m.name)} title="Sidebar side on this monitor"
            onChange={(e) => app.update((cfg) => ({ ...cfg, displays: { ...cfg.displays, [m.name]: { ...(cfg.displays[m.name] ?? { enabled: active.has(m.name), profileId: cfg.profiles[0].id }), sidebarSide: e.target.value === "profile" ? undefined : (e.target.value as "left" | "right") } } }))}>
            <option value="profile">Sidebar: profile side</option>
            <option value="left">Sidebar on the left</option>
            <option value="right">Sidebar on the right</option>
          </select>
          <select value={c.displays[m.name]?.secondMode && c.displays[m.name]?.secondMode !== profileOf(m.name).displayMode ? c.displays[m.name]?.secondMode : "none"} disabled={!active.has(m.name)} title="A second mode shown on this monitor at the same time"
            aria-label={`Second mode for ${title(m)}`}
            onChange={(e) => app.update((cfg) => ({ ...cfg, displays: { ...cfg.displays, [m.name]: { ...(cfg.displays[m.name] ?? { enabled: active.has(m.name), profileId: cfg.profiles[0].id }), secondMode: e.target.value === "none" ? undefined : (e.target.value as DisplayMode) } } }))}>
            <option value="none">No second mode</option>
            {MODES.filter((x) => x.value !== profileOf(m.name).displayMode).map((x) => <option key={x.value} value={x.value}>Also: {x.label}</option>)}
          </select>
          <label className="switch compact" title="Show Command Centre on this monitor"><input type="checkbox" checked={active.has(m.name)} onChange={(e) => setEnabled(m.name, e.target.checked)} /><i /></label>
        </div>
      ))}
      <ProfilesSection />
    </div>
  );
}

function ProfilesSection() {
  const { app } = useSettings();
  const c = app.config;
  const set = (id: string, fn: (p: Profile) => Profile) => app.update((cfg) => ({ ...cfg, profiles: cfg.profiles.map((p) => (p.id === id ? fn(p) : p)) }));
  const add = () => app.update((cfg) => ({ ...cfg, profiles: [...cfg.profiles, { id: uid(), name: `Profile ${cfg.profiles.length + 1}`, displayMode: "floating", sidebarSide: "right", pageIds: [] }] }));
  const remove = async (p: Profile) => {
    if (c.profiles.length <= 1) return;
    if (!(await confirmDialog(`Delete the profile “${p.name}”? Monitors using it switch to “${c.profiles.find((x) => x.id !== p.id)!.name}”.`, "Delete profile", "Delete"))) return;
    app.update((cfg) => {
      const fallback = cfg.profiles.find((x) => x.id !== p.id)!.id;
      const displays = Object.fromEntries(Object.entries(cfg.displays).map(([n, d]) => [n, d.profileId === p.id ? { ...d, profileId: fallback } : d]));
      return { ...cfg, profiles: cfg.profiles.filter((x) => x.id !== p.id), displays };
    });
  };
  return (
    <>
      <div className="card-head"><h2>Profiles</h2><button className="btn" onClick={add}><Glyph name="plus" size={14} /> New profile</button></div>
      <p className="dim">A profile picks the display mode and which pages appear. Example: a sidebar with just “Coding” on your side monitor, and the full panel on your main one.</p>
      {c.profiles.map((p) => (
        <section key={p.id} className={`card ${p.id === app.profile.id ? "current" : ""}`}>
          <div className="row">
            <input className="grow" value={p.name} onChange={(e) => set(p.id, (x) => ({ ...x, name: e.target.value }))} aria-label="Profile name" />
            <select value={p.displayMode} onChange={(e) => set(p.id, (x) => ({ ...x, displayMode: e.target.value as DisplayMode }))}>
              {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            {p.displayMode === "sidebar" && (
              <select value={p.sidebarSide} onChange={(e) => set(p.id, (x) => ({ ...x, sidebarSide: e.target.value as "left" | "right" }))}>
                <option value="left">Left edge</option><option value="right">Right edge</option>
              </select>
            )}
            <button className="icon-btn" title="Duplicate" onClick={() => app.update((cfg) => ({ ...cfg, profiles: [...cfg.profiles, { ...p, id: uid(), name: `${p.name} copy` }] }))}><Glyph name="copy" size={13} /></button>
            <button className="icon-btn danger" disabled={c.profiles.length <= 1} title="Delete" onClick={() => void remove(p)}><Glyph name="trash" size={13} /></button>
          </div>
          <div className="row wrap page-picks">
            <span className="dim small">Pages:</span>
            <button className={`chip ${p.pageIds.length === 0 ? "active" : ""}`} onClick={() => set(p.id, (x) => ({ ...x, pageIds: [] }))}>All pages</button>
            {c.pages.map((pg) => {
              const on = p.pageIds.includes(pg.id);
              return (
                <button key={pg.id} className={`chip ${on ? "active" : ""}`}
                  onClick={() => set(p.id, (x) => ({ ...x, pageIds: on ? x.pageIds.filter((i) => i !== pg.id) : [...x.pageIds, pg.id] }))}>
                  <Glyph name={pg.icon} size={12} /> {pg.name}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
