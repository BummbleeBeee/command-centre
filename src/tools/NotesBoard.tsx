import { useState } from "react";
import { useApp } from "../app/context";
import { Glyph } from "../components/Icon";
import { confirmDialog } from "../lib/executor";
import { uid } from "../lib/schema";

const NOTE_COLORS = ["#f5c26b", "#ff9a6b", "#ff8fb1", "#c79bff", "#7aa8ff", "#6fd3a5", "#e9edf5"];

export function NotesBoard() {
  const app = useApp();
  const [q, setQ] = useState("");
  const notes = [...app.config.notes].sort((a, b) => b.updated - a.updated).filter((n) => n.text.toLowerCase().includes(q.toLowerCase()));
  const add = () => app.update((c) => ({ ...c, notes: [{ id: uid(), text: "", color: NOTE_COLORS[c.notes.length % NOTE_COLORS.length], updated: Date.now() }, ...c.notes] }));
  const patch = (id: string, p: Partial<{ text: string; color: string }>) =>
    app.update((c) => ({ ...c, notes: c.notes.map((n) => (n.id === id ? { ...n, ...p, updated: p.text !== undefined ? Date.now() : n.updated } : n)) }));
  const remove = async (id: string, text: string) => {
    if (text.trim() && !(await confirmDialog("Delete this note?", "Delete note", "Delete"))) return;
    app.update((c) => ({ ...c, notes: c.notes.filter((n) => n.id !== id) }));
  };
  return (
    <div className="notes">
      <div className="row">
        <label className="search grow"><Glyph name="search" size={14} /><input className="bare" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" /></label>
        <button className="btn primary" onClick={add}><Glyph name="plus" size={14} /> New note</button>
      </div>
      {app.config.notes.length === 0 && <p className="dim">No notes yet. Notes save automatically and are included in backups and exports.</p>}
      <div className="note-grid">
        {notes.map((n) => (
          <div key={n.id} className="note" style={{ "--note": n.color } as React.CSSProperties}>
            <textarea value={n.text} autoFocus={!n.text} placeholder="Write something…" onChange={(e) => patch(n.id, { text: e.target.value })} spellCheck />
            <div className="note-foot">
              <div className="note-colors">
                {NOTE_COLORS.map((c) => <button key={c} style={{ background: c }} className={c === n.color ? "active" : ""} onClick={() => patch(n.id, { color: c })} aria-label={`Colour ${c}`} />)}
              </div>
              <small>{new Date(n.updated).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>
              <button className="icon-btn" onClick={() => void navigator.clipboard?.writeText(n.text)} title="Copy text"><Glyph name="copy" size={13} /></button>
              <button className="icon-btn danger" onClick={() => void remove(n.id, n.text)} title="Delete note"><Glyph name="trash" size={13} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
