import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Glyph } from "./Icon";

export interface MenuItem { label: string; icon?: string; danger?: boolean; disabled?: boolean; onSelect?: () => void; submenu?: MenuItem[] }

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [open, setOpen] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(6, Math.min(x, window.innerWidth - r.width - 6)), y: Math.max(6, Math.min(y, window.innerHeight - r.height - 6)) });
  }, [x, y]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", key); window.removeEventListener("blur", onClose); };
  }, [onClose]);

  return (
    <div ref={ref} className="menu" style={{ left: pos.x, top: pos.y }} role="menu">
      {items.map((it, i) => (
        <div key={i} className="menu-row" onMouseEnter={() => setOpen(it.submenu ? i : null)}>
          <button role="menuitem" disabled={it.disabled} className={it.danger ? "danger" : ""}
            onClick={() => { if (it.submenu) { setOpen(i); return; } it.onSelect?.(); onClose(); }}>
            {it.icon && <Glyph name={it.icon} size={15} />}<span>{it.label}</span>{it.submenu && <Glyph name="chevron-right" size={13} className="menu-caret" />}
          </button>
          {it.submenu && open === i && (
            <div className="menu submenu">
              {it.submenu.map((sub, j) => (
                <button key={j} role="menuitem" disabled={sub.disabled} onClick={() => { sub.onSelect?.(); onClose(); }}>
                  {sub.icon && <Glyph name={sub.icon} size={15} />}<span>{sub.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
