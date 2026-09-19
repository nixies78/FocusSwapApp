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
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use windows::Win32::Foundation::POINT;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_CONTROL,
    MOD_NOREPEAT, MOD_SHIFT, VK_CONTROL, VK_MENU, VK_SHIFT, VK_SPACE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetCursorInfo, GetCursorPos, GetMessageW, GetSystemMetrics, PeekMessageW,
    TranslateMessage, CURSORINFO, MSG, PM_NOREMOVE, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
    SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, WM_HOTKEY,
};

static GLOBAL_APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static LAST_TRIGGER_MILLIS: AtomicU64 = AtomicU64::new(0);

fn log_status(msg: &str) {
    let now = chrono_or_simple_timestamp();
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("focusdeck_status.log")
        .and_then(|mut f| {
            use std::io::Write;
            writeln!(f, "[{}] {}", now, msg)
        });
}

fn chrono_or_simple_timestamp() -> String {
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    let millis = duration.subsec_millis();
    let hours = (secs / 3600) % 24;
    let mins = (secs / 60) % 60;
    let s = secs % 60;
    format!("{:02}:{:02}:{:02}.{:03}", hours, mins, s, millis)
}

fn can_trigger_now() -> bool {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let last = LAST_TRIGGER_MILLIS.load(Ordering::SeqCst);
    if now.saturating_sub(last) >= 250 {
        LAST_TRIGGER_MILLIS.store(now, Ordering::SeqCst);
        true
    } else {
        false
    }
}

fn trigger_toggle_overlay(source: &'static str) {
    if !can_trigger_now() {
        return;
    }

    if !is_cursor_on_local_machine() {
        log_status(&format!("[{}] Ignored: cursor is on remote machine (MWB active)", source));
        return;
    }

    log_status(&format!("[{}] Triggered toggle_overlay", source));

    if let Some(app) = GLOBAL_APP_HANDLE.get() {
        let app_c = app.clone();
        let _ = app.run_on_main_thread(move || {
            toggle_overlay(&app_c);
        });
    }
}

fn is_cursor_on_local_machine() -> bool {
    unsafe {
        let mut pt = POINT::default();
        let pt_ok = GetCursorPos(&mut pt).is_ok();

        let mut ci = CURSORINFO::default();
        ci.cbSize = std::mem::size_of::<CURSORINFO>() as u32;
        let ci_ok = GetCursorInfo(&mut ci).is_ok();

        let v_left = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let v_top = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let v_width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let v_height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        let v_right = v_left + v_width;
        let v_bottom = v_top + v_height;

        let cursor_hidden = ci_ok && ci.flags.0 == 0;
        let at_outer_edge = pt_ok && (
            pt.x <= v_left + 2 ||
            pt.x >= v_right - 2 ||
            pt.y <= v_top + 2 ||
            pt.y >= v_bottom - 2
        );
        let parked_at_origin = pt_ok && pt.x == 0 && pt.y == 0;

        let is_remote = cursor_hidden || at_outer_edge || (parked_at_origin && cursor_hidden);

        !is_remote
    }
}

