import { useEffect, useState } from "react";

/** 5×7 dot-matrix glyphs (rows top→bottom, 5 bits each). */
const GLYPHS: Record<string, number[]> = {
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  "3": [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ":": [0b0, 0b1, 0b1, 0b0, 0b1, 0b1, 0b0],
  " ": [0, 0, 0, 0, 0, 0, 0],
};

/** "14:05" in the user's 12/24-hour style, without AM/PM (dot displays read cleaner). */
export function clockText(d: Date): string {
  const parts = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value ?? String(d.getHours());
  const m = parts.find((p) => p.type === "minute")?.value ?? String(d.getMinutes()).padStart(2, "0");
  return `${h.padStart(2, "0")}:${m}`;
}

/**
 * Dot-matrix clock (LED / notch style). `dot` is the dot pitch in px; unlit dots are drawn
 * faintly when `ghost` is set. The colon blinks every second.
 */
export function DotClock({ dot = 3, color = "currentColor", ghost = 0.12, blink = true, className }: { dot?: number; color?: string; ghost?: number; blink?: boolean; className?: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(t); }, []);
  const text = clockText(now);
  const colonOn = !blink || now.getSeconds() % 2 === 0;
  const cells: { x: number; y: number; on: boolean }[] = [];
  let col = 0;
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS[" "];
    const width = ch === ":" ? 1 : 5;
    for (let r = 0; r < 7; r++) for (let c = 0; c < width; c++) {
      const bit = (g[r] >> (width - 1 - c)) & 1;
      cells.push({ x: col + c, y: r, on: !!bit && (ch !== ":" || colonOn) });
    }
    col += width + 1;
  }
  const w = (col - 1) * dot, h = 7 * dot, rad = dot * 0.38;
  return (
    <svg className={className} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label={text} role="img">
      {cells.map((c, i) => (c.on || ghost > 0) && (
        <circle key={i} cx={c.x * dot + dot / 2} cy={c.y * dot + dot / 2} r={rad} fill={color} opacity={c.on ? 1 : ghost} />
      ))}
    </svg>
  );
}
