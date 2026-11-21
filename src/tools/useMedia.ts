import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, isDesktop, MediaAction, NowPlaying } from "../lib/api";

/**
 * Polls the Windows media session (Spotify first) while mounted and visible. Album art is
 * fetched only when the track changes, and the progress bar is extrapolated between polls.
 */
export function useMedia(intervalMs = 1500) {
  const [np, setNp] = useState<NowPlaying | null>(null);
  const [art, setArt] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const base = useRef({ pos: 0, at: Date.now() });
  const artKey = useRef("");

  const refresh = useCallback(async () => {
    if (!isDesktop()) return;
    try {
      const v = await api.nowPlaying();
      base.current = { pos: v.positionMs, at: Date.now() };
      setNp(v);
      if (v.artKey !== artKey.current) {
        artKey.current = v.artKey;
        setArt(v.available ? await api.mediaArt().catch(() => null) : null);
      }
    } catch { /* keep last state */ }
  }, []);

  useEffect(() => {
    if (!isDesktop()) return;
    let alive = true;
    let t: number | undefined;
    const tick = async () => {
      const visible = document.visibilityState === "visible" && (await getCurrentWindow().isVisible().catch(() => true));
      if (visible) await refresh();
      if (alive) t = window.setTimeout(tick, intervalMs);
    };
    void tick();
    return () => { alive = false; window.clearTimeout(t); };
  }, [intervalMs, refresh]);

  useEffect(() => {
    if (!np?.playing) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [np?.playing]);

  const position = np ? Math.min(np.durationMs || Infinity, base.current.pos + (np.playing ? now - base.current.at : 0)) : 0;

  const control = useCallback(async (action: MediaAction, value?: number) => {
    await api.mediaControl(action, value).catch(() => false);
    if (action === "seek" && value !== undefined) base.current = { pos: value, at: Date.now() };
    window.setTimeout(() => void refresh(), 350);
  }, [refresh]);

  return { np, art, position, control, refresh };
}

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
