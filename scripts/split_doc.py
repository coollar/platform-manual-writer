#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按「顶层块」把飞书 DocxXML 切成若干段，供分段推送（overwrite + append）。

用途：顶层块很多的大文档（实测 457 块 / 104 图）一次性 `docs +update --command overwrite`
会让**服务端**超时（network/timeout），且服务端可能已部分写入导致内容错位。
解法是把文档切段：首段 overwrite，其余 append。

关键保证：脚本用深度扫描找出所有顶层块，段的边界为「段首块起点 → 下一段首块起点」，
因此**各段拼接严格等于源文件**（含块间空白）——脚本内断言这一点，不成立就报错退出，
确保切分不会静默丢内容。

用法：
    python split_doc.py draft.xml                 # 默认每段 120 个顶层块，输出到 ./segments
    python split_doc.py draft.xml -p 80 -o out    # 自定义每段块数与输出目录
    python split_doc.py draft.xml --json          # 仅输出 manifest JSON（不写文件）

推荐的推送顺序（切出的段天然有序）：
    lark-cli docs +update --doc <token> --command overwrite --content "@./out/seg_01.xml"
    for f in out/seg_*.xml; do ... append ...; done   # seg_01 跳过
"""
import argparse
import json
import os
import re
import sys


def top_level_spans(text):
    """返回 [(start, end), ...]，每个元素是一个顶层块的字符区间，按出现顺序。"""
    res, depth, i, n, start = [], 0, 0, len(text), None
    while i < n:
        if text[i] != '<':
            i += 1
            continue
        if text.startswith('<!--', i):
            j = text.find('-->', i)
            if j == -1:
                break
            i = j + 3
            continue
        if text.startswith('<![CDATA[', i):
            j = text.find(']]>', i)
            if j == -1:
                break
            i = j + 3
            continue
        j, q = i + 1, None
        while j < n:
            c = text[j]
            if q:
                if c == q:
                    q = None
            elif c in '"\'':
                q = c
            elif c == '>':
                break
            j += 1
        tag = text[i:j + 1]
        is_end = tag.startswith('</')
        is_self = (not is_end) and tag[:-1].rstrip().endswith('/')
        if is_end:
            depth -= 1
            if depth == 0:
                res.append((start, j + 1))
                start = None
        else:
            if depth == 0:
                start = i
                if is_self:
                    res.append((start, j + 1))
                    start = None
                else:
                    depth += 1
            elif not is_self:
                depth += 1
        i = j + 1
    return res


def brief(frag, width=44):
    m = re.match(r'<([a-zA-Z][\w-]*)', frag)
    tag = m.group(1) if m else '?'
    txt = re.sub(r'<[^>]+>', '', frag)
    txt = re.sub(r'\s+', ' ', txt).strip()[:width]
    return '%s | %s' % (tag, txt)


def main(argv=None):
    ap = argparse.ArgumentParser(description='把 DocxXML 按顶层块切段，供分段推送')
    ap.add_argument('src', help='源 XML 文件路径')
    ap.add_argument('-p', '--per', type=int, default=120, help='每段最多包含的顶层块数（默认 120）')
    ap.add_argument('-o', '--out', default='segments', help='输出目录（默认 ./segments）')
    ap.add_argument('--json', action='store_true', help='只打印 manifest JSON，不写文件')
    args = ap.parse_args(argv)

    s = open(args.src, encoding='utf-8').read()
    spans = top_level_spans(s)
    if not spans:
        print('未找到任何顶层块，请确认输入是 DocxXML。', file=sys.stderr)
        return 2

    segs, cur = [], []
    for sp in spans:
        cur.append(sp)
        if len(cur) >= args.per:
            segs.append(cur)
            cur = []
    if cur:
        segs.append(cur)

    manifest = []
    texts = []
    for idx, grp in enumerate(segs):
        a = grp[0][0]
        b = segs[idx + 1][0][0] if idx + 1 < len(segs) else len(s)
        txt = s[a:b]
        texts.append(txt)
        manifest.append({
            'index': idx + 1,
            'blocks': len(grp),
            'chars': len(txt),
            'head': brief(txt[:200]),
            'tail': brief(txt[-200:]),
        })

    if ''.join(texts) != s:
        print('切分校验失败：各段重组与源文件不一致（有遗漏或重叠），未写盘。', file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return 0

    os.makedirs(args.out, exist_ok=True)
    for idx, txt in enumerate(texts, 1):
        p = os.path.join(args.out, 'seg_%02d.xml' % idx)
        open(p, 'w', encoding='utf-8').write(txt)
        manifest[idx - 1]['file'] = p
    open(os.path.join(args.out, 'manifest.json'), 'w', encoding='utf-8').write(
        json.dumps(manifest, ensure_ascii=False, indent=2))

    print('顶层块总数 %d → %d 段（每段 ≤%d 块），已写入 %s/'
          % (len(spans), len(segs), args.per, args.out))
    for m in manifest:
        print('  %-16s %3d 块 %6d 字符  首:%s' % (m['file'], m['blocks'], m['chars'], m['head']))
    print('\n推送：首段用 --command overwrite，其余依次用 --command append。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
