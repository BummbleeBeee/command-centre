import type { DisplayMode, GlassStyle, Settings } from "../types";

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const PALETTES = {
  dark: { bg: "#10151f", surface: "#1b2231", text: "#eef2f8" },
  light: { bg: "#eef1f6", surface: "#ffffff", text: "#141a26" },
};

export const GRADIENTS: Record<string, string> = {
  aurora: "radial-gradient(120% 90% at 0% 0%, rgba(80,140,255,.30), transparent 55%), radial-gradient(90% 80% at 100% 100%, rgba(120,90,255,.26), transparent 60%)",
  dusk: "radial-gradient(110% 90% at 100% 0%, rgba(200,120,255,.28), transparent 55%), radial-gradient(90% 80% at 0% 100%, rgba(255,120,160,.20), transparent 60%)",
  ember: "radial-gradient(110% 90% at 0% 100%, rgba(255,140,80,.28), transparent 55%), radial-gradient(90% 80% at 100% 0%, rgba(255,90,90,.18), transparent 60%)",
  ocean: "radial-gradient(110% 90% at 50% 0%, rgba(60,200,220,.26), transparent 55%), radial-gradient(90% 80% at 0% 100%, rgba(60,120,255,.22), transparent 60%)",
  forest: "radial-gradient(110% 90% at 0% 0%, rgba(80,200,140,.26), transparent 55%), radial-gradient(90% 80% at 100% 100%, rgba(40,160,120,.20), transparent 60%)",
  rose: "radial-gradient(110% 90% at 100% 0%, rgba(255,110,170,.30), transparent 55%), radial-gradient(90% 80% at 0% 100%, rgba(255,170,120,.20), transparent 60%)",
  candy: "radial-gradient(100% 80% at 0% 0%, rgba(255,120,200,.30), transparent 55%), radial-gradient(100% 80% at 100% 100%, rgba(90,200,255,.28), transparent 60%)",
  lime: "radial-gradient(110% 90% at 100% 100%, rgba(180,240,90,.24), transparent 55%), radial-gradient(90% 80% at 0% 0%, rgba(60,200,160,.18), transparent 60%)",
  gold: "radial-gradient(110% 90% at 50% 0%, rgba(255,200,90,.26), transparent 55%), radial-gradient(90% 80% at 100% 100%, rgba(255,140,60,.16), transparent 60%)",
  mono: "linear-gradient(160deg, rgba(255,255,255,.07), transparent 60%)",
};

export interface ThemePreset {
  id: string;
  name: string;
  bg: string;
  surface: string;
  text: string;
  accent: string;
  backdrop: string;
  glass: GlassStyle;
}

/** Ready-made colour themes: far beyond "blue on black". */
export const THEME_PRESETS: ThemePreset[] = [
  { id: "midnight", name: "Midnight", bg: "#10151f", surface: "#1b2231", text: "#eef2f8", accent: "#7aa8ff", backdrop: "", glass: "frosted" },
  { id: "aurora", name: "Aurora", bg: "#120f24", surface: "#211b3d", text: "#f1edff", accent: "#a78bfa", backdrop: "aurora", glass: "frosted" },
  { id: "sunset", name: "Sunset", bg: "#241018", surface: "#3a1a26", text: "#fff0ea", accent: "#ff8a5c", backdrop: "ember", glass: "tinted" },
  { id: "rose", name: "Rose", bg: "#22101b", surface: "#3a1c2d", text: "#ffeef6", accent: "#ff6fae", backdrop: "rose", glass: "frosted" },
  { id: "forest", name: "Forest", bg: "#0d1a15", surface: "#173026", text: "#e9f8ef", accent: "#4ade80", backdrop: "forest", glass: "frosted" },
  { id: "ocean", name: "Ocean", bg: "#08161f", surface: "#0f2a38", text: "#e6f7ff", accent: "#22d3ee", backdrop: "ocean", glass: "clear" },
  { id: "candy", name: "Candy", bg: "#1a1030", surface: "#2a1c48", text: "#fff2fb", accent: "#f472b6", backdrop: "candy", glass: "tinted" },
  { id: "lime", name: "Lime", bg: "#11160b", surface: "#1f2a14", text: "#f3fbe6", accent: "#a3e635", backdrop: "lime", glass: "frosted" },
  { id: "gold", name: "Gold", bg: "#1a140a", surface: "#2c2312", text: "#fff6e3", accent: "#fbbf24", backdrop: "gold", glass: "frosted" },
  { id: "neon", name: "Neon", bg: "#07060c", surface: "#14121f", text: "#f5f3ff", accent: "#e040fb", backdrop: "", glass: "neon" },
  { id: "mono", name: "Graphite", bg: "#141414", surface: "#222222", text: "#f2f2f2", accent: "#d4d4d4", backdrop: "mono", glass: "solid" },
  { id: "mocha", name: "Mocha", bg: "#1b1410", surface: "#2d221b", text: "#f6ece4", accent: "#d4a373", backdrop: "", glass: "solid" },
  { id: "paper", name: "Paper", bg: "#f6f1e7", surface: "#fffaf0", text: "#2b2418", accent: "#c2410c", backdrop: "", glass: "solid" },
  { id: "ice", name: "Ice", bg: "#eaf3fb", surface: "#ffffff", text: "#0f2236", accent: "#2563eb", backdrop: "ocean", glass: "clear" },
  { id: "lavender", name: "Lavender", bg: "#f1ecfb", surface: "#ffffff", text: "#241a3b", accent: "#7c3aed", backdrop: "aurora", glass: "frosted" },
  { id: "peach", name: "Peach", bg: "#fdf0ea", surface: "#fffaf7", text: "#3a1f15", accent: "#f97316", backdrop: "rose", glass: "frosted" },
];

