import { useCallback, useEffect, useState } from "react";
import { useApp } from "../app/context";
import { Glyph } from "../components/Icon";
import { api, isDesktop, SpotifyPlaylist } from "../lib/api";

let cache: SpotifyPlaylist[] | null = null;

/** Your Spotify playlists (Spotify Web API). Includes the one-time connect steps. */
export function SpotifyPlaylists({ compact }: { compact?: boolean }) {
  const app = useApp();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [lists, setLists] = useState<SpotifyPlaylist[] | null>(cache);
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try { setError(null); const l = await api.spotifyPlaylists(); cache = l; setLists(l); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!isDesktop()) { setConnected(false); return; }
    void api.spotifyStatus().then((c) => { setConnected(c); if (c && !cache) void load(); }).catch(() => setConnected(false));
  }, [load]);

  const connect = async () => {
    setBusy(true); setError(null);
    try { await api.spotifyConnect(clientId); setConnected(true); await load(); app.toast({ kind: "success", title: "Spotify connected" }); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const play = async (p: SpotifyPlaylist) => {
    try {
      const r = await api.spotifyPlay(p.uri);
      app.toast({ kind: "success", title: r === "playing" ? `Playing ${p.name}` : `Opened ${p.name} in Spotify`, detail: r === "opened" ? "Press play in Spotify (starting playback from here needs Spotify Premium and Spotify open)." : undefined });
    } catch (e) { app.toast({ kind: "error", title: "Spotify", detail: (e as Error).message }); }
  };

  if (connected === null) return <p className="dim small">Checking Spotify…</p>;
  if (!connected) {
    return (
      <div className="sp-connect">
        <strong><Glyph name="music" size={14} /> Show your playlists</strong>
        {!compact && (
          <ol className="dim small">
            <li>Open <b>developer.spotify.com/dashboard</b>, sign in and click <b>Create app</b> (any name).</li>
            <li>Add this Redirect URI: <code>http://127.0.0.1:43821/callback</code> and tick <b>Web API</b>.</li>
            <li>Copy the app's <b>Client ID</b>, paste it below, and click Connect. Your browser asks you to allow access.</li>
          </ol>
        )}
        {compact && <p className="dim small">Connect once in Tools → Spotify (needs a free Spotify developer Client ID).</p>}
        {!compact && (
          <div className="row">
            <input className="grow" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Spotify Client ID" />
            <button className="btn" disabled={!isDesktop()} onClick={() => void api.openUrl("https://developer.spotify.com/dashboard")}>Open dashboard</button>
            <button className="btn primary" disabled={busy || clientId.trim().length < 16} onClick={() => void connect()}>{busy ? "Waiting for browser…" : "Connect"}</button>
          </div>
        )}
        {error && <p className="warn small">{error}</p>}
      </div>
    );
  }
  const shown = (lists ?? []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className={`sp-lists ${compact ? "compact" : ""}`}>
      <div className="row">
        <strong className="grow"><Glyph name="music" size={14} /> Playlists</strong>
        {!compact && <input className="sp-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" />}
        <button className="icon-btn" onClick={() => void load()} title="Refresh"><Glyph name="refresh" size={13} /></button>
        {!compact && <button className="btn" onClick={() => void api.spotifyDisconnect().then(() => { cache = null; setLists(null); setConnected(false); })}>Disconnect</button>}
      </div>
      {error && <p className="warn small">{error}</p>}
      {lists === null && !error && <p className="dim small">Loading playlists…</p>}
      {lists && lists.length === 0 && <p className="dim small">No playlists found on your account.</p>}
      <div className="sp-grid">
        {shown.map((p) => (
          <button key={p.id} className="sp-item" onClick={() => void play(p)} title={`${p.name} · ${p.tracks} tracks${p.owner ? ` · ${p.owner}` : ""}`}>
            {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span className="sp-noart"><Glyph name="music" size={16} /></span>}
            <span className="sp-name">{p.name}</span>
            {!compact && <small>{p.tracks} tracks</small>}
          </button>
        ))}
      </div>
    </div>
  );
}
