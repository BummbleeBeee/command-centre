import { useApp } from "../app/context";
import { ButtonIcon, Glyph } from "../components/Icon";
import { Toggle } from "../settings/SettingsView";

/** Turn the hub circle on, choose what it shows and which apps are pinned around it. */
export function HubSettingsPanel() {
  const app = useApp();
  const hub = app.config.hub;
  const set = (p: Partial<typeof hub>) => app.update((c) => ({ ...c, hub: { ...c.hub, ...p } }));
  const buttons = app.config.pages.flatMap((p) => p.buttons.map((b) => ({ b, page: p.name })));
  const toggle = (id: string) => set({ pinned: hub.pinned.includes(id) ? hub.pinned.filter((x) => x !== id) : [...hub.pinned, id].slice(0, 12) });
  return (
    <div className="alarms">
      <section className="card">
        <h3><Glyph name="dot" size={15} /> Hub circle</h3>
        <p className="dim small">A small floating circle you can drag anywhere. Click it to open a big circle with the time, music, your upcoming classes, alarms and timers, your latest note, and pinned apps around the edge. Right-click it for these settings.</p>
        <Toggle label="Show the hub circle" detail="Separate always-on-top circle, independent of the main launcher" checked={hub.enabled} onChange={(v) => set({ enabled: v })} />
        <Toggle label="Stay on desktop" detail="Always visible on the desktop, but below every open app (survives Show Desktop)" checked={hub.desktopMode} onChange={(v) => set({ desktopMode: v })} />
        <Toggle label="Music" checked={hub.showMusic} onChange={(v) => set({ showMusic: v })} />
        <Toggle label="Upcoming (classes, alarms, timers)" checked={hub.showUpcoming} onChange={(v) => set({ showUpcoming: v })} />
        <Toggle label="Latest sticky note" checked={hub.showNotes} onChange={(v) => set({ showNotes: v })} />
        <div className="row">
          <span>Small circle</span>
          <div className="seg">
            <button className={app.config.settings.orbStyle === "light" ? "active" : ""} onClick={() => app.update((c) => ({ ...c, settings: { ...c.settings, orbStyle: "light" } }))}>Light, black dot clock</button>
            <button className={app.config.settings.orbStyle === "dark" ? "active" : ""} onClick={() => app.update((c) => ({ ...c, settings: { ...c.settings, orbStyle: "dark" } }))}>Dark</button>
          </div>
        </div>
        <button className="btn" onClick={() => set({ position: undefined })}>Move the circle back to its corner</button>
      </section>
      <section className="card">
        <div className="card-head"><h3><Glyph name="pin" size={15} /> Pinned apps ({hub.pinned.length}/12)</h3>{hub.pinned.length > 0 && <button className="btn" onClick={() => set({ pinned: [] })}>Clear</button>}</div>
        <div className="pin-grid">
          {buttons.map(({ b, page }) => (
            <button key={b.id} className={`pin-pick ${hub.pinned.includes(b.id) ? "on" : ""}`} onClick={() => toggle(b.id)} title={`${b.label} · ${page}`}>
              <span className="tile-icon mini" style={{ "--tile-color": b.color } as React.CSSProperties}><ButtonIcon icon={b.icon} size={22} /></span>
              <span>{b.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
