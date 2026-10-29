#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check_doc.py —— 飞书手册 XML 结构机械检查

用法：
    python check_doc.py <draft.xml> [--base <资源基目录>] [--url-whitelist <正则>]

检查项：
    - H1/H2/H3 结构与顺序
    - **H1/H2/H3 是否都带 seq="auto"（飞书原生自动编号，缺则为硬错误）**
    - 版本号提取（V1.x / V2.x）
    - 重名 H2（飞书大纲跳转分不清，警告）
    - 图号（caption="图 N"）是否 1..N 连续、无跳重
    - **图注是否带圆形序号枚举「：1 …，2 …」（提示，图内标注靠 capture_lib 的 n 保证）**
    - 表格 / 画板 / 图片标签计数
    - 图片与画板引用的资源文件是否存在
    - URL 残留（列出全部，白名单外的需人工确认）
    - 未转义的裸尖括号风险
    - 有序列表续号（li seq）统计 + 多列表小节编号衔接提示

退出码：0=全部通过；1=存在硬错误（图号不连续 / 资源缺失 / 裸尖括号 / **标题缺 seq="auto"**）
"""
import io
import os
import re
import sys
from collections import defaultdict

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def main():
    args = list(sys.argv[1:])
    if not args:
        print(__doc__)
        sys.exit(2)
    P = args[0]
    base = "."
    url_whitelist = None
    for i, a in enumerate(args):
        if a == "--base" and i + 1 < len(args):
            base = args[i + 1]
        if a == "--url-whitelist" and i + 1 < len(args):
            url_whitelist = args[i + 1]

    s = io.open(P, encoding="utf-8").read()
    lines = s.split("\n")
    hard_error = False

    print("=== 文件 ===", os.path.abspath(P))
    print("=== 总字符数 ===", len(s))

    # ---------- 版本号 ----------
    vers = sorted(set(re.findall(r"V(\d+)\.(\d+)", s)), key=lambda x: (int(x[0]), int(x[1])))
    print("\n=== 版本号（去重）===", ["V%s.%s" % v for v in vers] if vers else "未找到")

    h1 = re.findall(r"<h1[^>]*>(.*?)</h1>", s)
    h2 = re.findall(r"<h2[^>]*>(.*?)</h2>", s)
    h3 = re.findall(r"<h3[^>]*>(.*?)</h3>", s)
    print("\n=== H1 顺序（%d 个）===" % len(h1))
    for i, t in enumerate(h1, 1):
        print("  %d. %s" % (i, t))
    print("\n=== H2（%d 个）===" % len(h2))
    for t in h2:
        print("  -", t)
    if h3:
        print("\n=== H3（%d 个）===" % len(h3))
        for t in h3:
            print("  -", t)

    # ---------- 标题级序号（seq="auto"） ----------
    print('\n=== 标题级序号（seq="auto"）===')
    hd = re.findall(r"<h([123])([^>]*)>(.*?)</h\1>", s, re.S)
    hd_no = [
        (lv, re.sub(r"<[^>]+>", "", tx).strip())
        for lv, at, tx in hd
        if 'seq="auto"' not in at
    ]
    print('  H1/H2/H3 总数:', len(hd), ' 带 seq="auto":', len(hd) - len(hd_no))
    if hd_no:
        hard_error = True
        print('  !! %d 个标题缺 seq="auto"，飞书不会给它们自动编号：' % len(hd_no))
        for lv, tx in hd_no[:30]:
            print("     H%s  %s" % (lv, tx[:40]))
        if len(hd_no) > 30:
            print("     ...（其余 %d 个略）" % (len(hd_no) - 30))
        print('  修法：把 <hN> 改成 <hN seq="auto">，飞书渲染为「1.」「1.1」级序号。')
    else:
        print('  全部标题都带 seq="auto"')

    # ---------- 重名 H2 ----------
    d2 = defaultdict(list)
    for i, l in enumerate(lines, 1):
        m = re.search(r"<h2[^>]*>(.*?)</h2>", l)
        if m:
            d2[m.group(1)].append(i)
    dup2 = {k: v for k, v in d2.items() if len(v) > 1}
    print("\n=== 重名 H2 ===")
    if dup2:
        for k, v in dup2.items():
            print("  「%s」 x%d  行 %s" % (k, len(v), v))
        print("  （飞书大纲跳转分不清，建议加限定词）")
    else:
        print("  无")

    # ---------- 图号 ----------
    caps = re.findall(r'caption="([^"]*)"', s)
    nums = []
    nonstd = []
    for c in caps:
        m = re.match(r"图\s*(\d+)", c)
        if m:
            nums.append(int(m.group(1)))
        else:
            nonstd.append(c)
    print("\n=== 图（%d 张）===" % len(caps))
    print("  图号序列:", nums)
    if nonstd:
        print("  未编号 caption:", nonstd)
    exp = list(range(1, len(nums) + 1))
    cont = nums == exp
    print("  连续且从1开始:", cont)
    if not cont:
        hard_error = True
        for i, (a, b) in enumerate(zip(nums, exp)):
            if a != b:
                print("  第一处不符：第%d项 期望%d 实际%d" % (i + 1, b, a))
                break
        if len(nums) != len(exp):
            print("  数量不符：实际 %d 张" % len(nums))

    # ---------- 图注是否带序号枚举 ----------
    enum = [c for c in caps if re.search(r"[：:]\s*1[\s　、,，]|[：:]\s*1[^\d\s]", c)]
    print("\n=== 图注序号枚举（提示，非错误）===")
    print("  含「：1 …，2 …」式枚举的图注: %d/%d" % (len(enum), len(caps)))
    if caps and len(enum) < len(caps):
        for c in caps:
            if c not in enum:
                print("  ⚠ 未含序号枚举:", c.replace("&#xA;", " ")[:60])
        if enum:
            print("  （本册多数图采用枚举式图注，上面这些图注与图上的圆形序号对不上，建议补齐）")
        else:
            print("  （本册未采用枚举式图注，可忽略；但图内标注仍应带 capture_lib 的 n 序号）")

    print("\n=== 表格数 ===", s.count("<table>"))
    print("=== 画板数 ===", s.count("<whiteboard"))
    print("=== 图片标签数 ===", s.count("<img "))
    print("=== callout 数 ===", s.count("<callout"))

    # ---------- 有序列表编号 ----------
    seq_cnt = len(re.findall(r'<li\s+seq="', s))
    print("\n=== 有序列表续号 li seq= 次数 ===", seq_cnt)

    # 按 H2 分块模拟编号，找出"多列表且编号不衔接"的小节
    cur_ctx = ""
    blocks = defaultdict(list)  # ctx -> [ [seq or None, ...], ... ]
    inb = False
    cur = []
    for l in lines:
        m = re.match(r"<h2[^>]*>(.*?)</h2>", l)
        if m:
            cur_ctx = m.group(1)
        if l.strip() == "<ol>":
            inb = True
            cur = []
        elif inb and l.strip() == "</ol>":
            inb = False
            blocks[cur_ctx].append(cur)
        elif inb:
            mi = re.match(r'<li(?:\s+seq="(\d+)")?>', l)
            if mi:
                cur.append(int(mi.group(1)) if mi.group(1) else None)
    warn = []
    for ctx, bs in blocks.items():
        if len(bs) < 2:
            continue
        cursor = 1
        ok = True
        for b in bs:
            start = b[0] if b[0] is not None else 1
            if start != cursor:
                ok = False
            cursor = start + len(b)
        if not ok:
            warn.append((ctx, bs))
    print("\n=== 多列表小节编号衔接（提示，非错误）===")
    if warn:
        for ctx, bs in warn:
            starts = [(b[0] if b[0] is not None else 1) for b in bs]
            print("  ⚠ 「%s」各块起始号 %s —— 若本属同一条流程，需给续接块首项加 seq=\"N\"" % (ctx, starts))
    else:
        print("  无（各多列表小节编号均衔接，或均为独立清单）")

    # ---------- URL ----------
    urls = re.findall(r"""https?://[^\s"'<>）)]+""", s)
    print("\n=== 全部 URL ===")
    for u in sorted(set(urls)):
        flag = ""
        if url_whitelist and not re.search(url_whitelist, u):
            flag = "   <-- 白名单外，请确认"
        print("  ", u, flag)

    # ---------- 裸尖括号 ----------
    print("\n=== 潜在裸尖括号 ===")
    bad_angle = 0
    for i, l in enumerate(lines, 1):
        if re.search(r"<[^a-zA-Z/!]", l) and "&lt;" not in l:
            print("  L%d: %s" % (i, l[:140]))
            bad_angle += 1
    if bad_angle:
        hard_error = True
        print("  共 %d 处" % bad_angle)
    else:
        print("  无")

    # ---------- 资源存在性 ----------
    print("\n=== 图片/画板文件存在性（基准 %s）===" % os.path.abspath(base))
    missing = []
    for pth in re.findall(r'path="@([^"]+)"', s):
        rel = pth[2:] if pth.startswith("./") else pth
        fp = os.path.normpath(os.path.join(base, rel))
        if not os.path.exists(fp):
            missing.append(fp)
    total = len(re.findall(r'path="@', s))
    print("  引用总数:", total)
    print("  缺失:", missing if missing else "无（全部齐备）")
    if missing:
        hard_error = True

    print("\n=== 结论 ===")
    print("  硬错误:", "有（见上）" if hard_error else "无")
    sys.exit(1 if hard_error else 0)


if __name__ == "__main__":
    main()
