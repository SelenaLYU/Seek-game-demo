# 第一关海边场景构图探索 v3

## 参考图分工

1. 队友海岸图：只参考舒服的蓝绿海水、暖沙色和海边氛围。
2. 动画场景拼图：只参考手绘动画轮廓、形状概括和笔触表现。
3. v2 场景草图：只用于识别需要修正的问题——重复的山脊、相近的岛形、单一草边。不是风格基准。

## 构图要求

- 远景用少量彼此分开的岛：左侧低平岛、中央大面积开阔海面、右侧单独高岛、远处一个小礁岛。
- 中景村落只集中在左侧一段，海岸线向右逐渐稀疏，避免连续重复的屋顶和山形。
- 前景分出两侧近处深色植物、不同大小与色相的岩石、潮池和暖沙；不是一整条同色草地。
- 中下部沙路保持水平、连续、开放，近景物件不得挡住角色路线。
- 远景减饱和，中景清晰度居中，前景更深更醒目，形成值域层次。

## 生成提示词

```text
Generate a distinctly improved original 16:9 side-scrolling game background concept. Reference 1 is palette-only: comfortable teal and sky-blue water, warm sand, muted greens. Reference 2 is style-only: concise French hand-drawn animation shapes, irregular ink contours, simple painted color masses. Reference 3 is the previous draft to correct: do NOT repeat its continuous layered mountain ridges, repeated island bumps, tiny busy grass border, or broad same-height bushes. Improve its depth rhythm and varied near foreground.

FAR DISTANCE SHAPE RHYTHM: use only THREE separated island silhouettes, with large open-water gaps between them. At x≈15% a low flat narrow island. From x≈25% to x≈63% leave open sea and sky with no land behind it. At x≈70% place one single tall asymmetric steep-sided headland with an uneven but simple contour. At x≈88% place one tiny isolated rock-islet. No other land silhouettes. Never draw a chain of matching hills, continuous ridge, repeated mountain layers, or evenly spaced islands. Keep distant shapes pale and low contrast.

MIDGROUND: a single compact coastal hamlet at far left (two or three small Lingnan houses beneath one broad wind-shaped tree), ending before the center. The rest is an irregular low rocky shoreline with a few distinct clusters and broad sea shapes, not repeating texture. Clearly separate the hamlet/shore from the far islands by color and overlap.

FOREGROUND: varied near-camera frame with depth, not a grass strip. At both bottom corners, overlapping dark teal broad leaves and reeds; near lower left a small ochre rock cluster; lower right a larger blue-gray rock cluster; among them a small turquoise tide pool and pale sand/pebbles. Vary shape size and color, allow foreground forms to overlap the bottom edge and corners. Keep the broad center-lower sandy play lane perfectly continuous, level and open, with no stones or plants intruding into it.

Strict lateral side-view 2D platformer camera, simple readable silhouettes, no deep perspective or isometric angle. Strong value-depth order: dark foreground, medium-value coast, pale distant sea and islands. Sky occupies upper third. Hand-drawn TV animation art: clean uneven dark umber outline, simple shape design, matte opaque watercolor/gouache blocks, only sparse brush marks; reduce tiny detail. Preserve a calm blue-green and ochre palette, not monochrome. No character, key, door, bridge, birds, text, watermark, collage or panel borders.
```

## 评估

相较 v2，本版远景形体与开阔海面更有间隔，前景颜色与尺度更丰富。仍是概念全景；需与独立近景层组合后在游戏视口里检查遮挡、视差幅度和场景连续性。
