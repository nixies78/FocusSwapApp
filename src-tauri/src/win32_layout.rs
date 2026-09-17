use serde::{Deserialize, Serialize};
use std::path::Path;
use std::thread::sleep;
use std::time::{Duration, Instant};
use windows::core::PWSTR;
use windows::Win32::Foundation::{BOOL, CloseHandle, HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO,
    MONITOR_DEFAULTTONEAREST, MonitorFromWindow,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, EnumWindows, GetClassNameW, GetWindowRect, GetWindowTextLengthW,
    GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    IsZoomed, SetForegroundWindow, SetWindowPos, ShowWindow, HWND_TOP,
    SWP_SHOWWINDOW, SW_MAXIMIZE, SW_RESTORE, SW_SHOW,
};

use crate::config::Placement;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub index: usize,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapturedWindow {
    pub id: String,
    pub title: String,
    pub executable: String,
    pub process_path: String,
    pub screen_index: usize,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub is_maximized: bool,
    pub is_minimized: bool,
    pub is_chrome: bool,
    pub suggested_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapturedLayout {
    pub monitors: Vec<MonitorInfo>,
    pub windows: Vec<CapturedWindow>,
}

unsafe extern "system" fn enum_monitors_callback(
    hmonitor: HMONITOR,
    _: HDC,
    _: *mut RECT,
    lparam: LPARAM,
) -> BOOL {
    let monitors = &mut *(lparam.0 as *mut Vec<(HMONITOR, MONITORINFO)>);
    let mut info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };

    if GetMonitorInfoW(hmonitor, &mut info).as_bool() {
        monitors.push((hmonitor, info));
    }

    BOOL(1)
}

pub fn get_monitors() -> Vec<MonitorInfo> {
    let mut raw_monitors: Vec<(HMONITOR, MONITORINFO)> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(
            HDC::default(),
            None,
            Some(enum_monitors_callback),
            LPARAM(&mut raw_monitors as *mut Vec<(HMONITOR, MONITORINFO)> as isize),
        );
    }

    let mut result = Vec::new();
    for (i, (_hmon, info)) in raw_monitors.into_iter().enumerate() {
        let width = info.rcMonitor.right - info.rcMonitor.left;
        let height = info.rcMonitor.bottom - info.rcMonitor.top;
        let is_primary = (info.dwFlags & 1) != 0; // MONITORINFOF_PRIMARY = 1

        result.push(MonitorInfo {
            index: i + 1,
            name: format!("Screen {}", i + 1),
            x: info.rcMonitor.left,
            y: info.rcMonitor.top,
            width,
            height,
            is_primary,
        });
    }

    if result.is_empty() {
        result.push(MonitorInfo {
            index: 1,
            name: "Screen 1".to_string(),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            is_primary: true,
        });
    }

    result
}

struct CaptureContext {
    monitors: Vec<MonitorInfo>,
    windows: Vec<CapturedWindow>,
}

