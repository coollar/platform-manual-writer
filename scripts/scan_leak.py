#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scan_leak.py —— 安全审计：扫描技能包中残留的项目专属硬编码信息

用法：
    python scan_leak.py [skills_dir]

检查项：
    - 硬编码 URL（平台域名 / 内网域名 / feishu.cn docx token）
    - 硬编码凭据（USER / PASS / TOKEN / SECRET 等被赋了真值）
    - 硬编码本地绝对路径（C:\\Users\\...）
    - 平台专属名词（旧平台残留的公司名 / 产品名）

平台专属词从哪来（顺序）：
    1. 环境变量 LEAK_PLATFORM_WORDS（逗号分隔）
    2. config.json 的 platform.name 与 platform.legacy_names
    ——换平台时只需改 config.json，不用改本脚本。

退出码：0=干净；1=发现残留
"""
import io
import json
import os
import re
import sys
from pathlib import Path

# ---------- 扫描规则 ----------
# 通用规则：与具体平台无关，任何项目都适用
STATIC_RULES = [
    ("URL_残留", r"https?://[^\s\"'<>）)]+"),
    ("TOKEN_残留", r"[A-Za-z0-9]{20,30}"),          # 可能命中 token，需二次过滤
    ("路径_残留", r"[A-Za-z]:\\Users\\[^\s\"'<>]+"),
    # 凭据赋值：值必须被引号包裹且不以 < 开头（放过 <占位符>）
    ("凭据_残留", r"(?:USER|PASS|PASSWORD|ACCOUNT|SECRET|API_?KEY|ACCESS_TOKEN)\s*[:=]\s*[\"'](?![<\s])[^\"'\n]{3,}[\"']"),
]


def load_platform_words(base):
    """读取「平台专属词」——用于检出旧平台的域名/产品名残留。

    取值来源（按优先级）：
      1. 环境变量 LEAK_PLATFORM_WORDS（逗号分隔）
      2. config.json 的 platform.name 与 platform.legacy_names
    都没有则返回空列表（该规则自动跳过），不会误用其他平台的名字。
    """
    env = os.environ.get("LEAK_PLATFORM_WORDS")
    if env:
        return [w.strip() for w in env.split(",") if w.strip()]

    cfg_path = Path(base) / "config.json"
    if not cfg_path.exists():
        cfg_path = Path(base) / "platform-manual-writer" / "config.json"
    if cfg_path.exists():
        try:
            cfg = json.loads(io.open(str(cfg_path), encoding="utf-8").read())
            plat = cfg.get("platform") or {}
            words = []
            name = plat.get("name") or ""
            if name and not name.startswith("<"):
                words.append(name)
            for w in (plat.get("legacy_names") or []):
                if w and not str(w).startswith("<"):
                    words.append(str(w))
            return words
        except Exception:
            pass
    return []


def build_platform_rules(words):
    """把平台专属词编译成一条正则规则。"""
    if not words:
        return []
    escaped = [re.escape(w) for w in words]
    return [("平台专属", "|".join(escaped))]

# 白名单：config_template.json 里的占位符不算泄露
WHITELIST = [
    re.compile(r"<[^>]+>"),                           # <占位符>
    re.compile(r"https://<[^>]+>"),
    re.compile(r"example\.com"),
    re.compile(r"python3"),
    re.compile(r"node_modules"),
    re.compile(r"__pycache__"),
    re.compile(r"SKILL\.md"),
    re.compile(r"assets/"),
    re.compile(r"references/"),
    re.compile(r"scripts/"),
]


def is_whitelisted(hit):
    for w in WHITELIST:
        if w.search(hit):
            return True
    return False


def scan_file(path, rules):
    findings = []
    try:
        s = io.open(path, encoding="utf-8").read()
    except Exception:
        return findings
    lines = s.split("\n")
    for rule_name, pattern in rules:
        for i, line in enumerate(lines, 1):
            for m in re.finditer(pattern, line):
                hit = m.group(0)
                if is_whitelisted(hit):
                    continue
                # 进一步过滤 token：排除纯数字、纯字母、常见变量名
                if rule_name == "TOKEN_残留":
                    if hit.isdigit() or hit.isalpha() or len(hit) < 20:
                        continue
                    # 排除 JSON 里的 true/false/null
                    if hit.lower() in ("true", "false", "null"):
                        continue
                findings.append((path, i, rule_name, hit))
    return findings


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "."
    skill_dir = Path(base)
    findings = []

    # 通用规则 + 由 config.json / 环境变量派生的平台专属规则
    words = load_platform_words(base)
    rules = STATIC_RULES + build_platform_rules(words)
    print("=== 平台专属词 ===", words if words else "（未配置，跳过该规则）")

    skip = {".git", "node_modules", "__pycache__", ".workbuddy"}
    for root, dirs, files in os.walk(skill_dir):
        dirs[:] = [d for d in dirs if d not in skip]
        for f in files:
            if f == "scan_leak.py":
                continue  # 跳过审计脚本自身（规则注释含示例词）
            if not f.endswith((".js", ".py", ".md", ".json", ".xml")):
                continue
            p = Path(root) / f
            findings.extend(scan_file(str(p), rules))

    if not findings:
        print("=== 安全审计：未发现项目专属硬编码残留 ===")
        sys.exit(0)

    print("=== 安全审计：发现 %d 处疑似残留 ===" % len(findings))
    for path, line, rule, hit in findings:
        print("  %-20s L%-4d  [%s]  %s" % (Path(path).name, line, rule, hit[:80]))
    print("\n请把以上残留改为环境变量或 config.json 占位符。")
    sys.exit(1)


if __name__ == "__main__":
    main()
