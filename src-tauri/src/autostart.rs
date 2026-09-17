use log::{error, info};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x08000000;
const REG_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const APP_NAME: &str = "FocusDeck";

pub fn is_autostart_enabled() -> bool {
    let output = Command::new("reg")
        .args(["query", REG_KEY, "/v", APP_NAME])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match output {
        Ok(out) => out.status.success(),
        Err(_) => false,
    }
}

pub fn get_app_executable_path() -> PathBuf {
    let candidate = PathBuf::from(r"C:\VibeCoding\FocusSwapApp\FocusDeck.exe");
    if candidate.exists() {
        return candidate;
    }

    if let Ok(cur_exe) = std::env::current_exe() {
        return cur_exe;
    }

    candidate
}

pub fn set_autostart(enable: bool) -> Result<(), String> {
    if enable {
        let exe = get_app_executable_path();
        let exe_str = exe.to_string_lossy();
        let reg_value = format!("\"{}\"", exe_str);

        let status = Command::new("reg")
            .args(["add", REG_KEY, "/v", APP_NAME, "/t", "REG_SZ", "/d", &reg_value, "/f"])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| format!("Failed to execute reg.exe: {}", e))?;

        if status.success() {
            info!("Autostart enabled for {}", reg_value);
            Ok(())
        } else {
            error!("reg.exe exited with non-zero status when adding autostart");
            Err("Failed to add autostart registry entry".to_string())
        }
    } else {
        let _ = Command::new("reg")
            .args(["delete", REG_KEY, "/v", APP_NAME, "/f"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();

        info!("Autostart disabled");
        Ok(())
    }
}
