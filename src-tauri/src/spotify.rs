//! Spotify Web API: sign-in (Authorization Code + PKCE, no client secret), your playlists,
//! and playing a playlist. Tokens live in Windows Credential Manager.
//!
//! Playing through the Web API needs Spotify Premium and an active device; otherwise the
//! playlist is opened in the Spotify desktop app (`spotify:` URI) so you can press play.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::launcher::shell_open;
use crate::util::com_blocking;

const SERVICE: &str = "CommandCentre";
pub const REDIRECT_PORT: u16 = 43821;
pub const REDIRECT_URI: &str = "http://127.0.0.1:43821/callback";
const SCOPES: &str = "playlist-read-private playlist-read-collaborative user-read-playback-state user-modify-playback-state user-read-currently-playing";

fn store(name: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, &format!("spotify-{name}")).map_err(|e| e.to_string())
}
fn read(name: &str) -> Option<String> {
    store(name).ok()?.get_password().ok()
}

#[derive(Default)]
pub struct SpotifyState {
    token: Mutex<Option<(String, Instant)>>,
}

fn b64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// PKCE verifier + S256 challenge (pure apart from the random bytes; unit-tested).
pub fn pkce_pair(random: &[u8; 48]) -> (String, String) {
    let verifier = b64url(random);
    let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

fn query_param(path: &str, key: &str) -> Option<String> {
    let q = path.split_once('?')?.1.split_whitespace().next()?;
    url::form_urlencoded::parse(q.as_bytes()).find(|(k, _)| k == key).map(|(_, v)| v.into_owned())
}

/// Waits (max 3 minutes) for Spotify to redirect the browser back to our loopback address.
fn wait_for_callback(state: &str) -> Result<String, String> {
    let listener = TcpListener::bind(("127.0.0.1", REDIRECT_PORT)).map_err(|e| format!("Port {REDIRECT_PORT} is busy: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(180);
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]).to_string();
                let path = req.lines().next().unwrap_or("").split_whitespace().nth(1).unwrap_or("").to_string();
                if !path.starts_with("/callback") {
                    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
                    continue;
                }
                let ok = query_param(&path, "state").as_deref() == Some(state);
                let code = query_param(&path, "code");
                let error = query_param(&path, "error");
                let msg = if ok && code.is_some() { "Spotify is connected to Command Centre. You can close this tab." } else { "Spotify sign-in failed. Please try again from Command Centre." };
                let body = format!("<!doctype html><meta charset=utf-8><title>Command Centre</title><body style=\"font-family:Segoe UI;background:#10151f;color:#eef2f8;display:grid;place-items:center;height:90vh\"><h2>{msg}</h2></body>");
                let _ = stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes());
                if !ok {
                    return Err("Sign-in response did not match (state check failed).".into());
                }
                return code.ok_or_else(|| format!("Spotify sign-in was cancelled{}", error.map(|e| format!(" ({e})")).unwrap_or_default()));
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() > deadline {
                    return Err("Timed out waiting for the Spotify sign-in (3 minutes).".into());
                }
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

async fn token_request(form: &[(&str, &str)]) -> Result<Value, String> {
    let resp = reqwest::Client::new()
        .post("https://accounts.spotify.com/api/token")
        .form(form)
        .send()
        .await
        .map_err(|e| format!("Could not reach Spotify: {e}"))?;
    let status = resp.status();
    let v: Value = resp.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        return Err(format!("Spotify sign-in error: {}", v["error_description"].as_str().or(v["error"].as_str()).unwrap_or("unknown")));
    }
    Ok(v)
}

fn remember(state: &SpotifyState, v: &Value) -> Result<String, String> {
    let access = v["access_token"].as_str().ok_or("No access token from Spotify")?.to_string();
    let secs = v["expires_in"].as_u64().unwrap_or(3600).saturating_sub(60);
    if let Some(r) = v["refresh_token"].as_str() {
        store("refresh")?.set_password(r).map_err(|e| e.to_string())?;
    }
    *state.token.lock().unwrap() = Some((access.clone(), Instant::now() + Duration::from_secs(secs)));
    Ok(access)
}

async fn access_token(state: &SpotifyState) -> Result<String, String> {
    if let Some((t, exp)) = state.token.lock().unwrap().clone() {
        if Instant::now() < exp {
            return Ok(t);
        }
    }
    let client_id = read("client-id").ok_or("Spotify isn't connected yet.")?;
    let refresh = read("refresh").ok_or("Spotify isn't connected yet.")?;
    let v = token_request(&[("grant_type", "refresh_token"), ("refresh_token", &refresh), ("client_id", &client_id)]).await?;
    remember(state, &v)
}

