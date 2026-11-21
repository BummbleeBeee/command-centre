//! Native geometry for the four display modes. All positioning is computed against the
//! monitor *work area* (excludes the taskbar) and is DPI-aware.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Mutex;

use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::UI::Shell::{SHAppBarMessage, ABE_LEFT, ABE_RIGHT, ABM_NEW, ABM_REMOVE, ABM_SETPOS, APPBARDATA};
use windows::Win32::UI::WindowsAndMessaging::WM_USER;

use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Deserialize, Clone, Copy)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

#[derive(Deserialize, Clone, Copy)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeRequest {
    pub mode: String,
    pub expanded: bool,
    pub always_on_top: bool,
    /// Physical-pixel bounds remembered for the floating panel.
    pub floating: Option<Rect>,
    pub floating_default: Size,
    pub sidebar_side: String,
    pub sidebar_width: f64,
    pub sidebar_expanded_width: f64,
    pub notch_size: Size,
    pub notch_expanded_size: Size,
    pub button_size: f64,
    pub button_expanded_size: Size,
    /// Physical top-left of the collapsed tiny button.
    pub button_position: Option<Point>,
    /// Name of the monitor this window belongs to (multi-monitor support).
    #[serde(default)]
    pub monitor: Option<String>,
    /// Width (logical px) of a pinned sidebar strip; the expanded sidebar then overlays it.
    #[serde(default)]
    pub pinned_width: Option<f64>,
}

const MARGIN: f64 = 10.0;

fn work_rect(m: &Monitor) -> Rect {
    let wa = m.work_area();
    Rect { x: wa.position.x, y: wa.position.y, width: wa.size.width, height: wa.size.height }
}

fn contains(r: &Rect, x: i32, y: i32) -> bool {
    x >= r.x && y >= r.y && x < r.x + r.width as i32 && y < r.y + r.height as i32
}

fn monitor_at(win: &WebviewWindow, x: i32, y: i32) -> Option<Monitor> {
    win.available_monitors().ok()?.into_iter().find(|m| contains(&work_rect(m), x, y))
}

/// Moves first, then sizes, then re-asserts both. When a window crosses to a monitor with
/// different scaling, Windows rescales it on arrival; sizing after the move (and checking)
/// keeps the exact physical size we asked for.
fn place(window: &WebviewWindow, x: i32, y: i32, w: u32, h: u32) -> tauri::Result<()> {
    window.set_position(PhysicalPosition::new(x, y))?;
    window.set_size(PhysicalSize::new(w, h))?;
    window.set_position(PhysicalPosition::new(x, y))?;
    if let (Ok(sz), Ok(pos)) = (window.outer_size(), window.outer_position()) {
        if sz.width != w || sz.height != h || pos.x != x || pos.y != y {
            window.set_size(PhysicalSize::new(w, h))?;
            window.set_position(PhysicalPosition::new(x, y))?;
        }
    }
    Ok(())
}

pub fn monitor_name(m: &Monitor, index: usize) -> String {
    m.name().cloned().filter(|n| !n.is_empty()).unwrap_or_else(|| format!("Monitor {}", index + 1))
}

fn monitor_by_name(win: &WebviewWindow, name: &str) -> Option<Monitor> {
    win.available_monitors().ok()?.into_iter().enumerate().find(|(i, m)| monitor_name(m, *i) == name).map(|(_, m)| m)
}

fn clamp_into(r: Rect, area: &Rect) -> Rect {
    let width = r.width.min(area.width);
    let height = r.height.min(area.height);
    let x = r.x.clamp(area.x, area.x + area.width as i32 - width as i32);
    let y = r.y.clamp(area.y, area.y + area.height as i32 - height as i32);
    Rect { x, y, width, height }
}

