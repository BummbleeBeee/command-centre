import { useCallback, useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Glyph } from "../components/Icon";
import { api, BackupInfo, isDesktop } from "../lib/api";
import { confirmDialog } from "../lib/executor";
import { ConfigError, parseConfigText, serialiseConfig, uid } from "../lib/schema";
import type { Config } from "../types";
import { useSettings } from "./SettingsView";

export function BackupTab() {
  const { app } = useSettings();
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [problem, setProblem] = useState<string[] | null>(null);
  const [pending, setPending] = useState<{ config: Config; warnings: string[]; source: string } | null>(null);

  const refresh = useCallback(() => { if (isDesktop()) api.listBackups().then(setBackups).catch(() => undefined); }, []);
  useEffect(refresh, [refresh]);

  const doExport = async () => {
    const date = new Date().toISOString().slice(0, 10);
    const path = await save({ title: "Export configuration", defaultPath: `command-centre-${date}.json`, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return;
    try {
      await api.exportConfigFile(path.endsWith(".json") ? path : `${path}.json`, serialiseConfig(app.config));
      app.toast({ kind: "success", title: "Configuration exported", detail: path });
    } catch (e) { app.toast({ kind: "error", title: "Export failed", detail: (e as Error).message }); }
  };

  const loadCandidate = (text: string, source: string) => {
    setProblem(null);
    try {
      const { config, warnings } = parseConfigText(text);
      setPending({ config, warnings, source });
    } catch (e) {
      setPending(null);
      setProblem(e instanceof ConfigError ? e.problems : [(e as Error).message]);
    }
  };

  const doImport = async () => {
    const path = await open({ multiple: false, title: "Import configuration", filters: [{ name: "JSON", extensions: ["json"] }] });
    if (typeof path !== "string") return;
    try { loadCandidate(await api.readImportFile(path), path.split(/[\\/]/).pop() ?? path); }
    catch (e) { setProblem([(e as Error).message]); }
  };

  const restore = async (b: BackupInfo) => {
    try { loadCandidate(await api.readBackup(b.name), `backup from ${new Date(b.modifiedMs).toLocaleString()}`); }
    catch (e) { setProblem([(e as Error).message]); }
  };

  const applyReplace = async () => {
    if (!pending) return;
    if (!(await confirmDialog(`Replace your current configuration with ${pending.source}? Your current setup is backed up first.`, "Replace configuration", "Replace"))) return;
    try {
      await api.createBackup("before-import");
      await app.replace(pending.config);
      app.toast({ kind: "success", title: "Configuration replaced", detail: "A backup of the previous setup was saved." });
      setPending(null);
      refresh();
    } catch (e) { app.toast({ kind: "error", title: "Import failed", detail: (e as Error).message }); }
  };

  const applyMerge = async () => {
    if (!pending) return;
    await api.createBackup("before-merge").catch(() => undefined);
    const seqIdMap = new Map<string, string>();
    const seqs = pending.config.sequences.map((q) => { const id = uid(); seqIdMap.set(q.id, id); return { ...q, id }; });
    const pages = pending.config.pages.map((p) => ({
      ...p,
      id: uid(),
      name: app.config.pages.some((x) => x.name === p.name) ? `${p.name} (imported)` : p.name,
      buttons: p.buttons.map((b) => ({ ...b, id: uid(), hotkey: undefined, sequenceId: b.sequenceId ? seqIdMap.get(b.sequenceId) : undefined })),
    }));
    app.update((c) => ({ ...c, pages: [...c.pages, ...pages], sequences: [...c.sequences, ...seqs] }));
    app.toast({ kind: "success", title: `Added ${pages.length} page(s) and ${seqs.length} sequence(s)`, detail: "Imported hotkeys were cleared to avoid conflicts." });
    setPending(null);
  };

  const removeBackup = async (b: BackupInfo) => {
    if (!(await confirmDialog("Delete this backup permanently?", "Delete backup", "Delete"))) return;
    await api.deleteBackup(b.name).catch(() => undefined);
    refresh();
  };

  return (
    <div className="tab-body">
      <h2>Export &amp; import</h2>
      <p className="dim">Exports are plain JSON (schema version {app.config.schemaVersion}) and include every page, button, sequence and setting.</p>
      <div className="row">
        <button className="btn" disabled={!isDesktop()} onClick={() => void doExport()}><Glyph name="download" size={14} /> Export…</button>
        <button className="btn" disabled={!isDesktop()} onClick={() => void doImport()}><Glyph name="upload" size={14} /> Import…</button>
        <button className="btn" disabled={!isDesktop()} onClick={() => api.configDirPath().then((d) => api.openFolder(d)).catch(() => undefined)}><Glyph name="folder" size={14} /> Open data folder</button>
      </div>

      {problem && (
        <div className="card error-card">
          <strong>That file can't be used</strong>
          <ul>{problem.map((p, i) => <li key={i}>{p}</li>)}</ul>
          <small className="dim">Nothing was changed.</small>
        </div>
      )}

      {pending && (
        <div className="card import-card">
          <strong>Ready to import {pending.source}</strong>
          <p className="dim">{pending.config.pages.length} page(s), {pending.config.pages.reduce((n, p) => n + p.buttons.length, 0)} button(s), {pending.config.sequences.length} sequence(s).</p>
          {pending.warnings.length > 0 && <ul className="warn">{pending.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          <div className="row">
            <button className="btn primary" onClick={() => void applyReplace()}>Replace everything</button>
            <button className="btn" onClick={() => void applyMerge()}>Add its pages to mine</button>
            <button className="btn" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card-head">
        <h2>Backups</h2>
        <button className="btn" disabled={!isDesktop()} onClick={() => api.createBackup("manual").then(() => { refresh(); app.toast({ kind: "success", title: "Backup created" }); }).catch((e) => app.toast({ kind: "error", title: "Backup failed", detail: (e as Error).message }))}>
          <Glyph name="plus" size={14} /> Back up now
        </button>
      </div>
      <p className="dim">A backup is made automatically once a day and before every import or restore.</p>
      {backups.length === 0 && <p className="dim">No backups yet.</p>}
      <div className="backup-list">
        {backups.map((b) => (
          <div key={b.name} className="row backup-row">
            <Glyph name="clock" size={14} />
            <span className="grow">{new Date(b.modifiedMs).toLocaleString()} <small className="dim">· {b.name.split("-").slice(2).join("-").replace(".json", "")} · {(b.size / 1024).toFixed(1)} KB</small></span>
            <button className="btn" onClick={() => void restore(b)}>Restore…</button>
            <button className="icon-btn danger" onClick={() => void removeBackup(b)} title="Delete backup"><Glyph name="trash" size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
