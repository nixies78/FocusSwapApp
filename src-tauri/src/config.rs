use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Placement {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    #[serde(default)]
    pub screen: Option<usize>,
    #[serde(default)]
    pub maximized: Option<bool>,
}

fn default_on_switch_away() -> String {
    "nothing".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    #[serde(rename = "type")]
    pub action_type: String,
    pub executable: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub placement: Option<Placement>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub is_chrome_app: Option<bool>,
    #[serde(default = "default_on_switch_away")]
    pub on_switch_away: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub shortcut: String,
    #[serde(default = "default_on_switch_away")]
    pub on_switch_away: String,
    pub actions: Vec<Action>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceConfig {
    pub presets: Vec<Preset>,
}

impl Default for WorkspaceConfig {
    fn default() -> Self {
        Self {
            presets: vec![
                Preset {
                    id: "calendar".to_string(),
                    name: "Quick Calendar".to_string(),
                    shortcut: "1".to_string(),
                    on_switch_away: "nothing".to_string(),
                    actions: vec![Action {
                        action_type: "launch".to_string(),
                        executable: "chrome.exe".to_string(),
                        title: Some("Google Calendar".to_string()),
                        is_chrome_app: Some(true),
                        on_switch_away: "nothing".to_string(),
                        args: vec![
                            "--app=https://calendar.google.com".to_string(),
                            "--new-window".to_string(),
                        ],
                        placement: Some(Placement {
                            x: 200,
                            y: 150,
                            width: 1200,
                            height: 800,
                            screen: Some(1),
                            maximized: Some(false),
                        }),
                    }],
                },
                Preset {
                    id: "notes".to_string(),
                    name: "Scratchpad & Docs".to_string(),
                    shortcut: "2".to_string(),
                    on_switch_away: "nothing".to_string(),
                    actions: vec![Action {
                        action_type: "launch".to_string(),
                        executable: "notepad.exe".to_string(),
                        title: Some("Notepad".to_string()),
                        is_chrome_app: Some(false),
                        on_switch_away: "nothing".to_string(),
                        args: vec![],
                        placement: Some(Placement {
                            x: 100,
                            y: 100,
                            width: 800,
                            height: 700,
                            screen: Some(1),
                            maximized: Some(false),
                        }),
                    }],
                },
                Preset {
                    id: "notion".to_string(),
                    name: "Notion Workspace".to_string(),
                    shortcut: "3".to_string(),
                    on_switch_away: "nothing".to_string(),
                    actions: vec![Action {
                        action_type: "launch".to_string(),
                        executable: "chrome.exe".to_string(),
                        title: Some("Notion".to_string()),
                        is_chrome_app: Some(true),
                        on_switch_away: "nothing".to_string(),
                        args: vec![
                            "--app=https://www.notion.so".to_string(),
                            "--new-window".to_string(),
                        ],
                        placement: Some(Placement {
                            x: 250,
                            y: 120,
                            width: 1300,
                            height: 850,
                            screen: Some(2),
                            maximized: Some(false),
                        }),
                    }],
                },
            ],
        }
    }
}

pub fn get_config_path() -> PathBuf {
    // 1. Check if workspaces.json exists in the current working directory
    let local_path = PathBuf::from("workspaces.json");
    if local_path.exists() {
        return local_path;
    }

    // 2. Check next to the executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let next_to_exe = exe_dir.join("workspaces.json");
            if next_to_exe.exists() {
                return next_to_exe;
            }
        }
    }

    // 3. Fallback to AppData/FocusDeck/workspaces.json
    if let Some(config_dir) = dirs::config_dir() {
        let app_dir = config_dir.join("FocusDeck");
        let _ = fs::create_dir_all(&app_dir);
        return app_dir.join("workspaces.json");
    }

    local_path
}

pub fn load_config() -> Result<WorkspaceConfig, String> {
    let path = get_config_path();
    if !path.exists() {
        let default_config = WorkspaceConfig::default();
        if let Ok(serialized) = serde_json::to_string_pretty(&default_config) {
            let _ = fs::write(&path, serialized);
        }
        return Ok(default_config);
    }

    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config file at {:?}: {}", path, e))?;

    let config: WorkspaceConfig = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse JSON in {:?}: {}", path, e))?;

    Ok(config)
}

pub fn save_config(config: &WorkspaceConfig) -> Result<(), String> {
    let path = get_config_path();
    let contents = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    let _ = fs::write(&path, &contents);

    // Also sync to AppData
    if let Some(config_dir) = dirs::config_dir() {
        let app_dir = config_dir.join("FocusDeck");
        let _ = fs::create_dir_all(&app_dir);
        let app_data_path = app_dir.join("workspaces.json");
        if app_data_path != path {
            let _ = fs::write(&app_data_path, &contents);
        }
    }

    // Also sync to root workspaces.json
    let root_path = PathBuf::from("workspaces.json");
    if root_path != path {
        let _ = fs::write(&root_path, &contents);
    }

    Ok(())
}

pub fn save_presets(presets: Vec<Preset>) -> Result<(), String> {
    let config = WorkspaceConfig { presets };
    save_config(&config)
}

pub fn delete_preset(preset_id: &str) -> Result<Vec<Preset>, String> {
    let mut config = load_config()?;
    config.presets.retain(|p| p.id != preset_id);
    save_config(&config)?;
    Ok(config.presets)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config_schema() {
        let default_cfg = WorkspaceConfig::default();
        assert_eq!(default_cfg.presets.len(), 3);
        assert_eq!(default_cfg.presets[0].id, "calendar");
        assert_eq!(default_cfg.presets[0].shortcut, "1");
        assert_eq!(default_cfg.presets[0].actions[0].executable, "chrome.exe");
        let placement = default_cfg.presets[0].actions[0].placement.as_ref().unwrap();
        assert_eq!(placement.width, 1200);
        assert_eq!(placement.height, 800);
    }

    #[test]
    fn test_parse_workspaces_json() {
        let json_str = r#"{
            "presets": [
                {
                    "id": "calendar",
                    "name": "Quick Calendar",
                    "shortcut": "1",
                    "actions": [
                        {
                            "type": "launch",
                            "executable": "chrome.exe",
                            "args": ["--app=https://calendar.google.com", "--new-window"],
                            "placement": {
                                "x": 200,
                                "y": 150,
                                "width": 1200,
                                "height": 800
                            }
                        }
                    ]
                }
            ]
        }"#;

        let cfg: Result<WorkspaceConfig, _> = serde_json::from_str(json_str);
        assert!(cfg.is_ok());
        let cfg = cfg.unwrap();
        assert_eq!(cfg.presets.len(), 1);
        assert_eq!(cfg.presets[0].name, "Quick Calendar");
        assert_eq!(cfg.presets[0].actions[0].args.len(), 2);
        // Should default to "nothing" when missing from JSON
        assert_eq!(cfg.presets[0].on_switch_away, "nothing");

        // Test explicit on_switch_away
        let json_with_action = r#"{
            "presets": [
                {
                    "id": "gemini",
                    "name": "Gemini",
                    "shortcut": "2",
                    "on_switch_away": "temp_minimize",
                    "actions": []
                }
            ]
        }"#;
        let cfg2: WorkspaceConfig = serde_json::from_str(json_with_action).unwrap();
        assert_eq!(cfg2.presets[0].on_switch_away, "temp_minimize");
    }
}