/// Pure geometry so it can be unit-tested without a window.
pub fn compute(req: &ModeRequest, area: Rect, scale: f64, saved_floating_ok: bool) -> Rect {
    let px = |v: f64| (v * scale).round() as i32;
    let m = px(MARGIN);
    match req.mode.as_str() {
        "sidebar" => {
            let w = px(if req.expanded { req.sidebar_expanded_width } else { req.sidebar_width });
            // A pinned sidebar has reserved its strip (outside the work area): sit flush on it.
            let (area, m) = match req.pinned_width {
                Some(pw) => {
                    let pw = px(pw);
                    let a = if req.sidebar_side == "left" { Rect { x: area.x - pw, width: area.width + pw as u32, ..area } } else { Rect { width: area.width + pw as u32, ..area } };
                    (a, 0)
                }
                None => (area, if req.sidebar_width < 30.0 && !req.expanded { 0 } else { m }),
            };
            let h = area.height as i32 - 2 * m;
            let x = if req.sidebar_side == "left" { area.x + m } else { area.x + area.width as i32 - w - m };
            Rect { x, y: area.y + m, width: w as u32, height: h.max(200) as u32 }
        }
        "notch" => {
            let s = if req.expanded { req.notch_expanded_size } else { req.notch_size };
            let (w, h) = (px(s.width), px(s.height));
            let x = area.x + (area.width as i32 - w) / 2;
            clamp_into(Rect { x, y: area.y, width: w as u32, height: h as u32 }, &area)
        }
        "button" => {
            let b = px(req.button_size);
            let pos = req
                .button_position
                .filter(|p| contains(&area, p.x + b / 2, p.y + b / 2))
                .unwrap_or(Point { x: area.x + area.width as i32 - b - m * 3, y: area.y + area.height as i32 - b - m * 3 });
            if !req.expanded {
                return clamp_into(Rect { x: pos.x, y: pos.y, width: b as u32, height: b as u32 }, &area);
            }
            let (w, h) = (px(req.button_expanded_size.width), px(req.button_expanded_size.height));
            let (cx, cy) = (pos.x + b / 2, pos.y + b / 2);
            clamp_into(Rect { x: cx - w / 2, y: cy - h / 2, width: w as u32, height: h as u32 }, &area)
        }
        _ => {
            if let (Some(r), true) = (req.floating, saved_floating_ok) {
                return clamp_into(r, &area);
            }
            let (w, h) = (px(req.floating_default.width), px(req.floating_default.height));
            Rect {
                x: area.x + (area.width as i32 - w) / 2,
                y: area.y + (area.height as i32 - h) / 2,
                width: w as u32,
                height: h as u32,
            }
        }
    }
}

#[tauri::command]
pub fn apply_window_mode(window: WebviewWindow, req: ModeRequest) -> Result<Rect, String> {
    let e = |err: tauri::Error| err.to_string();
    // Pick the monitor: the one holding the saved bounds, else the current, else primary.
    let anchor = match req.mode.as_str() {
        "floating" => req.floating.map(|r| (r.x + r.width as i32 / 2, r.y + 20)),
        "button" => req.button_position.map(|p| (p.x + 8, p.y + 8)),
        _ => None,
    };
    let saved_monitor = anchor.and_then(|(x, y)| monitor_at(&window, x, y));
    let saved_ok = saved_monitor.is_some();
    let named = req.monitor.as_deref().and_then(|n| monitor_by_name(&window, n));
    let monitor = saved_monitor
        .or(named)
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or("No display found")?;
    let rect = compute(&req, work_rect(&monitor), monitor.scale_factor(), saved_ok);

    let floating = req.mode == "floating";
    // Shadowed borderless windows carry an invisible ~8 px frame; a window thinner than that
    // breaks the size maths, so decide the shadow before resizing and never shadow thin strips.
    let thin = rect.width < 40 || rect.height < 40 || req.pinned_width.is_some();
    window.set_shadow((floating || req.mode == "sidebar") && !thin).map_err(e)?;
    // Size limits only exist while floating (resizable). Clearing them makes the windowing
    // library re-read the current size, which overflows for thin strips, so only clear if set.
    if window.is_resizable().unwrap_or(false) {
        window.set_min_size::<PhysicalSize<u32>>(None).map_err(e)?;
        window.set_max_size::<PhysicalSize<u32>>(None).map_err(e)?;
    }
    window.set_resizable(floating).map_err(e)?;
    place(&window, rect.x, rect.y, rect.width, rect.height).map_err(e)?;
    if floating {
        let s = monitor.scale_factor();
        window.set_min_size(Some(PhysicalSize::new((360.0 * s) as u32, (300.0 * s) as u32))).map_err(e)?;
        window.set_max_size(Some(PhysicalSize::new((1800.0 * s) as u32, (1400.0 * s) as u32))).map_err(e)?;
    }
    window.set_always_on_top(!floating || req.always_on_top).map_err(e)?;
    window.set_skip_taskbar(!floating).map_err(e)?;
    Ok(rect)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    name: String,
    index: usize,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale: f64,
    primary: bool,
}

