#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_placeholder.py — 家宅装饰缺图标件统一占位图生成（任务书 #50 WP1，REQ-137）

依赖：pip install pillow
用法：
    python scripts/decor/make_placeholder.py [--size 128] [--out assets/decor-icons/_placeholder.png]

产物：深色底 + 金色问号 + 箱子剪影的单张 PNG，尺寸与正图一致（--size 与实测正图对齐）。
用途：decor_catalog 中 icon_file_id 为空的 41 件在前端统一引用本占位图，不做提取。
"""
import argparse
import os
from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', type=int, default=128)
    ap.add_argument('--out', default='assets/decor-icons/_placeholder.png')
    args = ap.parse_args()

    s = args.size
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 深色底（圆角观感用纯色矩形，暗色主题 #1a1d23 → #23262e 微渐变感：两层矩形）
    pad = max(2, s // 32)
    d.rectangle([pad, pad, s - pad - 1, s - pad - 1], fill=(26, 29, 35, 255))
    d.rectangle([pad, pad, s - pad - 1, s // 2], fill=(35, 38, 46, 255))
    # 金色描边
    gold = (200, 162, 60, 255)
    d.rectangle([pad, pad, s - pad - 1, s - pad - 1], outline=gold, width=max(1, s // 64))

    # 箱子剪影（中下）：箱体 + 箱盖 + 锁扣
    bw, bh = int(s * 0.46), int(s * 0.30)
    bx, by = (s - bw) // 2, int(s * 0.52)
    chest = (74, 60, 38, 255)
    chest_edge = (140, 112, 56, 255)
    d.rectangle([bx, by + bh // 4, bx + bw - 1, by + bh - 1], fill=chest, outline=chest_edge, width=max(1, s // 96))
    d.rectangle([bx, by, bx + bw - 1, by + bh // 4], fill=(88, 71, 44, 255), outline=chest_edge, width=max(1, s // 96))
    lw = max(2, s // 24)
    d.rectangle([s // 2 - lw // 2, by + bh // 8, s // 2 + lw // 2, by + bh // 8 + lw], fill=gold)

    # 金色问号（上半部居中，像素字体，5×7 放大）
    qmark = [
        " 111 ",
        "1   1",
        "    1",
        "   1 ",
        "  1  ",
        "     ",
        "  1  ",
    ]
    cell = max(2, s // 28)
    qw, qh = 5 * cell, 7 * cell
    qx, qy = (s - qw) // 2, int(s * 0.10)
    for r, row in enumerate(qmark):
        for c, ch in enumerate(row):
            if ch == '1':
                d.rectangle([qx + c * cell, qy + r * cell, qx + (c + 1) * cell - 1, qy + (r + 1) * cell - 1], fill=gold)

    out_dir = os.path.dirname(args.out)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    img.save(args.out)
    print(f'placeholder -> {args.out} ({s}x{s})')


if __name__ == '__main__':
    main()
