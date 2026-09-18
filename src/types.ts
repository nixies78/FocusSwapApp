export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
  screen?: number;
  maximized?: boolean;
}

export interface Action {
  type: string;
  executable: string;
  args: string[];
  placement?: Placement;
  title?: string;
  is_chrome_app?: boolean;
  on_switch_away?: SwitchAwayAction;
}

export type SwitchAwayAction = 'nothing' | 'minimize' | 'temp_minimize' | 'kill';

export interface Preset {
  id: string;
  name: string;
  shortcut: string;
  on_switch_away?: SwitchAwayAction;
  parent_id?: string;
  actions: Action[];
}

export interface MonitorInfo {
  index: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  is_primary: boolean;
}

export interface CapturedWindow {
  id: string;
  title: string;
  executable: string;
  process_path: string;
  screen_index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  is_maximized: boolean;
  is_minimized: boolean;
  is_chrome: boolean;
  suggested_url?: string;
}

export interface CapturedLayout {
  monitors: MonitorInfo[];
  windows: CapturedWindow[];
}

export interface ChromeProfile {
  id: string;
  name: string;
  user_name: string;
}

export type CleanupRuleAction = 'minimize' | 'keep' | 'kill' | 'close';

export interface CleanupRule {
  id: string;
  name: string;
  executable?: string;
  title_contains?: string;
  action: CleanupRuleAction;
}

export interface CleanupConfig {
  default_action: CleanupRuleAction;
  rules: CleanupRule[];
}

export interface CleanupSummary {
  minimized: number;
  killed: number;
  closed: number;
  kept: number;
}

