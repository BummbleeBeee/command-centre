import type { Toast } from "../app/context";
import { Glyph } from "./Icon";

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => onDismiss(t.id)}>
          <span className="toast-icon"><Glyph name={t.kind === "error" ? "x" : t.kind === "success" ? "check" : "bell"} size={14} stroke={2.4} /></span>
          <div>
            <strong>{t.title}</strong>
            {t.detail && <p>{t.detail}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