unsafe extern "system" fn capture_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let ctx = &mut *(lparam.0 as *mut CaptureContext);

    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }

    let is_min = IsIconic(hwnd).as_bool();
    let is_max = IsZoomed(hwnd).as_bool();

    let mut cloaked: u32 = 0;
    let _ = DwmGetWindowAttribute(
        hwnd,
        DWMWA_CLOAKED,
        &mut cloaked as *mut u32 as *mut _,
        std::mem::size_of::<u32>() as u32,
    );
    if cloaked != 0 {
        return BOOL(1);
    }

    let mut rect = RECT::default();
    if GetWindowRect(hwnd, &mut rect).is_ok() {
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 10 || height <= 10 {
            return BOOL(1);
        }
    }

    let length = GetWindowTextLengthW(hwnd);
    if length <= 0 {
        return BOOL(1);
    }

    let mut buf = vec![0u16; (length + 1) as usize];
    let copied = GetWindowTextW(hwnd, &mut buf);
    if copied <= 0 {
        return BOOL(1);
    }
    let mut title = String::from_utf16_lossy(&buf[..copied as usize]).trim().to_string();

    // Ignore shell and system overlays
    let title_lower = title.to_lowercase();
    if title_lower == "program manager"
        || title_lower == "windows input experience"
        || title_lower == "focusdeck overlay"
        || title_lower == "focusdeck"
    {
        return BOOL(1);
    }

    let mut process_id: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut process_id));
    if process_id == 0 || process_id == std::process::id() {
        return BOOL(1);
    }

    // Resolve full executable path
    let mut exe_path = String::new();
    let mut exe_name = String::new();

    if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) {
        let mut path_buf = vec![0u16; 1024];
        let mut size = path_buf.len() as u32;
        if QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            PWSTR(path_buf.as_mut_ptr()),
            &mut size,
        )
        .is_ok()
        {
            exe_path = String::from_utf16_lossy(&path_buf[..size as usize]);
            if let Some(name) = Path::new(&exe_path).file_name() {
                exe_name = name.to_string_lossy().to_string();
            }
        }
        let _ = CloseHandle(handle);
    }

    if exe_name.is_empty() {
        return BOOL(1);
    }

    let exe_lower = exe_name.to_lowercase();

    let mut class_buf = vec![0u16; 256];
    let class_len = GetClassNameW(hwnd, &mut class_buf);
    let class_name = String::from_utf16_lossy(&class_buf[..class_len as usize]);

    let is_file_explorer = (exe_lower == "explorer.exe" || exe_lower == "explorer")
        && (class_name == "CabinetWClass" || class_name == "ExploreWClass");

    // Ignore shell/desktop/taskbar explorer windows, but keep actual folder windows
    if (exe_lower == "explorer.exe" || exe_lower == "explorer") && !is_file_explorer {
        return BOOL(1);
    }

    // Ignore known system background binaries and ghost settings
    if exe_lower == "shellexperiencehost.exe"
        || exe_lower == "searchhost.exe"
        || exe_lower == "lockapp.exe"
        || exe_lower == "taskmgr.exe"
        || exe_lower == "systemsettings.exe"
        || exe_lower == "startmenuexperiencehost.exe"
        || exe_lower == "textinputhost.exe"
    {
        return BOOL(1);
    }

    // Determine monitor
    let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    let mut screen_idx = 1;
    let mut mon_info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if GetMonitorInfoW(hmon, &mut mon_info).as_bool() {
        for m in &ctx.monitors {
            if m.x == mon_info.rcMonitor.left && m.y == mon_info.rcMonitor.top {
                screen_idx = m.index;
                break;
            }
        }
    }

    let is_chrome = exe_lower.contains("chrome") || exe_lower.contains("msedge");

    if exe_lower == "applicationframehost.exe" {
        let title_lower = title.to_lowercase();
        if title_lower.contains("calc") {
            exe_name = "calc.exe".to_string();
            exe_path = r"C:\Windows\System32\calc.exe".to_string();
        } else {
            // Ignore generic background ApplicationFrameHost instances like Settings
            return BOOL(1);
        }
    }

    let mut suggested_url = None;
    if is_chrome {
        let title_lower = title.to_lowercase();
        if title_lower.contains("youtube") {
            if title_lower.contains("subscription") {
                suggested_url = Some("https://www.youtube.com/feed/subscriptions".to_string());
            } else {
                suggested_url = Some("https://www.youtube.com".to_string());
            }
        } else if title_lower.contains("gemini") {
            suggested_url = Some("https://gemini.google.com/app".to_string());
        } else if title_lower.contains("calendar") {
            suggested_url = Some("https://calendar.google.com".to_string());
        } else if title_lower.contains("notion") {
            suggested_url = Some("https://www.notion.so".to_string());
        } else if title_lower.contains("gmail") || title_lower.contains("inbox") {
            suggested_url = Some("https://mail.google.com".to_string());
        } else if title_lower.contains("github") {
            suggested_url = Some("https://github.com".to_string());
        } else if title_lower.contains("reddit") {
            suggested_url = Some("https://www.reddit.com".to_string());
        } else if title_lower.contains("spotify") {
            suggested_url = Some("https://open.spotify.com".to_string());
        } else if title_lower.contains("twitch") {
            suggested_url = Some("https://www.twitch.tv".to_string());
        } else if title_lower.contains("chatgpt") {
            suggested_url = Some("https://chatgpt.com".to_string());
        }
    } else if is_file_explorer {
        let resolved = resolve_folder_path(&title);
        if let Some(pos) = title.find(" - File Explorer") {
            title = title[..pos].trim().to_string();
        } else if let Some(pos) = title.find(" - Windows Explorer") {
            title = title[..pos].trim().to_string();
        }
        suggested_url = Some(resolved);
    }

    let id = format!("{}_{}", exe_name, process_id);
    ctx.windows.push(CapturedWindow {
        id,
        title,
        executable: exe_name,
        process_path: exe_path,
        screen_index: screen_idx,
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
        is_maximized: is_max,
        is_minimized: is_min,
        is_chrome,
        suggested_url,
    });

    BOOL(1)
}

