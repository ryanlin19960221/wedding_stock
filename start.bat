@echo off
chcp 65001 > nul
title Fugle Pulse - 股票走勢動態儀表板
echo ========================================================
echo   正在啟動 Fugle Pulse 股票走勢動態儀表板...
echo ========================================================
echo.
python --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 未檢測到 Python，嘗試直接開啟網頁...
    start "" "index.html"
) else (
    echo [OK] 正在啟動本地 Web 伺服器 (http://localhost:8080)...
    start "" "http://localhost:8080"
    python server.py
)
pause
