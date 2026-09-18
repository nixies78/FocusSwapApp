use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, SetWindowsHookExW, WH_KEYBOARD_LL,
};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};

unsafe extern "system" fn dummy_proc(n_code: i32, w_param: WPARAM, l_param: LPARAM) -> LRESULT {
    CallNextHookEx(None, n_code, w_param, l_param)
}

#[test]
fn test_hook_result() {
    unsafe {
        let mut pt = windows::Win32::Foundation::POINT::default();
        let _ = windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut pt);
        println!("Current Cursor Pos: x={}, y={}", pt.x, pt.y);

        let mut ci = windows::Win32::UI::WindowsAndMessaging::CURSORINFO::default();
        ci.cbSize = std::mem::size_of::<windows::Win32::UI::WindowsAndMessaging::CURSORINFO>() as u32;
        let ok = windows::Win32::UI::WindowsAndMessaging::GetCursorInfo(&mut ci).is_ok();
        println!("CursorInfo: ok={}, flags=0x{:X}, hCursor={:?}, pt=({}, {})", ok, ci.flags.0, ci.hCursor, ci.ptScreenPos.x, ci.ptScreenPos.y);

        let fg = windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow();
        println!("Foreground Window: {:?}", fg);

        let v_left = windows::Win32::UI::WindowsAndMessaging::GetSystemMetrics(windows::Win32::UI::WindowsAndMessaging::SM_XVIRTUALSCREEN);
        let v_top = windows::Win32::UI::WindowsAndMessaging::GetSystemMetrics(windows::Win32::UI::WindowsAndMessaging::SM_YVIRTUALSCREEN);
        let v_width = windows::Win32::UI::WindowsAndMessaging::GetSystemMetrics(windows::Win32::UI::WindowsAndMessaging::SM_CXVIRTUALSCREEN);
        let v_height = windows::Win32::UI::WindowsAndMessaging::GetSystemMetrics(windows::Win32::UI::WindowsAndMessaging::SM_CYVIRTUALSCREEN);
        println!("Virtual Screen: ({}, {}) {}x{}", v_left, v_top, v_width, v_height);

        let hmon = windows::Win32::Graphics::Gdi::MonitorFromPoint(pt, windows::Win32::Graphics::Gdi::MONITOR_DEFAULTTONULL);
        println!("MonitorFromPoint (NULL): {:?}", hmon);
    }

    use tauri_plugin_global_shortcut::Shortcut;
    for sc in &["Ctrl+Shift+C", "Shift+Ctrl+C", "F14", "Ctrl+Shift+Space", "Alt+Q"] {
        match sc.parse::<Shortcut>() {
            Ok(s) => println!("Parsed '{}' -> {:?}", sc, s),
            Err(e) => println!("FAILED to parse '{}': {:?}", sc, e),
        }
    }
}
