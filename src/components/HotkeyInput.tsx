import { useState } from "react";
import { acceleratorFromEvent, isSafeGlobalHotkey } from "../lib/hotkeys";
import { Glyph } from "./Icon";

export function HotkeyInput({ value, onChange, global = true, placeholder = "Click and press keys" }: {
  value: string | undefined; onChange: (v: string | undefined) => void; global?: boolean; placeholder?: string;
}) {
  const [recording, setRecording] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  return (
    <div className="hotkey">
      <button type="button" className={`hotkey-box ${recording ? "recording" : ""}`}
        onClick={() => { setRecording(true); setWarning(null); }}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => {
          if (!recording) return;
          e.preventDefault();
          e.stopPropagation();
          if (e.key === "Escape" && !e.ctrlKey && !e.altKey) { setRecording(false); return; }
          if (e.key === "Backspace" && !e.ctrlKey && !e.altKey && !e.shiftKey) { onChange(undefined); setRecording(false); return; }
          const acc = acceleratorFromEvent(e.nativeEvent);
          if (!acc) return;
          if (global && !isSafeGlobalHotkey(acc)) { setWarning("Global hotkeys need Ctrl, Alt or Win (or an F-key) so normal typing isn't blocked."); return; }
          onChange(acc);
          setRecording(false);
        }}>
        {recording ? <span className="dim">Press a key combination… (Esc cancels, Backspace clears)</span>
          : value ? value.split("+").map((k) => <kbd key={k}>{k}</kbd>) : <span className="dim">{placeholder}</span>}
      </button>
      {value && <button type="button" className="icon-btn" onClick={() => onChange(undefined)} aria-label="Clear hotkey"><Glyph name="x" size={13} /></button>}
      {warning && <small className="warn">{warning}</small>}
    </div>
  );
}
