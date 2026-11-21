import { useMemo, useState } from "react";
import { edit, useApp } from "../app/context";
import { HotkeyInput } from "../components/HotkeyInput";
import { Glyph } from "../components/Icon";
import { describeStep, resolveAction, runAction, RunResult } from "../engine/runner";
import { api, InstalledApp, isDesktop } from "../lib/api";
import { createExecutor, confirmDialog } from "../lib/executor";
import { isSafeGlobalHotkey } from "../lib/hotkeys";
import { uid } from "../lib/schema";
import type { LauncherButton, Sequence, Step, StepType } from "../types";
import { IconPicker } from "./IconPicker";
import { AppSearch } from "./AppSearch";
import { blankStep, StepCard, STEP_TYPES } from "./StepCard";

type Draft = (LauncherButton & { kind: "button" }) | (Sequence & { kind: "sequence" });

export function ActionEditor() {
  const app = useApp();
  const o = app.overlay!;
  const initial = useMemo<Draft>(() => {
    if (o.kind === "button") {
      const found = o.buttonId ? edit.findButton(app.config, o.buttonId)?.button : undefined;
      return found
        ? { ...structuredClone(found), kind: "button" }
        : { kind: "button", id: uid(), label: "", icon: { type: "builtin", name: "rocket" }, color: "#7aa8ff", steps: [], confirm: false, stopOnError: true };
    }
    const seq = o.kind === "sequence" && o.sequenceId ? app.config.sequences.find((q) => q.id === o.sequenceId) : undefined;
    return seq ? { ...structuredClone(seq), kind: "sequence" } : { kind: "sequence", id: uid(), name: "", icon: { type: "builtin", name: "zap" }, color: "#c79bff", steps: [], confirm: false, stopOnError: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [d, setD] = useState<Draft>(initial);
  const [adding, setAdding] = useState(false);
  const [testResult, setTestResult] = useState<RunResult | null>(null);
  const [testing, setTesting] = useState(false);
  const isNew = o.kind === "button" ? !o.buttonId : o.kind === "sequence" && !o.sequenceId;
  const name = d.kind === "button" ? d.label : d.name;
  const linkedSeq = d.kind === "button" && d.sequenceId ? app.config.sequences.find((q) => q.id === d.sequenceId) : undefined;
  const firstPath = (linkedSeq?.steps ?? d.steps).find((s): s is Extract<Step, { type: "launch" }> => s.type === "launch" && !!s.path)?.path;

  const patch = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p } as Draft));
  const setSteps = (steps: Step[]) => patch({ steps });
  const setName = (v: string) => patch(d.kind === "button" ? { label: v } : { name: v } as Partial<Draft>);
  const err = (m: string) => app.toast({ kind: "error", title: "Icon", detail: m });

  const onAppPicked = (a: InstalledApp) => {
    if (!name.trim()) setName(a.name);
    if (d.icon.type === "builtin" && d.icon.name === "rocket" && isDesktop() && !a.target.startsWith("shell:")) {
      void api.extractIcon(a.target).then((data) => patch({ icon: { type: "image", data } })).catch(() => undefined);
    }
  };

  const problems: string[] = [];
  if (!name.trim()) problems.push("Give it a name.");
  if (d.kind === "button" && d.hotkey && !isSafeGlobalHotkey(d.hotkey)) problems.push("Hotkey needs a modifier.");
  if (d.kind === "button" && d.hotkey) {
    const clash = app.config.pages.flatMap((p) => p.buttons).find((b) => b.id !== d.id && b.hotkey?.toLowerCase() === d.hotkey!.toLowerCase());
    if (clash) problems.push(`Hotkey already used by “${clash.label}”.`);
    if (d.hotkey.toLowerCase() === app.config.settings.toggleHotkey.toLowerCase()) problems.push("Hotkey is used to show/hide Command Centre.");
  }

  const save = () => {
    if (problems.length) { app.toast({ kind: "error", title: "Can't save yet", detail: problems.join(" ") }); return; }
    if (d.kind === "button" && o.kind === "button") {
      const { kind: _k, ...button } = d;
      void _k;
      app.update((c) => {
        const exists = edit.findButton(c, button.id);
        if (exists) return edit.page(c, exists.page.id, (p) => ({ ...p, buttons: p.buttons.map((b) => (b.id === button.id ? button : b)) }));
        return edit.page(c, o.pageId, (p) => ({ ...p, buttons: [...p.buttons, button] }));
      });
    } else if (d.kind === "sequence") {
      const { kind: _k, ...seq } = d;
      void _k;
      app.update((c) => ({ ...c, sequences: c.sequences.some((q) => q.id === seq.id) ? c.sequences.map((q) => (q.id === seq.id ? seq : q)) : [...c.sequences, seq] }));
    }
    app.toast({ kind: "success", title: `Saved “${name}”` });
    app.setOverlay(o.kind === "sequence" ? { kind: "settings", tab: "sequences" } : null);
  };

  const remove = async () => {
    if (!(await confirmDialog(`Delete “${name}”?`, "Delete", "Delete"))) return;
    if (d.kind === "button") app.update((c) => ({ ...c, pages: c.pages.map((p) => ({ ...p, buttons: p.buttons.filter((b) => b.id !== d.id) })) }));
    else app.update((c) => ({
      ...c,
      sequences: c.sequences.filter((q) => q.id !== d.id),
      pages: c.pages.map((p) => ({ ...p, buttons: p.buttons.map((b) => (b.sequenceId === d.id ? { ...b, sequenceId: undefined } : b)) })),
    }));
    app.setOverlay(d.kind === "sequence" ? { kind: "settings", tab: "sequences" } : null);
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const def = d.kind === "button" ? resolveAction(d, app.config) : d;
      const res = await runAction(def, { config: app.config, exec: createExecutor(() => undefined), riskyNeedsConfirm: () => true });
      setTestResult(res);
    } finally { setTesting(false); }
  };

  const saveAsSequence = () => {
    if (d.kind !== "button") return;
    const seq: Sequence = { id: uid(), name: d.label || "New sequence", icon: d.icon, color: d.color, steps: d.steps, confirm: d.confirm, confirmMessage: d.confirmMessage, stopOnError: d.stopOnError };
    app.update((c) => ({ ...c, sequences: [...c.sequences, seq] }));
    patch({ sequenceId: seq.id });
    app.toast({ kind: "success", title: `Saved as reusable sequence “${seq.name}”` });
  };

  const addStep = (t: StepType) => { setSteps([...d.steps, blankStep(t, uid())]); setAdding(false); };
  const useOwnSteps = !(d.kind === "button" && d.sequenceId);

  return (
    <div className="editor">
      <div className="editor-scroll">
        {d.kind === "button" && (
          <section className="card">
            <div className="card-head"><h3>{isNew ? "Add an app" : "Change app"}</h3><span className="dim">Name, icon and launch step are filled in for you</span></div>
            <AppSearch autoFocus={isNew} onPick={(a, icon) => {
              const launch: Step = { id: uid(), type: "launch", path: a.target };
              const steps = d.steps.length === 0 || (d.steps.length === 1 && d.steps[0].type === "launch") ? [launch] : [launch, ...d.steps.filter((x, i) => !(i === 0 && x.type === "launch"))];
              patch({ label: !isNew && name.trim() && d.steps[0]?.type !== "launch" ? name : a.name, steps, sequenceId: undefined, ...(icon ? { icon: { type: "image", data: icon } } : {}) } as Partial<Draft>);
            }} />
          </section>
        )}
        <section className="card">
          <div className="row">
            <label className="field grow">Name<input value={name} placeholder={d.kind === "button" ? "e.g. Coding Mode" : "e.g. Morning setup"} onChange={(e) => setName(e.target.value)} /></label>
            {d.kind === "button" && <label className="field grow">Tooltip<input value={d.tooltip ?? ""} placeholder="Shown on hover (optional)" onChange={(e) => patch({ tooltip: e.target.value || undefined })} /></label>}
          </div>
          <IconPicker icon={d.icon} color={d.color} appPath={firstPath} onIcon={(icon) => patch({ icon })} onColor={(color) => patch({ color })} onError={err} />
          {d.kind === "button" && (
            <label className="field">Global hotkey (works even when Command Centre is hidden)
              <HotkeyInput value={d.hotkey} onChange={(hotkey) => patch({ hotkey })} />
            </label>
          )}
        </section>

        {d.kind === "button" && (
          <section className="card">
            <div className="seg">
              <button className={useOwnSteps ? "active" : ""} onClick={() => patch({ sequenceId: undefined })}>Its own steps</button>
              <button className={!useOwnSteps ? "active" : ""} disabled={!app.config.sequences.length} onClick={() => patch({ sequenceId: app.config.sequences[0]?.id })}>A saved sequence</button>
            </div>
            {!useOwnSteps && (
              <div className="row">
                <select className="grow" value={d.sequenceId} onChange={(e) => patch({ sequenceId: e.target.value })}>
                  {app.config.sequences.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
                <button className="btn" onClick={() => app.setOverlay({ kind: "sequence", sequenceId: d.sequenceId! })}>Edit sequence</button>
              </div>
            )}
            {!useOwnSteps && linkedSeq && <ol className="seq-preview">{linkedSeq.steps.map((st) => <li key={st.id}>{describeStep(st, app.config)}</li>)}</ol>}
          </section>
        )}

        {useOwnSteps && (
          <section className="card">
            <div className="card-head">
              <h3>Steps</h3>
              <span className="dim">Run top to bottom</span>
            </div>
            {d.steps.length === 0 && <p className="dim">No steps yet. Add one below. A single “Launch application” step makes a classic launcher button.</p>}
            <div className="steps">
              {d.steps.map((st, i) => (
                <StepCard key={st.id} step={st} index={i} total={d.steps.length}
                  excludeSequenceId={d.kind === "sequence" ? d.id : undefined}
                  onAppPicked={onAppPicked}
                  onChange={(n) => setSteps(d.steps.map((x) => (x.id === st.id ? n : x)))}
                  onRemove={() => setSteps(d.steps.filter((x) => x.id !== st.id))}
                  onDuplicate={() => { const list = [...d.steps]; list.splice(i + 1, 0, { ...structuredClone(st), id: uid() }); setSteps(list); }}
                  onMove={(dir) => { const list = [...d.steps]; const j = i + dir; [list[i], list[j]] = [list[j], list[i]]; setSteps(list); }} />
              ))}
            </div>
            {adding ? (
              <div className="step-types">
                {STEP_TYPES.map((t) => <button key={t.type} onClick={() => addStep(t.type)}><Glyph name={t.icon} size={15} /> {t.label}</button>)}
                <button className="dim" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn add-step" onClick={() => setAdding(true)}><Glyph name="plus" size={14} /> Add step</button>
            )}
          </section>
        )}

        {d.kind === "button" && (
          <section className="card">
            <div className="card-head"><h3>Dropdown</h3><span className="dim">An arrow on the button opens a tall panel</span></div>
            <div className="seg">
              <button className={!d.flyout ? "active" : ""} onClick={() => patch({ flyout: undefined })}>None</button>
              <button className={d.flyout?.kind === "items" ? "active" : ""} onClick={() => patch({ flyout: { kind: "items", items: d.flyout?.items ?? [] } })}>My items</button>
              <button className={d.flyout?.kind === "spotify" ? "active" : ""} onClick={() => patch({ flyout: { kind: "spotify", items: [] } })}>Spotify player + playlists</button>
            </div>
            {d.flyout?.kind === "items" && (
              <div className="steps">
                {d.flyout.items.map((it, i) => (
                  <div key={it.id} className="flyout-edit-item">
                    <input value={it.label} placeholder="Item name" onChange={(e) => patch({ flyout: { kind: "items", items: d.flyout!.items.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)) } })} />
                    <StepCard step={it.step} index={i} total={d.flyout!.items.length}
                      onChange={(st) => patch({ flyout: { kind: "items", items: d.flyout!.items.map((x) => (x.id === it.id ? { ...x, step: st } : x)) } })}
                      onRemove={() => patch({ flyout: { kind: "items", items: d.flyout!.items.filter((x) => x.id !== it.id) } })}
                      onDuplicate={() => patch({ flyout: { kind: "items", items: [...d.flyout!.items, { ...structuredClone(it), id: uid(), step: { ...it.step, id: uid() } }] } })}
                      onMove={(dir) => { const l = [...d.flyout!.items]; const j = i + dir; [l[i], l[j]] = [l[j], l[i]]; patch({ flyout: { kind: "items", items: l } }); }} />
                  </div>
                ))}
                <div className="row">
                  <button className="btn" onClick={() => patch({ flyout: { kind: "items", items: [...(d.flyout?.items ?? []), { id: uid(), label: "Website", step: { id: uid(), type: "url", url: "https://" } }] } })}><Glyph name="globe" size={13} /> Add website</button>
                  <button className="btn" onClick={() => patch({ flyout: { kind: "items", items: [...(d.flyout?.items ?? []), { id: uid(), label: "Folder", step: { id: uid(), type: "folder", path: "" } }] } })}><Glyph name="folder" size={13} /> Add folder</button>
                  <button className="btn" onClick={() => patch({ flyout: { kind: "items", items: [...(d.flyout?.items ?? []), { id: uid(), label: "App / project", step: { id: uid(), type: "launch", path: "" } }] } })}><Glyph name="rocket" size={13} /> Add app or project</button>
                </div>
              </div>
            )}
            {d.flyout?.kind === "spotify" && <p className="dim small">Shows what's playing with controls, plus your Spotify playlists (connect once in Tools → Spotify).</p>}
          </section>
        )}

        {useOwnSteps && (
          <section className="card">
            <label className="switch"><span><strong>Ask before running</strong><small>Show a confirmation prompt first</small></span>
              <input type="checkbox" checked={d.confirm} onChange={(e) => patch({ confirm: e.target.checked })} /><i /></label>
            {d.confirm && <input value={d.confirmMessage ?? ""} placeholder="Confirmation message" onChange={(e) => patch({ confirmMessage: e.target.value || undefined })} />}
            <label className="switch"><span><strong>Stop at the first error</strong><small>Otherwise keep going and report errors at the end</small></span>
              <input type="checkbox" checked={d.stopOnError} onChange={(e) => patch({ stopOnError: e.target.checked })} /><i /></label>
          </section>
        )}

        {testResult && (
          <section className={`card test-result ${testResult.status}`}>
            <h3>Test run: {testResult.status.replace(/-/g, " ")}</h3>
            <ul>{testResult.log.map((l, i) => <li key={i} className={l.status}><b>{l.status}</b> {l.label}{l.message ? `: ${l.message}` : ""}</li>)}</ul>
          </section>
        )}
      </div>

      <footer className="editor-foot">
        {!isNew && <button className="btn danger" onClick={() => void remove()}><Glyph name="trash" size={14} /> Delete</button>}
        {d.kind === "button" && useOwnSteps && d.steps.length > 1 && <button className="btn" onClick={saveAsSequence} title="Make these steps reusable by other buttons">Save as sequence</button>}
        <span className="grow" />
        <button className="btn" disabled={testing || !isDesktop()} onClick={() => void test()}>{testing ? "Running…" : "Test run"}</button>
        <button className="btn" onClick={() => app.setOverlay(o.kind === "sequence" ? { kind: "settings", tab: "sequences" } : null)}>Cancel</button>
        <button className="btn primary" onClick={save}>Save</button>
      </footer>
    </div>
  );
}