fn start_native_hotkey_listener(app: AppHandle) {
    let _ = GLOBAL_APP_HANDLE.set(app.clone());

    // 1. Dedicated Win32 RegisterHotKey message loop thread (Zero global hooks, zero lag)
    std::thread::spawn(|| {
        unsafe {
            let mut msg = MSG::default();
            let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);

            // Hotkeys explicitly configured:
            // - Shift+Ctrl+C (Razer Synapse mouse button 3)
            // - F14 (Requested function key)
            // - F13 (Razer Synapse mouse button 2)
            // - F15
            // - Ctrl+Shift+Space
            // - Alt+Q (Standard fallback)
            // CRITICAL: F20 (0x83) is NEVER registered! Strictly reserved for Help Respond!
            // CRITICAL: Alt+Space is NEVER registered! Strictly reserved for PowerToys Run!
            let hotkeys: [(i32, &'static str, HOT_KEY_MODIFIERS, u32); 6] = [
                (101, "Win32 Hotkey: Shift+Ctrl+C", HOT_KEY_MODIFIERS(MOD_CONTROL.0 | MOD_SHIFT.0 | MOD_NOREPEAT.0), 0x43),
                (102, "Win32 Hotkey: F14", HOT_KEY_MODIFIERS(MOD_NOREPEAT.0), 0x7D),
                (103, "Win32 Hotkey: F13", HOT_KEY_MODIFIERS(MOD_NOREPEAT.0), 0x7C),
                (104, "Win32 Hotkey: F15", HOT_KEY_MODIFIERS(MOD_NOREPEAT.0), 0x7E),
                (105, "Win32 Hotkey: Ctrl+Shift+Space", HOT_KEY_MODIFIERS(MOD_CONTROL.0 | MOD_SHIFT.0 | MOD_NOREPEAT.0), VK_SPACE.0 as u32),
                (106, "Win32 Hotkey: Alt+Q", HOT_KEY_MODIFIERS(MOD_ALT.0 | MOD_NOREPEAT.0), 0x51),
            ];

            let mut registered_ids = Vec::new();
            for (id, name, mods, vk) in hotkeys {
                match RegisterHotKey(None, id, mods, vk) {
                    Ok(_) => {
                        registered_ids.push(id);
                        log_status(&format!("Successfully registered Win32 RegisterHotKey: {} (ID {})", name, id));
                    }
                    Err(e) => {
                        log_status(&format!("Failed to register Win32 RegisterHotKey: {} (ID {}): {:?}", name, id, e));
                    }
                }
            }

            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                if msg.message == WM_HOTKEY {
                    let id = msg.wParam.0 as i32;
                    let source = match id {
                        101 => "Win32 Hotkey: Shift+Ctrl+C",
                        102 => "Win32 Hotkey: F14",
                        103 => "Win32 Hotkey: F13",
                        104 => "Win32 Hotkey: F15",
                        105 => "Win32 Hotkey: Ctrl+Shift+Space",
                        106 => "Win32 Hotkey: Alt+Q",
                        _ => "Win32 Hotkey: Unknown",
                    };
                    trigger_toggle_overlay(source);
                }
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            for id in registered_ids {
                let _ = UnregisterHotKey(None, id);
            }
        }
    });

    // 2. Dedicated GetAsyncKeyState Polling Thread (15ms loop)
    // Catches mouse buttons (Mouse 4/5) and synthetic driver keystrokes without hooks
    std::thread::spawn(|| {
        let mut was_xbtn1 = false;
        let mut was_xbtn2 = false;
        let mut was_f14 = false;
        let mut was_f13 = false;
        let mut was_shift_ctrl_c = false;
        let mut was_alt_q = false;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(15));

            unsafe {
                let is_ctrl = (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
                let is_shift = (GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0;
                let is_alt = (GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000) != 0;

                let c_down = (GetAsyncKeyState(0x43) as u16 & 0x8000) != 0;
                let q_down = (GetAsyncKeyState(0x51) as u16 & 0x8000) != 0;
                let f14_down = (GetAsyncKeyState(0x7D) as u16 & 0x8000) != 0;
                let f13_down = (GetAsyncKeyState(0x7C) as u16 & 0x8000) != 0;
                let xbtn1_down = (GetAsyncKeyState(0x05) as u16 & 0x8000) != 0; // Mouse 4
                let xbtn2_down = (GetAsyncKeyState(0x06) as u16 & 0x8000) != 0; // Mouse 5

                let is_shift_ctrl_c = c_down && is_ctrl && is_shift;
                let is_alt_q = q_down && is_alt && !is_ctrl;

                // Detect rising edges (button/key just pressed down)
                if xbtn1_down && !was_xbtn1 {
                    trigger_toggle_overlay("Mouse Poller: Mouse 4 (XBUTTON1)");
                }
                if xbtn2_down && !was_xbtn2 {
                    trigger_toggle_overlay("Mouse Poller: Mouse 5 (XBUTTON2)");
                }
                if f14_down && !was_f14 {
                    trigger_toggle_overlay("Key Poller: F14");
                }
                if f13_down && !was_f13 {
                    trigger_toggle_overlay("Key Poller: F13");
                }
                if is_shift_ctrl_c && !was_shift_ctrl_c {
                    trigger_toggle_overlay("Key Poller: Shift+Ctrl+C");
                }
                if is_alt_q && !was_alt_q {
                    trigger_toggle_overlay("Key Poller: Alt+Q");
                }

                was_xbtn1 = xbtn1_down;
                was_xbtn2 = xbtn2_down;
                was_f14 = f14_down;
                was_f13 = f13_down;
                was_shift_ctrl_c = is_shift_ctrl_c;
                was_alt_q = is_alt_q;
            }
        }
    });
}