/// Lists connected monitors (physical pixels) for the Displays settings map.
#[tauri::command]
pub fn list_monitors(window: WebviewWindow) -> Result<Vec<MonitorInfo>, String> {
    let primary = window.primary_monitor().ok().flatten().map(|m| (m.position().x, m.position().y));
    let list = window.available_monitors().map_err(|e| e.to_string())?;
    Ok(list
        .iter()
        .enumerate()
        .map(|(i, m)| MonitorInfo {
            name: monitor_name(m, i),
            index: i,
            x: m.position().x,
            y: m.position().y,
            width: m.size().width,
            height: m.size().height,
            scale: m.scale_factor(),
            primary: primary == Some((m.position().x, m.position().y)),
        })
        .collect())
}

pub fn display_label(name: &str) -> String {
    let clean: String = name.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    format!("display-{}", if clean.is_empty() { "x".to_string() } else { clean })
}

/// Makes sure exactly one extra launcher window exists per listed monitor (the main window
/// covers the first enabled monitor). Windows for monitors no longer listed are closed.
/// Must be async: creating a window from a synchronous command deadlocks on Windows.
#[tauri::command]
pub async fn sync_display_windows(app: AppHandle, displays: Vec<String>) -> Result<(), String> {
    let wanted: HashSet<String> = displays.iter().map(|d| display_label(d)).collect();
    for (label, w) in app.webview_windows() {
        if label.starts_with("display-") && !wanted.contains(&label) {
            let _ = w.destroy();
        }
    }
    for name in displays {
        let label = display_label(&name);
        if app.get_webview_window(&label).is_some() {
            continue;
        }
        let query: String = url::form_urlencoded::byte_serialize(name.as_bytes()).collect();
        WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(format!("index.html?display={query}").into()))
            .title("Command Centre")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .shadow(false)
            .resizable(false)
            .visible(false)
            .inner_size(300.0, 300.0)
            .disable_drag_drop_handler()
            .build()
            .map_err(|e| format!("Could not open a window for {name}: {e}"))?;
    }
    Ok(())
}

/// Opens or closes the detachable hub circle (its own small always-on-top window).
/// Async because creating a window from a synchronous command deadlocks on Windows.
#[tauri::command]
pub async fn set_hub_window(app: AppHandle, show: bool) -> Result<(), String> {
    match (show, app.get_webview_window("hub")) {
        (true, None) => {
            WebviewWindowBuilder::new(&app, "hub", WebviewUrl::App("index.html?hub=1".into()))
                .title("Command Centre Hub")
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .shadow(false)
                .resizable(false)
                .visible(false)
                .inner_size(64.0, 64.0)
                .disable_drag_drop_handler()
                .build()
                .map_err(|e| format!("Could not open the hub: {e}"))?;
        }
        (false, Some(w)) => {
            let _ = w.destroy();
        }
        _ => {}
    }
    Ok(())
}

// ------------------------------------------------------------------ pinned sidebar (AppBar)

/// Windows registered as AppBars (one pinned sidebar per monitor).
static APPBARS: Mutex<Vec<isize>> = Mutex::new(Vec::new());

fn appbar_data(hwnd: HWND, edge: u32, rc: RECT) -> APPBARDATA {
    APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, hWnd: hwnd, uCallbackMessage: WM_USER + 77, uEdge: edge, rc, lParam: LPARAM(0) }
}

