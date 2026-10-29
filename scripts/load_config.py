#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""load_config.py —— 统一加载用户配置

用法：
    from load_config import load_config
    cfg = load_config()

搜索顺序（先找到的先返回）：
    1. 环境变量 MANUAL_CONFIG 指定的路径
    2. 当前工作目录下的 config.json
    3. 脚本所在目录（skills/platform-manual-writer/）下的 config.json

返回结构见 config_template.json。
未找到时抛出 FileNotFoundError 并给出提示。
"""
import io
import json
import os
import sys
from pathlib import Path


def load_config():
    env = os.environ.get("MANUAL_CONFIG")
    candidates = []
    if env:
        candidates.append(Path(env))
    candidates.append(Path.cwd() / "config.json")
    # 脚本所在目录的上级（技能包根目录）
    here = Path(__file__).resolve().parent.parent
    candidates.append(here / "config.json")

    for p in candidates:
        if p.exists():
            with io.open(str(p), encoding="utf-8") as f:
                return json.load(f)

    raise FileNotFoundError(
        "未找到 config.json。请从 config_template.json 复制一份并填入实际值，"
        "或设置环境变量 MANUAL_CONFIG=/path/to/config.json"
    )


def apply_env_overrides(cfg):
    """用环境变量覆盖 config.json 中的值（安全优先）。"""
    env_map = {
        "MANUAL_BASE_URL": ("platform", "base_url"),
        "MANUAL_LOGIN_URL": ("platform", "login_url"),
        "MANUAL_USER": ("env", "user"),
        "MANUAL_PASS": ("env", "pass"),
        "CHROME_PATH": ("paths", "chrome"),
        "NODE_PATH": ("paths", "node_modules"),
        "HEADLESS": ("env", "headless"),
        "TEST_PREFIX": ("env", "test_prefix"),
    }
    for env_key, (section, key) in env_map.items():
        val = os.environ.get(env_key)
        if val is not None:
            if section not in cfg:
                cfg[section] = {}
            cfg[section][key] = val
    return cfg


if __name__ == "__main__":
    cfg = apply_env_overrides(load_config())
    print(json.dumps(cfg, ensure_ascii=False, indent=2))
