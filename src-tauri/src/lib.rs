mod ai;
mod config;
mod icons;
mod launcher;
mod media;
mod processes;
mod scheduler;
mod spotify;
mod system;
mod util;
mod window_mode;

use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

fn main_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("main")
}

/// Shows every launcher window (one per enabled monitor) and focuses the main one.
fn show(app: &AppHandle) {
    for w in app.webview_windows().values() {
        let _ = w.show();
        let _ = w.unminimize();
    }
    if let Some(w) = main_window(app) {
        let _ = w.set_focus();
    }
}

fn toggle(app: &AppHandle) {
    let visible = main_window(app).map(|w| w.is_visible().unwrap_or(false)).unwrap_or(false);
    if visible {
        for w in app.webview_windows().values() {
            let _ = w.hide();
        }
    } else {
        show(app);
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let toggle_item = MenuItem::with_id(app, "toggle", "Show / hide Command Centre", true, None::<&str>)?;
    let modes = Submenu::with_items(
        app,
        "Display mode",
        true,
        &[
            &MenuItem::with_id(app, "mode:floating", "Floating panel", true, None::<&str>)?,
            &MenuItem::with_id(app, "mode:sidebar", "Slim sidebar", true, None::<&str>)?,
            &MenuItem::with_id(app, "mode:notch", "Top notch", true, None::<&str>)?,
            &MenuItem::with_id(app, "mode:button", "Tiny button", true, None::<&str>)?,
        ],
    )?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let hotkeys = MenuItem::with_id(app, "toggle-hotkeys", "Pause / resume global hotkeys", true, None::<&str>)?;
    let hub = MenuItem::with_id(app, "toggle-hub", "Show / hide hub circle", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Command Centre", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&toggle_item, &modes, &hub, &settings, &hotkeys, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().cloned().expect("bundled icon"))
        .tooltip("Command Centre")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => toggle(app),
            "quit" => app.exit(0),
            "settings" => {
                show(app);
                let _ = app.emit("tray-open-settings", ());
            }
            "toggle-hub" => {
                let _ = app.emit("tray-toggle-hub", ());
            }
            "toggle-hotkeys" => {
                let _ = app.emit("tray-toggle-hotkeys", ());
            }
            id if id.starts_with("mode:") => {
                show(app);
                let _ = app.emit("tray-mode", id.trim_start_matches("mode:").to_string());
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                toggle(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .manage(Mutex::new(system::StatsState::default()))
        .manage(scheduler::Scheduler::default())
        .manage(ai::AiState::default())
        .manage(spotify::SpotifyState::default())
        .invoke_handler(tauri::generate_handler![
            config::load_config,
            config::save_config,
            config::quarantine_config,
            config::create_backup,
            config::list_backups,
            config::read_backup,
            config::delete_backup,
            config::export_config_file,
            config::read_import_file,
            config::config_dir_path,
            launcher::launch_app,
            launcher::open_folder,
            launcher::open_url,
            launcher::list_installed_apps,
            icons::extract_icon,
            launcher::read_icon_file,
            processes::is_app_running,
            processes::close_app_gracefully,
            system::get_volume,
            system::set_volume,
            system::set_mute,
            system::get_brightness,
            system::set_brightness,
            system::send_shortcut,
            system::system_action,
            media::now_playing,
            media::media_art,
            media::media_control,
            system::system_stats,
            window_mode::apply_window_mode,
            window_mode::show_main_window,
            window_mode::list_monitors,
            window_mode::sync_display_windows,
            ai::ai_set_key,
            ai::ai_delete_key,
            ai::ai_key_status,
            ai::ai_chat,
            ai::ai_cancel,
            ai::ai_list_openai_models,
            window_mode::set_hub_window,
            window_mode::appbar_set,
            window_mode::set_desktop_layer,
            window_mode::appbar_remove,
            window_mode::open_panel_window,
            spotify::spotify_connect,
            spotify::spotify_disconnect,
            spotify::spotify_status,
            spotify::spotify_playlists,
            spotify::spotify_play,
            scheduler::set_alarms,
            scheduler::start_timer,
            scheduler::snooze_alarm,
            scheduler::cancel_timer,
            scheduler::list_timers,
            scheduler::stop_alarm_sound,
            scheduler::test_alarm_sound,
            scheduler::set_keep_awake,
            scheduler::keep_awake_status,
        ])
        .on_window_event(|window, event| {
            // The window lives in the tray: closing hides it, "Quit" in the tray exits.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            build_tray(app.handle())?;
            app.state::<scheduler::Scheduler>().start(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running Command Centre")
        .run(|_app, event| {
            // Give a pinned sidebar's reserved screen strip back to Windows on quit.
            if let tauri::RunEvent::Exit = event {
                window_mode::appbar_cleanup();
            }
        });
}
