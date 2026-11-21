import type { CSSProperties } from "react";
import type { IconRef } from "../types";

/** Original 24×24 stroke icon set. Each entry is a list of SVG path `d` strings. */
const P: Record<string, string[]> = {
  grid: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  folder: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  globe: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M3 12h18", "M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"],
  terminal: ["M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M7 10l3 2-3 2", "M12 15h5"],
  code: ["M9 7l-5 5 5 5", "M15 7l5 5-5 5", "M13.5 5l-3 14"],
  camera: ["M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z", "M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"],
  image: ["M4 5h16v14H4z", "M4 16l5-5 4 4 2-2 5 5", "M15.5 8.5h.01"],
  film: ["M4 4h16v16H4z", "M8 4v16", "M16 4v16", "M4 9h4", "M4 15h4", "M16 9h4", "M16 15h4"],
  scissors: ["M6 7a2.5 2.5 0 1 0 0 .01", "M6 17a2.5 2.5 0 1 0 0 .01", "M8 8.5L20 18", "M8 15.5L20 6"],
  settings: ["M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "M12 2.5v3", "M12 18.5v3", "M2.5 12h3", "M18.5 12h3", "M5.3 5.3l2.1 2.1", "M16.6 16.6l2.1 2.1", "M5.3 18.7l2.1-2.1", "M16.6 7.4l2.1-2.1"],
  sliders: ["M4 6h10", "M18 6h2", "M16 4v4", "M4 12h4", "M12 12h8", "M10 10v4", "M4 18h12", "M20 18h0", "M18 16v4"],
  power: ["M12 3v9", "M6.3 6.8a8 8 0 1 0 11.4 0"],
  lock: ["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3"],
  moon: ["M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"],
  "volume-up": ["M4 9h3l5-4v14l-5-4H4z", "M16 9a4 4 0 0 1 0 6", "M18.5 6.5a7.5 7.5 0 0 1 0 11"],
  "volume-down": ["M4 9h3l5-4v14l-5-4H4z", "M16 9.5a3.5 3.5 0 0 1 0 5"],
  mute: ["M4 9h3l5-4v14l-5-4H4z", "M16 9.5l5 5", "M21 9.5l-5 5"],
  sun: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2v2", "M12 20v2", "M2 12h2", "M20 12h2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4"],
  play: ["M8 5.5v13l10.5-6.5z"],
  pause: ["M8 5h3v14H8z", "M13 5h3v14h-3z"],
  next: ["M6 6l8 6-8 6z", "M17 6v12"],
  prev: ["M18 6l-8 6 8 6z", "M7 6v12"],
  music: ["M9 18V6l11-2v12", "M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z", "M20 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"],
  monitor: ["M3 5h18v11H3z", "M9 20h6", "M12 16v4"],
  layers: ["M12 3l9 5-9 5-9-5z", "M3 13l9 5 9-5"],
  activity: ["M3 12h4l3-7 4 14 3-7h4"],
  broom: ["M14 3l-3.5 8", "M6.5 11h9l1.5 10H5z", "M9 15v6", "M12.5 15v6"],
  zap: ["M13 2L4 14h7l-1 8 9-12h-7z"],
  rocket: ["M12 15l-3-3c1.5-4.5 4.8-8 10-9-1 5.2-4.5 8.5-9 10z", "M9 12l-4 1 3-4", "M12 15l-1 4 4-3", "M15.5 8.5h.01"],
  mail: ["M3 6h18v12H3z", "M3 7l9 6 9-6"],
  chat: ["M4 5h16v11H9l-5 4z"],
  star: ["M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"],
  heart: ["M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20z"],
  home: ["M4 11l8-7 8 7", "M6 10v10h12V10", "M10 20v-5h4v5"],
  search: ["M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z", "M20 20l-4.8-4.8"],
  plus: ["M12 5v14", "M5 12h14"],
  edit: ["M4 20h4L19 9l-4-4L4 16z", "M13.5 6.5l4 4"],
  copy: ["M9 9h11v11H9z", "M5 15H4V4h11v1"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"],
  x: ["M6 6l12 12", "M18 6L6 18"],
  check: ["M5 12.5l4.5 4.5L19 7"],
  "chevron-left": ["M15 5l-7 7 7 7"],
  "chevron-right": ["M9 5l7 7-7 7"],
  "chevron-down": ["M5 9l7 7 7-7"],
  "arrow-right": ["M4 12h15", "M13 6l6 6-6 6"],
  keyboard: ["M3 7h18v10H3z", "M7 11h.01", "M11 11h.01", "M15 11h.01", "M8 14h8"],
  cpu: ["M7 7h10v10H7z", "M10 10h4v4h-4z", "M10 3v4", "M14 3v4", "M10 17v4", "M14 17v4", "M3 10h4", "M3 14h4", "M17 10h4", "M17 14h4"],
  wifi: ["M2.5 9a14 14 0 0 1 19 0", "M5.5 12.5a9.5 9.5 0 0 1 13 0", "M8.8 16a5 5 0 0 1 6.4 0", "M12 19.5h.01"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7v5l3 2"],
  bell: ["M6 16V11a6 6 0 0 1 12 0v5l2 2H4z", "M10 20.5h4"],
  bookmark: ["M6 3h12v18l-6-4-6 4z"],
  palette: ["M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.4-2-.4-1.2.4-2.2 1.6-2.2H18a3 3 0 0 0 3-3c0-5-4-10.8-9-10.8z", "M7.5 11h.01", "M10 7h.01", "M14.5 7h.01"],
  sparkles: ["M10 3l1.8 4.7L16.5 9.5l-4.7 1.8L10 16l-1.8-4.7L3.5 9.5l4.7-1.8z", "M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z"],
  briefcase: ["M3 8h18v11H3z", "M8 8V5h8v3", "M3 13h18"],
  gamepad: ["M6 8h12a4 4 0 0 1 3.9 4.9l-1 4a2.5 2.5 0 0 1-4.3 1L15 16H9l-1.6 1.9a2.5 2.5 0 0 1-4.3-1l-1-4A4 4 0 0 1 6 8z", "M8 11v3", "M6.5 12.5h3", "M15.5 12h.01", "M17.5 13.5h.01"],
  pin: ["M9 3h6l-1 6 4 3v2H6v-2l4-3z", "M12 14v7"],
  eye: ["M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  download: ["M12 4v11", "M7 10l5 5 5-5", "M4 20h16"],
  upload: ["M12 20V9", "M7 14l5-5 5 5", "M4 4h16"],
  refresh: ["M20 11a8 8 0 0 0-14.6-4.5L4 8", "M4 4v4h4", "M4 13a8 8 0 0 0 14.6 4.5L20 16", "M20 20v-4h-4"],
  minus: ["M5 12h14"],
  drag: ["M9 6h.01", "M15 6h.01", "M9 12h.01", "M15 12h.01", "M9 18h.01", "M15 18h.01"],
  "panel": ["M4 5h16v14H4z", "M4 9h16"],
  "sidebar": ["M4 5h16v14H4z", "M15 5v14"],
  "notch": ["M3 6h18", "M8 6v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6", "M4 6v12h16V6"],
  "dot": ["M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  photo: ["M4 5h16v14H4z", "M8 10a1.5 1.5 0 1 0 0-.01", "M20 15l-5-5-9 9"],
  cloud: ["M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5a4 4 0 0 1-1 8.5z"],
  bolt: ["M13 3L5 13h6l-1 8 8-10h-6z"],
  coffee: ["M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z", "M16 10h1.5a2.5 2.5 0 0 1 0 5H16", "M8 3.5c0 1 1 1.5 1 2.5s-1 1.5-1 2.5", "M12 3.5c0 1 1 1.5 1 2.5s-1 1.5-1 2.5"],
  shuffle: ["M3 7h3.5c2 0 3.3 1 4.4 2.7l2.2 4.6C14.2 16 15.5 17 17.5 17H21", "M3 17h3.5c1.2 0 2.1-.4 2.9-1.1", "M15 7h6", "M18 4l3 3-3 3", "M18 14l3 3-3 3"],
  repeat: ["M4 11V9a3 3 0 0 1 3-3h12", "M16 3l3 3-3 3", "M20 13v2a3 3 0 0 1-3 3H5", "M8 21l-3-3 3-3"],
  alarm: ["M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M12 9v4l2.5 1.5", "M4 4.5L6.5 2", "M20 4.5L17.5 2"],
  note: ["M5 4h14v11l-5 5H5z", "M14 20v-5h5", "M8 9h8", "M8 12.5h5"],
};

export const ICON_NAMES = Object.keys(P).filter((n) => !["dot", "drag", "x", "check", "minus", "chevron-left", "chevron-right", "chevron-down"].includes(n));

export function Glyph({ name, size = 20, stroke = 1.8, style, className }: { name: string; size?: number; stroke?: number; style?: CSSProperties; className?: string }) {
  const paths = P[name] ?? P.zap;
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export function ButtonIcon({ icon, size = 22 }: { icon: IconRef; size?: number }) {
  if (icon.type === "image") return <img src={icon.data} width={size} height={size} alt="" draggable={false} style={{ objectFit: "contain" }} />;
  if (icon.type === "text") return <span style={{ fontSize: size * 0.8, lineHeight: 1, fontWeight: 600 }}>{icon.value}</span>;
  return <Glyph name={icon.name} size={size} />;
}
