# 第一关海边跳跃路线探索 v5

## 参考图用途

- 队友的海岸概念只参考舒适的蓝绿海水、暖沙色和低饱和色彩。
- 《悠悠长假》场景拼图只参考手绘线条、造型概括和动画背景的笔触。
- 不临摹参考图构图，不照搬欧洲建筑。

## 生成提示词

```text
Create a horizontal side-scrolling 2D platform game background concept for a Chinese coastal village level, very wide 3.5:1 landscape composition. Use the first reference only for comfortable muted color palette and coastal subject; use the second reference only for its hand-drawn French animation background ink line quality, simplified shapes, imperfect pencil/brush marks, restrained texture, and graphic illustration look. Do not copy the European buildings from second ref; coastal village houses should be simple southern Chinese seaside houses, understated and small.

Make the whole scene unmistakably illustrated and graphic, NOT photorealistic, NOT 3D, NOT glossy digital painting, NOT anime. Broad flat gouache color areas, sparse dry-brush texture, visible varied hand-ink contour lines, imperfect brush marks, simplified organic silhouettes, restrained crosshatch in shadow. Limit detail. Avoid individually rendered leaves, realistic rock microtexture, realistic foam, photographic perspective, volumetric lighting, gradients, shiny water, dramatic clouds. Clouds are simple flat hand-drawn clusters and long thin strokes, each with one cream highlight and one pale-blue underside only. Calm clear sky.

Design legible parallax depth with distinct non-repetitive silhouettes: far background pale blue-gray open water horizon and only 3 discrete island silhouettes of different height and shape, widely spaced with large open sea gaps; middle distance teal sea as broad horizontal flat-color bands, left side a few small coastal houses among asymmetric trees; midground a low curved cove. Foreground gameplay shore forms a continuous connected sandy terrace path across the width, with readable broad safe platform tops and vertical eroded earth/stone faces. The playable route rises in three clear connected steps from a low beach at left, reaches a high broad ledge around the center, descends one step, then continues as a long low beach to the right. The top walking surfaces connect to the next ledges without isolated floating rocks; no deep pits, no obstructive objects on the path. Show step rhythm with strong silhouette changes, not evenly repeated stairs. Keep an open playable lane across the middle-lower portion, framed by sparse foreground rocks and a few plant clusters at extreme left/right edges only.

Composition should feel like an animation background painting, hand-drawn and simplified, with strong separation between near dark green foreground silhouettes, warm sandy playable midground, lighter turquoise sea and distant blue islands. Avoid repeating hills, rocks, trees, or clouds. No characters, UI, text, red marks, borders, collage, or inset panels. Treat this as a scene layout concept rather than a production-ready tiled layer.
```

## 当前状态

- 输出尺寸：2117×743；约 2.85:1。它是构图概念，不是适配 1900×540 的成品底图。
- 沙岸已经表达低处—逐级升高—再下降—长沙滩的玩法节奏；岛屿与云形也比上一轮更概括。
- 仍需继续压低岩石和海面纹理密度，并拆出背景、地形美术与透明前景层后，才能进入游戏验证。
- 程序当前碰撞路径并非连续阶梯，需先确定并实现和画面一致的地形碰撞轮廓。