/// Opens the Spotify sign-in page in the browser and completes the PKCE flow.
#[tauri::command]
pub async fn spotify_connect(state: tauri::State<'_, SpotifyState>, client_id: String) -> Result<(), String> {
    let client_id = client_id.trim().to_string();
    if client_id.len() < 16 || !client_id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("That doesn't look like a Spotify Client ID (32 letters and numbers).".into());
    }
    let mut random = [0u8; 48];
    getrandom::getrandom(&mut random).map_err(|e| e.to_string())?;
    let (verifier, challenge) = pkce_pair(&random);
    let mut st = [0u8; 16];
    getrandom::getrandom(&mut st).map_err(|e| e.to_string())?;
    let state_param = b64url(&st);
    let mut auth = url::Url::parse("https://accounts.spotify.com/authorize").unwrap();
    auth.query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", REDIRECT_URI)
        .append_pair("code_challenge_method", "S256")
        .append_pair("code_challenge", &challenge)
        .append_pair("scope", SCOPES)
        .append_pair("state", &state_param);
    let waiter = {
        let s = state_param.clone();
        tauri::async_runtime::spawn_blocking(move || wait_for_callback(&s))
    };
    let url = auth.to_string();
    com_blocking(move || shell_open(&url, None, None, false)).await?;
    let code = waiter.await.map_err(|e| e.to_string())??;
    let v = token_request(&[
        ("grant_type", "authorization_code"),
        ("code", &code),
        ("redirect_uri", REDIRECT_URI),
        ("client_id", &client_id),
        ("code_verifier", &verifier),
    ])
    .await?;
    store("client-id")?.set_password(&client_id).map_err(|e| e.to_string())?;
    remember(&state, &v)?;
    Ok(())
}

#[tauri::command]
pub fn spotify_disconnect(state: tauri::State<'_, SpotifyState>) {
    for k in ["refresh", "client-id"] {
        if let Ok(e) = store(k) {
            let _ = e.delete_credential();
        }
    }
    *state.token.lock().unwrap() = None;
}

#[tauri::command]
pub fn spotify_status() -> bool {
    read("refresh").is_some() && read("client-id").is_some()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    id: String,
    name: String,
    uri: String,
    image: Option<String>,
    tracks: u64,
    owner: String,
}

async fn api_get(state: &SpotifyState, url: &str) -> Result<Value, String> {
    let token = access_token(state).await?;
    let resp = reqwest::Client::new().get(url).bearer_auth(token).send().await.map_err(|e| e.to_string())?;
    if resp.status().as_u16() == 401 {
        *state.token.lock().unwrap() = None;
        return Err("Spotify session expired. Reconnect in Tools → Spotify.".into());
    }
    if !resp.status().is_success() {
        return Err(format!("Spotify error {}", resp.status()));
    }
    resp.json().await.map_err(|e| e.to_string())
}

/// Your playlists (up to 100), newest first as Spotify orders them.
#[tauri::command]
pub async fn spotify_playlists(state: tauri::State<'_, SpotifyState>) -> Result<Vec<Playlist>, String> {
    let mut out = Vec::new();
    let mut next = Some("https://api.spotify.com/v1/me/playlists?limit=50".to_string());
    while let Some(url) = next.take() {
        let v = api_get(&state, &url).await?;
        for p in v["items"].as_array().cloned().unwrap_or_default() {
            if p.is_null() {
                continue;
            }
            out.push(Playlist {
                id: p["id"].as_str().unwrap_or("").into(),
                name: p["name"].as_str().unwrap_or("Untitled").into(),
                uri: p["uri"].as_str().unwrap_or("").into(),
                image: p["images"].as_array().and_then(|a| a.last().or(a.first())).and_then(|i| i["url"].as_str()).map(String::from),
                tracks: p["tracks"]["total"].as_u64().unwrap_or(0),
                owner: p["owner"]["display_name"].as_str().unwrap_or("").into(),
            });
        }
        if out.len() < 100 {
            next = v["next"].as_str().map(String::from);
        }
    }
    Ok(out)
}

pub fn valid_spotify_uri(uri: &str) -> bool {
    let parts: Vec<&str> = uri.split(':').collect();
    parts.len() == 3 && parts[0] == "spotify" && ["playlist", "album", "artist", "track", "show"].contains(&parts[1]) && !parts[2].is_empty() && parts[2].chars().all(|c| c.is_ascii_alphanumeric())
}

/// Plays a playlist. Returns "playing" (Web API, Premium) or "opened" (opened in the Spotify app).
#[tauri::command]
pub async fn spotify_play(state: tauri::State<'_, SpotifyState>, uri: String) -> Result<String, String> {
    if !valid_spotify_uri(&uri) {
        return Err("Not a Spotify link.".into());
    }
    if let Ok(token) = access_token(&state).await {
        let resp = reqwest::Client::new()
            .put("https://api.spotify.com/v1/me/player/play")
            .bearer_auth(token)
            .json(&serde_json::json!({ "context_uri": uri }))
            .send()
            .await;
        if let Ok(r) = resp {
            if r.status().is_success() {
                return Ok("playing".into());
            }
        }
    }
    // No Premium / no active device: open it in the Spotify app instead.
    com_blocking(move || shell_open(&uri, None, None, false)).await?;
    Ok("opened".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_matches_rfc7636_shape() {
        let (v, c) = pkce_pair(&[7u8; 48]);
        assert_eq!(v.len(), 64);
        assert_eq!(c.len(), 43);
        assert!(!v.contains('=') && !c.contains('+') && !c.contains('/'));
        // RFC 7636 appendix B test vector
        let rfc_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(b64url(&Sha256::digest(rfc_verifier.as_bytes())), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn spotify_uris_are_validated() {
        assert!(valid_spotify_uri("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"));
        assert!(!valid_spotify_uri("spotify:playlist:../x"));
        assert!(!valid_spotify_uri("https://evil"));
        assert!(!valid_spotify_uri("spotify:user:me:collection"));
    }

    #[test]
    fn callback_params() {
        assert_eq!(query_param("/callback?code=abc&state=xyz HTTP/1.1", "code").as_deref(), Some("abc"));
        assert_eq!(query_param("/callback?error=access_denied&state=s", "error").as_deref(), Some("access_denied"));
    }
}
