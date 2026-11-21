//! Configuration persistence: %APPDATA%\com.commandcentre.app\config.json with atomic
//! writes, automatic daily backups, manual backups, restore, import and export.
//! Validation and schema migration live in the frontend (src/lib/schema.ts); the
//! backend guarantees the file is well-formed JSON and is never half-written.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};

const MAX_BACKUPS: usize = 30;

/// Reads a text file, tolerating a UTF-8 byte-order mark (Notepad adds one).
fn read_text(path: &Path) -> std::io::Result<String> {
    fs::read_to_string(path).map(|s| s.strip_prefix('\u{feff}').map(str::to_string).unwrap_or(s))
}
const MAX_IMPORT_BYTES: u64 = 8 * 1024 * 1024;
const AUTO_BACKUP_EVERY: Duration = Duration::from_secs(24 * 60 * 60);

fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_config_dir().map_err(|e| format!("No config directory: {e}"))?;
    fs::create_dir_all(&d).map_err(|e| format!("Cannot create {}: {e}", d.display()))?;
    Ok(d)
}

fn backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = dir(app)?.join("backups");
    fs::create_dir_all(&d).map_err(|e| format!("Cannot create backup folder: {e}"))?;
    Ok(d)
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, contents).map_err(|e| format!("Cannot write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| format!("Cannot replace {}: {e}", path.display()))
}

fn ensure_json(contents: &str) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(contents).map(|_| ()).map_err(|e| format!("Not valid JSON: {e}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    name: String,
    size: u64,
    modified_ms: u64,
}

fn backups(app: &AppHandle) -> Result<Vec<BackupInfo>, String> {
    let mut list: Vec<BackupInfo> = fs::read_dir(backup_dir(app)?)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|e| e.path().extension().map(|x| x == "json").unwrap_or(false))
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            let modified_ms = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64;
            Some(BackupInfo { name: e.file_name().to_string_lossy().to_string(), size: meta.len(), modified_ms })
        })
        .collect();
    list.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(list)
}

fn sanitize_reason(reason: &str) -> String {
    let r: String = reason.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(24).collect();
    if r.is_empty() { "manual".into() } else { r }
}

fn backup_current(app: &AppHandle, reason: &str) -> Result<Option<BackupInfo>, String> {
    let src = dir(app)?.join("config.json");
    if !src.exists() {
        return Ok(None);
    }
    let name = format!("backup-{}-{}.json", now_secs(), sanitize_reason(reason));
    fs::copy(&src, backup_dir(app)?.join(&name)).map_err(|e| format!("Backup failed: {e}"))?;
    let all = backups(app)?;
    for old in all.iter().skip(MAX_BACKUPS) {
        let _ = fs::remove_file(backup_dir(app)?.join(&old.name));
    }
    Ok(all.into_iter().find(|b| b.name == name))
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> Result<Option<String>, String> {
    let path = dir(&app)?.join("config.json");
    if !path.exists() {
        return Ok(None);
    }
    read_text(&path).map(Some).map_err(|e| format!("Cannot read config: {e}"))
}

#[tauri::command]
pub fn save_config(app: AppHandle, contents: String) -> Result<(), String> {
    ensure_json(&contents)?;
    let path = dir(&app)?.join("config.json");
    let latest = backups(&app)?.first().map(|b| b.modified_ms).unwrap_or(0);
    let age = Duration::from_millis((now_secs() * 1000).saturating_sub(latest));
    if path.exists() && age > AUTO_BACKUP_EVERY {
        backup_current(&app, "daily")?;
    }
    write_atomic(&path, &contents)
}

/// Moves an unreadable config aside (never deletes it) so the app can start fresh.
#[tauri::command]
pub fn quarantine_config(app: AppHandle) -> Result<String, String> {
    let d = dir(&app)?;
    let src = d.join("config.json");
    let dst = d.join(format!("config.invalid-{}.json", now_secs()));
    fs::rename(&src, &dst).map_err(|e| e.to_string())?;
    Ok(dst.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_backup(app: AppHandle, reason: Option<String>) -> Result<Option<BackupInfo>, String> {
    backup_current(&app, reason.as_deref().unwrap_or("manual"))
}

#[tauri::command]
pub fn list_backups(app: AppHandle) -> Result<Vec<BackupInfo>, String> {
    backups(&app)
}

fn checked_backup_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if name.contains(['/', '\\']) || name.contains("..") || !name.ends_with(".json") {
        return Err("Invalid backup name.".into());
    }
    Ok(backup_dir(app)?.join(name))
}

#[tauri::command]
pub fn read_backup(app: AppHandle, name: String) -> Result<String, String> {
    read_text(&checked_backup_path(&app, &name)?).map_err(|e| format!("Cannot read backup: {e}"))
}

#[tauri::command]
pub fn delete_backup(app: AppHandle, name: String) -> Result<(), String> {
    fs::remove_file(checked_backup_path(&app, &name)?).map_err(|e| e.to_string())
}

fn require_json_ext(path: &str) -> Result<(), String> {
    if Path::new(path).extension().map(|e| e.eq_ignore_ascii_case("json")).unwrap_or(false) {
        Ok(())
    } else {
        Err("Please choose a .json file.".into())
    }
}

#[tauri::command]
pub fn export_config_file(path: String, contents: String) -> Result<(), String> {
    require_json_ext(&path)?;
    ensure_json(&contents)?;
    fs::write(&path, contents).map_err(|e| format!("Export failed: {e}"))
}

#[tauri::command]
pub fn read_import_file(path: String) -> Result<String, String> {
    require_json_ext(&path)?;
    let meta = fs::metadata(&path).map_err(|e| format!("Cannot open file: {e}"))?;
    if meta.len() > MAX_IMPORT_BYTES {
        return Err("File is too large to be a Command Centre configuration (max 8 MB).".into());
    }
    let text = read_text(Path::new(&path)).map_err(|e| format!("Cannot read file: {e}"))?;
    ensure_json(&text)?;
    Ok(text)
}

#[tauri::command]
pub fn config_dir_path(app: AppHandle) -> Result<String, String> {
    Ok(dir(&app)?.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reasons_are_sanitized() {
        assert_eq!(sanitize_reason("before-import"), "before-import");
        assert_eq!(sanitize_reason("../../evil"), "evil");
        assert_eq!(sanitize_reason(""), "manual");
    }

    #[test]
    fn atomic_write_round_trip() {
        let p = std::env::temp_dir().join(format!("cc-test-{}.json", now_secs()));
        write_atomic(&p, "{\"a\":1}").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "{\"a\":1}");
        let _ = fs::remove_file(p);
    }

    #[test]
    fn bom_is_tolerated() {
        let p = std::env::temp_dir().join(format!("cc-bom-{}.json", now_secs()));
        fs::write(&p, "\u{feff}{\"a\":1}").unwrap();
        assert_eq!(read_text(&p).unwrap(), "{\"a\":1}");
        let _ = fs::remove_file(p);
    }

    #[test]
    fn json_ext_required() {
        assert!(require_json_ext("C:\\x\\cfg.JSON").is_ok());
        assert!(require_json_ext("C:\\x\\cfg.exe").is_err());
        assert!(ensure_json("{oops").is_err());
    }
}
