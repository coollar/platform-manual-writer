@echo off
rem setenv.bat -- 把 config.json 载入当前 cmd 会话的环境变量
rem
rem 用途：JS 脚本（login.js / inventory_buttons.js）只读环境变量、
rem       不读 config.json。本脚本一次导出，JS 与 Python 脚本都能用。
rem
rem 用法：在 cmd 里直接运行
rem   setenv.bat
rem 载入后可直接跑：
rem   node scripts\login.js

set "PY=python"
where %PY% >nul 2>nul
if errorlevel 1 (
  echo [setenv] 找不到 python，请先安装 Python 3
  goto :eof
)

for /f "usebackq delims=" %%L in (`%PY% "%~dp0scripts\_emit_env.py" --bat`) do %%L

echo [setenv] 已从 config.json 载入环境变量：
echo   MANUAL_BASE_URL  = %MANUAL_BASE_URL%
echo   MANUAL_LOGIN_URL = %MANUAL_LOGIN_URL%
echo   MANUAL_USER      = %MANUAL_USER%
echo   CHROME_PATH      = %CHROME_PATH%
echo   NODE_PATH        = %NODE_PATH%
