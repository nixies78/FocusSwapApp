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
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use windows::Win32::Foundation::{LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_MENU, VK_SHIFT, VK_SPACE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetCursorInfo, GetCursorPos, GetMessageW, GetSystemMetrics,
    PeekMessageW, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, CURSORINFO,
    KBDLLHOOKSTRUCT, MSG, PM_NOREMOVE, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
    SM_YVIRTUALSCREEN, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

static GLOBAL_APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static CTRL_PRESSED: AtomicBool = AtomicBool::new(false);
static SHIFT_PRESSED: AtomicBool = AtomicBool::new(false);
static ALT_PRESSED: AtomicBool = AtomicBool::new(false);
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
    // Return system timestamp
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

fn trigger_toggle_overlay(source: &'static str) {
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

        log_status(&format!(
            "[MWB-CHECK] pt=({},{}) hidden={} at_edge={} parked={} → local={}",
            pt.x, pt.y, cursor_hidden, at_outer_edge, parked_at_origin, !is_remote
        ));

        !is_remote
    }
}

unsafe extern "system" fn low_level_keyboard_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if n_code >= 0 {
        let msg = w_param.0 as u32;
        let kbd = &*(l_param.0 as *const KBDLLHOOKSTRUCT);
        let vk = kbd.vkCode;

        // Dynamically track modifier states (crucial for synthetic/injected mouse macro keystrokes)
        if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
            if vk == 0x10 || vk == 0xA0 || vk == 0xA1 {
                SHIFT_PRESSED.store(true, Ordering::SeqCst);
            }
            if vk == 0x11 || vk == 0xA2 || vk == 0xA3 {
                CTRL_PRESSED.store(true, Ordering::SeqCst);
            }
            if vk == 0x12 || vk == 0xA4 || vk == 0xA5 {
                ALT_PRESSED.store(true, Ordering::SeqCst);
            }
        } else if msg == WM_KEYUP || msg == WM_SYSKEYUP {
            if vk == 0x10 || vk == 0xA0 || vk == 0xA1 {
                SHIFT_PRESSED.store(false, Ordering::SeqCst);
            }
            if vk == 0x11 || vk == 0xA2 || vk == 0xA3 {
                CTRL_PRESSED.store(false, Ordering::SeqCst);
            }
            if vk == 0x12 || vk == 0xA4 || vk == 0xA5 {
                ALT_PRESSED.store(false, Ordering::SeqCst);
            }
        }

        if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
            let is_ctrl = CTRL_PRESSED.load(Ordering::SeqCst)
                || (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000 != 0)
                || (GetAsyncKeyState(0x11) as u16 & 0x8000 != 0);
            let is_shift = SHIFT_PRESSED.load(Ordering::SeqCst)
                || (GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000 != 0)
                || (GetAsyncKeyState(0x10) as u16 & 0x8000 != 0);
            let is_alt = ALT_PRESSED.load(Ordering::SeqCst)
                || (GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000 != 0)
                || (kbd.flags.0 & 0x20 != 0);

            // Determine if the key matches any of our trigger shortcuts
            let matched_source = if (vk == 0x43 || vk == 0x63) && is_ctrl && is_shift {
                Some("Native Hook: Shift+Ctrl+C")
            } else if vk >= 0x7C && vk <= 0x87 {
                Some("Native Hook: Extended Function Key (F13-F24)")
            } else if vk == VK_SPACE.0 as u32 && is_ctrl && is_shift && !is_alt {
                Some("Native Hook: Ctrl+Shift+Space")
            } else if vk == 0x51 && is_alt && !is_ctrl {
                Some("Native Hook: Alt+Q")
            } else {
                None
            };

            if let Some(source) = matched_source {
                // Check if mouse cursor is on local machine (Mouse Without Borders multi-machine support)
                if !is_cursor_on_local_machine() {
                    log_status(&format!(
                        "[{}] FORWARDING: mouse cursor is remote. Passing key to MWB!",
                        source
                    ));
                    // DO NOT swallow or trigger overlay! Let Mouse Without Borders forward the key across the network!
                    return CallNextHookEx(None, n_code, w_param, l_param);
                }

                trigger_toggle_overlay(source);
                return LRESULT(1);
            }
        }
    }
    CallNextHookEx(None, n_code, w_param, l_param)
}

fn start_native_hotkey_hook(app: AppHandle) {
    let _ = GLOBAL_APP_HANDLE.set(app);

    std::thread::spawn(|| {
        unsafe {
            // Force creation of message queue for this worker thread
            let mut msg = MSG::default();
            let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);

            let hmod = windows::Win32::System::LibraryLoader::GetModuleHandleW(None).unwrap_or_default();
            let hook = SetWindowsHookExW(
                WH_KEYBOARD_LL,
                Some(low_level_keyboard_proc),
                hmod,
                0,
            );

            match hook {
                Ok(h) => {
                    let _ = std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open("focusdeck_status.log")
                        .and_then(|mut f| {
                            use std::io::Write;
                            writeln!(f, "Native WH_KEYBOARD_LL hook active with hmod: {:?}", hmod)
                        });

                    let mut msg = MSG::default();
                    while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                        let _ = TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }
                    let _ = UnhookWindowsHookEx(h);
                }
                Err(e) => {
                    let _ = std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open("focusdeck_status.log")
                        .and_then(|mut f| {
                            use std::io::Write;
                            writeln!(f, "ERROR: SetWindowsHookExW failed: {:?}", e)
                        });
                }
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
                "FocusDeck v{} Active | Shortcuts: Shift+Ctrl+C / F14 (fallback Alt+Q) | MWB: ENABLED | Autostart: {}",
                version,
                autostart::is_autostart_enabled()
            ));

            // Start low-level native keyboard hook (supports Shift+Ctrl+C, F14, Ctrl+Shift+Space, Alt+Q)
            start_native_hotkey_hook(app.handle().clone());

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
