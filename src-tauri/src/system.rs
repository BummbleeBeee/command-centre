//! Safe Windows system integrations: volume, brightness, keyboard shortcuts,
//! media transport, an allow-listed set of system actions and live system stats.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use windows::Win32::Foundation::{BOOL, HWND};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
use windows::Win32::System::Power::SetSuspendState;
use windows::Win32::System::Shutdown::LockWorkStation;
use windows::Win32::System::Threading::GetCurrentProcessId;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP,
    VIRTUAL_KEY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindow, GetWindowLongW, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    SetForegroundWindow, GWL_EXSTYLE, GW_HWNDNEXT, GW_OWNER, WS_EX_TOOLWINDOW,
};

use crate::launcher::shell_open;
use crate::util::{com_blocking, powershell};

// ---------------------------------------------------------------- volume

fn endpoint() -> Result<IAudioEndpointVolume, String> {
    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| format!("Audio service unavailable: {}", e.message()))?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|_| "No audio output device is available.".to_string())?;
        device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None).map_err(|e| format!("Volume control unavailable: {}", e.message()))
    }
}

#[derive(Serialize)]
pub struct VolumeState {
    level: u32,
    muted: bool,
}

fn read_volume(v: &IAudioEndpointVolume) -> Result<VolumeState, String> {
    unsafe {
        let level = v.GetMasterVolumeLevelScalar().map_err(|e| e.message())?;
        let muted = v.GetMute().map_err(|e| e.message())?.as_bool();
        Ok(VolumeState { level: (level * 100.0).round() as u32, muted })
    }
}

#[tauri::command]
pub async fn get_volume() -> Result<VolumeState, String> {
    com_blocking(|| read_volume(&endpoint()?)).await
}

/// Sets absolute volume (`level`) or changes it relatively (`delta`), in percent.
#[tauri::command]
pub async fn set_volume(level: Option<i32>, delta: Option<i32>) -> Result<VolumeState, String> {
    com_blocking(move || {
        let v = endpoint()?;
        let current = read_volume(&v)?.level as i32;
        let target = level.unwrap_or(current + delta.unwrap_or(0)).clamp(0, 100);
        unsafe {
            v.SetMasterVolumeLevelScalar(target as f32 / 100.0, std::ptr::null()).map_err(|e| e.message())?;
        }
        read_volume(&v)
    })
    .await
}

/// `muted`: Some(true/false) to set, None to toggle.
#[tauri::command]
pub async fn set_mute(muted: Option<bool>) -> Result<VolumeState, String> {
    com_blocking(move || {
        let v = endpoint()?;
        let next = muted.unwrap_or(!read_volume(&v)?.muted);
        unsafe {
            v.SetMute(BOOL::from(next), std::ptr::null()).map_err(|e| e.message())?;
        }
        read_volume(&v)
    })
    .await
}

// ---------------------------------------------------------------- brightness

const NO_BRIGHTNESS: &str = "Brightness control is not supported by this display. Windows only exposes it for built-in laptop/tablet screens (external monitors need the monitor's own buttons).";

