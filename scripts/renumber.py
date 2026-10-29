#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""renumber.py —— 飞书手册 XML 图号连续重排

把正文里所有 caption="图 N ..." 按出现顺序重新编号为 1..N 连续。
用于增删图之后修复图号。

用法：
    python renumber.py <draft.xml>          # 原地重排并写回（会先备份）
    python renumber.py <draft.xml> --dry    # 只预览，不写回

注意：
    1) 重排前会先扫描 caption 之外的「图 N」引用——正文若引用了图号，
       重排会导致引用断链，需人工处理（脚本只提示，不自动改）。
    2) 默认写回前生成 <draft.xml>.bak 备份。
"""
import io
import os
import re
import shutil
import sys


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    p = args[0]
    dry = "--dry" in args

    s = io.open(p, encoding="utf-8").read()

    # 1) 扫描 caption 之外的「图 N」引用（可能造成断链）
    body = re.sub(r'caption="图\s*\d+[^"]*"', "", s)
    others = re.findall(r".{22}图\s*\d+.{22}", body)
    print("caption 之外的「图 N」引用: %d" % len(others))
    for o in others:
        print("   ..." + o.replace("\n", " ") + "...")
    if others:
        print("   ⚠️ 正文引用了图号，重排后需人工核对。")

    # 2) 按出现顺序重编号
    cnt = [0]

    def repl(m):
        cnt[0] += 1
        rest = re.sub(r"^\s*\d+\s*", "", m.group(1)).strip()
        return 'caption="图 %d  %s"' % (cnt[0], rest)

    s2 = re.sub(r'caption="图\s*(\d+[^"]*)"', repl, s)

    # 3) 校验 1..N 连续
    nums = [int(x) for x in re.findall(r'caption="图 (\d+)', s2)]
    ok = nums == list(range(1, len(nums) + 1))
    print(
        "图片总数=%d  编号=%d..%d  连续=%s"
        % (len(nums), nums[0] if nums else 0, nums[-1] if nums else 0, ok)
    )

    if dry:
        print("（dry-run，未写回）")
        return

    if not ok:
        print("重排后仍不连续，已中止，未写回。")
        sys.exit(1)

    shutil.copyfile(p, p + ".bak")
    io.open(p, "w", encoding="utf-8", newline="\n").write(s2)
    print("已写回：%s（备份 %s.bak）" % (os.path.abspath(p), os.path.basename(p)))


if __name__ == "__main__":
    main()