fn toggle_overlay(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open("focusdeck_status.log")
            .and_then(|mut f| {
                use std::io::Write;
                writeln!(f, "[toggle_overlay] is_visible: {}", is_visible)
            });

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

#[tauri::command]
fn get_chrome_profiles() -> Result<Vec<launcher::ChromeProfile>, String> {
    Ok(launcher::detect_chrome_profiles())
}

#[tauri::command]
fn get_cleanup_config() -> Result<config::CleanupConfig, String> {
    config::get_cleanup_config()
}

#[tauri::command]
fn save_cleanup_config(cleanup: config::CleanupConfig) -> Result<(), String> {
    config::save_cleanup_config(cleanup)
}

#[tauri::command]
fn execute_smart_cleanup() -> Result<win32_layout::CleanupSummary, String> {
    win32_layout::execute_smart_cleanup()
}

#[tauri::command]
fn update_and_restart(_app: AppHandle) -> Result<(), String> {
    let exe_dir = if let Ok(exe_path) = std::env::current_exe() {
        exe_path.parent().unwrap_or_else(|| std::path::Path::new(".")).to_path_buf()
    } else {
        std::path::PathBuf::from(".")
    };

    let script_path = exe_dir.join("update_and_restart.bat");
    if !script_path.exists() {
        let bat_content = "@echo off\r\ntitle FocusDeck Updater\r\ntaskkill /f /im FocusDeck.exe >nul 2>&1\r\ntimeout /t 1 /nobreak >nul\r\ncd /d \"%~dp0\"\r\ngit pull\r\nstart \"\" \"%~dp0FocusDeck.exe\"\r\nexit\r\n";
        let _ = std::fs::write(&script_path, bat_content);
    }

    std::process::Command::new("cmd.exe")
        .args(["/c", "start", "", script_path.to_str().unwrap_or("update_and_restart.bat")])
        .current_dir(&exe_dir)
        .spawn()
        .map_err(|e| format!("Failed to launch updater: {}", e))?;

    // Exit immediately so FocusDeck.exe is unlocked for git pull
    std::process::exit(0);
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
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(|app| {
            let version = env!("CARGO_PKG_VERSION");
            let primary_shortcut = "Shift+Ctrl+C / F14";

            log_status(&format!(
                "FocusDeck v{} Active | Shortcuts: Shift+Ctrl+C / F14 / F13 / Mouse4/5 (fallback Alt+Q) | Conflict-Free RegisterHotKey + Polling (Zero Hooks) | Autostart: {}",
                version,
                autostart::is_autostart_enabled()
            ));

            // Start conflict-free native Win32 hotkey listener and mouse poller
            start_native_hotkey_listener(app.handle().clone());

            // Register Tray Icon & Menu
            let toggle_label = format!("Toggle FocusDeck v{} ({})", version, primary_shortcut);
            let toggle_item = MenuItem::with_id(app, "toggle", &toggle_label, true, None::<&str>)?;
            let autostart_item = CheckMenuItem::with_id(
                app,
                "autostart",
                "Start with Windows",
                true,
                autostart::is_autostart_enabled(),
                None::<&str>,
            )?;
            let config_item = MenuItem::with_id(app, "config", "Open Workspaces Config", true, None::<&str>)?;
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

            let tooltip = format!("FocusDeck v{} ({})", version, primary_shortcut);
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
            get_chrome_profiles,
            get_cleanup_config,
            save_cleanup_config,
            execute_smart_cleanup,
            update_and_restart,
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