#[tauri::command]
pub async fn get_brightness() -> Result<u32, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let out = powershell(
            "(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness",
            &[],
        )
        .map_err(|_| NO_BRIGHTNESS.to_string())?;
        out.parse::<u32>().map_err(|_| NO_BRIGHTNESS.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_brightness(level: Option<i32>, delta: Option<i32>) -> Result<u32, String> {
    let current = if level.is_none() { get_brightness().await? as i32 } else { 0 };
    let target = level.unwrap_or(current + delta.unwrap_or(0)).clamp(0, 100);
    tauri::async_runtime::spawn_blocking(move || {
        powershell(
            "$m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Select-Object -First 1; \
             Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{Timeout=[uint32]1; Brightness=[byte]$env:CC_LEVEL} | Out-Null",
            &[("CC_LEVEL", &target.to_string())],
        )
        .map_err(|_| NO_BRIGHTNESS.to_string())?;
        Ok(target as u32)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------- keyboard

fn vk_for(token: &str) -> Option<u16> {
    let t = token.trim().to_lowercase();
    let vk = match t.as_str() {
        "ctrl" | "control" => 0x11,
        "shift" => 0x10,
        "alt" => 0x12,
        "win" | "meta" | "super" | "cmd" => 0x5B,
        "enter" | "return" => 0x0D,
        "tab" => 0x09,
        "esc" | "escape" => 0x1B,
        "space" => 0x20,
        "backspace" => 0x08,
        "delete" | "del" => 0x2E,
        "insert" | "ins" => 0x2D,
        "home" => 0x24,
        "end" => 0x23,
        "pageup" | "pgup" => 0x21,
        "pagedown" | "pgdn" => 0x22,
        "left" => 0x25,
        "up" => 0x26,
        "right" => 0x27,
        "down" => 0x28,
        "printscreen" | "prtsc" => 0x2C,
        "volumemute" => 0xAD,
        "volumedown" => 0xAE,
        "volumeup" => 0xAF,
        "medianext" => 0xB0,
        "mediaprev" | "mediaprevious" => 0xB1,
        "mediastop" => 0xB2,
        "mediaplaypause" | "playpause" => 0xB3,
        ";" => 0xBA,
        "=" | "plus" => 0xBB,
        "," => 0xBC,
        "-" | "minus" => 0xBD,
        "." => 0xBE,
        "/" => 0xBF,
        "`" => 0xC0,
        "[" => 0xDB,
        "\\" => 0xDC,
        "]" => 0xDD,
        "'" => 0xDE,
        _ => {
            let b = t.as_bytes();
            if b.len() == 1 && (b[0].is_ascii_lowercase() || b[0].is_ascii_digit()) {
                return Some(b[0].to_ascii_uppercase() as u16);
            }
            if let Some(n) = t.strip_prefix('f').and_then(|n| n.parse::<u16>().ok()) {
                if (1..=24).contains(&n) {
                    return Some(0x70 + n - 1);
                }
            }
            return None;
        }
    };
    Some(vk)
}

pub fn parse_shortcut(keys: &str) -> Result<Vec<u16>, String> {
    let parts: Vec<&str> = keys.split('+').filter(|p| !p.trim().is_empty()).collect();
    if parts.is_empty() {
        return Err("Shortcut is empty.".into());
    }
    parts.iter().map(|p| vk_for(p).ok_or_else(|| format!("Unknown key \"{}\" in shortcut.", p.trim()))).collect()
}

fn is_extended(vk: u16) -> bool {
    (0x21..=0x2E).contains(&vk) || vk == 0x5B || (0xAD..=0xB3).contains(&vk)
}

fn key_input(vk: u16, up: bool) -> INPUT {
    let mut flags = KEYBD_EVENT_FLAGS(0);
    if up {
        flags |= KEYEVENTF_KEYUP;
    }
    if is_extended(vk) {
        flags |= KEYEVENTF_EXTENDEDKEY;
    }
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VIRTUAL_KEY(vk), wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
    }
}

pub fn send_vks(vks: &[u16]) -> Result<(), String> {
    let mut inputs: Vec<INPUT> = vks.iter().map(|&vk| key_input(vk, false)).collect();
    inputs.extend(vks.iter().rev().map(|&vk| key_input(vk, true)));
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize != inputs.len() {
        return Err("Windows blocked the key input (an elevated app may be in focus).".into());
    }
    Ok(())
}

fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked: u32 = 0;
    unsafe {
        DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut _ as *mut _, 4).is_ok() && cloaked != 0
    }
}

/// If Command Centre itself has keyboard focus, hand focus back to the window the user
/// was working in, so shortcuts reach that application rather than the launcher.
fn focus_previous_app() {
    unsafe {
        let own_pid = GetCurrentProcessId();
        let fg = GetForegroundWindow();
        let mut pid = 0;
        GetWindowThreadProcessId(fg, Some(&mut pid));
        if pid != own_pid {
            return;
        }
        let mut cur = fg;
        for _ in 0..200 {
            let Ok(next) = GetWindow(cur, GW_HWNDNEXT) else { return };
            if next.0.is_null() {
                return;
            }
            cur = next;
            let mut p = 0;
            GetWindowThreadProcessId(cur, Some(&mut p));
            let ex = GetWindowLongW(cur, GWL_EXSTYLE) as u32;
            let owned = GetWindow(cur, GW_OWNER).map(|h| !h.0.is_null()).unwrap_or(false);
            if p != own_pid
                && IsWindowVisible(cur).as_bool()
                && !IsIconic(cur).as_bool()
                && !owned
                && ex & WS_EX_TOOLWINDOW.0 == 0
                && !is_cloaked(cur)
            {
                let _ = SetForegroundWindow(cur);
                std::thread::sleep(Duration::from_millis(90));
                return;
            }
        }
    }
}

#[tauri::command]
pub async fn send_shortcut(keys: String) -> Result<(), String> {
    let vks = parse_shortcut(&keys)?;
    tauri::async_runtime::spawn_blocking(move || {
        focus_previous_app();
        send_vks(&vks)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------- system actions

pub const SYSTEM_ACTIONS: &[&str] = &[
    "lock", "sleep", "show_desktop", "task_manager", "settings", "snip", "file_explorer", "media_play_pause",
    "media_next", "media_previous", "volume_up", "volume_down", "volume_mute", "task_view", "action_center",
    "snap_left", "snap_right", "maximize_window", "minimize_window", "desktop_left", "desktop_right",
];

#[tauri::command]
pub async fn system_action(action: String) -> Result<(), String> {
    if !SYSTEM_ACTIONS.contains(&action.as_str()) {
        return Err(format!("\"{action}\" is not a permitted system control."));
    }
    com_blocking(move || {
        let key = |k: &[u16]| send_vks(k);
        // Window-management keys must reach the user's window, not Command Centre.
        let to_app = |k: &[u16]| { focus_previous_app(); send_vks(k) };
        match action.as_str() {
            "lock" => unsafe { LockWorkStation().map_err(|e| e.message().to_string()) },
            "sleep" => {
                if unsafe { SetSuspendState(false, false, false) }.as_bool() {
                    Ok(())
                } else {
                    Err("Windows refused to sleep (sleep may be disabled by policy).".into())
                }
            }
            "show_desktop" => key(&[0x5B, 0x44]),
            "task_view" => key(&[0x5B, 0x09]),
            "action_center" => key(&[0x5B, 0x41]),
            "task_manager" => shell_open("taskmgr.exe", None, None, false),
            "settings" => shell_open("ms-settings:", None, None, false),
            "snip" => shell_open("ms-screenclip:", None, None, false),
            "file_explorer" => shell_open("explorer.exe", None, None, false),
            "media_play_pause" => key(&[0xB3]),
            "media_next" => key(&[0xB0]),
            "media_previous" => key(&[0xB1]),
            "volume_up" => key(&[0xAF]),
            "volume_down" => key(&[0xAE]),
            "volume_mute" => key(&[0xAD]),
            "snap_left" => to_app(&[0x5B, 0x25]),
            "snap_right" => to_app(&[0x5B, 0x27]),
            "maximize_window" => to_app(&[0x5B, 0x26]),
            "minimize_window" => to_app(&[0x5B, 0x28]),
            "desktop_left" => key(&[0x11, 0x5B, 0x25]),
            "desktop_right" => key(&[0x11, 0x5B, 0x27]),
            _ => unreachable!(),
        }
    })
    .await
}

// ---------------------------------------------------------------- stats

pub struct StatsState {
    sys: sysinfo::System,
    nets: sysinfo::Networks,
    last: Instant,
}

impl Default for StatsState {
    fn default() -> Self {
        Self { sys: sysinfo::System::new(), nets: sysinfo::Networks::new_with_refreshed_list(), last: Instant::now() }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    cpu: f32,
    memory_used: u64,
    memory_total: u64,
    net_down: u64,
    net_up: u64,
}

/// Polled by the UI only while a stats widget is visible.
#[tauri::command]
pub fn system_stats(state: tauri::State<'_, Mutex<StatsState>>) -> Result<SystemStats, String> {
    let mut s = state.lock().map_err(|_| "stats lock poisoned")?;
    s.sys.refresh_cpu_usage();
    s.sys.refresh_memory();
    s.nets.refresh();
    let secs = s.last.elapsed().as_secs_f64().max(0.25);
    s.last = Instant::now();
    let (down, up) = s.nets.iter().fold((0u64, 0u64), |(d, u), (_, n)| (d + n.received(), u + n.transmitted()));
    Ok(SystemStats {
        cpu: s.sys.global_cpu_usage(),
        memory_used: s.sys.used_memory(),
        memory_total: s.sys.total_memory(),
        net_down: (down as f64 / secs) as u64,
        net_up: (up as f64 / secs) as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_shortcuts() {
        assert_eq!(parse_shortcut("Ctrl+Shift+S").unwrap(), vec![0x11, 0x10, 0x53]);
        assert_eq!(parse_shortcut("Win+D").unwrap(), vec![0x5B, 0x44]);
        assert_eq!(parse_shortcut("Alt+F4").unwrap(), vec![0x12, 0x73]);
        assert!(parse_shortcut("Ctrl+Banana").is_err());
        assert!(parse_shortcut("").is_err());
    }

    /// Reads the real volume, sets it to the same value, and checks it round-trips.
    #[test]
    #[ignore = "uses the real audio device"]
    fn e2e_volume_round_trip() {
        use tauri::async_runtime::block_on;
        let before = block_on(get_volume()).expect("read volume");
        let after = block_on(set_volume(Some(before.level as i32), None)).expect("set volume");
        assert_eq!(before.level, after.level);
        assert_eq!(before.muted, after.muted);
    }

    /// Brightness either works or returns the clear "not supported" message.
    #[test]
    #[ignore = "queries WMI"]
    fn e2e_brightness_reports_capability() {
        match tauri::async_runtime::block_on(get_brightness()) {
            Ok(v) => assert!(v <= 100),
            Err(e) => assert!(e.contains("not supported")),
        }
    }

    #[test]
    fn rejects_unlisted_system_action() {
        assert!(tauri::async_runtime::block_on(system_action("shutdown".into())).is_err());
    }

    #[test]
    fn system_actions_are_allow_listed() {
        assert!(SYSTEM_ACTIONS.contains(&"lock"));
        assert!(!SYSTEM_ACTIONS.contains(&"shutdown"));
    }
}
