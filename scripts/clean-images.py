# =============================================================================
# 去除主站商品图上的 "LOTTE Mart" 水印（安全页必须无品牌）
#
# 原理：水印是固定的一行浅灰半透明文字，纵向固定在约 y=192..218 / 300px。
#   1) 用「局部中值 - 原值」的浅色细笔画响应 + 低饱和度，圈出水印笔画
#   2) 对命中像素做扩散修补（只填细笔画，商品主体细节保留）
#   3) 多轮递进（阈值 2.5 → 1.5 → 0.9），逐层淡化残影
#
# 用法： python scripts/clean-images.py [--dry]
# 输出： site/assets/safe/*.webp（原地覆盖；原图备份 raw/safe-orig/）
# =============================================================================
import glob
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'site', 'assets', 'safe')
ORIG_DIR = os.path.join(ROOT, 'raw', 'safe-orig')

BAND = (188, 222)          # 水印行范围（含余量）
PASSES = (2.5, 1.6, 1.0)  # 递进阈值
ITERS = 220


def masks(gray_img, sat, med, thr):
    d = med - gray_img
    m = np.zeros(gray_img.shape, bool)
    y0, y1 = BAND
    m[y0:y1, :] = (d[y0:y1, :] > thr) & (d[y0:y1, :] < 48) & (sat[y0:y1, :] < 18)
    return m


def diffuse(g, m, iters=ITERS):
    img = g.copy()
    if not m.any():
        return img
    img[m] = img[~m].mean()
    for _ in range(iters):
        pad = np.pad(img, 1, mode='edge')
        avg = (pad[:-2, 1:-1] + pad[2:, 1:-1] + pad[1:-1, :-2] + pad[1:-1, 2:]) / 4.0
        img = np.where(m, avg, img)
    return img


def clean(path, dry=False):
    im = Image.open(path).convert('RGB')
    rgb = np.asarray(im).astype(np.float32)
    total = 0
    for thr in PASSES:
        g = rgb.mean(axis=2)
        sat = rgb.max(axis=2) - rgb.min(axis=2)
        med = np.asarray(Image.fromarray(g.astype(np.uint8)).filter(ImageFilter.MedianFilter(9))).astype(np.float32)
        m = masks(g, sat, med, thr)
        # 膨胀 1px，避免笔画边缘残留
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 127
        n = int(m.sum())
        total += n
        if dry or n == 0:
            continue
        for c in range(3):
            rgb[:, :, c] = diffuse(rgb[:, :, c], m)
    return rgb, total


def main(dry=False):
    only = [a for a in sys.argv[1:] if not a.startswith('-')]
    os.makedirs(ORIG_DIR, exist_ok=True)
    for path in sorted(glob.glob(os.path.join(SRC_DIR, '*.webp'))):
        name = os.path.basename(path)
        if name.startswith('_'):
            continue
        if only and name.rsplit('.', 1)[0] not in only:
            continue
        rgb, n = clean(path, dry)
        print(f'[{"plan" if dry else "fix "}] {name:14s} px={n:6d}')
        if dry:
            continue
        bak = os.path.join(ORIG_DIR, name)
        if not os.path.exists(bak):
            shutil.copy2(path, bak)
        Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(path, 'WEBP', quality=92, method=6)
    print('\ndone')


if __name__ == '__main__':
    main('--dry' in sys.argv)
