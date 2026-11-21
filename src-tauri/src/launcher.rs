//! Launching applications, shortcuts, folders and websites; app discovery and icons.

use std::path::{Path, PathBuf};

use base64::Engine;
use serde::Serialize;
use windows::core::PCWSTR;
use windows::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use crate::util::{com_blocking, expand_env, powershell, wide};

/// ShellExecuteEx wrapper. Handles .exe, .lnk, .url, folders, `shell:` URIs and URLs
/// exactly like Explorer would, without spawning a shell interpreter.
pub fn shell_open(target: &str, args: Option<&str>, cwd: Option<&str>, elevated: bool) -> Result<(), String> {
    let verb = wide(if elevated { "runas" } else { "open" });
    let file = wide(target);
    let params = args.filter(|a| !a.trim().is_empty()).map(wide);
    let dir = cwd.filter(|d| !d.trim().is_empty()).map(wide);
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI,
        lpVerb: PCWSTR(verb.as_ptr()),
        lpFile: PCWSTR(file.as_ptr()),
        lpParameters: params.as_ref().map(|p| PCWSTR(p.as_ptr())).unwrap_or(PCWSTR::null()),
        lpDirectory: dir.as_ref().map(|d| PCWSTR(d.as_ptr())).unwrap_or(PCWSTR::null()),
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };
    unsafe { ShellExecuteExW(&mut info) }.map_err(|e| {
        let code = e.code().0 as u32 & 0xFFFF;
        match code {
            2 | 3 => format!("Windows could not find \"{target}\"."),
            5 => "Access denied by Windows.".to_string(),
            1223 => "Cancelled by the user.".to_string(),
            1155 => format!("No application is associated with \"{target}\"."),
            _ => format!("Windows could not open \"{target}\": {}", e.message()),
        }
    })
}

fn is_bare_command(t: &str) -> bool {
    !t.contains('\\') && !t.contains('/') && !t.contains(':')
}

#[tauri::command]
pub async fn launch_app(path: String, args: Option<String>, cwd: Option<String>, elevated: Option<bool>) -> Result<(), String> {
    let target = expand_env(path.trim().trim_matches('"'));
    if target.is_empty() {
        return Err("No application path set.".into());
    }
    let lower = target.to_lowercase();
    let ok = Path::new(&target).exists() || lower.starts_with("shell:") || is_bare_command(&target);
    if !ok {
        return Err(format!("File not found: {target}"));
    }
    // Executables start in their own folder by default (many apps expect this);
    // shortcuts keep the working directory stored inside the .lnk.
    let cwd = cwd.filter(|c| !c.trim().is_empty()).map(|c| expand_env(&c)).or_else(|| {
        if !lower.ends_with(".exe") {
            return None;
        }
        Path::new(&target).parent().filter(|p| p.is_dir()).map(|p| p.to_string_lossy().to_string())
    });
    com_blocking(move || shell_open(&target, args.as_deref(), cwd.as_deref(), elevated.unwrap_or(false))).await
}

#[tauri::command]
pub async fn open_folder(path: String) -> Result<(), String> {
    let target = expand_env(path.trim().trim_matches('"'));
    if !(Path::new(&target).is_dir() || target.to_lowercase().starts_with("shell:")) {
        return Err(format!("Folder not found: {target}"));
    }
    com_blocking(move || shell_open(&target, None, None, false)).await
}

pub fn validate_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    let candidate = if trimmed.contains("://") { trimmed.to_string() } else { format!("https://{trimmed}") };
    let parsed = url::Url::parse(&candidate).map_err(|_| format!("\"{trimmed}\" is not a valid web address."))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed.to_string()),
        s => Err(format!("Only http and https links are allowed (got \"{s}\").")),
    }
}

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    let target = validate_url(&url)?;
    com_blocking(move || shell_open(&target, None, None, false)).await
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    name: String,
    target: String,
    source: &'static str,
}

fn walk_shortcuts(dir: &Path, depth: u8, out: &mut Vec<InstalledApp>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if depth < 4 {
                walk_shortcuts(&path, depth + 1, out);
            }
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if !matches!(ext.as_str(), "lnk" | "url" | "appref-ms") {
            continue;
        }
        let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
        let lname = name.to_lowercase();
        if name.is_empty() || lname.contains("uninstall") || lname.contains("readme") || lname.starts_with("desktop") {
            continue;
        }
        out.push(InstalledApp { name, target: path.to_string_lossy().to_string(), source: "startMenu" });
    }
}

/// Lists Start-menu shortcuts plus Microsoft Store (packaged) apps.
#[tauri::command]
pub async fn list_installed_apps() -> Result<Vec<InstalledApp>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut apps = Vec::new();
        let roots: Vec<PathBuf> = ["ProgramData", "APPDATA"]
            .iter()
            .filter_map(|v| std::env::var(v).ok())
            .map(|base| PathBuf::from(base).join("Microsoft\\Windows\\Start Menu\\Programs"))
            .collect();
        for root in roots {
            walk_shortcuts(&root, 0, &mut apps);
        }
        // Packaged apps have an AppUserModelID containing '!'. Launch via shell:AppsFolder.
        if let Ok(json) = powershell(
            "Get-StartApps | Where-Object { $_.AppID -like '*!*' } | Select-Object Name,AppID | ConvertTo-Json -Compress",
            &[],
        ) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&json) {
                let items = match value {
                    serde_json::Value::Array(a) => a,
                    other => vec![other],
                };
                for item in items {
                    if let (Some(name), Some(id)) = (item["Name"].as_str(), item["AppID"].as_str()) {
                        apps.push(InstalledApp { name: name.into(), target: format!("shell:AppsFolder\\{id}"), source: "store" });
                    }
                }
            }
        }
        apps.sort_by_key(|a| a.name.to_lowercase());
        apps.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
        Ok(apps)
    })
    .await
    .map_err(|e| e.to_string())?
}

const MAX_ICON_BYTES: u64 = 1024 * 1024;

/// Reads a user-chosen PNG/SVG/ICO/JPG/WebP/GIF icon into a data URL (max 1 MB).
#[tauri::command]
pub fn read_icon_file(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => return Err("Unsupported icon format. Use PNG, SVG, ICO, JPG, WebP or GIF.".into()),
    };
    let meta = std::fs::metadata(p).map_err(|e| format!("Cannot read icon: {e}"))?;
    if meta.len() > MAX_ICON_BYTES {
        return Err("Icon is larger than 1 MB. Please choose a smaller image.".into());
    }
    let bytes = std::fs::read(p).map_err(|e| format!("Cannot read icon: {e}"))?;
    Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_are_validated() {
        assert_eq!(validate_url("example.com").unwrap(), "https://example.com/");
        assert!(validate_url("https://github.com/x").is_ok());
        assert!(validate_url("file:///C:/Windows").is_err());
        assert!(validate_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn bare_commands() {
        assert!(is_bare_command("code"));
        assert!(!is_bare_command("C:\\x.exe"));
    }
}
