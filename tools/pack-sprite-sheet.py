#!/usr/bin/env python3
"""把各状态的裁剪帧打包成一张「按状态分区」的角色精灵图。

为什么要自己写这一步（而不是直接用 cutout.py 的 --canvas）：
`fit_canvas` 是**逐帧**按 alpha 包围盒等比缩放 + 居中，所以
- 站立（包围盒高）→ 放大到填满画布；
- 跨步跑 / 团身跳（包围盒矮）→ 又被放大到填满画布；
结果同一角色在不同状态里大小不一致，跑起来还会因为逐帧等比而上下弹。

本脚本改用**全表共用的单一缩放系数 + 脚底线对齐**：
1. 以 idle（直立）帧的包围盒中位数作为「角色站立高度」基准；
2. 所有状态、所有帧共用同一个缩放系数，身体大小天然一致；
3. 每帧包围盒的**底边**统一贴到同一 ground line，脚不会上下弹；
4. 水平按包围盒中心居中（与原始序列帧的做法一致）。

输出：cols × rows 的规则网格，行 = 状态，供 Phaser load.spritesheet 直接切。
"""

from __future__ import annotations

import argparse
import statistics
from pathlib import Path

from PIL import Image

STATES = ("idle", "run", "jump", "fall")


def bbox_of(image: Image.Image):
    return image.getchannel("A").getbbox()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("frames_dir", help="cutout.py sheet 产出的 <state>-NN.png 所在目录")
    ap.add_argument("output", help="输出合成精灵图路径")
    ap.add_argument("--cols", type=int, default=8, help="每状态帧数（=列数）")
    ap.add_argument("--layout", default="", help="各状态实际帧数，逗号分隔，如 8,8,4,4；"
                                                 "不足 cols 的行右侧留空帧")
    ap.add_argument("--cell", default="192x224", help="单帧画布，如 192x224")
    ap.add_argument("--ref-state", default="idle", help="作为站立高度基准的状态")
    ap.add_argument("--ref-height", type=int, default=160, help="基准状态缩放后的目标高度(px)")
    ap.add_argument("--ground", type=int, default=206, help="脚底线在单帧画布内的 y")
    args = ap.parse_args()

    cell_w, cell_h = (int(v) for v in args.cell.lower().split("x"))
    src_dir = Path(args.frames_dir)

    # 1) 收集各状态帧（文件名排序即帧序）。layout 可指定每状态只用前 N 帧，
    #    用于「模型补帧尺寸不一致时只取重绘的原姿势帧」。
    counts = [int(v) for v in args.layout.split(",")] if args.layout else [args.cols] * len(STATES)
    if len(counts) != len(STATES):
        raise SystemExit(f"--layout 需要 {len(STATES)} 个数，收到 {len(counts)}")
    used = dict(zip(STATES, counts))
    frames: dict[str, list[Path]] = {}
    for state in STATES:
        items = sorted(src_dir.glob(f"{state}-*.png"))
        if not items:
            raise SystemExit(f"缺少状态的帧: {state}")
        frames[state] = items[: used[state]]
    print("每行帧数:", ", ".join(f"{s}={len(frames[s])}" for s in STATES))

    # 2) 用基准状态（直立）的包围盒高度中位数定"站立高度"，得出全表统一缩放系数
    ref_heights = []
    for path in frames[args.ref_state]:
        bb = bbox_of(Image.open(path).convert("RGBA"))
        if bb:
            ref_heights.append(bb[3] - bb[1])
    ref_h = statistics.median(ref_heights)
    scale = args.ref_height / ref_h
    print(f"站立高度基准 {args.ref_state}: {ref_h:.0f}px (n={len(ref_heights)}) "
          f"-> 目标 {args.ref_height}px, 统一缩放 {scale:.4f}")

    # 3) 逐帧等比缩放 + 脚底线对齐 + 水平居中，贴进单帧画布
    out = Image.new("RGBA", (cell_w * args.cols, cell_h * len(STATES)), (0, 0, 0, 0))
    report = []
    for row, state in enumerate(STATES):
        for col, path in enumerate(frames[state]):
            im = Image.open(path).convert("RGBA")
            bb = bbox_of(im)
            if bb is None:
                raise SystemExit(f"空帧: {path}")
            im = im.crop(bb)
            new = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
            im = im.resize(new, Image.LANCZOS)
            x = col * cell_w + (cell_w - im.width) // 2
            y = row * cell_h + args.ground - im.height
            if x < col * cell_w or y < row * cell_h or x + im.width > (col + 1) * cell_w:
                raise SystemExit(f"帧超出画布: {path.name} {im.size}")
            out.alpha_composite(im, (x, y))
            report.append((state, col, im.width, im.height, args.ground - im.height))

    out.save(args.output)
    print(f"输出 {args.output}  {out.width}x{out.height}  "
          f"({args.cols}x{len(STATES)} 格, 单帧 {cell_w}x{cell_h})")

    # 4) 自检表：脚底线必须全表一致，同状态内高度不应大幅漂移
    print(f"{'state':6}{'frame':>6}{'w':>6}{'h':>6}{'top':>6}")
    for state in STATES:
        rows = [r for r in report if r[0] == state]
        tops = [r[4] for r in rows]
        hs = [r[3] for r in rows]
        for r in rows:
            print(f"{r[0]:6}{r[1]:>6}{r[2]:>6}{r[3]:>6}{r[4]:>6}")
        print(f"  -> {state}: 高度 {min(hs)}~{max(hs)} (极差 {max(hs)-min(hs)}px), "
              f"包围盒顶 y {min(tops)}~{max(tops)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
