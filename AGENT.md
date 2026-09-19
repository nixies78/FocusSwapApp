# FocusDeck — Agent & Developer Architecture Guide

> **CRITICAL NOTICE FOR ALL FUTURE AI AGENTS AND DEVELOPERS**:
> Read this document completely before modifying any hotkey, hook, input handling, or multi-machine logic. Violating these architectural rules has previously caused severe regressions, dual-screen popup loops, and broken mouse triggers.

---

## 1. System Setup & Environment

FocusDeck runs across a two-computer setup using **PowerToys Mouse Without Borders (MWB)**:
- **Machine B (Master PC)**: Physical keyboard and Razer mouse are plugged in here (Hostname: `WINALIE-PIDQLNK`, 4K 3840×2160 display).
- **Machine A (Secondary PC)**: Controls receive forwarded keyboard and mouse events over the local network via Mouse Without Borders (Hostname: `EM01DLNQ`).
- **Razer Mouse Button Mappings**:
  - Button 3: `Shift + Ctrl + C` (`0x43`)
  - Button 2: `F13` / `F14` (`0x7C` / `0x7D`)
  - Fallback: `Alt + Q` (`0x51`)
- **Other Running Tools**:
  - **Help Respond**: Uses `F20` (`0x83`).
  - **PowerToys Run**: Uses `Alt + Space`.

---

## 2. Hard Architectural Rules (DO NOT BREAK)

### Rule 1: NEVER Replace `WH_KEYBOARD_LL` with `RegisterHotKey`
- **Why**: Mouse drivers (e.g. Razer Synapse) inject simulated/synthetic keystrokes for extra mouse buttons. Win32 `RegisterHotKey` does **not** reliably capture driver-injected or extended virtual keys without active window focus.
- **History**: Several past versions tried replacing the low-level hook with `RegisterHotKey`. In every single attempt, physical mouse buttons immediately stopped responding.
- **Requirement**: Always use the native `WH_KEYBOARD_LL` low-level keyboard hook with dynamic modifier tracking (`CTRL_PRESSED`, `SHIFT_PRESSED`, `ALT_PRESSED`) inside a dedicated Windows message pump thread.

### Rule 2: NEVER Intercept `F20` (`0x83`)
- `F20` is exclusively reserved for the user's "Help Respond" utility.
- The hook condition in [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs) **must explicitly exclude F20**:
  ```rust
  else if vk >= 0x7C && vk <= 0x87 && vk != 0x83 {
      Some("Native Hook: Extended Function Key (F13-F24, not F20)")
  }
  ```

### Rule 3: NEVER Intercept or Register `Alt + Space`
- `Alt + Space` is reserved for PowerToys Run.

---

## 3. Multi-Machine & Mouse Without Borders Architecture

### The Problem
When the user moves the mouse from Machine B (Master) to Machine A (Secondary) and presses a hotkey:
1. The physical signal enters Machine B first (because the hardware is plugged into Machine B).
2. If Machine B intercepts the key, shows its overlay, and returns `LRESULT(1)` (swallowing the key):
   - FocusDeck pops up on Machine B instead of Machine A.
   - The key is swallowed, so Mouse Without Borders never sends it over the network to Machine A.
   - FocusDeck on Machine B captures focus and traps the cursor.

