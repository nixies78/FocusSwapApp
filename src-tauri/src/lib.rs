mod autostart;
mod config;
mod launcher;
mod session;
mod win32_layout;

use config::{get_config_path, load_config, Preset};
use launcher::execute_preset as run_preset;
use session::SessionManager;
use std::process::Command;
use std::sync::Arc;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

fn toggle_overlay(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(is_visible) = window.is_visible() {
            if is_visible {
                let _ = window.hide();
            } else {
                // Position and size to cover target monitor
                let mon = window.current_monitor().ok().flatten()
                    .or_else(|| window.primary_monitor().ok().flatten());
                if let Some(m) = mon {
                    let size = m.size();
                    let pos = m.position();
                    let _ = window.set_position(tauri::Position::Physical(*pos));
                    let _ = window.set_size(tauri::Size::Physical(*size));

                    #[cfg(windows)]
                    {
                        let center_x = pos.x + (size.width as i32 / 2);
                        let center_y = pos.y + (size.height as i32 / 2);
                        unsafe {
                            let _ = windows::Win32::UI::WindowsAndMessaging::SetCursorPos(center_x, center_y);
                        }
                    }
                }
                let _ = window.show();
                let _ = window.set_focus();

                #[cfg(windows)]
                if let Ok(hwnd) = window.hwnd() {
                    win32_layout::force_foreground_window(windows::Win32::Foundation::HWND(hwnd.0 as _));
                }
            }
        }
    }
}

