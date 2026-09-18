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
        let hmod = windows::Win32::System::LibraryLoader::GetModuleHandleW(None).unwrap_or_default();
        let hook_hmod = SetWindowsHookExW(WH_KEYBOARD_LL, Some(dummy_proc), hmod, 0);
        println!("hook with hmod ({:?}): {:?}", hmod, hook_hmod);
    }

    use tauri_plugin_global_shortcut::Shortcut;
    for sc in &["Ctrl+Shift+C", "Shift+Ctrl+C", "F14", "Ctrl+Shift+Space", "Alt+Q"] {
        match sc.parse::<Shortcut>() {
            Ok(s) => println!("Parsed '{}' -> {:?}", sc, s),
            Err(e) => println!("FAILED to parse '{}': {:?}", sc, e),
        }
    }
}