### Why Naive Win32 Checks Fail
- **Cursor is NOT hidden**: Windows reports `cursor_hidden = false` when MWB leaves the screen.
- **Cursor is NOT at (0,0)**: MWB parks the cursor at the boundary (~39px from the edge on 4K, recorded as `LastX: 39` in MWB's `settings.json`). A naive `pt.x <= 2` check fails.
- **Background CLI illusion**: Calling `GetCursorPos` from a non-interactive background PowerShell shell returns `(0,0)` with `ERROR_ACCESS_DENIED (err=5)`. Do **not** assume the user's cursor is at `(0,0)` based on CLI probe scripts!

### The Solution: Real-Time Peer Cursor Sync (UDP Port 15188)
1. **Local Mouse Tracking**:
   - Each FocusDeck instance runs a background thread polling `GetCursorPos` every 50ms (zero hooks).
   - Whenever `GetCursorPos` coordinates change, `LAST_LOCAL_MOUSE_MOVE` is updated.
   - When moving, the machine broadcasts `FOCUSDECK:MOUSE:<COMPUTERNAME>` on UDP port 15188 (`255.255.255.255`).
2. **Self-Broadcast Filtering**:
   - In the UDP receiver, packets where `<COMPUTERNAME>` matches the local hostname are **discarded** to prevent loopback echo.
   - Valid peer packets update `LAST_REMOTE_MOUSE_MOVE`.
3. **Strict Single-Machine Mutual Exclusion**:
   - When the hotkey is pressed on Machine B:
     ```rust
     if remote_move > 0 && remote_elapsed < local_elapsed {
         // Remote machine had more recent mouse activity!
         // DO NOT open overlay on local machine.
         // Pass through to Mouse Without Borders so it forwards the key.
         return CallNextHookEx(None, n_code, w_param, l_param);
     }
     ```
   - If local mouse activity is newer: Machine B opens locally and returns `LRESULT(1)` (swallows the key).
   - If remote mouse activity is newer: Machine B calls `CallNextHookEx(...)` and does **not** open.
   - Mouse Without Borders automatically forwards the keystroke across the network to Machine A.
   - Machine A receives the forwarded key, sees that its own mouse was active, and opens exclusively on Machine A.
4. **DO NOT Broadcast `TRIGGER` Packets Over UDP**:
   - In v0.3.1, sending `FOCUSDECK:TRIGGER` over UDP caused both machines to trigger at once due to broadcast loopback and MWB double-forwarding.
   - Let MWB handle the keystroke transport; FocusDeck only uses UDP for mouse locality age synchronization.

---

## 4. Diagnostics & How to Debug

### Fast Health Check
Run [`diag_check.bat`](diag_check.bat) from the project root. It will output:
- Whether `FocusDeck.exe` process is running and its PID.
- The latest heartbeat logs from [`focusdeck_diag.log`](focusdeck_diag.log):
  - `hook_alive=true`: Proves the hook thread is pumping messages.
  - `total_triggers`: Increments on every hotkey press.
  - `local_mouse_age=...ms` vs `remote_mouse_age=...ms`: Proves peer mouse sync is receiving packets.
- The last 10 lines of [`focusdeck_status.log`](focusdeck_status.log).

### Process Management on Windows
- Antigravity / IDE background tasks execute within a Windows Job Object. Spawning processes directly in a background task will kill the child process when the task ends.
- **To launch FocusDeck independently from the CLI**, use CIM `Win32_Process::Create`:
  ```powershell
  Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
      CommandLine = 'c:\VibeCoding\FocusSwapApp\FocusDeck.exe';
      CurrentDirectory = 'c:\VibeCoding\FocusSwapApp'
  }
  ```
- Or run `start.bat` from File Explorer.

---

## 5. Build & Deployment Checklist

When making any changes to FocusDeck:
1. **Compile**: Run `npx tauri build`.
2. **Deploy to Root**:
   ```powershell
   taskkill /f /im FocusDeck.exe 2>$null
   Copy-Item "src-tauri\target\release\focusdeck.exe" "FocusDeck.exe" -Force
   ```
3. **Launch & Verify**:
   - Launch via CIM `Win32_Process::Create`.
   - Wait 12 seconds and inspect `focusdeck_diag.log` to confirm `hook_alive=true`.
4. **Version Bumping**:
   Always bump version numbers in all 4 files in sync:
   - `src/version.ts`
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
5. **Git Synchronization**:
   - Push to `origin/main`.
   - On the secondary machine (Machine A), pull updates via `git pull` or click **Update & Restart** in the FocusDeck UI.
