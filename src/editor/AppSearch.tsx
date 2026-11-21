import { useEffect, useMemo, useRef, useState } from "react";
import { Glyph } from "../components/Icon";
import { api, InstalledApp, isDesktop } from "../lib/api";
import { installedApps } from "../lib/resolveApps";

const iconCache = new Map<string, string | null>();

/** Ranks installed apps for a query: name starts with it, then a word starts with it, then contains it. */
export function rankApps(apps: InstalledApp[], q: string, limit = 8): InstalledApp[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const score = (a: InstalledApp) => {
    const n = a.name.toLowerCase();
    if (n.startsWith(t)) return 0;
    if (n.split(/[\s\-_.]+/).some((w) => w.startsWith(t))) return 1;
    if (n.includes(t)) return 2;
    return 9;
  };
  return apps.map((a) => [score(a), a] as const).filter(([s]) => s < 9).sort((x, y) => x[0] - y[0] || x[1].name.length - y[1].name.length).slice(0, limit).map(([, a]) => a);
}

function AppRowIcon({ target }: { target: string }) {
  const [src, setSrc] = useState<string | null | undefined>(iconCache.get(target));
  useEffect(() => {
    if (src !== undefined || !isDesktop()) return;
    let alive = true;
    void api.extractIcon(target, 48).then((d) => { iconCache.set(target, d); if (alive) setSrc(d); }).catch(() => { iconCache.set(target, null); if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [target, src]);
  return src ? <img src={src} alt="" width={22} height={22} /> : <Glyph name="rocket" size={16} />;
}

/** Type-ahead search over installed apps ("ch" → Chrome…), with each app's real icon. */
export function AppSearch({ onPick, autoFocus }: { onPick: (app: InstalledApp, icon: string | null) => void; autoFocus?: boolean }) {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { void installedApps().then(setApps); }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  const results = useMemo(() => rankApps(apps, q), [apps, q]);
  useEffect(() => setActive(0), [q]);

  const pick = async (a: InstalledApp) => {
    setOpen(false);
    setQ(a.name);
    let icon = iconCache.get(a.target) ?? null;
    if (!icon && isDesktop()) icon = await api.extractIcon(a.target, 96).catch(() => null);
    onPick(a, icon);
  };

  return (
    <div className="app-search" ref={box}>
      <label className="search">
        <Glyph name="search" size={14} />
        <input className="bare" value={q} autoFocus={autoFocus} placeholder={apps.length ? "Search apps to add, e.g. “ch” for Chrome" : "Loading installed apps…"}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
            if (e.key === "Enter" && results[active]) { e.preventDefault(); void pick(results[active]); }
            if (e.key === "Escape") setOpen(false);
          }} />
      </label>
      {open && q.trim() && (
        <div className="app-suggest" role="listbox">
          {results.length === 0 && <div className="app-suggest-empty">No installed app matches “{q}”. Use Browse in a Launch step for any .exe.</div>}
          {results.map((a, i) => (
            <button key={a.target} role="option" aria-selected={i === active} className={`app-suggest-row ${i === active ? "active" : ""}`}
              onMouseEnter={() => setActive(i)} onClick={() => void pick(a)}>
              <span className="app-suggest-icon"><AppRowIcon target={a.target} /></span>
              <span className="grow">{highlight(a.name, q)}</span>
              <small>{a.source === "store" ? "Store app" : "App"}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function highlight(name: string, q: string) {
  const i = name.toLowerCase().indexOf(q.trim().toLowerCase());
  if (i < 0 || !q.trim()) return name;
  return <>{name.slice(0, i)}<mark>{name.slice(i, i + q.trim().length)}</mark>{name.slice(i + q.trim().length)}</>;
}
