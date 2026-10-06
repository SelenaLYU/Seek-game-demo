#!/usr/bin/env python3
"""去掉抠图残留的洋红边（chroma spill / 洋红光晕）。

背景：本项目的精灵图多数是「洋红底生图 + 抠图」出来的。抠图会在角色轮廓上留下
一圈洋红（magenta）半透明/不透明的溢出像素，游戏里读作「角色身上有一圈紫光」。
本脚本把这一圈修掉，不动角色的正常像素：

1. 溢出像素判定：`spill = min(r, b) - g`，大于阈值即认为是洋红溢出。
2. 轮廓上的溢出：用最近的非溢出像素颜色补色（发丝/衣服颜色自然延伸到边上），
   同时按溢出强度把 alpha 收掉 —— 纯洋红的像素直接变透明，边缘变成角色本色的柔和过渡。
3. 轮廓内部的溢出（例如辫子里被紫光染到的实心像素）：只补色，不动 alpha，避免把身体打穿。
4. alpha≈0 的像素 RGB 清零，避免线性采样/缩图时再渗出紫边。

用法：
    python tools/despill.py <in.png> [out.png] [--threshold 20] [--keep-alpha-inside]
    python tools/despill.py --report <in.png>      # 只统计，不写文件
    python tools/despill.py <dir>                  # 批量处理目录下所有 png
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

KEY_MAX_SPILL = 255.0
ALPHA_SOURCE_MIN = 32


def _load(path: Path) -> Image.Image:
    im = Image.open(path)
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    return im


def _mask_from_alpha(arr: np.ndarray, alpha: np.ndarray, spill: np.ndarray, thr: float) -> np.ndarray:
    """洋红溢出掩膜：只看 alpha > 0 的像素。"""
    return (spill > thr) & (alpha > 0)


def despill(img: Image.Image, threshold: float = 20.0, keep_alpha_inside: bool = True) -> tuple[Image.Image, dict]:
    arr = np.asarray(img).astype(np.int16)
    rgb = arr[..., :3]
    alpha = arr[..., 3]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    spill = np.minimum(r, b) - g
    mask = _mask_from_alpha(arr, alpha, spill, threshold)
    stats = {
        "pixels": int(mask.sum()),
        "opaque": int((mask & (alpha >= 200)).sum()),
        "semi": int((mask & (alpha < 200)).sum()),
    }
    if not mask.any():
        return img.copy(), stats

    keyness = np.clip(spill.astype(np.float32) / KEY_MAX_SPILL, 0.0, 1.0)

    # —— 需要用来补色的「干净」像素：不带溢出、且本身有实色 ——
    clean = (~mask) & (alpha >= ALPHA_SOURCE_MIN)
    if not clean.any():  # 极端情况：整张都是溢出像素，退回去饱和
        out = rgb.copy()
        out[..., 0] = np.clip(r - spill, 0, 255)
        out[..., 2] = np.clip(b - spill, 0, 255)
        res = np.concatenate([out, alpha[..., None]], axis=-1).astype(np.uint8)
        stats["inside"] = 0
        return Image.fromarray(res, "RGBA"), stats

    # 形体内部（被轮廓包住）的溢出像素：只补色、保留 alpha
    solid = ndimage.binary_fill_holes(clean)
    inside = mask & solid & keep_alpha_inside
    stats["inside"] = int(inside.sum())

    # 最近干净像素的颜色（EDT 的 return_indices 直接给出最近邻坐标）
    _, (iy, ix) = ndimage.distance_transform_edt(~clean, return_indices=True)
    filled = rgb[iy, ix].astype(np.int16)

    # 溢出像素一律换成「最近干净像素」的颜色：洋红是外来污染，角色配色里没有任何一种
    # （发棕、肤暖、衣奶白、裤青）会落在洋红判定里，所以直接换色比“去饱和”更安全。
    out_rgb = rgb.copy()
    out_rgb[mask] = filled[mask]

    out_alpha = alpha.astype(np.float32)
    rim = mask & ~inside
    out_alpha[rim] = alpha[rim].astype(np.float32) * (1.0 - keyness[rim])
    out_alpha = np.clip(out_alpha, 0, 255)

    # 兜底：换色是逐像素的，边缘处可能还剩一丁点洋红盈余 → 直接减掉，保证整张图 0 溢出。
    # 角色正常配色不可能命中这个条件（暖色系 b<g、青绿系 b<g、奶白系 r≈g≈b）。
    excess = np.minimum(out_rgb[..., 0], out_rgb[..., 2]) - out_rgb[..., 1]
    drop = np.clip(excess, 0, None)
    out_rgb[..., 0] = out_rgb[..., 0] - drop
    out_rgb[..., 2] = out_rgb[..., 2] - drop

    # 边缘已经收掉的、以及本来就几乎透明的像素：RGB 清零
    dead = out_alpha < 4
    out_rgb[dead] = 0
    out_alpha[dead] = 0

    res = np.concatenate([out_rgb.astype(np.uint8), out_alpha.astype(np.uint8)[..., None]], axis=-1)
    return Image.fromarray(res, "RGBA"), stats


def _iter_inputs(p: Path) -> list[Path]:
    if p.is_dir():
        return sorted(x for x in p.glob("*.png") if not x.name.startswith("."))
    return [p]


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="去掉洋红抠图残留/光晕")
    ap.add_argument("input", type=Path)
    ap.add_argument("output", type=Path, nargs="?")
    ap.add_argument("--threshold", type=float, default=20.0, help="溢出判定阈值，默认 20")
    ap.add_argument("--report", action="store_true", help="只统计，不写文件")
    args = ap.parse_args(argv)

    inputs = _iter_inputs(args.input)
    if not inputs:
        print(f"没有找到 png: {args.input}", file=sys.stderr)
        return 1

    for src in inputs:
        if args.report:
            dst = None
        elif args.output is None:
            dst = src.with_name(f"{src.stem}-despilled.png")
        elif args.input.is_dir():
            args.output.mkdir(parents=True, exist_ok=True)
            dst = args.output / src.name
        else:
            dst = args.output

        img = _load(src)
        out, stats = despill(img, args.threshold)
        if dst is not None:
            out.save(dst)
        print(
            f"{src.name}: 溢出像素 {stats['pixels']}（实心 {stats['opaque']} / 半透明 {stats['semi']}，"
            f"内部 {stats.get('inside', 0)}）" + (f" -> {dst}" if dst else "")
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
