use std::collections::HashMap;
use std::sync::Mutex;
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    PostMessageW, ShowWindow, SW_HIDE, SW_MINIMIZE, WM_CLOSE,
};
#[cfg(not(test))]
use windows::Win32::UI::WindowsAndMessaging::IsWindow;
use log::{info, warn};

use crate::config::load_config;

pub fn is_window_alive(hwnd: HWND) -> bool {
    #[cfg(test)]
    {
        !hwnd.0.is_null()
    }
    #[cfg(not(test))]
    {
        unsafe { IsWindow(hwnd).as_bool() }
    }
}

#[derive(Debug, Clone)]
pub struct TrackedAppWindow {
    pub action_index: usize,
    pub hwnd: isize,
    pub on_switch_away: String, // "nothing", "minimize", "temp_minimize", "kill"
    pub executable: String,
    pub title_hint: Option<String>,
}

pub struct SessionManager {
    /// Current active preset ID (None represents the "General" / default state)
    pub active_session: Mutex<Option<String>>,
    /// Tracked windows per preset ID: preset_id -> Vec<TrackedAppWindow>
    pub session_windows: Mutex<HashMap<String, Vec<TrackedAppWindow>>>,
    /// HWNDs that were temporarily minimized and should be restored on switching to General
    pub temp_minimized_hwnds: Mutex<Vec<isize>>,
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            active_session: Mutex::new(None),
            session_windows: Mutex::new(HashMap::new()),
            temp_minimized_hwnds: Mutex::new(Vec::new()),
        }
    }

    /// Get current active session ID (None = General)
    pub fn get_active_session(&self) -> Option<String> {
        self.active_session.lock().unwrap().clone()
    }

    /// Register an HWND for a specific action in a preset with its switch-away policy
    pub fn register_app_window(
        &self,
        preset_id: &str,
        action_index: usize,
        hwnd_val: isize,
        on_switch_away: &str,
        executable: &str,
        title_hint: Option<&str>,
    ) {
        if hwnd_val == 0 {
            return;
        }
        let mut map = self.session_windows.lock().unwrap();
        let list = map.entry(preset_id.to_string()).or_default();

        if let Some(existing) = list.iter_mut().find(|w| w.action_index == action_index) {
            existing.hwnd = hwnd_val;
            existing.on_switch_away = on_switch_away.to_string();
            existing.executable = executable.to_string();
            existing.title_hint = title_hint.map(|s| s.to_string());
        } else {
            info!(
                "Registering HWND {} for action {} ('{}') in session '{}' with switch action '{}'",
                hwnd_val,
                action_index,
                title_hint.unwrap_or(executable),
                preset_id,
                on_switch_away
            );
            list.push(TrackedAppWindow {
                action_index,
                hwnd: hwnd_val,
                on_switch_away: on_switch_away.to_string(),
                executable: executable.to_string(),
                title_hint: title_hint.map(|s| s.to_string()),
            });
        }

        // If it was previously marked as temp_minimized, remove it since it is now active
        let mut temp = self.temp_minimized_hwnds.lock().unwrap();
        temp.retain(|&h| h != hwnd_val);
    }

    /// Return the alive HWND for an action in a preset, if one is currently tracked and valid
    pub fn get_alive_window_for_action(&self, preset_id: &str, action_index: usize) -> Option<isize> {
        let mut map = self.session_windows.lock().unwrap();
        if let Some(list) = map.get_mut(preset_id) {
            if let Some(app_win) = list.iter().find(|w| w.action_index == action_index) {
                let hwnd = HWND(app_win.hwnd as _);
                if is_window_alive(hwnd) {
                    return Some(app_win.hwnd);
                }
            }
            // Clean up any dead entry for this action_index
            list.retain(|w| {
                if w.action_index == action_index {
                    is_window_alive(HWND(w.hwnd as _))
                } else {
                    true
                }
            });
        }
        None
    }

    /// Mark a window as restored (removes it from temp_minimized_hwnds)
    pub fn mark_window_restored(&self, hwnd_val: isize) {
        let mut temp = self.temp_minimized_hwnds.lock().unwrap();
        temp.retain(|&h| h != hwnd_val);
    }

    /// Transition to a workspace preset session
    pub fn transition_to(&self, target_preset_id: &str) -> Result<(), String> {
        let prev_id_opt = {
            let mut active = self.active_session.lock().unwrap();
            let prev = active.clone();
            *active = Some(target_preset_id.to_string());
            prev
        };

        if let Some(prev_id) = prev_id_opt {
            if prev_id != target_preset_id {
                self.handle_switch_away(&prev_id);
            }
        }

        Ok(())
    }

    /// Transition to the "General" desktop state:
    /// 1. Action the departing session according to each application's on_switch_away setting
    /// 2. Un-minimize and restore all temp-minimized windows
    pub fn switch_to_general(&self) -> Result<(), String> {
        info!("Switching to General desktop state");
        let prev_id_opt = {
            let mut active = self.active_session.lock().unwrap();
            let prev = active.clone();
            *active = None; // Reset active session to General
            prev
        };

        if let Some(prev_id) = prev_id_opt {
            self.handle_switch_away(&prev_id);
        }

        Ok(())
    }

    /// Handle the switch-away policy on each application of the departed session
    pub fn handle_switch_away(&self, preset_id: &str) {
        let cfg = match load_config() {
            Ok(c) => c,
            Err(e) => {
                warn!("Could not load config during switch-away: {}", e);
                return;
            }
        };

        let preset = match cfg.presets.into_iter().find(|p| p.id == preset_id) {
            Some(p) => p,
            None => {
                warn!("Preset '{}' not found in config during switch-away", preset_id);
                return;
            }
        };

        let mut tracked = {
            let mut map = self.session_windows.lock().unwrap();
            map.remove(preset_id).unwrap_or_default()
        };

        // Fallback scan: if any action doesn't have a tracked window yet, search by title keyword
        for (action_index, action) in preset.actions.iter().enumerate() {
            let kw = crate::launcher::get_title_keyword(action);
            let action_policy = &action.on_switch_away;
            let action_exe = &action.executable;

            let already_tracked = tracked.iter().any(|w| w.action_index == action_index);
            if !already_tracked {
                if let Some(ref k) = kw {
                    let is_app = action.is_chrome_app.unwrap_or(false)
                        || action.args.iter().any(|a| a.starts_with("--app="));
                    let found = crate::win32_layout::find_windows(None, Some(k), None, is_app);
                    if let Some(f_hwnd) = found.first() {
                        tracked.push(TrackedAppWindow {
                            action_index,
                            hwnd: f_hwnd.0 as isize,
                            on_switch_away: action_policy.clone(),
                            executable: action_exe.clone(),
                            title_hint: Some(k.clone()),
                        });
                    }
                }
            }
        }

        info!(
            "Executing per-application switch-away actions for session '{}' ({} window(s))",
            preset_id,
            tracked.len()
        );

        let mut remaining = Vec::new();

        for win in tracked {
            let hwnd = HWND(win.hwnd as _);
            if !is_window_alive(hwnd) {
                continue;
            }

            let policy = win.on_switch_away.to_lowercase();
            match policy.as_str() {
                "minimize" | "temp_minimize" => {
                    info!("Minimizing HWND {:?} ({}) [policy: {}]", hwnd, win.executable, policy);
                    unsafe {
                        let _ = ShowWindow(hwnd, SW_MINIMIZE);
                    }
                    remaining.push(win);
                }
                "kill" => {
                    info!("Closing/killing HWND {:?} ({})", hwnd, win.executable);
                    unsafe {
                        let _ = ShowWindow(hwnd, SW_HIDE);
                        let _ = PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0));
                    }
                    // Killed windows are not retained
                }
                _ => {
                    // "nothing" -> preserve window as is
                    info!("Preserving HWND {:?} ({}) ('nothing' selected)", hwnd, win.executable);
                    remaining.push(win);
                }
            }
        }

        let mut map = self.session_windows.lock().unwrap();
        map.insert(preset_id.to_string(), remaining);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_manager_initial_state() {
        let sm = SessionManager::new();
        assert_eq!(sm.get_active_session(), None);
        assert!(sm.temp_minimized_hwnds.lock().unwrap().is_empty());
    }

    #[test]
    fn test_session_transition_and_per_app_registration() {
        let sm = SessionManager::new();
        let res = sm.transition_to("workspace_1");
        assert!(res.is_ok());
        assert_eq!(sm.get_active_session(), Some("workspace_1".to_string()));

        // Register two apps with different policies
        sm.register_app_window("workspace_1", 0, 1001, "temp_minimize", "chrome.exe", Some("Calendar"));
        sm.register_app_window("workspace_1", 1, 1002, "kill", "notepad.exe", Some("Notepad"));

        {
            let map = sm.session_windows.lock().unwrap();
            let wins = map.get("workspace_1").unwrap();
            assert_eq!(wins.len(), 2);
            assert_eq!(wins[0].on_switch_away, "temp_minimize");
            assert_eq!(wins[1].on_switch_away, "kill");
            assert_eq!(wins[0].action_index, 0);
            assert_eq!(wins[1].action_index, 1);
        }

        assert_eq!(sm.get_alive_window_for_action("workspace_1", 0), Some(1001));
        assert_eq!(sm.get_alive_window_for_action("workspace_1", 1), Some(1002));
        assert_eq!(sm.get_alive_window_for_action("workspace_1", 2), None);

        // Switch to general
        let res2 = sm.switch_to_general();
        assert!(res2.is_ok());
        assert_eq!(sm.get_active_session(), None);
    }
}