pub fn capture_current_layout() -> CapturedLayout {
    let monitors = get_monitors();
    let mut ctx = CaptureContext {
        monitors: monitors.clone(),
        windows: Vec::new(),
    };

    unsafe {
        let _ = EnumWindows(
            Some(capture_windows_callback),
            LPARAM(&mut ctx as *mut CaptureContext as isize),
        );
    }

    CapturedLayout {
        monitors,
        windows: ctx.windows,
    }
}

unsafe extern "system" fn collect_hwnds_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let list = &mut *(lparam.0 as *mut std::collections::HashSet<isize>);
    if IsWindowVisible(hwnd).as_bool() {
        list.insert(hwnd.0 as isize);
    }
    BOOL(1)
}

pub fn get_all_visible_hwnds() -> std::collections::HashSet<isize> {
    let mut set = std::collections::HashSet::new();
    unsafe {
        let _ = EnumWindows(
            Some(collect_hwnds_callback),
            LPARAM(&mut set as *mut std::collections::HashSet<isize> as isize),
        );
    }
    set
}

struct FindContext<'a> {
    target_pid: Option<u32>,
    title_pattern: Option<String>,
    exclude_hwnds: Option<&'a std::collections::HashSet<isize>>,
    require_app_mode: bool,
    matched_hwnds: Vec<HWND>,
}

unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let ctx = &mut *(lparam.0 as *mut FindContext);

    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }

    let mut cloaked: u32 = 0;
    let _ = DwmGetWindowAttribute(
        hwnd,
        DWMWA_CLOAKED,
        &mut cloaked as *mut u32 as *mut _,
        std::mem::size_of::<u32>() as u32,
    );
    if cloaked != 0 {
        return BOOL(1);
    }

    if let Some(exclude) = ctx.exclude_hwnds {
        if exclude.contains(&(hwnd.0 as isize)) {
            return BOOL(1);
        }
    }

    let mut rect = RECT::default();
    if GetWindowRect(hwnd, &mut rect).is_ok() {
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 0 || height <= 0 {
            return BOOL(1);
        }
    }

    let mut process_id: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut process_id));

    let length = GetWindowTextLengthW(hwnd);
    let mut title = String::new();
    if length > 0 {
        let mut buf = vec![0u16; (length + 1) as usize];
        let copied = GetWindowTextW(hwnd, &mut buf);
        if copied > 0 {
            title = String::from_utf16_lossy(&buf[..copied as usize]);
        }
    }

    if title.is_empty() {
        return BOOL(1);
    }



    if let Some(target_pid) = ctx.target_pid {
        if process_id == target_pid && length > 0 {
            ctx.matched_hwnds.push(hwnd);
            return BOOL(1);
        }
    }

    if let Some(ref pattern) = ctx.title_pattern {
        let p_lower = pattern.to_lowercase();
        let t_lower = title.to_lowercase();
        if t_lower.contains(&p_lower) || p_lower.contains(&t_lower) {
            ctx.matched_hwnds.push(hwnd);
            return BOOL(1);
        }
    }

    BOOL(1)
}

pub fn find_windows(
    target_pid: Option<u32>,
    title_pattern: Option<&str>,
    exclude_hwnds: Option<&std::collections::HashSet<isize>>,
    require_app_mode: bool,
) -> Vec<HWND> {
    let mut ctx = FindContext {
        target_pid,
        title_pattern: title_pattern.map(|s| s.to_string()),
        exclude_hwnds,
        require_app_mode,
        matched_hwnds: Vec::new(),
    };

    unsafe {
        let _ = EnumWindows(
            Some(enum_windows_callback),
            LPARAM(&mut ctx as *mut FindContext as isize),
        );
    }

    ctx.matched_hwnds
}

pub fn wait_for_window(
    target_pid: Option<u32>,
    title_pattern: Option<&str>,
    exclude_hwnds: Option<&std::collections::HashSet<isize>>,
    require_app_mode: bool,
    timeout: Duration,
) -> Option<HWND> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        let found = find_windows(target_pid, title_pattern, exclude_hwnds, require_app_mode);
        if let Some(&hwnd) = found.first() {
            return Some(hwnd);
        }
        sleep(Duration::from_millis(50));
    }
    None
}

