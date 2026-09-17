@echo off
echo ========================================================
echo   Enabling FocusDeck Windows Startup
echo ========================================================
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "FocusDeck" /t REG_SZ /d "\"%~dp0FocusDeck.exe\"" /f
if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCCESS] FocusDeck will now start automatically when you log in to Windows!
    echo Registry key: HKCU\Software\Microsoft\Windows\CurrentVersion\Run
    echo Target: "%~dp0FocusDeck.exe"
) else (
    echo.
    echo [ERROR] Failed to set registry entry.
)
echo ========================================================
pause
