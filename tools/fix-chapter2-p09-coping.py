#!/usr/bin/env python3
"""给第二关长街段 p09 补回顶部亮石檐（角色站在石头上的视觉对位）。

## 问题（2026-10-05，Simon 实机截图指出）

玩家在第三层走到长街右段（x≈3050, 走道面 y=950）时，脚下是一条**暗边**，
亮着的石砌面在它下面几像素——读作「人浮在石头上/站在墙沿的阴影里」。
他自己圈出来：人物应该站在石头上面。

## 量出来的根因

1. 背景 `background-night.png` 在走道处是**镂空**的（alpha=0），镂空起始行就是
   走道面：p06→820、p07→865、p08→910、p09→950。贴图段（p0x）负责补上这块。
2. 背景在镂空线上方留了一条亮檐（受光的石头顶面边缘），它与镂空线的距离：
   p06 2–3px、p07 5px、p08 4–5px、**p09 7–8px**。
3. 关键在于贴图段自己的首行：p06/p07/p08 首行是**亮檐**（均值 104/108/115），
   把背景亮檐到走道面之间的缝补亮，于是「亮檐 → 亮顶面 → 石面」连成一片；
   而 **p09 首行是暗的**（均值 44，次行 59），于是在角色脚下形成一条暗缝。

| 段 | 走道面 y | 背景亮檐 | 与走道面差 | 贴图首行亮度 |
| --- | --- | --- | --- | --- |
| p06 | 820 | 817 | 3px | 104 |
| p07 | 865 | 860 | 5px | 108 |
| p08 | 910 | 905 | 5px | 115 |
| **p09** | **950** | **942** | **8px** | **44** ← 异常 |

## 修法

不改关卡几何（三层走道 820/865/910/950、碰撞、障碍、遮挡、检查点全部不动），
只把 p09 的**前两行**换成背景自己 y=942/943 那两个像素行（同一幅画里紧贴上方的
亮檐，x 范围 2700–3680 与 p09 完全 1:1 对应），于是亮檐自然延续到走道面上。

p06/p07/p08 不动：它们的首行本来就是亮檐。

用法：
    /usr/bin/python3 tools/fix-chapter2-p09-coping.py            # 写回 p09.png
    /usr/bin/python3 tools/fix-chapter2-p09-coping.py --check     # 只体检不改
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BG = ROOT / 'assets/level2/night-v1/background-night.png'
STRIP = ROOT / 'assets/level2/night-v1/p09.png'

# p09 在舞台上的位置：世界 x 2700–3680、y 950–1100；背景同坐标处镂空。
STRIP_X, STRIP_Y = 2700, 950
COPING_Y = 942            # 背景里那条亮檐（世界 y）
SOURCE_X = 2750           # 取源起点：2700–2749 与 p08 重叠、背景在那里也是镂空的，必须避开
PATCH_ROWS = (0, 1)       # 要替换的 p09 行


def main() -> int:
    check_only = '--check' in sys.argv[1:]
    background = Image.open(BG).convert('RGBA')
    strip = Image.open(STRIP).convert('RGBA')
    width, height = strip.size

    if width != 980 or height != 150:
        raise SystemExit(f'p09 尺寸变了（{width}x{height}），先复核本脚本的坐标假设')

    span = STRIP_X + width - SOURCE_X
    if any(background.getpixel((x, y))[3] < 8
           for y in range(COPING_Y, COPING_Y + len(PATCH_ROWS))
           for x in range(SOURCE_X, STRIP_X + width, 31)):
        raise SystemExit('取源区间里背景仍镂空，本脚本的取源假设不成立')

    # 从 2750 起取 930px 的亮檐，横向拉伸到 980（多出 5%，对 2px 高的高光条不可见），
    # 得到一条单源、无接缝、与紧邻石檐亮度一致的顶面高光。
    source = background.crop((SOURCE_X, COPING_Y, STRIP_X + width, COPING_Y + len(PATCH_ROWS)))
    source = source.resize((width, len(PATCH_ROWS)), Image.LANCZOS)
    before = [round(sum(strip.getpixel((x, y))[:3]) / 3) for y in PATCH_ROWS for x in (0, width // 2, width - 1)]
    after = [round(sum(source.getpixel((x, i))[:3]) / 3) for i, _ in enumerate(PATCH_ROWS) for x in (0, width // 2, width - 1)]

    print(f'p09 首两行亮度 {before} → {after}（p06/p07/p08 首行约 104–115）')
    if check_only:
        print('体检：' + ('OK' if min(after) > 90 else '首行仍偏暗，需要写回'))
        return 0

    if min(after) < 90:
        raise SystemExit('取到的源行不够亮，拒绝写回（否则等于把暗缝换成另一条暗缝）')

    patched = strip.copy()
    patched.paste(source, (0, PATCH_ROWS[0]))
    patched.save(STRIP)
    print(f'已写回 {STRIP.relative_to(ROOT)}；接着跑 /usr/bin/python3 tools/optimize-images.py 重生成 WebP')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
