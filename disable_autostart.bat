@echo off
echo ========================================================
echo   Disabling FocusDeck Windows Startup
echo ========================================================
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "FocusDeck" /f
if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCCESS] FocusDeck startup on login disabled.
) else (
    echo.
    echo FocusDeck was not registered in startup or already removed.
)
echo ========================================================
pause
