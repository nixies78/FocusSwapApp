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
    }
}

#[test]
fn test_register_hotkey() {
    unsafe {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_NOREPEAT,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            GetMessageW, PeekMessageW, MSG, PM_NOREMOVE, WM_HOTKEY,
        };

        let mut msg = MSG::default();
        let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);

        let ok = RegisterHotKey(None, 999, HOT_KEY_MODIFIERS(MOD_ALT.0 | MOD_NOREPEAT.0), 0x51);
        println!("RegisterHotKey Alt+Q result: {:?}", ok);
        assert!(ok.is_ok());

        let unreg = UnregisterHotKey(None, 999);
        println!("UnregisterHotKey result: {:?}", unreg);
        assert!(unreg.is_ok());
    }
}
