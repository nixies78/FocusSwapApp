# FocusDeck

A lightweight, system-wide task and workspace switcher utility for Windows built with **Rust**, **Tauri v2**, **Win32 APIs**, and **React + Tailwind CSS**.

![FocusDeck](src-tauri/icons/icon.png)

---

## Key Features

1. **Quiet System Tray Background Utility**:
   - Runs quietly in the Windows notification area (tray).
   - Left-click tray icon or use global hotkeys to toggle the overlay.
   - Right-click tray menu for quick actions: **Start with Windows** (autostart toggle), Open `workspaces.json`, Reload Configuration, Toggle, or Quit.
   - Can automatically start minimized to tray on Windows boot / login.

2. **Global Hotkey Invocation**:
   - System-wide hotkey listener (`Alt+Space` or `Ctrl+Shift+Space`).
   - Instantly toggles the focus overlay from anywhere in Windows without breaking context.

3. **Blackout / Frosted-Glass Focus Overlay**:
   - Borderless, fullscreen transparent backdrop styled with dark frosted-glass (`rgba(10, 10, 15, 0.85)` + CSS `backdrop-filter: blur(24px)`).
   - Centered HUD launcher navigable entirely by keyboard:
     - **Numbers `1-9`**: Instant 1-touch preset launching.
     - **Arrow Keys `↑` / `↓`**: Cycle through presets.
     - **`Enter`**: Execute selected preset.
     - **`Esc`**: Dismiss overlay immediately.
     - **Fuzzy Search**: Filter presets by title or process arguments on the fly.
     - **`Ctrl+O`**: Edit configuration.
     - **`Ctrl+R`**: Hot-reload configuration.

4. **Isolated Chrome / Web App Handling**:
   - Web applications (e.g., Google Calendar, Notion) are launched in dedicated application mode:
     ```cmd
     chrome.exe --app="<URL>" --new-window
     ```
   - Prevents web links from snapping into existing background browser tabs or navigating away from your active virtual desktop.
   - Automatically discovers Chrome in standard locations (`Program Files`, `Program Files (x86)`, `LocalAppData`), PATH, or falls back to Chromium Edge if needed.

5. **Win32 Window Positioning & Layout Engine**:
   - Uses native Windows APIs (`windows-rs` / `user32.dll`):
     - `EnumWindows` and `GetWindowThreadProcessId` to locate spawned window handles (`HWND`).
     - `SetWindowPos` to size and reposition windows to exact bounds `(x, y, width, height)`.
     - `ShowWindow` (`SW_RESTORE`) and `SetForegroundWindow` to bring target apps directly to the foreground.

---

## Configuration (`workspaces.json`)

FocusDeck reads from `workspaces.json` (located in the project root or `%APPDATA%\FocusDeck\workspaces.json`):

```json
{
  "presets": [
    {
      "id": "calendar",
      "name": "Quick Calendar",
      "shortcut": "1",
      "actions": [
        {
          "type": "launch",
          "executable": "chrome.exe",
          "args": [
            "--app=https://calendar.google.com",
            "--new-window"
          ],
          "placement": {
            "x": 200,
            "y": 150,
            "width": 1200,
            "height": 800
          }
        }
      ]
    },
    {
      "id": "notes",
      "name": "Scratchpad & Docs",
      "shortcut": "2",
      "actions": [
        {
          "type": "launch",
          "executable": "notepad.exe",
          "args": [],
          "placement": {
            "x": 100,
            "y": 100,
            "width": 800,
            "height": 700
          }
        }
      ]
    },
    {
      "id": "notion",
      "name": "Notion Workspace",
      "shortcut": "3",
      "actions": [
        {
          "type": "launch",
          "executable": "chrome.exe",
          "args": [
            "--app=https://www.notion.so",
            "--new-window"
          ],
          "placement": {
            "x": 250,
            "y": 120,
            "width": 1300,
            "height": 850
          }
        }
      ]
    }
  ]
}
```

---

## Building & Running

### Prerequisites
- Node.js (v18+)
- Rust (Cargo & Rustc)
- Visual Studio C++ Build Tools (MSVC)

### Development Mode
```bash
# Install frontend packages
npm install

# Run frontend in development mode
npm run dev

# Run full desktop app with live reload
npm run tauri dev
```

### Production Build
```bash
# Build frontend and compile optimized Windows executable
npm run build
cd src-tauri
cargo build --release
```
The compiled release executable will be located at:
`src-tauri/target/release/focusdeck.exe`
