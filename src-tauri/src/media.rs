//! Now-playing and transport control through Windows' Global System Media Transport
//! Controls. Prefers the Spotify desktop app's session when it is running, so the
//! Spotify card controls Spotify even if a browser tab is also playing.

use base64::Engine;
use serde::Serialize;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session, GlobalSystemMediaTransportControlsSessionManager as Mgr,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
};
use windows::Media::MediaPlaybackAutoRepeatMode as Repeat;
use windows::Storage::Streams::DataReader;
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    available: bool,
    title: String,
    artist: String,
    album: String,
    app: String,
    is_spotify: bool,
    playing: bool,
    position_ms: u64,
    duration_ms: u64,
    shuffle: Option<bool>,
    repeat: String,
    art_key: String,
}

fn session_app(s: &Session) -> String {
    s.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default()
}

fn pick_session(mgr: &Mgr) -> Option<Session> {
    if let Ok(list) = mgr.GetSessions() {
        let n = list.Size().unwrap_or(0);
        for i in 0..n {
            if let Ok(s) = list.GetAt(i) {
                if session_app(&s).to_lowercase().contains("spotify") {
                    return Some(s);
                }
            }
        }
    }
    mgr.GetCurrentSession().ok()
}

fn mta<T>(f: impl FnOnce() -> T) -> T {
    unsafe {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        let r = f();
        if hr.is_ok() {
            CoUninitialize();
        }
        r
    }
}

fn friendly_app(aumid: &str) -> String {
    let last = aumid.rsplit(['\\', '!']).next().unwrap_or("");
    let base = last.trim_end_matches(".exe");
    if aumid.to_lowercase().contains("spotify") {
        "Spotify".into()
    } else if base.is_empty() {
        aumid.into()
    } else {
        base.into()
    }
}

fn query() -> windows::core::Result<NowPlaying> {
    let mgr = Mgr::RequestAsync()?.get()?;
    let Some(session) = pick_session(&mgr) else { return Ok(NowPlaying::default()) };
    let props = session.TryGetMediaPropertiesAsync()?.get()?;
    let info = session.GetPlaybackInfo()?;
    let playing = info.PlaybackStatus().map(|s| s == Status::Playing).unwrap_or(false);
    let shuffle = info.IsShuffleActive().and_then(|r| r.Value()).ok();
    let repeat = match info.AutoRepeatMode().and_then(|r| r.Value()) {
        Ok(Repeat::Track) => "track",
        Ok(Repeat::List) => "list",
        Ok(_) => "none",
        Err(_) => "unknown",
    }
    .to_string();
    let (position_ms, duration_ms) = session
        .GetTimelineProperties()
        .map(|t| {
            let pos = t.Position().map(|d| d.Duration).unwrap_or(0);
            let end = t.EndTime().map(|d| d.Duration).unwrap_or(0);
            ((pos.max(0) / 10_000) as u64, (end.max(0) / 10_000) as u64)
        })
        .unwrap_or((0, 0));
    let aumid = session_app(&session);
    let title = props.Title()?.to_string();
    let artist = props.Artist()?.to_string();
    Ok(NowPlaying {
        available: true,
        art_key: format!("{title}\u{1}{artist}"),
        album: props.AlbumTitle().map(|h| h.to_string()).unwrap_or_default(),
        is_spotify: aumid.to_lowercase().contains("spotify"),
        app: friendly_app(&aumid),
        title,
        artist,
        playing,
        position_ms,
        duration_ms,
        shuffle,
        repeat,
    })
}

#[tauri::command]
pub async fn now_playing() -> Result<NowPlaying, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(mta(|| query().unwrap_or_default())))
        .await
        .map_err(|e| e.to_string())?
}

fn art() -> windows::core::Result<Option<String>> {
    let mgr = Mgr::RequestAsync()?.get()?;
    let Some(session) = pick_session(&mgr) else { return Ok(None) };
    let props = session.TryGetMediaPropertiesAsync()?.get()?;
    let Ok(thumb) = props.Thumbnail() else { return Ok(None) };
    let stream = thumb.OpenReadAsync()?.get()?;
    let size = stream.Size()? as u32;
    if size == 0 || size > 4 * 1024 * 1024 {
        return Ok(None);
    }
    let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0)?)?;
    reader.LoadAsync(size)?.get()?;
    let mut buf = vec![0u8; size as usize];
    reader.ReadBytes(&mut buf)?;
    let mime = stream.ContentType().map(|c| c.to_string()).unwrap_or_default();
    let mime = if mime.starts_with("image/") { mime } else { "image/jpeg".into() };
    Ok(Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(buf))))
}

/// Album art of the current track as a data URL (fetched only when the track changes).
#[tauri::command]
pub async fn media_art() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(mta(|| art().unwrap_or(None))))
        .await
        .map_err(|e| e.to_string())?
}

fn control(action: &str, value: Option<f64>) -> windows::core::Result<bool> {
    let mgr = Mgr::RequestAsync()?.get()?;
    let Some(s) = pick_session(&mgr) else { return Ok(false) };
    Ok(match action {
        "play_pause" => s.TryTogglePlayPauseAsync()?.get()?,
        "play" => s.TryPlayAsync()?.get()?,
        "pause" => s.TryPauseAsync()?.get()?,
        "next" => s.TrySkipNextAsync()?.get()?,
        "previous" => s.TrySkipPreviousAsync()?.get()?,
        "shuffle" => {
            let cur = s.GetPlaybackInfo()?.IsShuffleActive().and_then(|r| r.Value()).unwrap_or(false);
            s.TryChangeShuffleActiveAsync(!cur)?.get()?
        }
        "repeat" => {
            let cur = s.GetPlaybackInfo()?.AutoRepeatMode().and_then(|r| r.Value()).unwrap_or(Repeat::None);
            let next = match cur {
                Repeat::None => Repeat::List,
                Repeat::List => Repeat::Track,
                _ => Repeat::None,
            };
            s.TryChangeAutoRepeatModeAsync(next)?.get()?
        }
        "seek" => s.TryChangePlaybackPositionAsync((value.unwrap_or(0.0).max(0.0) * 10_000.0) as i64)?.get()?,
        _ => false,
    })
}

/// Transport control for the preferred (Spotify-first) media session.
#[tauri::command]
pub async fn media_control(action: String, value: Option<f64>) -> Result<bool, String> {
    if !["play_pause", "play", "pause", "next", "previous", "shuffle", "repeat", "seek"].contains(&action.as_str()) {
        return Err(format!("Unknown media action \"{action}\""));
    }
    tauri::async_runtime::spawn_blocking(move || mta(|| control(&action, value)).map_err(|e| e.message().to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn friendly_names() {
        assert_eq!(friendly_app("Spotify.exe"), "Spotify");
        assert_eq!(friendly_app("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic"), "Microsoft.ZuneMusic");
        assert_eq!(friendly_app("chrome.exe"), "chrome");
    }

    #[test]
    #[ignore = "queries the Windows media session"]
    fn e2e_media_query_does_not_fail() {
        let np = mta(query);
        assert!(np.is_ok(), "{:?}", np.err());
    }
}
