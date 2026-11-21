//! Background scheduler: alarms (time of day, optional weekdays), countdown timers,
//! snoozes and "keep awake" mode. Runs in Rust so it keeps working while every
//! Command Centre window is hidden in the tray.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use windows::core::PCWSTR;
use windows::Win32::Foundation::HMODULE;
use windows::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_FILENAME, SND_FLAGS, SND_LOOP, SND_NODEFAULT};
use windows::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED};
use windows::Win32::System::SystemInformation::GetLocalTime;

use crate::util::wide;

#[derive(Deserialize, Clone, Debug)]
pub struct Alarm {
    pub id: String,
    pub label: String,
    /// "HH:MM", 24-hour local time.
    pub time: String,
    /// 0 = Sunday … 6 = Saturday. Empty = every day.
    #[serde(default)]
    pub days: Vec<u8>,
    pub enabled: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Timer {
    pub id: String,
    pub label: String,
    pub at_ms: u64,
    pub kind: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AwakeStatus {
    pub active: bool,
    /// None while active = until turned off.
    pub until_ms: Option<u64>,
    pub keep_display_on: bool,
}

#[derive(Default)]
struct State {
    alarms: Vec<Alarm>,
    timers: Vec<Timer>,
    fired: HashSet<String>,
    sound_started: Option<u64>,
    awake: Option<(Option<u64>, bool)>,
    /// Last execution state applied: None = never; Some(None) = off; Some(Some(display)) = on.
    awake_applied: Option<Option<bool>>,
}

#[derive(Clone, Default)]
pub struct Scheduler(Arc<Mutex<State>>);

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

const SOUND_MAX_MS: u64 = 5 * 60 * 1000;

fn alarm_sound_path() -> Option<String> {
    let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".into());
    ["Alarm01.wav", "Alarm02.wav", "Ring01.wav", "Windows Notify System Generic.wav", "notify.wav"]
        .iter()
        .map(|f| format!("{windir}\\Media\\{f}"))
        .find(|p| std::path::Path::new(p).exists())
}

pub fn play_alarm_sound() {
    if let Some(path) = alarm_sound_path() {
        let w = wide(&path);
        unsafe {
            let _ = PlaySoundW(PCWSTR(w.as_ptr()), HMODULE::default(), SND_FILENAME | SND_ASYNC | SND_LOOP | SND_NODEFAULT);
        }
    }
}

pub fn stop_sound() {
    unsafe {
        let _ = PlaySoundW(PCWSTR::null(), HMODULE::default(), SND_FLAGS(0));
    }
}

/// Does an alarm match this local minute? (pure, unit-tested)
pub fn alarm_matches(a: &Alarm, hour: u16, minute: u16, weekday: u16) -> bool {
    if !a.enabled {
        return false;
    }
    let Some((h, m)) = a.time.split_once(':') else { return false };
    let (Ok(h), Ok(m)) = (h.trim().parse::<u16>(), m.trim().parse::<u16>()) else { return false };
    h == hour && m == minute && (a.days.is_empty() || a.days.contains(&(weekday as u8)))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Fired {
    id: String,
    label: String,
    kind: String,
}

fn fire(app: &AppHandle, s: &mut State, id: &str, label: &str, kind: &str) {
    play_alarm_sound();
    s.sound_started = Some(now_ms());
    let title = if kind == "timer" { "Timer finished" } else { "Alarm" };
    let _ = app.notification().builder().title(title).body(if label.is_empty() { "Command Centre" } else { label }).show();
    for w in app.webview_windows().values() {
        let _ = w.show();
        let _ = w.unminimize();
    }
    let _ = app.emit("alarm-fired", Fired { id: id.into(), label: label.into(), kind: kind.into() });
}

fn apply_awake(s: &mut State) {
    let want = s.awake.map(|(_, display)| display);
    if s.awake_applied == Some(want) {
        return;
    }
    // This thread lives for the whole app, so the execution state stays in force.
    unsafe {
        match want {
            Some(true) => SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED),
            Some(false) => SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED),
            None => SetThreadExecutionState(ES_CONTINUOUS),
        };
    }
    s.awake_applied = Some(want);
}

impl Scheduler {
    pub fn start(&self, app: AppHandle) {
        let me = self.clone();
        std::thread::Builder::new()
            .name("cc-scheduler".into())
            .spawn(move || loop {
                {
                    let mut s = me.0.lock().unwrap();
                    let now = now_ms();
                    let t = unsafe { GetLocalTime() };
                    let minute_key = format!("{}-{}-{}-{}-{}", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute);
                    let due: Vec<Alarm> = s
                        .alarms
                        .iter()
                        .filter(|a| alarm_matches(a, t.wHour, t.wMinute, t.wDayOfWeek))
                        .filter(|a| !s.fired.contains(&format!("{}@{minute_key}", a.id)))
                        .cloned()
                        .collect();
                    for a in due {
                        s.fired.insert(format!("{}@{minute_key}", a.id));
                        fire(&app, &mut s, &a.id, &a.label, "alarm");
                    }
                    if s.fired.len() > 500 {
                        s.fired.clear();
                    }
                    let (done, rest): (Vec<Timer>, Vec<Timer>) = s.timers.drain(..).partition(|x| x.at_ms <= now);
                    s.timers = rest;
                    for x in done {
                        fire(&app, &mut s, &x.id, &x.label, &x.kind);
                    }
                    if s.sound_started.map(|t0| now.saturating_sub(t0) > SOUND_MAX_MS).unwrap_or(false) {
                        stop_sound();
                        s.sound_started = None;
                    }
                    if let Some((Some(until), _)) = s.awake {
                        if now >= until {
                            s.awake = None;
                            let _ = app.emit("keep-awake-changed", ());
                        }
                    }
                    apply_awake(&mut s);
                }
                std::thread::sleep(Duration::from_millis(1000));
            })
            .expect("spawn scheduler");
    }

