import { useEffect, useState } from "react";
import { useApp } from "../app/context";
import { Glyph } from "../components/Icon";
import type { Settings } from "../types";
import { AppearanceTab, GeneralTab } from "./GeneralTabs";
import { BackupTab } from "./BackupTab";
import { PagesTab, SequencesTab } from "./ContentTabs";
import { ShortcutsTab, SystemTab, AboutTab } from "./SystemTabs";
import { MonitorsTab } from "./MonitorsTab";
import { WidgetsTab } from "./WidgetsTab";

const TABS = [
  { id: "general", label: "General", icon: "panel" },
  { id: "monitors", label: "Monitors", icon: "monitor" },
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "widgets", label: "Widgets", icon: "layers" },
  { id: "pages", label: "Pages", icon: "grid" },
  { id: "sequences", label: "Sequences", icon: "zap" },
  { id: "shortcuts", label: "Shortcuts", icon: "keyboard" },
  { id: "system", label: "System", icon: "sliders" },
  { id: "backup", label: "Backup", icon: "download" },
  { id: "about", label: "About", icon: "bookmark" },
];

export function useSettings() {
  const app = useApp();
  const s = app.config.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => app.update((c) => ({ ...c, settings: { ...c.settings, [k]: v } }));
  return { app, s, set };
}

export function SettingsView({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState(initialTab ?? "general");
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  return (
    <div className="settings">
      <nav className="settings-nav">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}><Glyph name={t.icon} size={15} /> <span>{t.label}</span></button>
        ))}
      </nav>
      <div className="settings-body">
        {tab === "general" && <GeneralTab />}
        {tab === "monitors" && <MonitorsTab />}
        {tab === "appearance" && <AppearanceTab />}
        {tab === "widgets" && <WidgetsTab />}
        {tab === "pages" && <PagesTab />}
        {tab === "sequences" && <SequencesTab />}
        {tab === "shortcuts" && <ShortcutsTab />}
        {tab === "system" && <SystemTab />}
        {tab === "backup" && <BackupTab />}
        {tab === "about" && <AboutTab />}
      </div>
    </div>
  );
}

export function Toggle({ label, detail, checked, onChange, disabled }: { label: string; detail?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`switch ${disabled ? "disabled" : ""}`}>
      <span><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><i />
    </label>
  );
}

export function Range({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="range">
      <span><strong>{label}</strong><b>{value}{unit}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