pub fn apply_placement(hwnd: HWND, placement: &Placement) -> bool {
    unsafe {
        if placement.maximized == Some(true) {
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            let _ = ShowWindow(hwnd, SW_MAXIMIZE);
            force_foreground_window(hwnd);
            return true;
        }

        if IsIconic(hwnd).as_bool() || IsZoomed(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        } else {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }

        let pos_ok = SetWindowPos(
            hwnd,
            HWND_TOP,
            placement.x,
            placement.y,
            placement.width,
            placement.height,
            SWP_SHOWWINDOW,
        );

        force_foreground_window(hwnd);
        pos_ok.is_ok()
    }
}

pub fn force_foreground_window(hwnd: HWND) {
    unsafe {
        let _ = BringWindowToTop(hwnd);
        let _ = SetForegroundWindow(hwnd);
    }
}

/// Helper to resolve File Explorer folder paths from window titles or user inputs.
/// Windows 11 window titles often look like "Downloads - File Explorer" or "FocusSwapApp - File Explorer".
pub fn resolve_folder_path(raw: &str) -> String {
    let mut clean = raw.trim().trim_matches('"').trim_matches('\'').trim();

    // Strip " - File Explorer" or " - Windows Explorer" suffix
    if let Some(pos) = clean.to_lowercase().find(" - file explorer") {
        clean = clean[..pos].trim();
    } else if let Some(pos) = clean.to_lowercase().find(" - windows explorer") {
        clean = clean[..pos].trim();
    }

    if clean.is_empty() {
        return dirs::download_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "shell:MyComputerFolder".to_string());
    }

    // If it's a CLI switch like /select,... return as is
    if clean.starts_with('/') || clean.starts_with('-') {
        return clean.to_string();
    }

    // Check if it's already a valid path that exists
    let p = Path::new(clean);
    if p.is_absolute() && p.exists() {
        return clean.to_string();
    }

    let lower = clean.to_lowercase();

    // Match known standard folders
    match lower.as_str() {
        "downloads" => {
            if let Some(d) = dirs::download_dir() {
                return d.to_string_lossy().to_string();
            }
        }
        "documents" | "my documents" => {
            if let Some(d) = dirs::document_dir() {
                return d.to_string_lossy().to_string();
            }
        }
        "pictures" | "my pictures" => {
            if let Some(d) = dirs::picture_dir() {
                return d.to_string_lossy().to_string();
            }
        }
        "desktop" => {
            if let Some(d) = dirs::desktop_dir() {
                return d.to_string_lossy().to_string();
            }
        }
        "music" | "my music" => {
            if let Some(d) = dirs::audio_dir() {
                return d.to_string_lossy().to_string();
            }
        }
        "videos" | "my videos" => {
            if let Some(d) = dirs::video_dir() {
                return d.to_string_lossy().to_string();
            }
        }
        "home" | "this pc" => {
            return "shell:MyComputerFolder".to_string();
        }
        _ => {}
    }

    let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Default".to_string());

    if lower == "onedrive" {
        let onedrive_path = format!("{}\\OneDrive", user_profile);
        if Path::new(&onedrive_path).exists() {
            return onedrive_path;
        }
    }

    if lower.contains("(c:)") || lower == "c:" || lower == "c" {
        return "C:\\".to_string();
    }
    if lower.contains("(d:)") || lower == "d:" || lower == "d" {
        return "D:\\".to_string();
    }
    if lower.contains("(e:)") || lower == "e:" || lower == "e" {
        return "E:\\".to_string();
    }

    // Try common candidates
    let candidates = [
        format!("{}\\{}", user_profile, clean),
        format!("{}\\Downloads\\{}", user_profile, clean),
        format!("{}\\Documents\\{}", user_profile, clean),
        format!("{}\\Desktop\\{}", user_profile, clean),
        format!("{}\\Pictures\\{}", user_profile, clean),
        format!("C:\\{}", clean),
        format!("D:\\{}", clean),
        format!("E:\\{}", clean),
    ];

    for cand in &candidates {
        if Path::new(cand).exists() {
            return cand.clone();
        }
    }

    clean.to_string()
}

