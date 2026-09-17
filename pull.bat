@echo off
title Git Pull - FocusDeck
echo ========================================================
echo               Updating FocusDeck from Git
echo ========================================================
echo.
:: Automatically close FocusDeck if running so Windows unlocks FocusDeck.exe
tasklist /fi "imagename eq FocusDeck.exe" 2>nul | find /i "FocusDeck.exe" >nul
if %errorlevel% equ 0 (
    echo Closing running FocusDeck instance before updating...
    taskkill /f /im FocusDeck.exe >nul 2>&1
    timeout /t 1 /nobreak >nul
)

git pull
if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] FocusDeck is up to date!
    echo Restarting FocusDeck...
    start "" "%~dp0FocusDeck.exe"
) else (
    echo.
    echo [ERROR] Pull failed. Check your network or Git remote.
)
echo.
pause
