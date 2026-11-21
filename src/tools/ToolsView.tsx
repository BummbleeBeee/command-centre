import { useEffect, useState } from "react";
import { Glyph } from "../components/Icon";
import type { ToolPanel } from "../types";
import { AlarmsPanel } from "./AlarmsPanel";
import { AiChat } from "./AiChat";
import { ClassesPanel } from "./ClassesPanel";
import { HubSettingsPanel } from "./HubSettingsPanel";
import { AwakePanel } from "./AwakePanel";
import { NotesBoard } from "./NotesBoard";
import { SpotifyCard } from "./SpotifyCard";
import { SpotifyPlaylists } from "./SpotifyPlaylists";

const TABS: { id: ToolPanel; label: string; icon: string }[] = [
  { id: "ai", label: "AI chat", icon: "sparkles" },
  { id: "spotify", label: "Spotify", icon: "music" },
  { id: "notes", label: "Sticky notes", icon: "note" },
  { id: "alarms", label: "Alarms & timers", icon: "alarm" },
  { id: "awake", label: "Keep awake", icon: "coffee" },
  { id: "classes", label: "My classes", icon: "briefcase" },
  { id: "hub", label: "Hub circle", icon: "dot" },
];

export function ToolsView({ initialTab }: { initialTab?: ToolPanel }) {
  const [tab, setTab] = useState<ToolPanel>(initialTab ?? "spotify");
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  return (
    <div className="settings">
      <nav className="settings-nav">
        {TABS.map((t) => <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}><Glyph name={t.icon} size={15} /> <span>{t.label}</span></button>)}
      </nav>
      <div className="settings-body tools-body">
        <div className="tab-body">
          {tab === "spotify" && <><SpotifyCard /><SpotifyPlaylists /></>}
          {tab === "notes" && <NotesBoard />}
          {tab === "alarms" && <AlarmsPanel />}
          {tab === "awake" && <AwakePanel />}
          {tab === "ai" && <AiChat />}
          {tab === "classes" && <ClassesPanel />}
          {tab === "hub" && <HubSettingsPanel />}
        </div>
      </div>
    </div>
  );
}
