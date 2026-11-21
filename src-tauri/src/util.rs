//! Shared helpers: UTF-16 strings, COM-initialised worker threads, hidden PowerShell.

use std::os::windows::process::CommandExt;
use std::process::Command;

use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
use windows::Win32::System::Environment::ExpandEnvironmentStringsW;
use windows::core::PCWSTR;

pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Expands `%USERPROFILE%`-style variables in user-entered paths.
pub fn expand_env(input: &str) -> String {
    if !input.contains('%') {
        return input.to_string();
    }
    let src = wide(input);
    unsafe {
        let needed = ExpandEnvironmentStringsW(PCWSTR(src.as_ptr()), None);
        if needed == 0 {
            return input.to_string();
        }
        let mut buf = vec![0u16; needed as usize];
        let written = ExpandEnvironmentStringsW(PCWSTR(src.as_ptr()), Some(&mut buf));
        if written == 0 {
            return input.to_string();
        }
        String::from_utf16_lossy(&buf[..(written as usize).saturating_sub(1)])
    }
}

/// Runs blocking Windows work off the UI thread inside a single-threaded COM apartment
/// (required by ShellExecuteEx and the Core Audio API).
pub async fn com_blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || unsafe {
        let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
        let result = f();
        if hr.is_ok() {
            CoUninitialize();
        }
        result
    })
    .await
    .map_err(|e| format!("Background task failed: {e}"))?
}

/// Runs a PowerShell snippet without a console window. Values must be passed through
/// `env`, never interpolated into the script, so user input cannot inject commands.
pub fn powershell(script: &str, env: &[(&str, &str)]) -> Result<String, String> {
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW);
    for (k, v) in env {
        cmd.env(k, v);
    }
    let out = cmd.output().map_err(|e| format!("Could not start PowerShell: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if err.is_empty() { "PowerShell command failed".into() } else { err })
    }
}

/// Runs `f` on the current thread inside an STA COM apartment (used by tests).
#[allow(dead_code)]
pub fn with_sta<T>(f: impl FnOnce() -> T) -> T {
    unsafe {
        let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
        let r = f();
        if hr.is_ok() {
            CoUninitialize();
        }
        r
    }
}
