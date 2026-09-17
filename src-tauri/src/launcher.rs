use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use log::{info, warn};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{IsIconic, ShowWindow, SW_RESTORE, SW_SHOW};

use crate::config::{Action, Preset};
use crate::win32_layout::{apply_placement, force_foreground_window, wait_for_window};

/// Locate Chrome executable on Windows
pub fn find_chrome_executable() -> Option<PathBuf> {
    let candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ];

    for path_str in candidates {
        let p = PathBuf::from(path_str);
        if p.exists() {
            return Some(p);
        }
    }

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let user_chrome = Path::new(&local_app_data)
            .join("Google")
            .join("Chrome")
            .join("Application")
            .join("chrome.exe");
        if user_chrome.exists() {
            return Some(user_chrome);
        }
    }

    // Fallback: Check if chrome is on PATH
    if let Ok(output) = Command::new("where.exe").arg("chrome.exe").output() {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = path_str.lines().next() {
                let trimmed = first_line.trim();
                if !trimmed.is_empty() && Path::new(trimmed).exists() {
                    return Some(PathBuf::from(trimmed));
                }
            }
        }
    }

    // Secondary fallback: Microsoft Edge (Chromium, supports identical --app and --new-window flags)
    let edge_candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ];
    for path_str in edge_candidates {
        let p = PathBuf::from(path_str);
        if p.exists() {
            info!("Chrome not found, using Microsoft Edge fallback: {:?}", p);
            return Some(p);
        }
    }

    None
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChromeProfile {
    pub id: String,
    pub name: String,
    pub user_name: String,
}

pub fn detect_chrome_profiles() -> Vec<ChromeProfile> {
    let mut profiles = Vec::new();

    let local_app_data = match std::env::var("LOCALAPPDATA") {
        Ok(v) => PathBuf::from(v),
        Err(_) => return profiles,
    };

    let local_state_path = local_app_data
        .join("Google")
        .join("Chrome")
        .join("User Data")
        .join("Local State");

    if !local_state_path.exists() {
        return profiles;
    }

    let contents = match std::fs::read_to_string(&local_state_path) {
        Ok(c) => c,
        Err(_) => return profiles,
    };

    let json: serde_json::Value = match serde_json::from_str(&contents) {
        Ok(v) => v,
        Err(_) => return profiles,
    };

    if let Some(info_cache) = json.get("profile").and_then(|p| p.get("info_cache")).and_then(|i| i.as_object()) {
        for (profile_id, data) in info_cache {
            let name = data.get("name").and_then(|v| v.as_str()).unwrap_or(profile_id).to_string();
            let user_name = data.get("user_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            profiles.push(ChromeProfile {
                id: profile_id.clone(),
                name,
                user_name,
            });
        }
    }

    profiles
}

/// Helper to derive a probable window title keyword from arguments (e.g. for Google Calendar, Gemini, YouTube, or Notion)
pub fn extract_keyword_from_args(args: &[String]) -> Option<String> {
    for arg in args {
        let arg_lower = arg.to_lowercase();
        if arg_lower.contains("youtube.com") || arg_lower.contains("youtu.be") {
            return Some("YouTube".to_string());
        }
        if arg_lower.contains("gemini.google.com") {
            return Some("Gemini".to_string());
        }
        if arg_lower.contains("calendar.google.com") {
            return Some("Calendar".to_string());
        }
        if arg_lower.contains("mail.google.com") {
            return Some("Gmail".to_string());
        }
        if arg_lower.contains("notion.so") {
            return Some("Notion".to_string());
        }
        if arg_lower.contains("docs.google.com") {
            return Some("Docs".to_string());
        }
        if arg_lower.contains("github.com") {
            return Some("GitHub".to_string());
        }
        if arg_lower.contains("reddit.com") {
            return Some("Reddit".to_string());
        }
        if arg_lower.contains("spotify.com") {
            return Some("Spotify".to_string());
        }
        if arg_lower.contains("twitch.tv") {
            return Some("Twitch".to_string());
        }
        if arg_lower.contains("chatgpt.com") || arg_lower.contains("chat.openai.com") {
            return Some("ChatGPT".to_string());
        }
        if let Some(pos) = arg.find("--app=") {
            let url = &arg[pos + 6..];
            let clean_url = url.trim_start_matches("https://").trim_start_matches("http://");
            let clean_lower = clean_url.to_lowercase();
            if clean_lower.contains("youtube") {
                return Some("YouTube".to_string());
            }
            if clean_lower.contains("gemini") {
                return Some("Gemini".to_string());
            }
            if clean_lower.contains("calendar") {
                return Some("Calendar".to_string());
            }
            if let Some(slash_idx) = clean_url.find('/') {
                let domain = &clean_url[..slash_idx];
                let host_parts: Vec<&str> = domain.split('.').collect();
                if host_parts.len() >= 2 {
                    let name = if host_parts.len() > 2 { host_parts[1] } else { host_parts[0] };
                    if !name.is_empty() {
                        return Some(name.to_string());
                    }
                }
                return Some(domain.to_string());
            } else if !clean_url.is_empty() {
                return Some(clean_url.to_string());
            }
        }
    }
    None
}

