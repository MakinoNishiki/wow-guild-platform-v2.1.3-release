#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
resize_icons.py — 家宅装饰原生图标 → 128×128 终版压缩入库（任务书 #50 WP1，REQ-137）

依赖：pip install pillow
用法：
    tools/python/python.exe scripts/decor/resize_icons.py [--size 128]

输入：
    scripts/decor/out/icons-native/{fileID}.png    export_icons.js 导出的原生 PNG（400×400）
    scripts/decor/out/icons_manifest.json          导出清单（终版尺寸/字节回写于此）

产物：
    assets/decor-icons/{fileID}.png                128×128 LANCZOS 压缩 PNG（入 git，案 A）
    scripts/decor/out/icons_manifest.json          files[fileID] 增补 final_size/final_bytes

增量：manifest 已含 final_bytes 且目标 PNG 在盘上即跳过，重跑零重写。
说明：原生全量实测 87.0MB 超 50MB 红线，终版统一压 128×128（任务书：过大压一遍、
过小不拉申；本批原生 400×400 共 2000 件压缩、21 件原生 128×128 原样落盘不拉申）。
原生件留 scripts/decor/out/icons-native/（产物目录 gitignore 不入库），可复跑再生。
"""
import argparse
import json
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
NATIVE_DIR = os.path.join(ROOT, 'scripts/decor/out/icons-native')
FINAL_DIR = os.path.join(ROOT, 'assets/decor-icons')
MANIFEST = os.path.join(ROOT, 'scripts/decor/out/icons_manifest.json')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', type=int, default=128)
    args = ap.parse_args()

    with open(MANIFEST, encoding='utf-8') as f:
        manifest = json.load(f)

    os.makedirs(FINAL_DIR, exist_ok=True)
    done = skipped = missing = 0
    total_bytes = 0
    for file_id, entry in manifest['files'].items():
        final_path = os.path.join(FINAL_DIR, file_id + '.png')
        if entry.get('final_bytes') and os.path.exists(final_path):
            skipped += 1
            total_bytes += entry['final_bytes']
            continue
        src = os.path.join(NATIVE_DIR, file_id + '.png')
        if not os.path.exists(src):
            print(f'[resize] 缺原生件，跳过：{file_id}')
            missing += 1
            continue
        im = Image.open(src)
        if im.width <= args.size and im.height <= args.size:
            im.save(final_path, 'PNG', optimize=True)  # 原生不大于目标：不拉申，原样落盘
        else:
            im.resize((args.size, args.size), Image.LANCZOS).save(final_path, 'PNG', optimize=True)
        entry['final_size'] = min(args.size, im.width)
        entry['final_bytes'] = os.path.getsize(final_path)
        total_bytes += entry['final_bytes']
        done += 1
        if done % 200 == 0:
            print(f'[resize] 进度 {done}')
            with open(MANIFEST, 'w', encoding='utf-8') as f:
                json.dump(manifest, f, indent=1, ensure_ascii=False)

    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
    print(f'[resize] 完成：新压 {done}，跳过 {skipped}，缺原生 {missing}，'
          f'终版总体积 {total_bytes/1024/1024:.1f} MB（{len(manifest["files"])} 件）')


if __name__ == '__main__':
    main()