    fn with<T>(&self, f: impl FnOnce(&mut State) -> T) -> T {
        f(&mut self.0.lock().unwrap())
    }
}

#[tauri::command]
pub fn set_alarms(state: tauri::State<'_, Scheduler>, alarms: Vec<Alarm>) {
    state.with(|s| s.alarms = alarms);
}

#[tauri::command]
pub fn start_timer(state: tauri::State<'_, Scheduler>, id: String, label: String, seconds: u64) -> Result<Timer, String> {
    if seconds == 0 || seconds > 7 * 24 * 3600 {
        return Err("Timer must be between 1 second and 7 days.".into());
    }
    let t = Timer { id, label, at_ms: now_ms() + seconds * 1000, kind: "timer".into() };
    state.with(|s| {
        s.timers.retain(|x| x.id != t.id);
        s.timers.push(t.clone());
    });
    Ok(t)
}

#[tauri::command]
pub fn snooze_alarm(state: tauri::State<'_, Scheduler>, id: String, label: String, minutes: u64) -> Timer {
    stop_sound();
    let t = Timer { id: format!("{id}-snooze"), label, at_ms: now_ms() + minutes.clamp(1, 120) * 60_000, kind: "alarm".into() };
    state.with(|s| {
        s.sound_started = None;
        s.timers.retain(|x| x.id != t.id);
        s.timers.push(t.clone());
    });
    t
}

#[tauri::command]
pub fn cancel_timer(state: tauri::State<'_, Scheduler>, id: String) {
    state.with(|s| s.timers.retain(|x| x.id != id));
}

#[tauri::command]
pub fn list_timers(state: tauri::State<'_, Scheduler>) -> Vec<Timer> {
    state.with(|s| s.timers.clone())
}

#[tauri::command]
pub fn stop_alarm_sound(state: tauri::State<'_, Scheduler>) {
    stop_sound();
    state.with(|s| s.sound_started = None);
}

#[tauri::command]
pub fn test_alarm_sound(state: tauri::State<'_, Scheduler>) -> Result<(), String> {
    if alarm_sound_path().is_none() {
        return Err("No Windows alarm sound found in C:\\Windows\\Media.".into());
    }
    play_alarm_sound();
    state.with(|s| s.sound_started = Some(now_ms() - SOUND_MAX_MS + 4000)); // auto-stop after ~4 s
    Ok(())
}

/// minutes: Some(n) = for n minutes, None = until turned off. `enabled=false` turns it off.
#[tauri::command]
pub fn set_keep_awake(state: tauri::State<'_, Scheduler>, enabled: bool, minutes: Option<u64>, keep_display_on: Option<bool>) -> AwakeStatus {
    state.with(|s| {
        s.awake = enabled.then(|| (minutes.map(|m| now_ms() + m.clamp(1, 7 * 24 * 60) * 60_000), keep_display_on.unwrap_or(true)));
        status(s)
    })
}

fn status(s: &State) -> AwakeStatus {
    match s.awake {
        Some((until, display)) => AwakeStatus { active: true, until_ms: until, keep_display_on: display },
        None => AwakeStatus { active: false, until_ms: None, keep_display_on: true },
    }
}

#[tauri::command]
pub fn keep_awake_status(state: tauri::State<'_, Scheduler>) -> AwakeStatus {
    state.with(|s| status(s))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn alarm(time: &str, days: Vec<u8>, enabled: bool) -> Alarm {
        Alarm { id: "a".into(), label: "x".into(), time: time.into(), days, enabled }
    }

    #[test]
    fn alarm_matching() {
        assert!(alarm_matches(&alarm("07:30", vec![], true), 7, 30, 3));
        assert!(!alarm_matches(&alarm("07:30", vec![], true), 7, 31, 3));
        assert!(!alarm_matches(&alarm("07:30", vec![], false), 7, 30, 3));
        assert!(alarm_matches(&alarm("7:30", vec![1, 2, 3, 4, 5], true), 7, 30, 1));
        assert!(!alarm_matches(&alarm("07:30", vec![1, 2, 3, 4, 5], true), 7, 30, 0));
        assert!(!alarm_matches(&alarm("garbage", vec![], true), 7, 30, 0));
    }

    #[test]
    fn alarm_sound_exists_on_windows() {
        assert!(alarm_sound_path().is_some());
    }
}
