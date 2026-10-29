#!/usr/bin/env sh
# setenv.sh —— 把 config.json 载入当前 shell 的环境变量
#
# 用途：JS 脚本（login.js / inventory_buttons.js）只读环境变量、
#       不读 config.json。本脚本一次导出，JS 与 Python 脚本都能用。
#
# 用法（必须 source，不能直接执行）：
#   . ./setenv.sh          # sh / bash / zsh
#
# 载入后可直接跑：
#   node scripts/login.js

DIR="$(cd "$(dirname "$0")" && pwd)"

# 找一个可用的 python
PY="${PYTHON:-python3}"
command -v "$PY" >/dev/null 2>&1 || PY="python"
command -v "$PY" >/dev/null 2>&1 || {
  echo "[setenv] 找不到 python，请先安装 Python 3" >&2
  return 1 2>/dev/null || exit 1
}

eval "$("$PY" "$DIR/scripts/_emit_env.py" --sh)" || return 1 2>/dev/null

echo "[setenv] 已从 config.json 载入环境变量："
echo "  MANUAL_BASE_URL  = $MANUAL_BASE_URL"
echo "  MANUAL_LOGIN_URL = $MANUAL_LOGIN_URL"
echo "  MANUAL_USER      = $MANUAL_USER"
echo "  CHROME_PATH      = $CHROME_PATH"
echo "  NODE_PATH        = $NODE_PATH"