/// Reserves a strip at the monitor edge for the sidebar (other windows and maximised apps
/// stay out of it, like the taskbar) and moves the sidebar into it.
#[tauri::command]
pub fn appbar_set(window: WebviewWindow, side: String, width: f64, monitor: Option<String>) -> Result<Rect, String> {
    let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0 as _);
    let mon = monitor
        .as_deref()
        .and_then(|n| monitor_by_name(&window, n))
        .or_else(|| window.current_monitor().ok().flatten())
        .ok_or("No display found")?;
    let (mx, my) = (mon.position().x, mon.position().y);
    let (mw, mh) = (mon.size().width as i32, mon.size().height as i32);
    let w = (width * mon.scale_factor()).round() as i32;
    let edge = if side == "left" { ABE_LEFT } else { ABE_RIGHT };
    let mut rc = RECT { left: mx, top: my, right: mx + mw, bottom: my + mh };
    let mut abd = appbar_data(hwnd, edge, rc);
    unsafe {
        let mut reg = APPBARS.lock().unwrap();
        if !reg.contains(&(hwnd.0 as isize)) {
            if SHAppBarMessage(ABM_NEW, &mut abd) == 0 {
                return Err("Windows refused to reserve space for the sidebar.".into());
            }
            reg.push(hwnd.0 as isize);
        }
        // The strip is always flush with the monitor edge; Windows shrinks the work area by it.
        if side == "left" { rc.right = rc.left + w } else { rc.left = rc.right - w }
        abd.rc = rc;
        SHAppBarMessage(ABM_SETPOS, &mut abd);
    }
    // Height: the monitor's work area (so the taskbar stays visible); x: the reserved strip.
    let wa = mon.work_area();
    let r = Rect { x: rc.left, y: wa.position.y, width: w as u32, height: wa.size.height };
    let e = |err: tauri::Error| err.to_string();
    window.set_shadow(false).map_err(e)?;
    // Size limits only exist while floating (resizable). Clearing them makes the windowing
    // library re-read the current size, which overflows for thin strips, so only clear if set.
    if window.is_resizable().unwrap_or(false) {
        window.set_min_size::<PhysicalSize<u32>>(None).map_err(e)?;
        window.set_max_size::<PhysicalSize<u32>>(None).map_err(e)?;
    }
    window.set_resizable(false).map_err(e)?;
    place(&window, r.x, r.y, r.width, r.height).map_err(e)?;
    window.set_always_on_top(true).map_err(e)?;
    window.set_skip_taskbar(true).map_err(e)?;
    // Windows nudges windows out of a freshly reserved strip while it updates the work area;
    // put the sidebar back on its strip once that has settled.
    let w2 = window.clone();
    std::thread::spawn(move || {
        for delay in [400u64, 800] {
            std::thread::sleep(std::time::Duration::from_millis(delay));
            let _ = place(&w2, r.x, r.y, r.width, r.height);
        }
    });
    Ok(r)
}

/// Gives the reserved strip back to Windows.
pub fn appbar_cleanup() {
    for h in APPBARS.lock().unwrap().drain(..) {
        let mut d = appbar_data(HWND(h as _), ABE_LEFT, RECT::default());
        unsafe {
            SHAppBarMessage(ABM_REMOVE, &mut d);
        }
    }
}

fn appbar_remove_one(hwnd: isize) {
    let mut reg = APPBARS.lock().unwrap();
    if let Some(i) = reg.iter().position(|h| *h == hwnd) {
        reg.remove(i);
        let mut d = appbar_data(HWND(hwnd as _), ABE_LEFT, RECT::default());
        unsafe {
            SHAppBarMessage(ABM_REMOVE, &mut d);
        }
    }
}

/// Gives back the strip reserved by the calling window (other monitors keep theirs).
#[tauri::command]
pub fn appbar_remove(window: WebviewWindow) {
    if let Ok(h) = window.hwnd() {
        appbar_remove_one(h.0 as isize);
    }
}

