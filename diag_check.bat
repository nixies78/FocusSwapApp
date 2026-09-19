@echo off
title FocusDeck Diagnostic Check
echo ============================================================
echo  FocusDeck Diagnostic Report
echo ============================================================
echo.

echo --- Process Status ---
tasklist /FI "IMAGENAME eq FocusDeck.exe" 2>nul | find /i "FocusDeck.exe" >nul
if %errorlevel% equ 0 (
    echo [OK] FocusDeck.exe is RUNNING
    for /f "tokens=2" %%p in ('tasklist /FI "IMAGENAME eq FocusDeck.exe" /NH 2^>nul ^| find /i "FocusDeck.exe"') do echo      PID: %%p
) else (
    echo [!!] FocusDeck.exe is NOT RUNNING
)
echo.

echo --- Hook Heartbeat (last 5 entries from focusdeck_diag.log) ---
if exist "%~dp0focusdeck_diag.log" (
    powershell -NoProfile -Command "Get-Content '%~dp0focusdeck_diag.log' | Select-Object -Last 5"
) else (
    echo [!!] No diagnostic log found. FocusDeck may not have started yet.
)
echo.

echo --- Recent Triggers (last 10 entries from focusdeck_status.log) ---
if exist "%~dp0focusdeck_status.log" (
    powershell -NoProfile -Command "Get-Content '%~dp0focusdeck_status.log' | Select-Object -Last 10"
) else (
    echo [!!] No status log found.
)
echo.

echo --- Trigger Count Check ---
if exist "%~dp0focusdeck_diag.log" (
    powershell -NoProfile -Command "$last = Get-Content '%~dp0focusdeck_diag.log' | Select-Object -Last 1; if ($last -match 'total_triggers=(\d+)') { $n = $matches[1]; if ([int]$n -gt 0) { Write-Host \"[OK] $n trigger(s) have been received\" } else { Write-Host '[!!] Zero triggers received so far. Try pressing Alt+Q.' } } else { Write-Host '[??] Could not parse trigger count.' }"
) else (
    echo [!!] No diagnostic log.
)
echo.
echo ============================================================
echo  To test: press Alt+Q then run this again to see if
echo  a new trigger entry appears in the status log above.
echo ============================================================
pause
