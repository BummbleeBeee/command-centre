import { useEffect, useMemo, useState } from "react";
import { Glyph } from "../components/Icon";
import type { InstalledApp } from "../lib/api";
import { installedApps } from "../lib/resolveApps";

export function AppPicker({ onPick, onClose }: { onPick: (app: InstalledApp) => void; onClose: () => void }) {
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { void installedApps().then(setApps); }, []);
  const list = useMemo(() => (apps ?? []).filter((a) => a.name.toLowerCase().includes(q.toLowerCase())).slice(0, 200), [apps, q]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal app-picker" role="dialog" aria-label="Choose an installed app">
        <header>
          <label className="search"><Glyph name="search" size={14} /><input className="bare" autoFocus placeholder="Search installed apps" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && list[0]) onPick(list[0]); }} /></label>
          <button className="icon-btn" onClick={() => void installedApps(true).then(setApps)} title="Rescan"><Glyph name="refresh" size={14} /></button>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Glyph name="x" size={14} /></button>
        </header>
        <div className="app-list">
          {apps === null && <p className="dim pad">Scanning Start menu…</p>}
          {apps !== null && list.length === 0 && <p className="dim pad">No apps found{q ? ` for “${q}”` : ""}. Use Browse to pick an .exe instead.</p>}
          {list.map((a) => (
            <button key={a.target} className="app-row" onClick={() => onPick(a)} title={a.target}>
              <Glyph name={a.source === "store" ? "sparkles" : "rocket"} size={15} />
              <span>{a.name}</span>
              <small>{a.source === "store" ? "Store app" : "Start menu"}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
