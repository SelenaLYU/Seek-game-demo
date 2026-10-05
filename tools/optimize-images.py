#!/usr/bin/env python3
"""把运行时真正会加载的美术图转成 WebP，显著压缩首包与切场景时延。

为什么需要它（实测数据见 HANDOFF 的性能小节）：
  · dist 里最大的几项都是 PNG：房间背景 2.8MB、海边背景 2.65MB、
    鱼缸/录音机 2.5MB×2、书桌 1.86MB…首屏与切场景都要等这些图解码。
  · 水彩风格对有损压缩很友好：q82 下视觉几乎无损，体积能降 60%~80%。

规则（重要，改动别越界）：
  1. **不删原 PNG**。PNG 仍是美术真源与测试取样对象
     （tests/levelOneLayout.test.mjs 逐列读礁石 PNG 的 alpha 顶面）。
  2. **角色三套序列帧不转**。128×160 的小图逐帧是硬边美术，有损会糊帧、
     破坏掉色键与逐帧对齐；收益（670KB）也不值得冒这个风险。
  3. 脚本可重复运行：已存在且比源 PNG 新时跳过；加 --force 重转。
  4. 每次运行打印 before/after 体积对比，便于回填文档。

用法：
  /usr/bin/python3 tools/optimize-images.py           # 生成 webp
  /usr/bin/python3 tools/optimize-images.py --report  # 只看体积报告
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 运行时通过 Vite import 或 Phaser 字面路径真正加载的图（= 会进 dist 的图）。
# 不含角色序列帧（见文件头规则 2），也不含测试专用取样图。
RUNTIME_IMAGES: tuple[str, ...] = (
    # —— 第一关：海边 ——
    "scene/level1-watercolor-game-background-v1-1900x540.png",
    "assets/level1/level1-stepping-reef-v1.png",
    "assets/level1/level1-swing-seagull-v3-cute.png",
    "assets/level1/level1-jump-wave-crest-v2.png",
    "assets/level1/level1-golden-jasmine-key-v1.png",
    "assets/level1/level1-memory-room-stone-door-v3.png",
    # —— 第一关：回忆结尾（序章→海边→记忆之房→贝壳回忆）——
    "assets/story/chapter1-family-photo-seaside.png",
    # —— 第一关：记忆之房 ——
    "scene/level1-memory-room-night-empty-v2-1920x1080.png",
    "assets/environment/room-vintage-cassette-recorder-perspective-v1.png",
    "assets/items/room-fairytale-book-perspective-v1.png",
    "assets/environment/room-photo-frame-perspective-v1.png",
    "assets/environment/room-lockbox-closed-perspective-v1.png",
    "assets/environment/room-lockbox-open-empty-perspective-v1.png",
    "assets/items/room-flashlight-battery-perspective-v1.png",
    "assets/environment/room-hermit-crab-aquarium-perspective-v1.png",
    "assets/environment/room-wall-drawing-incomplete.png",
    "assets/environment/room-wall-drawing-complete.png",
    "assets/environment/room-flashlight-off.png",
    "assets/environment/room-flashlight-on.png",
    "assets/items/room-paint-brush.png",
    # —— 房间 DOM 面板用到的图（RadioPuzzleUI / RoomInteractionCopy / RoomDeskPopup / ShadowBoatPuzzleUI）
    "assets/environment/room-vintage-cassette-recorder-v1.png",
    "assets/environment/room-hermit-crab-aquarium-v1.png",
    "assets/environment/room-desk-decorated-empty-slots-v1.png",
    "assets/environment/room-desk-with-shadow-boat-props-v1.png",
    "assets/environment/room-shadow-pencil-case.png",
    "assets/environment/room-shadow-triangle-ruler.png",
    "assets/environment/room-shadow-pencil.png",
    "assets/environment/room-wall-boat.png",
    # —— 记忆之房后续补的美术（2026-10-02~05 加进代码，当时漏登记，房间因此多传 15.7MB PNG）——
    # 记一条教训：这份清单是**手维护**的，新图进代码就必须在这里补一行，
    # 否则 resolveImageUrl 找不到同名 webp 就安静回落到 PNG，性能问题不会让任何测试变红。
    "assets/environment/interactive-family-zoo-photo-frame-384x256.png",
    "assets/environment/interactive-vintage-radio-384x256.png",
    "assets/environment/room-lockbox-closed-v1.png",
    "assets/environment/room-lockbox-open-battery-v1.png",
    "assets/items/room-fairytale-book-v1.png",
    "assets/items/room-flashlight-battery-v1.png",
    "assets/items/room-memory-pearl-shell-v1.png",
    # 碎片 HUD 的 168px 贝壳图标（DOM 层，PNG 已很小；仍登记以便统一走同一套体积报告）
    "assets/items/room-memory-pearl-shell-hud-v1.png",
    # —— 第二关：夜骑楼挑战（ChapterTwoChallengeScene 的 35 张 literal load.image）——
    # 这批图 2026-10-04 入库时没登记，第二关进场一次传 11.9MB PNG；
    # 登记后走 resolveImageUrl 的同名 webp，落到 ~1MB。
    "assets/level2/night-v1/background-night.png",
    "assets/level2/night-v1/c01.png",
    "assets/level2/night-v1/c02.png",
    "assets/level2/night-v1/c03.png",
    "assets/level2/night-v1/c04.png",
    "assets/level2/night-v1/c05.png",
    "assets/level2/night-v1/c06.png",
    "assets/level2/night-v1/c07.png",
    "assets/level2/night-v1/c08.png",
    "assets/level2/night-v1/c09.png",
    "assets/level2/night-v1/c10.png",
    "assets/level2/night-v1/door.png",
    "assets/level2/night-v1/h01.png",
    "assets/level2/night-v1/h02.png",
    "assets/level2/night-v1/h03.png",
    "assets/level2/night-v1/h04.png",
    "assets/level2/night-v1/h05.png",
    "assets/level2/night-v1/h06.png",
    "assets/level2/night-v1/h07.png",
    "assets/level2/night-v1/h08.png",
    "assets/level2/night-v1/h09.png",
    "assets/level2/night-v1/old-banknote.png",
    "assets/level2/night-v1/p01.png",
    "assets/level2/night-v1/p02.png",
    "assets/level2/night-v1/p03.png",
    "assets/level2/night-v1/p04.png",
    "assets/level2/night-v1/p05.png",
    "assets/level2/night-v1/p06.png",
    "assets/level2/night-v1/p07.png",
    "assets/level2/night-v1/p08.png",
    "assets/level2/night-v1/p09.png",
    "assets/level2/night-v1/s01.png",
    "assets/level2/night-v1/s02.png",
    "assets/level2/night-v1/teacher.png",
    "assets/level2/night-v1/w01.png",
    # —— 第二关素材审查面板（AssetReviewOverlay 按需逐张打开；不在玩家进场关键路径）——
    # 这 12 张由审查面板展示，统一走 resolveImageUrl；母版仍保留 PNG 真源。
    "assets/scenes/chapter2/chapter2-convenience-store-stocked-night-v3-style-corrected-1920x1080.png",
    "assets/level2/convenience-store/interactive/story-props-master-v1.png",
    "assets/level2/convenience-store/interactive/puzzle-goods-caps-master-v1.png",
    "assets/level2/convenience-store/interactive/collection-and-snack-master-v1.png",
    "assets/level2/convenience-store/optional/growth-marks-observation-master-v3-wonky-chalk-handwriting.png",
    "assets/level2/convenience-store/optional/optional-observation-props-master-v1.png",
    "assets/level2/convenience-store/optional/lilei-shelf-hide-states-white-shirt-floral-shorts-v1.png",
    "assets/scenes/chapter2/chapter2-qilou-water-town-background-hd-7360x2200.png",
    "assets/level2/qilou/chapter2-platform-tiles-4x2.png",
    "assets/level2/qilou/chapter2-cover-modules-5x2.png",
    "assets/level2/qilou/chapter2-static-obstacles-3x3.png",
    "assets/level2/qilou/chapter2-dynamic-goal-modules-4x2.png",
)

# 有透明通道的道具统一用更高的 q（alpha 边缘更容易被抹），背景/实拍用低一档即可。
LARGE_BG = 1_000_000  # 源文件 ≥1MB 视为大图（背景/柜面），q82


@dataclass
class Result:
    src: Path
    out: Path
    src_bytes: int
    out_bytes: int
    written: bool

    @property
    def ratio(self) -> float:
        return 1 - (self.out_bytes / self.src_bytes if self.src_bytes else 0)


def to_webp(src: Path, out: Path, lossless: bool, quality: int) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    args = ["cwebp", "-quiet"]
    if lossless:
        args += ["-lossless", "-z", "9"]
    else:
        args += ["-q", str(quality), "-m", "6", "-alpha_q", "100"]
    args += [str(src), "-o", str(out)]
    if subprocess.run(args, capture_output=True).returncode != 0:
        raise SystemExit(f"cwebp 失败: {src}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", action="store_true", help="只统计，不写文件")
    parser.add_argument("--force", action="store_true", help="忽略时间戳，强制重转")
    parser.add_argument(
        "--check",
        action="store_true",
        help="只体检：缺 webp / webp 比 PNG 旧 就退出码 1（不写文件；不需要 cwebp）",
    )
    args = parser.parse_args()

    if not args.report and not args.check and subprocess.run(["which", "cwebp"], capture_output=True).returncode != 0:
        print("缺少 cwebp（brew install webp）", file=sys.stderr)
        return 1

    results: list[Result] = []
    missing: list[str] = []
    stale: list[str] = []
    for rel in RUNTIME_IMAGES:
        src = ROOT / rel
        if not src.exists():
            missing.append(rel)
            continue
        out = src.with_suffix(".webp")
        # webp 比 PNG 旧 = 美术改过但没重跑本脚本：resolveImageUrl 会继续柄旧图，静默发错
        if out.exists() and out.stat().st_mtime < src.stat().st_mtime:
            stale.append(rel)
        write = not args.report and not args.check
        if write and not args.force and out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
            write = False
        if write:
            to_webp(src, out, lossless=False, quality=82 if src.stat().st_size < LARGE_BG else 82)
        if not out.exists():
            # report / check 模式下首次运行还没生成过 webp，体积按 0 记
            out_bytes = 0
        else:
            out_bytes = out.stat().st_size
        results.append(Result(src, out, src.stat().st_size, out_bytes, write and out_bytes > 0))

    rows = sorted(results, key=lambda r: r.src_bytes - r.out_bytes, reverse=True)
    total_src = sum(r.src_bytes for r in rows)
    total_out = sum(r.out_bytes for r in rows)
    print(f"{'图（相对仓库根）':<62} {'PNG':>10} {'WebP':>10} {'省':>7}")
    for r in rows:
        print(f"{r.src.relative_to(ROOT)!s:<62} {r.src_bytes/1024:>9.0f}K {r.out_bytes/1024:>9.0f}K {r.ratio*100:>6.1f}%")
    if total_src:
        print("-" * 94)
        print(f"{'合计':<62} {total_src/1024/1024:>9.2f}M {total_out/1024/1024:>9.2f}M {(1-total_out/total_src)*100:>6.1f}%")
    if missing:
        print(f"\n⚠️ 源文件缺失（跳过 {len(missing)} 个）: {', '.join(missing)}")
    if stale:
        print(
            f"\n⚠️ WebP 比 PNG 旧（美术改过但没重跑脚本，运行时会发旧图）: "
            f"{', '.join(stale)}\n   修法：/usr/bin/python3 tools/optimize-images.py",
        )
    if args.check:
        ok = not missing and not stale
        print("✅ 体检通过：清单内全部图都有比 PNG 新的 WebP" if ok else "❌ 体检不通过（见上）")
        return 0 if ok else 1
    if args.report:
        print("\n（--report：未写任何文件）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
