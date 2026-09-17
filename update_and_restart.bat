@echo off
title FocusDeck Updater
echo ========================================================
echo             FocusDeck Automatic Update
echo ========================================================
echo.
echo Closing running FocusDeck instance...
taskkill /f /im FocusDeck.exe >nul 2>&1
timeout /t 1 /nobreak >nul

cd /d %~dp0
echo Pulling latest version from Git...
git pull

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Successfully pulled latest version!
    echo Restarting FocusDeck...
    timeout /t 1 /nobreak >nul
    start "" "%~dp0FocusDeck.exe"
    timeout /t 2 /nobreak >nul
    exit
) else (
 echo.
 echo [ERROR] Git pull failed. Please check your connection.
 echo.
 pause
 exit
)
