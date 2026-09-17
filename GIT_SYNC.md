# FocusSwapApp - Git & GitHub Synchronization Guide

This project has been initialized with Git. Follow these instructions to link this project to GitHub and synchronize your work.

---

## Linked Repository
This project is connected to:
**`https://github.com/nixies78/FocusSwapApp.git`**

---

## Installing on Computer 2 (at `C:\VibeCoding\FocusSwapApp`)

1. Open a Command Prompt or PowerShell terminal.
2. Create and enter `C:\VibeCoding`:
   ```cmd
   mkdir C:\VibeCoding
   cd C:\VibeCoding
   ```
3. Clone the repository into `FocusSwapApp`:
   ```cmd
   git clone https://github.com/nixies78/FocusSwapApp.git
   ```
4. Enter the folder:
   ```cmd
   cd C:\VibeCoding\FocusSwapApp
   ```
5. Double-click **`enable_autostart.bat`** to enable startup on Windows boot.
6. Double-click **`start.bat`** to run FocusDeck immediately. No build tools needed!

---

## Step 3: Easily Sync Future Changes

### Method 1: Using `sync.bat` (1-Click Sync)
Double-click `sync.bat` in this folder anytime you want to save & push your progress.
- It stages all modified and new files.
- Asks for a commit message (or press Enter for auto-timestamp).
- Commits and pushes to GitHub in one action.

### Method 2: Manual Terminal Commands
```bash
git add -A
git commit -m "Describe your changes"
git push
```

---

## Helpful Git Commands
- Check modified files: `git status`
- View commit history: `git log --oneline`
- Pull updates from GitHub: `git pull`
