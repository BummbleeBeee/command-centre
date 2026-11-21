import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktop } from "../lib/api";
import type { AnimationLevel, BackgroundEffect } from "../types";

interface P { x: number; y: number; vx: number; vy: number; r: number; a: number; t: number; c?: string }

const GLYPHS = "アイウエオカキクケコサシスセソ0123456789ABCDEF<>/*+=";

function rgba(rgb: string, a: number) { return `rgba(${rgb},${a})`; }

/**
 * Animated canvas background ("shader" effects). Capped at 30 fps, paused while the window
 * is hidden or the tab is in the background, and disabled entirely when animations are off.
 */
export function BackgroundFx({ effect, intensity, animations }: { effect: BackgroundEffect; intensity: number; animations: AnimationLevel }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || effect === "none" || animations === "off") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb").trim() || "122,168,255";
    const light = document.documentElement.dataset.scheme === "light";
    const ink = light ? "40,50,80" : "235,240,255";
    const density = (intensity / 100) * (animations === "reduced" ? 0.45 : 1);
    let w = 0, h = 0, dpr = 1;
    let parts: P[] = [];
    let cols: number[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    const make = (): P => {
      switch (effect) {
        case "rain": return { x: rnd(0, w), y: rnd(-h, h), vx: -0.6, vy: rnd(9, 15), r: rnd(10, 22), a: rnd(0.12, 0.35), t: 0 };
        case "snow": return { x: rnd(0, w), y: rnd(-h, h), vx: rnd(-0.3, 0.3), vy: rnd(0.4, 1.2), r: rnd(1, 3), a: rnd(0.35, 0.85), t: rnd(0, 6.28) };
        case "stars": return { x: rnd(0, w), y: rnd(0, h), vx: rnd(0.02, 0.08), vy: 0, r: rnd(0.4, 1.6), a: rnd(0.2, 0.9), t: rnd(0, 6.28) };
        case "bubbles": return { x: rnd(0, w), y: h + rnd(0, h), vx: 0, vy: -rnd(0.3, 1), r: rnd(3, 14), a: rnd(0.12, 0.3), t: rnd(0, 6.28) };
        case "fireflies": return { x: rnd(0, w), y: rnd(0, h), vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), r: rnd(1.2, 2.6), a: 0, t: rnd(0, 6.28) };
        default: return { x: 0, y: 0, vx: 0, vy: 0, r: 0, a: 0, t: 0 };
      }
    };
    const counts: Record<string, number> = { rain: 140, snow: 90, stars: 120, bubbles: 30, fireflies: 40 };

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.max(1, w * dpr); canvas.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((counts[effect] ?? 0) * density * Math.min(2, (w * h) / (700 * 500)));
      parts = Array.from({ length: n }, make);
      cols = Array.from({ length: Math.ceil(w / 14) }, () => rnd(-h, 0));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let visible = true;
    const vis = window.setInterval(async () => {
      visible = document.visibilityState === "visible" && (!isDesktop() || (await getCurrentWindow().isVisible().catch(() => true)));
    }, 2000);

    let raf = 0, last = 0, time = 0;
    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || ts - last < 33) return; // ~30 fps cap
      const dt = Math.min(3, (ts - last) / 16.7);
      last = ts; time += dt;
      ctx.clearRect(0, 0, w, h);
      switch (effect) {
        case "rain":
          ctx.lineWidth = 1;
          for (const p of parts) {
            p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.y > h) { p.y = -p.r; p.x = rnd(0, w + 40); }
            ctx.strokeStyle = rgba(ink, p.a);
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 2, p.y - p.r); ctx.stroke();
          }
          break;
        case "snow":
          for (const p of parts) {
            p.t += 0.02 * dt; p.x += (p.vx + Math.sin(p.t) * 0.4) * dt; p.y += p.vy * dt;
            if (p.y > h + 5) { p.y = -5; p.x = rnd(0, w); }
            ctx.fillStyle = rgba(light ? "120,140,180" : "255,255,255", p.a);
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
          }
          break;
        case "stars":
          for (const p of parts) {
            p.t += 0.04 * dt; p.x += p.vx * dt; if (p.x > w) p.x = 0;
            ctx.fillStyle = rgba(ink, p.a * (0.55 + 0.45 * Math.sin(p.t)));
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
          }
          break;
        case "bubbles":
          for (const p of parts) {
            p.t += 0.02 * dt; p.y += p.vy * dt; p.x += Math.sin(p.t) * 0.3 * dt;
            if (p.y < -20) { p.y = h + 20; p.x = rnd(0, w); }
            ctx.strokeStyle = rgba(accent, p.a + 0.15); ctx.fillStyle = rgba(accent, p.a * 0.35);
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); ctx.stroke();
          }
          break;
        case "fireflies":
          for (const p of parts) {
            p.t += 0.03 * dt; p.vx += rnd(-0.03, 0.03); p.vy += rnd(-0.03, 0.03);
            p.vx = Math.max(-0.5, Math.min(0.5, p.vx)); p.vy = Math.max(-0.5, Math.min(0.5, p.vy));
            p.x = (p.x + p.vx * dt + w) % w; p.y = (p.y + p.vy * dt + h) % h;
            const a = 0.25 + 0.6 * Math.max(0, Math.sin(p.t));
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
            g.addColorStop(0, rgba(accent, a)); g.addColorStop(1, rgba(accent, 0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 6, 0, 6.283); ctx.fill();
          }
          break;
        case "matrix":
          ctx.font = "13px Consolas, monospace";
          for (let i = 0; i < cols.length; i++) {
            if (Math.random() > density + 0.15) continue;
            const y = (cols[i] += 14 * dt * 0.6);
            ctx.fillStyle = rgba(accent, 0.5);
            ctx.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)], i * 14, y);
            ctx.fillStyle = rgba(accent, 0.12);
            ctx.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)], i * 14, y - 28);
            if (y > h + rnd(0, 300)) cols[i] = rnd(-100, 0);
          }
          break;
        case "waves": {
          const lines = Math.round(3 + 4 * density);
          for (let k = 0; k < lines; k++) {
            ctx.strokeStyle = rgba(accent, 0.08 + 0.05 * k / lines);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let x = 0; x <= w; x += 8) {
              const y = h * (0.35 + k * 0.08) + Math.sin(x * 0.012 + time * 0.03 + k) * (14 + k * 4) + Math.sin(x * 0.004 - time * 0.02) * 18;
              if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
          break;
        }
        case "aurora": {
          for (let k = 0; k < 3; k++) {
            const cx = w * (0.3 + 0.4 * Math.sin(time * 0.004 + k * 2.1));
            const cy = h * (0.35 + 0.25 * Math.cos(time * 0.003 + k * 1.7));
            const r = Math.max(w, h) * (0.45 + 0.1 * k);
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            const hue = k === 0 ? accent : k === 1 ? "80,220,180" : "190,110,255";
            g.addColorStop(0, rgba(hue, 0.16 * (0.6 + density * 0.6)));
            g.addColorStop(1, rgba(hue, 0));
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
          }
          break;
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.clearInterval(vis); };
  }, [effect, intensity, animations]);

  if (effect === "none" || animations === "off") return null;
  return <canvas ref={ref} className="bg-fx" aria-hidden="true" />;
}
