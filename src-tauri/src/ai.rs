//! In-app AI chat with Claude (Anthropic Messages API) and ChatGPT (OpenAI Chat Completions).
//!
//! - API keys live in Windows Credential Manager (never in config.json, never in the web layer).
//! - Requests are made from Rust over HTTPS; the reply is streamed to the UI as `ai-stream` events.
//! - Rust has no official Anthropic SDK, so the Claude call is the documented raw HTTP shape.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

const SERVICE: &str = "CommandCentre";
const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2026-10-21";
const OPENAI_URL: &str = "https://api.openai.com/v1/chat/completions";

fn entry(provider: &str) -> Result<keyring::Entry, String> {
    if provider != "claude" && provider != "openai" {
        return Err(format!("Unknown AI provider \"{provider}\""));
    }
    keyring::Entry::new(SERVICE, &format!("api-key-{provider}")).map_err(|e| e.to_string())
}

fn get_key(provider: &str) -> Result<String, String> {
    entry(provider)?.get_password().map_err(|_| {
        format!("No {} API key saved yet. Add it in Tools → AI chat → Keys.", if provider == "claude" { "Claude" } else { "OpenAI" })
    })
}

#[tauri::command]
pub fn ai_set_key(provider: String, key: String) -> Result<(), String> {
    let key = key.trim();
    if key.len() < 20 || key.contains(char::is_whitespace) {
        return Err("That doesn't look like an API key.".into());
    }
    entry(&provider)?.set_password(key).map_err(|e| format!("Could not save the key in Windows Credential Manager: {e}"))
}

#[tauri::command]
pub fn ai_delete_key(provider: String) -> Result<(), String> {
    match entry(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Serialize)]
pub struct KeyStatus {
    claude: bool,
    openai: bool,
}

#[tauri::command]
pub fn ai_key_status() -> KeyStatus {
    KeyStatus { claude: get_key("claude").is_ok(), openai: get_key("openai").is_ok() }
}

#[derive(Deserialize, Clone)]
pub struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StreamEvent {
    request_id: String,
    delta: Option<String>,
    done: bool,
    error: Option<String>,
    stop_reason: Option<String>,
}

