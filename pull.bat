@echo off
title Git Pull - FocusDeck
echo ========================================================
echo               Updating FocusDeck from Git
echo ========================================================
echo.
git pull
if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] FocusDeck is up to date!
) else (
    echo.
    echo [ERROR] Pull failed. Check your network or Git remote.
)
echo.
pause
