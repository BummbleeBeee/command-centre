import { CSSProperties, ReactNode, RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmtMinutes } from "../engine/runner";

const START = -135;
const SWEEP = 270;

/** Snap points for durations: 1-minute steps early on, then wider steps up to 12 hours. */
export const DURATION_STEPS: number[] = (() => {
  const s: number[] = [1, 2, 3, 4];
  for (let m = 5; m <= 60; m += 5) s.push(m);
  for (let m = 75; m <= 180; m += 15) s.push(m);
  for (let m = 210; m <= 720; m += 30) s.push(m);
  return s;
})();

/** Index of the snap point closest to `minutes`. */
export function stepIndex(minutes: number): number {
  let best = 0;
  DURATION_STEPS.forEach((m, i) => { if (Math.abs(m - minutes) < Math.abs(DURATION_STEPS[best] - minutes)) best = i; });
  return best;
}

/**
 * Pointer angle (degrees, 0 = top, clockwise) to a 0..1 position on the knob's 270° arc.
 * The dead zone at the bottom snaps to the nearer end. Pure for tests.
 */
export function angleToFraction(deg: number): number {
  let a = ((deg + 180) % 360 + 360) % 360 - 180; // -180..180
  if (a < START) a = START; // bottom dead zone: snap to the nearer end
  if (a > -START) a = -START;
  return (a - START) / SWEEP;
}

function arc(r: number, f0: number, f1: number): string {
  const p = (f: number) => {
    const a = ((START + f * SWEEP) * Math.PI) / 180;
    return [Math.sin(a) * r, -Math.cos(a) * r];
  };
  const [x0, y0] = p(f0), [x1, y1] = p(f1);
  const large = (f1 - f0) * SWEEP > 180 ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

/** A round knob you drag around (or scroll / arrow-key) to pick a value between min and max. */
export function Knob({ value, min, max, step = 1, onChange, onCommit, size = 120, label, children, color }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; onCommit?: (v: number) => void;
  size?: number; label: string; children?: ReactNode; color?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const live = useRef(value);
  live.current = value;
  const frac = max > min ? (value - min) / (max - min) : 0;
  const set = (v: number) => {
    const c = Math.min(max, Math.max(min, Math.round(v / step) * step));
    if (c !== live.current) { live.current = c; onChange(c); }
    return c;
  };
  const fromPointer = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    const deg = (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
    return set(min + angleToFraction(deg) * (max - min));
  };
  const R = 44;
  const a = ((START + frac * SWEEP) * Math.PI) / 180;
  return (
    <div className="knob" style={{ width: size, height: size, "--knob": color ?? "var(--accent)" } as CSSProperties}>
      <svg ref={ref} viewBox="-60 -60 120 120" role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
        onPointerDown={(e) => { e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId); fromPointer(e); }}
        onPointerMove={(e) => { if (e.buttons & 1) fromPointer(e); }}
        onPointerUp={() => onCommit?.(live.current)}
        onWheel={(e) => { onCommit?.(set(live.current + (e.deltaY < 0 ? step : -step))); }}
        onKeyDown={(e) => {
          const d = e.key === "ArrowUp" || e.key === "ArrowRight" ? step : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -step : 0;
          if (d) { e.preventDefault(); onCommit?.(set(live.current + d)); }
        }}>
        <circle className="knob-face" r={36} />
        <path className="knob-track" d={arc(R, 0, 1)} />
        {frac > 0.002 && <path className="knob-fill" d={arc(R, 0, frac)} />}
        <line className="knob-tick" x1={Math.sin(a) * 22} y1={-Math.cos(a) * 22} x2={Math.sin(a) * 32} y2={-Math.cos(a) * 32} />
        <circle className="knob-handle" cx={Math.sin(a) * R} cy={-Math.cos(a) * R} r={6.5} />
      </svg>
      <div className="knob-center">{children}</div>
    </div>
  );
}

/** Preset chips plus a round dial for any duration up to 12 hours. */
export function DurationPicker({ presets, initial = 45, action, onPick, extra }: {
  presets: number[]; initial?: number; action: string; onPick: (minutes: number) => void; extra?: ReactNode;
}) {
  const [idx, setIdx] = useState(stepIndex(initial));
  const minutes = DURATION_STEPS[idx];
  const until = new Date(Date.now() + minutes * 60_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="duration">
      <div className="duration-presets">
        {presets.map((m) => <button key={m} className="chip" onClick={() => onPick(m)}>{fmtMinutes(m)}</button>)}
        {extra}
      </div>
      <div className="duration-dial">
        <Knob value={idx} min={0} max={DURATION_STEPS.length - 1} onChange={setIdx} label="Duration" size={128}>
          <b>{fmtMinutes(minutes)}</b><small>until {until}</small>
        </Knob>
        <button className="btn primary" onClick={() => onPick(minutes)}>{action} · {fmtMinutes(minutes)}</button>
      </div>
    </div>
  );
}

/**
 * A small dropdown anchored to a button. Opens with a smooth drop, closes on outside click or
 * Escape, and always stays inside the window (scrolls if the window is short).
 */
export function Popover({ open, onClose, anchor, children, width = 250, className = "", onSpace }: {
  open: boolean; onClose: () => void; anchor: RefObject<HTMLElement>; children: ReactNode; width?: number; className?: string;
  /** If given, the dropdown always opens downward and asks the window to grow when it doesn't fit. */
  onSpace?: (px: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const grows = !!onSpace;
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean; max: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor.current) { setPos(null); return; }
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const w = Math.min(width, vw - 8);
      const left = Math.max(4, Math.min(r.left + r.width / 2 - w / 2, vw - w - 4));
      const below = vh - r.bottom - 6, above = r.top - 6;
      const up = !grows && below < 200 && above > below;
      setPos({ left, top: up ? r.top - 6 : r.bottom + 6, up, max: Math.max(120, (up ? above : below) - 4) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchor, width, grows]);
  // Ask for room below once the content's real height is known; give it back on close.
  useLayoutEffect(() => {
    if (!onSpace || !open || !pos || pos.up || !box.current) return;
    const need = pos.top + box.current.scrollHeight + 8 - window.innerHeight;
    if (need > 0) onSpace(need + 4);
  }, [onSpace, open, pos]);
  useEffect(() => { if (!open && onSpace) onSpace(0); }, [open, onSpace]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", down, true);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down, true); document.removeEventListener("keydown", key, true); };
  }, [open, onClose, anchor]);
  if (!open || !pos) return null;
  return createPortal(
    <div ref={box} className={`popover ${pos.up ? "up" : ""} ${className}`} role="dialog"
      style={{ left: pos.left, top: pos.top, width: Math.min(width, window.innerWidth - 8), maxHeight: pos.max }}
      onMouseDown={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}