#[derive(Default)]
pub struct AiState {
    cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

fn emit(app: &AppHandle, ev: StreamEvent) {
    let _ = app.emit("ai-stream", ev);
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

/// Turns a non-2xx response into a readable message.
async fn http_error(provider: &str, resp: reqwest::Response) -> String {
    let status = resp.status();
    let body: Value = resp.json().await.unwrap_or(Value::Null);
    let detail = body["error"]["message"].as_str().unwrap_or("").to_string();
    let name = if provider == "claude" { "Claude" } else { "OpenAI" };
    match status.as_u16() {
        401 | 403 => format!("{name} rejected the API key ({status}). Check it in Tools → AI chat → Keys."),
        404 => format!("{name}: model not found. {detail}"),
        429 => format!("{name} rate limit or quota reached. {detail}"),
        s if s >= 500 => format!("{name} is having problems right now ({status}). Try again shortly."),
        _ => format!("{name} error {status}: {detail}"),
    }
}

/// Builds the Claude request body (pure, unit-tested).
pub fn claude_body(model: &str, system: Option<&str>, messages: &[ChatMessage]) -> Value {
    let msgs: Vec<Value> = messages
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();
    let mut body = json!({
        "model": model,
        "max_tokens": 64000,
        "stream": true,
        "messages": msgs,
        // If Claude declines a message, the API retries it on a fallback model in the same call.
        "fallbacks": "default",
    });
    if let Some(s) = system.filter(|s| !s.trim().is_empty()) {
        body["system"] = json!(s);
    }
    body
}

pub fn openai_body(model: &str, system: Option<&str>, messages: &[ChatMessage]) -> Value {
    let mut msgs: Vec<Value> = Vec::new();
    if let Some(s) = system.filter(|s| !s.trim().is_empty()) {
        msgs.push(json!({ "role": "system", "content": s }));
    }
    msgs.extend(messages.iter().filter(|m| m.role == "user" || m.role == "assistant").map(|m| json!({ "role": m.role, "content": m.content })));
    json!({ "model": model, "stream": true, "messages": msgs })
}

/// Extracts the text delta (and stop reason) from one SSE `data:` payload.
pub fn parse_sse(provider: &str, data: &str) -> (Option<String>, Option<String>, Option<String>) {
    let Ok(v) = serde_json::from_str::<Value>(data) else { return (None, None, None) };
    if provider == "claude" {
        match v["type"].as_str() {
            Some("content_block_delta") if v["delta"]["type"] == "text_delta" => (v["delta"]["text"].as_str().map(String::from), None, None),
            Some("message_delta") => (None, v["delta"]["stop_reason"].as_str().map(String::from), None),
            Some("error") => (None, None, Some(v["error"]["message"].as_str().unwrap_or("Claude stream error").to_string())),
            _ => (None, None, None),
        }
    } else {
        let choice = &v["choices"][0];
        (choice["delta"]["content"].as_str().map(String::from), choice["finish_reason"].as_str().map(String::from), v["error"]["message"].as_str().map(String::from))
    }
}

/// Sends a chat to Claude or ChatGPT and streams the answer as `ai-stream` events.
/// Returns the full reply text.
#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    state: tauri::State<'_, AiState>,
    request_id: String,
    provider: String,
    model: String,
    system: Option<String>,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let key = get_key(&provider)?;
    if messages.is_empty() {
        return Err("Nothing to send.".into());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    state.cancels.lock().unwrap().insert(request_id.clone(), cancel.clone());
    let result = stream_chat(&app, &request_id, &provider, &model, system.as_deref(), &messages, &key, &cancel).await;
    state.cancels.lock().unwrap().remove(&request_id);
    match &result {
        Ok((_, stop)) => emit(&app, StreamEvent { request_id: request_id.clone(), delta: None, done: true, error: None, stop_reason: stop.clone() }),
        Err(e) => emit(&app, StreamEvent { request_id: request_id.clone(), delta: None, done: true, error: Some(e.clone()), stop_reason: None }),
    }
    result.map(|(text, _)| text)
}

#[allow(clippy::too_many_arguments)]
async fn stream_chat(
    app: &AppHandle,
    request_id: &str,
    provider: &str,
    model: &str,
    system: Option<&str>,
    messages: &[ChatMessage],
    key: &str,
    cancel: &AtomicBool,
) -> Result<(String, Option<String>), String> {
    let http = client()?;
    let req = if provider == "claude" {
        http.post(ANTHROPIC_URL)
            .header("x-api-key", key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("anthropic-beta", "server-side-fallback-2026-07-01")
            .json(&claude_body(model, system, messages))
    } else {
        http.post(OPENAI_URL).bearer_auth(key).json(&openai_body(model, system, messages))
    };
    let resp = req.send().await.map_err(|e| format!("Could not reach {}: {e}", if provider == "claude" { "Claude" } else { "OpenAI" }))?;
    if !resp.status().is_success() {
        return Err(http_error(provider, resp).await);
    }
    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    let mut full = String::new();
    let mut stop: Option<String> = None;
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            return Ok((full, Some("cancelled".into())));
        }
        let chunk = chunk.map_err(|e| format!("Connection dropped: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim_end_matches('\r').to_string();
            buf.drain(..=pos);
            let Some(data) = line.strip_prefix("data:").map(str::trim) else { continue };
            if data == "[DONE]" {
                continue;
            }
            let (delta, s, err) = parse_sse(provider, data);
            if let Some(e) = err {
                return Err(e);
            }
            if s.is_some() {
                stop = s;
            }
            if let Some(d) = delta.filter(|d| !d.is_empty()) {
                full.push_str(&d);
                emit(app, StreamEvent { request_id: request_id.into(), delta: Some(d), done: false, error: None, stop_reason: None });
            }
        }
    }
    if stop.as_deref() == Some("refusal") && full.is_empty() {
        return Err("Claude declined to answer this request.".into());
    }
    Ok((full, stop))
}

#[tauri::command]
pub fn ai_cancel(state: tauri::State<'_, AiState>, request_id: String) {
    if let Some(c) = state.cancels.lock().unwrap().get(&request_id) {
        c.store(true, Ordering::Relaxed);
    }
}

/// Chat-capable OpenAI models available to this key (for the model picker).
#[tauri::command]
pub async fn ai_list_openai_models() -> Result<Vec<String>, String> {
    let key = get_key("openai")?;
    let resp = client()?.get("https://api.openai.com/v1/models").bearer_auth(key).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(http_error("openai", resp).await);
    }
    let v: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut ids: Vec<String> = v["data"]
        .as_array()
        .map(|a| a.iter().filter_map(|m| m["id"].as_str().map(String::from)).collect())
        .unwrap_or_default();
    ids.retain(|id| (id.starts_with("gpt") || id.starts_with('o')) && !["audio", "realtime", "tts", "transcribe", "image", "search", "embedding"].iter().any(|x| id.contains(x)));
    ids.sort();
    ids.reverse();
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msgs() -> Vec<ChatMessage> {
        vec![
            ChatMessage { role: "user".into(), content: "hi".into() },
            ChatMessage { role: "assistant".into(), content: "hello".into() },
            ChatMessage { role: "system".into(), content: "ignored".into() },
        ]
    }

    #[test]
    fn claude_request_shape() {
        let b = claude_body("claude-opus-5-5", Some("Be brief"), &msgs());
        assert_eq!(b["model"], "claude-opus-5-5");
        assert_eq!(b["stream"], true);
        assert_eq!(b["system"], "Be brief");
        assert_eq!(b["fallbacks"], "default");
        assert_eq!(b["messages"].as_array().unwrap().len(), 2);
        assert!(b.get("temperature").is_none());
        assert!(b.get("thinking").is_none());
    }

    #[test]
    fn openai_request_shape() {
        let b = openai_body("gpt-x", Some("Be brief"), &msgs());
        assert_eq!(b["messages"][0]["role"], "system");
        assert_eq!(b["messages"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn parses_stream_events() {
        assert_eq!(parse_sse("claude", r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}"#).0.as_deref(), Some("Hel"));
        assert_eq!(parse_sse("claude", r#"{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"x"}}"#).0, None);
        assert_eq!(parse_sse("claude", r#"{"type":"message_delta","delta":{"stop_reason":"end_turn"}}"#).1.as_deref(), Some("end_turn"));
        assert!(parse_sse("claude", r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#).2.is_some());
        assert_eq!(parse_sse("openai", r#"{"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}"#).0.as_deref(), Some("Hi"));
        assert_eq!(parse_sse("openai", r#"{"choices":[{"delta":{},"finish_reason":"stop"}]}"#).1.as_deref(), Some("stop"));
    }
}
