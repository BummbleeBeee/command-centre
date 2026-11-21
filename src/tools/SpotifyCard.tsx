import { Glyph } from "../components/Icon";
import { api, isDesktop } from "../lib/api";
import { installedApps, matchApp } from "../lib/resolveApps";
import { fmtTime, useMedia } from "./useMedia";

export async function openSpotify() {
  const app = matchApp(await installedApps(), "Spotify");
  if (app) await api.launchApp(app.target);
  else await api.openUrl("https://open.spotify.com");
}

export function SpotifyCard() {
  const { np, art, position, control } = useMedia(1000);
  const has = !!np?.available && !!(np.title || np.artist);
  const pct = np && np.durationMs ? Math.min(100, (position / np.durationMs) * 100) : 0;
  return (
    <div className="spotify">
      <div className={`spotify-art ${has ? "" : "empty"}`}>
        {art ? <img src={art} alt="" draggable={false} /> : <Glyph name="music" size={42} />}
      </div>
      <div className="spotify-main">
        <div className="spotify-source">
          <span className={`spotify-dot ${np?.isSpotify ? "on" : ""}`} />
          {np?.isSpotify ? "Spotify" : has ? `Playing in ${np!.app}` : isDesktop() ? "Spotify isn't playing" : "Desktop app only"}
        </div>
        <h3 className="spotify-title">{has ? np!.title || "Unknown title" : "Nothing playing"}</h3>
        <p className="spotify-artist">{has ? [np!.artist, np!.album].filter(Boolean).join(" · ") : "Open Spotify and press play. Controls work for any app that uses Windows media controls."}</p>
        <div className="spotify-progress">
          <span>{fmtTime(position)}</span>
          <div className="bar" role="slider" aria-label="Seek" aria-valuenow={Math.round(pct)}
            onClick={(e) => {
              if (!np?.durationMs) return;
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              void control("seek", ((e.clientX - r.left) / r.width) * np.durationMs);
            }}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <span>{np?.durationMs ? fmtTime(np.durationMs) : "–:––"}</span>
        </div>
        <div className="spotify-controls">
          <button className={np?.shuffle ? "on" : ""} disabled={!has || np?.shuffle === null} onClick={() => void control("shuffle")} title="Shuffle"><Glyph name="shuffle" size={17} /></button>
          <button onClick={() => void control("previous")} disabled={!has} title="Previous"><Glyph name="prev" size={18} /></button>
          <button className="play" onClick={() => void control("play_pause")} disabled={!has} title="Play / pause"><Glyph name={np?.playing ? "pause" : "play"} size={20} /></button>
          <button onClick={() => void control("next")} disabled={!has} title="Next"><Glyph name="next" size={18} /></button>
          <button className={np && (np.repeat === "list" || np.repeat === "track") ? "on" : ""} disabled={!has || np?.repeat === "unknown"} onClick={() => void control("repeat")} title={`Repeat: ${np?.repeat ?? "off"}`}>
            <Glyph name="repeat" size={17} />{np?.repeat === "track" && <b className="repeat-one">1</b>}
          </button>
        </div>
        <button className="btn spotify-open" disabled={!isDesktop()} onClick={() => void openSpotify().catch(() => undefined)}><Glyph name="music" size={14} /> Open Spotify</button>
      </div>
    </div>
  );
}
