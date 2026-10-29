#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""_emit_env.py —— 把 config.json 转成环境变量导出语句

为什么需要它：
    JS 脚本（login.js / inventory_buttons.js / audit_template.js）
    **只读环境变量，不读 config.json**；
    而 Python 脚本走 load_config.py（能读 config.json）。
    本脚本把 config.json 里的值转成环境变量，让两边用同一份配置。

用法：
    python _emit_env.py --sh    # 输出 export KEY="value"（供 sh 的 eval 使用）
    python _emit_env.py --bat   # 输出 set "KEY=value"（供 cmd 的 for /f 使用）
    python _emit_env.py         # 输出 KEY=value（纯文本，便于查看）

配合 setenv.sh / setenv.bat 使用，一般不用直接调用。
"""
import argparse
import io
import json
import os
import sys
from pathlib import Path

# config.json 字段 → 环境变量名
MAPPING = [
    (("platform", "base_url"), "MANUAL_BASE_URL"),
    (("platform", "login_url"), "MANUAL_LOGIN_URL"),
    (("env", "user"), "MANUAL_USER"),
    (("env", "pass"), "MANUAL_PASS"),
    (("env", "headless"), "HEADLESS"),
    (("env", "test_prefix"), "TEST_PREFIX"),
    (("paths", "chrome"), "CHROME_PATH"),
    (("paths", "node_modules"), "NODE_PATH"),
    (("paths", "python"), "PYTHON"),
]

# 默认视口，供 JS 脚本参考
EXTRA = {}


def find_config():
    env = os.environ.get("MANUAL_CONFIG")
    candidates = []
    if env:
        candidates.append(Path(env))
    candidates.append(Path.cwd() / "config.json")
    here = Path(__file__).resolve().parent.parent
    candidates.append(here / "config.json")
    for p in candidates:
        if p.exists():
            return p
    return None


def main():
    ap = argparse.ArgumentParser(description="把 config.json 转成环境变量导出语句")
    ap.add_argument("--sh", action="store_true", help="输出 export KEY=value")
    ap.add_argument("--bat", action="store_true", help="输出 set \"KEY=value\"")
    args = ap.parse_args()

    cfg_path = find_config()
    if not cfg_path:
        sys.stderr.write(
            "未找到 config.json。请从 config_template.json 复制一份并填入实际值。\n"
        )
        sys.exit(1)

    cfg = json.loads(io.open(str(cfg_path), encoding="utf-8").read())
    pairs = []
    for (sec, key), env_name in MAPPING:
        val = (cfg.get(sec) or {}).get(key)
        if val is None:
            continue
        val = str(val)
        if not val or val.startswith("<"):
            # 占位符未填，跳过（不导出无意义的值）
            continue
        pairs.append((env_name, val))

    if args.sh:
        for k, v in pairs:
            # 双引号内转义反斜杠与双引号，避免 Windows 路径被 shell 吞掉
            esc = v.replace("\\", "\\\\").replace('"', '\\"')
            print('export %s="%s"' % (k, esc))
    elif args.bat:
        for k, v in pairs:
            print('set "%s=%s"' % (k, v.replace('"', '')))
    else:
        for k, v in pairs:
            print("%s=%s" % (k, v))


if __name__ == "__main__":
    main()