/** Settings patch that applies a preset. */
export function presetPatch(p: ThemePreset): Partial<Settings> {
  return { theme: "custom", customTheme: { background: p.bg, surface: p.surface, text: p.text }, accent: p.accent, backdrop: p.backdrop, glass: p.glass, themePreset: p.id };
}

/** Easing curves for the Motion setting. */
export const EASINGS: Record<Settings["easing"], string> = {
  smooth: "cubic-bezier(.2, .8, .2, 1)",
  snappy: "cubic-bezier(.3, 0, 0, 1)",
  bouncy: "cubic-bezier(.34, 1.56, .64, 1)",
  linear: "linear",
};

export function applyTheme(s: Settings, mode: DisplayMode) {
  const root = document.documentElement;
  const pal = s.theme === "custom" ? { bg: s.customTheme.background, surface: s.customTheme.surface, text: s.customTheme.text } : PALETTES[s.theme];
  const [br, bg, bb] = hexToRgb(pal.bg);
  const [sr, sg, sb] = hexToRgb(pal.surface);
  const [tr, tg, tb] = hexToRgb(pal.text);
  const [ar, ag, ab] = hexToRgb(s.accent);
  const light = (tr + tg + tb) / 3 < 128;
  // Glass style decides how see-through the panel is and how it is tinted.
  const base = s.opacity / 100;
  const alpha = s.glass === "solid" ? 1 : s.glass === "clear" ? Math.max(0.28, base * 0.55) : s.glass === "neon" ? Math.max(base, 0.9) : base;
  const tint = s.glass === "tinted" ? 0.22 : 0;
  const mix = (c: number, a: number) => Math.round(c * (1 - tint) + a * tint);
  const vars: Record<string, string> = {
    "--bg": `rgba(${mix(br, ar)},${mix(bg, ag)},${mix(bb, ab)},${alpha})`,
    "--bg-solid": pal.bg,
    "--surface": `rgba(${sr},${sg},${sb},${s.glass === "clear" ? (light ? 0.5 : 0.35) : light ? 0.75 : 0.55})`,
    "--surface-hover": `rgba(${sr},${sg},${sb},${light ? 0.95 : 0.85})`,
    "--text": pal.text,
    "--text-dim": `rgba(${tr},${tg},${tb},.62)`,
    "--text-faint": `rgba(${tr},${tg},${tb},.40)`,
    "--line": `rgba(${tr},${tg},${tb},${light ? 0.12 : 0.09})`,
    "--line-strong": s.glass === "neon" ? `rgba(${ar},${ag},${ab},.55)` : s.glass === "clear" ? `rgba(255,255,255,${light ? 0.6 : 0.22})` : `rgba(${tr},${tg},${tb},${light ? 0.2 : 0.16})`,
    "--accent": s.accent,
    "--accent-rgb": `${ar},${ag},${ab}`,
    "--accent-soft": `rgba(${ar},${ag},${ab},.16)`,
    "--radius": `${s.radius}px`,
    "--radius-sm": `${Math.max(4, Math.round(s.radius * 0.6))}px`,
    "--tile": `${s.buttonSize}px`,
    "--gap": `${s.gridGap}px`,
    "--shadow": light ? "0 18px 50px rgba(20,30,60,.18)" : "0 18px 50px rgba(0,0,0,.45)",
    "--backdrop": s.backdrop && GRADIENTS[s.backdrop] ? GRADIENTS[s.backdrop] : "none",
    "--glow": s.glass === "neon" ? `0 0 0 1px rgba(${ar},${ag},${ab},.6), 0 0 24px rgba(${ar},${ag},${ab},.35), inset 0 0 30px rgba(${ar},${ag},${ab},.08)` : "none",
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.anim = s.animations;
  root.dataset.scheme = light ? "light" : "dark";
  root.dataset.mode = mode;
  root.dataset.labels = s.showLabels ? "on" : "off";
  root.dataset.glass = s.glass;
  root.dataset.slide = s.slideIn ? "on" : "off";
  root.style.setProperty("--speed", String(s.animSpeed));
  root.style.setProperty("--ease", EASINGS[s.easing]);
}