#[tauri::command]
fn center_cursor(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let mon = window.current_monitor().ok().flatten()
            .or_else(|| window.primary_monitor().ok().flatten());
        if let Some(m) = mon {
            let size = m.size();
            let pos = m.position();
            let center_x = pos.x + (size.width as i32 / 2);
            let center_y = pos.y + (size.height as i32 / 2);
            #[cfg(windows)]
            unsafe {
                let _ = windows::Win32::UI::WindowsAndMessaging::SetCursorPos(center_x, center_y);
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn get_presets() -> Result<Vec<Preset>, String> {
    let cfg = load_config()?;
    Ok(cfg.presets)
}

#[tauri::command]
fn get_active_session(session_mgr: State<'_, Arc<SessionManager>>) -> Result<Option<String>, String> {
    Ok(session_mgr.get_active_session())
}

#[tauri::command]
fn switch_to_general(
    app: AppHandle,
    session_mgr: State<'_, Arc<SessionManager>>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    session_mgr.switch_to_general()
}

#[tauri::command]
fn execute_preset(
    app: AppHandle,
    preset_id: String,
    session_mgr: State<'_, Arc<SessionManager>>,
) -> Result<(), String> {
    // Immediately hide the overlay launcher
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    // Trigger session transition (actions the departing session according to policy)
    session_mgr.transition_to(&preset_id)?;

    let cfg = load_config()?;
    let preset = cfg
        .presets
        .into_iter()
        .find(|p| p.id == preset_id)
        .ok_or_else(|| format!("Preset '{}' not found", preset_id))?;

    run_preset(&preset, &session_mgr.inner())
}

#[tauri::command]
fn hide_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
fn open_config_file() -> Result<(), String> {
    let path = get_config_path();
    Command::new("notepad.exe")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open config file with notepad: {}", e))?;
    Ok(())
}

#[tauri::command]
fn reload_config() -> Result<Vec<Preset>, String> {
    let cfg = load_config()?;
    Ok(cfg.presets)
}

#[tauri::command]
fn capture_window_layout() -> Result<win32_layout::CapturedLayout, String> {
    Ok(win32_layout::capture_current_layout())
}

#[tauri::command]
fn save_presets(presets: Vec<Preset>) -> Result<(), String> {
    config::save_presets(presets)
}

#[tauri::command]
fn delete_preset(preset_id: String) -> Result<Vec<Preset>, String> {
    config::delete_preset(&preset_id)
}

#[tauri::command]
fn is_autostart_enabled() -> Result<bool, String> {
    Ok(autostart::is_autostart_enabled())
}

#[tauri::command]
fn set_autostart_enabled(enable: bool) -> Result<bool, String> {
    autostart::set_autostart(enable)?;
    Ok(autostart::is_autostart_enabled())
}

pub fn run() {
    // Ensure working directory is always the application folder
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let _ = std::env::set_current_dir(exe_dir);
        }
    }

    std::panic::set_hook(Box::new(|info| {
        let msg = format!("PANIC: {:?}", info);
        let _ = std::fs::write("C:\\VibeCoding\\FocusSwapApp\\focusdeck_crash.log", msg);
    }));

    let _ = env_logger::try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_overlay(app);
                    }
                })
                .build(),
        )
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(|app| {
            // Register default shortcuts (supports Alt+Space, Ctrl+Shift+Space, Alt+Q, Ctrl+Space)
            let mut registered: Vec<&'static str> = Vec::new();
            let shortcuts_to_try = ["Alt+Space", "Ctrl+Shift+Space", "Alt+Q", "Ctrl+Space"];
            for sc in &shortcuts_to_try {
                if let Ok(shortcut) = sc.parse::<Shortcut>() {
                    if app.global_shortcut().register(shortcut).is_ok() {
                        registered.push(*sc);
                    }
                }
            }

            let primary_shortcut = if registered.contains(&"Alt+Space") {
                "Alt+Space"
            } else if registered.contains(&"Ctrl+Shift+Space") {
                "Ctrl+Shift+Space"
            } else if registered.contains(&"Alt+Q") {
                "Alt+Q"
            } else {
                "Click Tray"
            };

            let _ = std::fs::write(
                "focusdeck_status.log",
                format!(
                    "FocusDeck Active.\nActive Shortcuts: {:?}\nPrimary: {}\nAutostart: {}\n",
                    registered,
                    primary_shortcut,
                    autostart::is_autostart_enabled()
                ),
            );

            // Register Tray Icon & Menu
            let toggle_label = format!("Toggle FocusDeck ({})", primary_shortcut);
            let toggle_item = MenuItem::with_id(app, "toggle", &toggle_label, true, None::<&str>)?;
            let autostart_item = CheckMenuItem::with_id(
                app,
                "autostart",
                "Start with Windows",
                true,
                autostart::is_autostart_enabled(),
                None::<&str>,
            )?;
            let config_item = MenuItem::with_id(app, "config", "Open workspaces.json", true, None::<&str>)?;
            let reload_item = MenuItem::with_id(app, "reload", "Reload Configuration", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit FocusDeck", true, None::<&str>)?;

            let tray_menu = Menu::with_items(
                app,
                &[
                    &toggle_item,
                    &autostart_item,
                    &config_item,
                    &reload_item,
                    &quit_item,
                ],
            )?;

            let icon_result = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
                .or_else(|_| tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png")));

            let icon = match icon_result {
                Ok(img) => img,
                Err(e) => {
                    let _ = std::fs::write(
                        "focusdeck_crash.log",
                        format!("Tray icon error: {:?}", e),
                    );
                    return Err(Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Failed to load tray icon: {}", e),
                    )));
                }
            };

            let tooltip = format!("FocusDeck ({})", primary_shortcut);
            let tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip(&tooltip)
                .menu(&tray_menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        toggle_overlay(app);
                    }
                    "autostart" => {
                        let current = autostart::is_autostart_enabled();
                        let _ = autostart::set_autostart(!current);
                    }
                    "config" => {
                        let _ = open_config_file();
                    }
                    "reload" => {
                        let _ = load_config();
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        toggle_overlay(app);
                    }
                })
                .build(app)?;

            // Crucial: keep TrayIcon referenced in Tauri state so it does not drop and delete itself from the tray!
            app.manage(tray);

            // Manage SessionManager state
            let session_manager = Arc::new(SessionManager::new());
            app.manage(session_manager);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_presets,
            get_active_session,
            execute_preset,
            switch_to_general,
            hide_overlay,
            center_cursor,
            open_config_file,
            reload_config,
            capture_window_layout,
            save_presets,
            delete_preset,
            is_autostart_enabled,
            set_autostart_enabled,
        ])
        .build(tauri::generate_context!())
        .map_err(|e| {
            let _ = std::fs::write(
                "focusdeck_crash.log",
                format!("Tauri build error: {:?}", e),
            );
            e
        })
        .expect("error while building FocusDeck application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