/// Helper to resolve an executable name to an absolute path if it is not in PATH
pub fn resolve_executable(exe: &str) -> String {
    let p = Path::new(exe);
    if p.is_absolute() && p.exists() {
        return exe.to_string();
    }

    let exe_lower = exe.to_lowercase();
    if exe_lower == "blender.exe" || exe_lower == "blender" {
        let candidates = [
            r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe",
            r"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe",
            r"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe",
            r"C:\Program Files\Blender Foundation\Blender 4.0\blender.exe",
        ];
        for c in candidates {
            if Path::new(c).exists() {
                return c.to_string();
            }
        }
        if let Ok(entries) = std::fs::read_dir(r"C:\Program Files\Blender Foundation") {
            for entry in entries.flatten() {
                let candidate = entry.path().join("blender.exe");
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }
    }

    exe.to_string()
}

/// Helper to get the most accurate title keyword for identifying windows
pub fn get_title_keyword(action: &Action) -> Option<String> {
    // If explicit --app= argument is given, derive from the URL domain/keyword
    if let Some(kw) = extract_keyword_from_args(&action.args) {
        return Some(kw);
    }

    let exe_lower = action.executable.to_lowercase();
    if exe_lower.contains("explorer") {
        let raw_target = action.args.first().map(|s| s.as_str()).unwrap_or_else(|| {
            action.title.as_deref().unwrap_or("")
        });
        let resolved = crate::win32_layout::resolve_folder_path(raw_target);
        let p = Path::new(&resolved);
        if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
        if !resolved.is_empty() {
            return Some(resolved);
        }
    }

    if let Some(ref title) = action.title {
        let mut clean = title.as_str().trim_start_matches('*').trim();
        if let Some(pos) = clean.find(" - Google Chrome") {
            clean = &clean[..pos];
        }
        if let Some(pos) = clean.find(" - Microsoft Edge") {
            clean = &clean[..pos];
        }
        let clean_lower = clean.to_lowercase();
        if clean_lower.contains("youtube") {
            return Some("YouTube".to_string());
        }
        if clean_lower.contains("gemini") {
            return Some("Gemini".to_string());
        }
        if clean_lower.contains("calendar") {
            return Some("Calendar".to_string());
        }
        if clean_lower.contains("notion") {
            return Some("Notion".to_string());
        }
        if clean_lower.contains("github") {
            return Some("GitHub".to_string());
        }
        if clean_lower.contains("reddit") {
            return Some("Reddit".to_string());
        }
        if clean_lower.contains("spotify") {
            return Some("Spotify".to_string());
        }
        // If title has bracketed project path like "* PrintPrep [C:\...\PrintPrep.blend] - Blender"
        if let Some(bracket_start) = clean.find('[') {
            let before_bracket = clean[..bracket_start].trim();
            if !before_bracket.is_empty() {
                return Some(before_bracket.to_string());
            }
        }
        if let Some(idx) = clean.find(" - ") {
            let prefix = clean[..idx].trim();
            if !prefix.is_empty() {
                return Some(prefix.to_string());
            }
        }
        let t = clean.trim();
        if !t.is_empty() {
            return Some(t.to_string());
        }
    }
    None
}

/// Execute a single action or restore existing tracked window
pub fn execute_action(
    action: &Action,
    action_index: usize,
    preset_id: &str,
    session_mgr: &std::sync::Arc<crate::session::SessionManager>,
) -> Result<(), String> {
    // 1. Check if this action already has a live, tracked window in this session
    if let Some(hwnd_val) = session_mgr.get_alive_window_for_action(preset_id, action_index) {
        let hwnd = HWND(hwnd_val as _);
        info!(
            "Session '{}' action {} already has live tracked window HWND {:?}. Restoring and repositioning...",
            preset_id, action_index, hwnd
        );

        // Mark window restored from temp_minimized
        session_mgr.mark_window_restored(hwnd_val);

        // Apply placement (restores from minimized/iconic, sets position or maximizes, and brings to foreground)
        if let Some(ref placement) = action.placement {
            let ok = apply_placement(hwnd, placement);
            if ok {
                info!("Placement successfully re-applied to existing window HWND {:?}", hwnd);
            } else {
                warn!("Failed to re-apply placement to existing window HWND {:?}", hwnd);
            }
        } else {
            unsafe {
                if IsIconic(hwnd).as_bool() {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                } else {
                    let _ = ShowWindow(hwnd, SW_SHOW);
                }
                force_foreground_window(hwnd);
            }
        }

        return Ok(());
    }

    let mut exe_to_run = resolve_executable(&action.executable);
    let mut args_to_run = action.args.clone();

    // If args are empty, check if title contains a bracketed project file path like [C:\path\to\file.ext]
    if args_to_run.is_empty() {
        if let Some(ref t) = action.title {
            if let Some(start) = t.find('[') {
                if let Some(end) = t.rfind(']') {
                    if start < end {
                        let inner = t[start + 1..end].trim();
                        if Path::new(inner).is_absolute() && Path::new(inner).exists() {
                            args_to_run.push(inner.to_string());
                        }
                    }
                }
            }
        }
    }

    // Check if ApplicationFrameHost (Windows UWP / Modern App)
    if exe_to_run.to_lowercase().contains("applicationframehost") {
        let title_check = action.title.as_deref().unwrap_or("").to_lowercase();
        if title_check.contains("calc") {
            exe_to_run = "calc.exe".to_string();
        }
    }

    // Check if launching File Explorer
    let is_explorer = exe_to_run.to_lowercase().contains("explorer");
    if is_explorer {
        let raw_target = args_to_run.first().cloned().unwrap_or_else(|| {
            action.title.clone().unwrap_or_default()
        });
        let resolved = crate::win32_layout::resolve_folder_path(&raw_target);
        args_to_run = vec![resolved];
    }

    // Check if launching Chrome / Web App
    let is_chrome = exe_to_run.eq_ignore_ascii_case("chrome.exe")
        || exe_to_run.eq_ignore_ascii_case("chrome");

    if is_chrome {
        if let Some(chrome_path) = find_chrome_executable() {
            exe_to_run = chrome_path.to_string_lossy().to_string();
        } else {
            warn!("Could not locate chrome.exe, attempting default PATH resolution");
        }
    }

    let is_chrome_app = action.is_chrome_app.unwrap_or(false)
        || action.args.iter().any(|a| a.starts_with("--app="));

    // Snapshot existing top-level windows right before spawning process
    let pre_existing_hwnds = crate::win32_layout::get_all_visible_hwnds();

    info!("Spawning process: {} {:?}", exe_to_run, args_to_run);

    let mut cmd = Command::new(&exe_to_run);
    for arg in &args_to_run {
        let clean = arg.trim();
        let normalized = if clean.starts_with("--") && clean.contains('=') {
            let parts: Vec<&str> = clean.splitn(2, '=').collect();
            let key = parts[0];
            let val = parts[1].trim();
            let clean_val = val.trim_matches('"').trim_matches('\'');
            format!("{}={}", key, clean_val)
        } else if (clean.starts_with('"') && clean.ends_with('"')) || (clean.starts_with('\'') && clean.ends_with('\'')) {
            clean[1..clean.len() - 1].to_string()
        } else {
            clean.to_string()
        };
        cmd.arg(&normalized);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn {}: {}", exe_to_run, e))?;

    let child_pid = child.id();
    info!("Spawned process PID: {}", child_pid);

    let preset_id_owned = preset_id.to_string();
    let session_mgr_clone = session_mgr.clone();
    let placement_opt = action.placement.clone();
    let title_hint = get_title_keyword(action);
    let action_on_switch_away = action.on_switch_away.clone();
    let fallback_title = if exe_to_run.to_lowercase().contains("notepad") {
        Some("Notepad".to_string())
    } else if exe_to_run.to_lowercase().contains("calc") {
        Some("Calculator".to_string())
    } else {
        None
    };

    let is_explorer = exe_to_run.to_lowercase().contains("explorer");
    let target_pid = if is_explorer { None } else { Some(child_pid) };

    std::thread::spawn(move || {
        // First attempt to find window by PID (or title hint for explorer which hands off to shell process)
        let hwnd_opt = wait_for_window(
            target_pid,
            title_hint.as_deref().or(fallback_title.as_deref()),
            Some(&pre_existing_hwnds),
            is_chrome_app,
            Duration::from_millis(3000),
        );

        match hwnd_opt {
            Some(hwnd) => {
                info!("Found new HWND {:?} for PID {}, registering to session '{}'...", hwnd, child_pid, preset_id_owned);
                session_mgr_clone.register_app_window(
                    &preset_id_owned,
                    action_index,
                    hwnd.0 as isize,
                    &action_on_switch_away,
                    &exe_to_run,
                    title_hint.as_deref(),
                );
                if let Some(ref placement) = placement_opt {
                    let ok = apply_placement(hwnd, placement);
                    if ok {
                        info!("Placement successfully applied.");
                    } else {
                        warn!("Failed to apply placement for HWND {:?}", hwnd);
                    }
                }
            }
            None => {
                // Try fallback search by title hint excluding pre-existing windows and enforcing app mode
                if let Some(ref hint) = title_hint {
                    info!("PID search timed out, searching by title hint: {} (app_mode: {})", hint, is_chrome_app);
                    if let Some(hwnd) = wait_for_window(
                        None,
                        Some(hint),
                        Some(&pre_existing_hwnds),
                        is_chrome_app,
                        Duration::from_millis(2500),
                    ) {
                        info!("Found new HWND {:?} by title hint, registering to session '{}'...", hwnd, preset_id_owned);
                        session_mgr_clone.register_app_window(
                            &preset_id_owned,
                            action_index,
                            hwnd.0 as isize,
                            &action_on_switch_away,
                            &exe_to_run,
                            Some(hint),
                        );
                        if let Some(ref placement) = placement_opt {
                            apply_placement(hwnd, placement);
                        }
                    } else {
                        // If no newly created window was found, check if an existing standalone app window matching hint is already open
                        if let Some(existing_hwnd) = wait_for_window(
                            None,
                            Some(hint),
                            None,
                            is_chrome_app,
                            Duration::from_millis(600),
                        ) {
                            info!("Found existing standalone HWND {:?} by hint '{}', registering to session '{}'...", existing_hwnd, hint, preset_id_owned);
                            session_mgr_clone.register_app_window(
                                &preset_id_owned,
                                action_index,
                                existing_hwnd.0 as isize,
                                &action_on_switch_away,
                                &exe_to_run,
                                Some(hint),
                            );
                            if let Some(ref placement) = placement_opt {
                                apply_placement(existing_hwnd, placement);
                            }
                        } else {
                            warn!("Window for PID {} or hint '{}' was not detected within timeout.", child_pid, hint);
                        }
                    }
                } else {
                    warn!("Window for PID {} was not detected within timeout.", child_pid);
                }
            }
        }
    });

    Ok(())
}

/// Execute all actions in a preset and track with session manager
pub fn execute_preset(
    preset: &Preset,
    session_mgr: &std::sync::Arc<crate::session::SessionManager>,
) -> Result<(), String> {
    info!("Executing preset: {} ({})", preset.name, preset.id);
    for (action_index, action) in preset.actions.iter().enumerate() {
        execute_action(action, action_index, &preset.id, session_mgr)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_chrome_executable() {
        let chrome = find_chrome_executable();
        assert!(chrome.is_some(), "Chrome or Edge executable should be located on Windows");
        let path = chrome.unwrap();
        assert!(path.exists());
    }

    #[test]
    fn test_extract_keyword_from_args() {
        let args = vec![
            "--app=https://calendar.google.com".to_string(),
            "--new-window".to_string(),
        ];
        let kw = extract_keyword_from_args(&args);
        assert_eq!(kw, Some("Calendar".to_string()));

        let args2 = vec![
            "--app=https://www.notion.so".to_string(),
            "--new-window".to_string(),
        ];
        let kw2 = extract_keyword_from_args(&args2);
        assert_eq!(kw2, Some("Notion".to_string()));

        let args3 = vec![
            "--app=https://www.youtube.com/feed/subscriptions".to_string(),
            "--new-window".to_string(),
        ];
        let kw3 = extract_keyword_from_args(&args3);
        assert_eq!(kw3, Some("YouTube".to_string()));
    }

    #[test]
    fn test_get_title_keyword_youtube() {
        let action = Action {
            action_type: "launch".to_string(),
            executable: "chrome.exe".to_string(),
            args: vec![
                "--app=https://www.youtube.com/feed/subscriptions".to_string(),
                "--new-window".to_string(),
            ],
            placement: None,
            title: Some("Subscriptions - YouTube - Google Chrome".to_string()),
            is_chrome_app: Some(true),
            on_switch_away: "kill".to_string(),
        };
        let kw = get_title_keyword(&action);
        assert_eq!(kw, Some("YouTube".to_string()));
    }
}
