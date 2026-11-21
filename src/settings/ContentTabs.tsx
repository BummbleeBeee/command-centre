import { open } from "@tauri-apps/plugin-dialog";
import { edit } from "../app/context";
import { ButtonIcon, Glyph, ICON_NAMES } from "../components/Icon";
import { usePageActions } from "../components/PageTabs";
import { describeStep } from "../engine/runner";
import { api, isDesktop } from "../lib/api";
import { confirmDialog } from "../lib/executor";
import { resolveAppHints } from "../lib/resolveApps";
import { defaultConfig, uid } from "../lib/schema";
import { GRADIENTS } from "../lib/theme";
import type { Page } from "../types";
import { Range, useSettings } from "./SettingsView";

export function PagesTab() {
  const { app } = useSettings();
  const actions = usePageActions();
  const setPage = (id: string, fn: (p: Page) => Page) => app.update((c) => edit.page(c, id, fn));
  const pickImage = async (p: Page) => {
    const path = await open({ multiple: false, title: "Background image (max 1 MB)", filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }] });
    if (typeof path !== "string") return;
    try {
      const data = await api.readIconFile(path);
      setPage(p.id, (x) => ({ ...x, background: { type: "image", value: data } }));
    } catch (e) { app.toast({ kind: "error", title: "Background", detail: (e as Error).message }); }
  };
  return (
    <div className="tab-body">
      <div className="card-head"><h2>Pages</h2><button className="btn" onClick={() => actions.add()}><Glyph name="plus" size={14} /> New page</button></div>
      <p className="dim">Each page has its own buttons, grid and background. Buttons can switch pages with a “Go to page” step.</p>
      {app.config.pages.map((p, i) => (
        <section key={p.id} className={`card page-card ${p.id === app.page.id ? "current" : ""}`}>
          <div className="row">
            <select value={p.icon} onChange={(e) => setPage(p.id, (x) => ({ ...x, icon: e.target.value }))} className="icon-select" title="Page icon">
              {ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <Glyph name={p.icon} size={18} />
            <input className="grow" value={p.name} onChange={(e) => setPage(p.id, (x) => ({ ...x, name: e.target.value }))} aria-label="Page name" />
            <span className="dim">{p.buttons.length} buttons</span>
            <button className="icon-btn" disabled={i === 0} onClick={() => actions.move(p, -1)} title="Move up"><Glyph name="chevron-left" size={13} style={{ transform: "rotate(90deg)" }} /></button>
            <button className="icon-btn" disabled={i === app.config.pages.length - 1} onClick={() => actions.move(p, 1)} title="Move down"><Glyph name="chevron-down" size={13} /></button>
            <button className="icon-btn" onClick={() => actions.duplicate(p)} title="Duplicate"><Glyph name="copy" size={13} /></button>
            <button className="icon-btn danger" onClick={() => void actions.remove(p)} title="Delete"><Glyph name="trash" size={13} /></button>
          </div>
          <Range label="Grid columns" value={p.columns} min={1} max={10} onChange={(v) => setPage(p.id, (x) => ({ ...x, columns: v }))} />
          <div className="row wrap bg-row">
            <span className="dim">Background</span>
            <button className={`bg-chip ${p.background.type === "none" ? "active" : ""}`} onClick={() => setPage(p.id, (x) => ({ ...x, background: { type: "none", value: "" } }))}>None</button>
            {Object.entries(GRADIENTS).map(([k, g]) => (
              <button key={k} className={`bg-chip ${p.background.type === "gradient" && p.background.value === k ? "active" : ""}`} style={{ backgroundImage: g }}
                onClick={() => setPage(p.id, (x) => ({ ...x, background: { type: "gradient", value: k } }))}>{k}</button>
            ))}
            <button className={`bg-chip ${p.background.type === "image" ? "active" : ""}`} disabled={!isDesktop()} onClick={() => void pickImage(p)}>Image…</button>
          </div>
        </section>
      ))}
    </div>
  );
}

export function SequencesTab() {
  const { app } = useSettings();
  const usedBy = (id: string) => app.config.pages.flatMap((p) => p.buttons).filter((b) => b.sequenceId === id).length;
  const addPresets = async () => {
    const presets = defaultConfig().sequences;
    await resolveAppHints({ ...defaultConfig(), sequences: presets, pages: [] });
    const fresh = presets.filter((p) => !app.config.sequences.some((q) => q.name === p.name)).map((p) => ({ ...p, id: uid() }));
    if (!fresh.length) { app.toast({ kind: "info", title: "All presets are already present" }); return; }
    app.update((c) => ({ ...c, sequences: [...c.sequences, ...fresh] }));
    app.toast({ kind: "success", title: `Added ${fresh.length} preset sequence(s)` });
  };
  const remove = async (id: string, name: string) => {
    const n = usedBy(id);
    if (!(await confirmDialog(`Delete the sequence “${name}”?${n ? ` ${n} button(s) use it and will be left with no steps.` : ""}`, "Delete sequence", "Delete"))) return;
    app.update((c) => ({
      ...c,
      sequences: c.sequences.filter((q) => q.id !== id),
      pages: c.pages.map((p) => ({ ...p, buttons: p.buttons.map((b) => (b.sequenceId === id ? { ...b, sequenceId: undefined } : b)) })),
    }));
  };
  return (
    <div className="tab-body">
      <div className="card-head">
        <h2>Reusable sequences</h2>
        <div className="row">
          <button className="btn" onClick={() => void addPresets()}><Glyph name="sparkles" size={14} /> Add presets</button>
          <button className="btn primary" onClick={() => app.setOverlay({ kind: "sequence", sequenceId: null })}><Glyph name="plus" size={14} /> New sequence</button>
        </div>
      </div>
      <p className="dim">A sequence is a named list of steps that any button can run, e.g. “Coding Mode” or “Clean Up”.</p>
      {app.config.sequences.length === 0 && <p className="dim">No sequences yet.</p>}
      {app.config.sequences.map((q) => (
        <section key={q.id} className="card seq-card">
          <div className="row">
            <span className="tile-icon mini" style={{ "--tile-color": q.color } as React.CSSProperties}><ButtonIcon icon={q.icon} size={18} /></span>
            <div className="grow">
              <strong>{q.name}</strong>
              <small className="dim block">{q.steps.length} step(s) · used by {usedBy(q.id)} button(s){q.confirm ? " · asks first" : ""}</small>
            </div>
            <button className="btn" onClick={() => app.setOverlay({ kind: "sequence", sequenceId: q.id })}><Glyph name="edit" size={13} /> Edit</button>
            <button className="icon-btn danger" onClick={() => void remove(q.id, q.name)} title="Delete"><Glyph name="trash" size={13} /></button>
          </div>
          <ol className="seq-preview">
            {q.steps.map((st) => <li key={st.id} className={st.type === "launch" && !st.path ? "warn" : ""}>{describeStep(st, app.config)}{st.type === "launch" && !st.path ? " (app not found: edit to choose it)" : ""}</li>)}
          </ol>
        </section>
      ))}
    </div>
  );
}
