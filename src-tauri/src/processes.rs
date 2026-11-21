//! Process inspection and *graceful* application closing.
//!
//! Command Centre never terminates processes. Closing posts WM_CLOSE to an app's
//! top-level windows, which is the same as clicking its X button: the app can show its
//! own "save changes?" prompt, so unsaved work is protected.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use windows::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM, WPARAM};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindow, GetWindowThreadProcessId, IsWindowVisible, PostMessageW, GW_OWNER, WM_CLOSE,
};
use windows::core::PWSTR;

const PROTECTED: &[&str] = &[
    "explorer.exe", "csrss.exe", "winlogon.exe", "wininit.exe", "dwm.exe", "lsass.exe", "services.exe",
    "smss.exe", "svchost.exe", "system", "fontdrvhost.exe", "sihost.exe", "ctfmon.exe", "taskhostw.exe",
    "searchhost.exe", "startmenuexperiencehost.exe", "shellexperiencehost.exe", "textinputhost.exe",
    "command-centre.exe",
];

/// Normalises "Code", "code.exe" or "C:\\...\\Code.exe" to "code.exe".
pub fn normalise_exe(name: &str) -> String {
    let base = name.trim().trim_matches('"').rsplit(['\\', '/']).next().unwrap_or("").to_lowercase();
    if base.is_empty() || base.ends_with(".exe") {
        base
    } else {
        format!("{base}.exe")
    }
}

pub fn is_protected(exe: &str) -> bool {
    PROTECTED.contains(&exe)
}

pub fn running_exe_names() -> HashSet<String> {
    let mut names = HashSet::new();
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return names };
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                names.insert(String::from_utf16_lossy(&entry.szExeFile[..len]).to_lowercase());
                if Process32NextW(snap, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
    }
    names
}

pub fn exe_name_for_pid(pid: u32) -> Option<String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let res = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(handle);
        res.ok()?;
        Some(normalise_exe(&String::from_utf16_lossy(&buf[..len as usize])))
    }
}

unsafe extern "system" fn collect_windows(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let list = &mut *(lparam.0 as *mut Vec<HWND>);
    list.push(hwnd);
    BOOL(1)
}

pub fn top_level_windows() -> Vec<HWND> {
    let mut list: Vec<HWND> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect_windows), LPARAM(&mut list as *mut _ as isize));
    }
    list
}

/** Visible, unowned top-level windows belonging to processes named `exe`. */
pub fn app_windows(exe: &str) -> Vec<HWND> {
    let mut cache: HashMap<u32, Option<String>> = HashMap::new();
    top_level_windows()
        .into_iter()
        .filter(|&hwnd| unsafe {
            if !IsWindowVisible(hwnd).as_bool() {
                return false;
            }
            if GetWindow(hwnd, GW_OWNER).map(|h| !h.0.is_null()).unwrap_or(false) {
                return false;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            cache.entry(pid).or_insert_with(|| exe_name_for_pid(pid)).as_deref() == Some(exe)
        })
        .collect()
}

#[tauri::command]
pub async fn is_app_running(name: String) -> Result<bool, String> {
    let exe = normalise_exe(&name);
    Ok(tauri::async_runtime::spawn_blocking(move || running_exe_names().contains(&exe)).await.unwrap_or(false))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseResult {
    was_running: bool,
    windows_asked: u32,
}

#[tauri::command]
pub async fn close_app_gracefully(name: String) -> Result<CloseResult, String> {
    let exe = normalise_exe(&name);
    if exe.is_empty() {
        return Err("No application name given.".into());
    }
    let own = std::env::current_exe().ok().map(|p| normalise_exe(&p.to_string_lossy())).unwrap_or_default();
    if is_protected(&exe) || exe == own {
        return Err(format!("{exe} is a protected Windows process and will not be closed."));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let was_running = running_exe_names().contains(&exe);
        if !was_running {
            return Ok(CloseResult { was_running, windows_asked: 0 });
        }
        let mut asked = 0;
        for hwnd in app_windows(&exe) {
            if unsafe { PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0)) }.is_ok() {
                asked += 1;
            }
        }
        Ok(CloseResult { was_running, windows_asked: asked })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalises_names() {
        assert_eq!(normalise_exe("Code"), "code.exe");
        assert_eq!(normalise_exe("C:\\Program Files\\App\\Resolve.EXE"), "resolve.exe");
        assert_eq!(normalise_exe("\"notepad.exe\""), "notepad.exe");
    }

    #[test]
    fn protects_shell() {
        assert!(is_protected(&normalise_exe("explorer")));
        assert!(!is_protected(&normalise_exe("notepad")));
    }

    /// Real end-to-end check of launch → detect → graceful close, using Character Map
    /// (a built-in tool with no user documents). Run with `cargo test --lib -- --ignored`.
    /// Skips if Character Map is already open.
    #[test]
    #[ignore = "opens and closes Character Map on the desktop"]
    fn e2e_launch_detect_and_graceful_close() {
        use std::time::Duration;
        use tauri::async_runtime::block_on;
        if running_exe_names().contains("charmap.exe") {
            eprintln!("Character Map already running: skipping");
            return;
        }
        block_on(crate::launcher::launch_app("charmap.exe".into(), None, None, None)).expect("launch charmap");
        let mut ready = false;
        for _ in 0..100 {
            std::thread::sleep(Duration::from_millis(100));
            if block_on(is_app_running("charmap".into())).unwrap() && !app_windows("charmap.exe").is_empty() { ready = true; break; }
        }
        assert!(ready, "charmap window did not appear");
        let r = block_on(close_app_gracefully("charmap".into())).expect("close");
        assert!(r.was_running);
        assert!(r.windows_asked >= 1, "no window was asked to close");
        let mut gone = false;
        for _ in 0..50 {
            std::thread::sleep(Duration::from_millis(100));
            if !running_exe_names().contains("charmap.exe") { gone = true; break; }
        }
        assert!(gone, "charmap did not exit after WM_CLOSE");
    }

    #[test]
    fn refuses_protected_processes() {
        let r = tauri::async_runtime::block_on(close_app_gracefully("explorer.exe".into()));
        assert!(r.is_err());
    }

    #[test]
    fn sees_own_process() {
        let own = normalise_exe(&std::env::current_exe().unwrap().to_string_lossy());
        assert!(running_exe_names().contains(&own));
    }
}