/// Opens Settings / Tools / editors in their own window so a sidebar, notch or tiny button
/// stays open next to it. `overlay` is the JSON the UI uses to describe the screen.
#[tauri::command]
pub async fn open_panel_window(app: AppHandle, overlay: String, display: Option<String>) -> Result<(), String> {
    if serde_json::from_str::<serde_json::Value>(&overlay).is_err() {
        return Err("Invalid panel request".into());
    }
    if let Some(w) = app.get_webview_window("panel") {
        let _ = w.emit_to("panel", "panel-overlay", overlay);
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        return Ok(());
    }
    let query: String = url::form_urlencoded::byte_serialize(overlay.as_bytes()).collect();
    let disp: String = display.map(|d| format!("&display={}", url::form_urlencoded::byte_serialize(d.as_bytes()).collect::<String>())).unwrap_or_default();
    WebviewWindowBuilder::new(&app, "panel", WebviewUrl::App(format!("index.html?panel={query}{disp}").into()))
        .title("Command Centre")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(true)
        .visible(false)
        .inner_size(760.0, 600.0)
        .min_inner_size(420.0, 360.0)
        .disable_drag_drop_handler()
        .build()
        .map_err(|e| format!("Could not open the settings window: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn show_main_window(window: WebviewWindow, focus: Option<bool>) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    let _ = window.unminimize();
    if focus.unwrap_or(true) {
        let _ = window.set_focus();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(mode: &str, expanded: bool) -> ModeRequest {
        ModeRequest {
            mode: mode.into(),
            expanded,
            always_on_top: true,
            floating: None,
            floating_default: Size { width: 640.0, height: 520.0 },
            sidebar_side: "right".into(),
            sidebar_width: 76.0,
            sidebar_expanded_width: 260.0,
            notch_size: Size { width: 240.0, height: 36.0 },
            notch_expanded_size: Size { width: 760.0, height: 190.0 },
            button_size: 60.0,
            button_expanded_size: Size { width: 340.0, height: 340.0 },
            button_position: None,
            monitor: None,
            pinned_width: None,
        }
    }
    const AREA: Rect = Rect { x: 0, y: 0, width: 1920, height: 1032 };

    #[test]
    fn sidebar_docks_right_full_height() {
        let r = compute(&req("sidebar", false), AREA, 1.0, false);
        assert_eq!(r.x + r.width as i32, 1910);
        assert_eq!(r.height, 1012);
    }

    #[test]
    fn notch_is_top_centre_and_dpi_scaled() {
        let r = compute(&req("notch", false), AREA, 1.5, false);
        assert_eq!((r.y, r.width, r.height), (0, 360, 54));
        assert_eq!(r.x, (1920 - 360) / 2);
    }

    #[test]
    fn button_expands_around_its_centre_and_stays_on_screen() {
        let mut q = req("button", true);
        q.button_position = Some(Point { x: 1880, y: 990 });
        let r = compute(&q, AREA, 1.0, false);
        assert!(r.x + r.width as i32 <= 1920 && r.y + r.height as i32 <= 1032);
        q.button_position = Some(Point { x: 800, y: 400 });
        let r = compute(&q, AREA, 1.0, false);
        assert_eq!((r.x + 170, r.y + 170), (830, 430));
    }

    #[test]
    fn display_labels_are_safe() {
        assert_eq!(display_label(r"\\.\DISPLAY2"), "display-DISPLAY2");
        assert_eq!(display_label("Monitor 3"), "display-Monitor3");
    }

    #[test]
    fn offscreen_floating_bounds_are_recentred() {
        let mut q = req("floating", false);
        q.floating = Some(Rect { x: 5000, y: 5000, width: 600, height: 500 });
        let r = compute(&q, AREA, 1.0, false);
        assert_eq!((r.x, r.y), (640, 256));
        let r = compute(&q, AREA, 1.0, true);
        assert!(r.x + r.width as i32 <= 1920);
    }
}

/// "Stay on desktop": the window belongs to the desktop (Progman), so it survives Show Desktop,
/// and sits at the bottom of the z-order, below every open app. `on = false` undoes it.
#[tauri::command]
pub fn set_desktop_layer(window: WebviewWindow, on: bool) -> Result<(), String> {
    use windows::core::w;
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowW, SetWindowLongPtrW, SetWindowPos, GWLP_HWNDPARENT, HWND_BOTTOM, HWND_TOP, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };
    let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0 as _);
    window.set_always_on_top(!on).map_err(|e| e.to_string())?;
    unsafe {
        let owner = if on { FindWindowW(w!("Progman"), None).unwrap_or_default() } else { HWND::default() };
        SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, owner.0 as isize);
        let after = if on { HWND_BOTTOM } else { HWND_TOP };
        SetWindowPos(hwnd, after, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE).map_err(|e| e.to_string())?;
    }
    Ok(())
}
