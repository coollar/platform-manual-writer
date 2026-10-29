#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""insert_section.py —— 手册 XML 安全批量编辑（命中校验，任一失配不写盘）

用途：给已有手册**追加模块 / 同步头部**时，把每个改动点写成 old→new 对，
      全部命中才写盘；任一失配就整体放弃并退出非 0。杜绝"手工替换漏改不自知"。

用法：
    python insert_section.py <target.xml> --edits <edits.json> [--backup <备份文件名>] [--dry-run]

edits.json 格式：
{
  "edits": [
    { "tag": "title",       "old": "…旧标题…",       "new": "…新标题…" },
    { "tag": "doc-version", "old": "…V2.4…",         "new": "…V2.5…" },
    { "tag": "maybe",       "old": "…",              "new": "…", "optional": true },
    { "tag": "ch21",        "append": "…新章节 XML…", "guard": "第二十一章标志串" }
  ]
}

规则：
  - 精确替换：old 必须**恰好命中 1 次**（0 次=失配，>1 次=歧义，都失败）
  - optional:true —— 该点允许命中 0 次（用于"可能已改过"的点），命中则替换
  - append 追加到文末；guard 命中则视为已追加，跳过（幂等）
  - 任一非 optional 点失配 → 全部不写盘，退出码 1
  - 默认先备份；--dry-run 只报告不写盘

退出码：0=成功（或 dry-run 全部命中）；1=有失配，未写盘；2=用法错误
"""
import io
import json
import os
import shutil
import sys


def load_edits(path):
    with io.open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    return data.get("edits", [])


def apply(s, edits):
    """在内存里逐条应用，返回 (新文本, 报告行列表, 是否有失配)。"""
    report = []
    failed = False
    for e in edits:
        tag = e.get("tag", "?")
        optional = e.get("optional", False)

        if "append" in e:
            block = e["append"]
            guard = e.get("guard")
            if not guard:
                guard = "".join(block.split())[:40]
            if guard and guard in s:
                report.append("SKIP [%s] 已存在（guard 命中）" % tag)
                continue
            s = s.rstrip() + "\n" + block + "\n"
            report.append("HIT  [%s] 追加到文末（%d 字符）" % (tag, len(block)))
            continue

        old = e.get("old")
        new = e.get("new")
        if old is None or new is None:
            report.append("MISS [%s] 缺少 old/new" % tag)
            failed = True
            continue

        c = s.count(old)
        if c == 1:
            s = s.replace(old, new)
            report.append("HIT  [%s]" % tag)
        elif c == 0 and optional:
            report.append("SKIP [%s] 未命中但 optional" % tag)
        elif c == 0:
            report.append("MISS [%s] 命中 0 次" % tag)
            failed = True
        else:
            report.append("MISS [%s] 命中 %d 次（期望 1，有歧义）" % (tag, c))
            failed = True
    return s, report, failed


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    target = args[0]
    edits_path = None
    backup = None
    dry = False
    i = 1
    while i < len(args):
        if args[i] == "--edits" and i + 1 < len(args):
            edits_path = args[i + 1]; i += 2
        elif args[i] == "--backup" and i + 1 < len(args):
            backup = args[i + 1]; i += 2
        elif args[i] == "--dry-run":
            dry = True; i += 1
        else:
            i += 1

    if not edits_path:
        print("!! 必须用 --edits 指定 edits.json")
        sys.exit(2)

    orig = io.open(target, encoding="utf-8").read()
    edits = load_edits(edits_path)
    new, report, failed = apply(orig, edits)

    print("=== 编辑报告（%d 个改动点）===" % len(edits))
    for line in report:
        print("  " + line)

    if failed:
        print("\n!! 有未命中项，**未写盘**。请修正 old 串后重跑。")
        sys.exit(1)

    if dry:
        print("\n[dry-run] 全部命中，未写盘。len %d -> %d" % (len(orig), len(new)))
        sys.exit(0)

    # 备份
    bak = backup or (target + ".bak")
    shutil.copyfile(target, bak)
    print("\n已备份 -> %s" % bak)

    with io.open(target, "w", encoding="utf-8", newline="\n") as f:
        f.write(new)
    print("已写盘。len %d -> %d（%+d）" % (len(orig), len(new), len(new) - len(orig)))


if __name__ == "__main__":
    main()
