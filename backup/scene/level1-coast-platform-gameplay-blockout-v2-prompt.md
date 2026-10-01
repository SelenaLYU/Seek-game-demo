# 第一关海边关卡构图 blockout v2

## 目标

明确画出横版平台游戏的地面与跳跃关系。此轮关注可玩性轮廓，不作为最终场景美术。

## 提示词

```text
A wide horizontal screenshot from a 2D side-scrolling children's platform game level. This is game level art, NOT landscape concept art. Orthographic side-on camera, flat 2D profile, ground and platforms dominate the lower 45% of frame. Aspect ratio 3.5:1, equivalent to a 1900x540 scrolling game world. A small girl character (around 100 px tall relative to 540 px screen height) is clearly in a jump arc between wide safe landing surfaces. Simple golden key pickup floats near a later platform. No captions, UI, text, annotations, collage, or frame.

Build the level geometry FIRST: a long low beach starting at left; then a clear 60-70px rise to a broad middle sand ledge; then another rise to a higher broad ledge; then descend to a long low beach at right. The platform top edges are clean, horizontal, sandy walkable surfaces, each at least 2.5 character-widths wide. Each rise is a distinct vertical step in the continuous coastal ground silhouette, with a short visible jump gap between landing tops; show open sky/sea through the gap so the jump challenge is obvious. Keep all surfaces connected to a large continuous earthen/cliff mass beneath them. The middle route must NOT look like isolated rocks, columns, or boulders. No huge central rock, no irregular piles of rocks, no rocks obstructing tops, no foreground wall. The child must be large and readable, placed mid-jump from one ledge toward the next, clearly interacting with the platform spacing.

Environment: simple flat blue-green sea behind the path; far horizon with 2-3 small varied island silhouettes only; at far left, tiny South China coastal village houses with white walls, dark roof tiles, restrained Lingnan arcade / village cues, not a European town, no church, no steeple, no timber cottages. Sparse grasses only at far edges. The sea and village are background planes, secondary to level geometry.

Art direction: hand-drawn 2D television animation background, graphic ink-and-gouache illustration inspired by attached animation reference's contour line character, but use original forms. Color palette from coastal reference: soft turquoise, dusty sea blue, muted green, warm pale sand. Strong simplified outlines, slightly imperfect visible pencil/brush contours; flat opaque fills; only one shadow shape per object; minimal texture. No realistic rendering, no glossy painterly highlights, no airbrush, no 3D volume. Clouds are a few small flat irregular ink shapes with cream fill, almost no shading. Terrain should read like a playable 2D platform level at first glance: repeatable clear walkable tops and intentional jumps, not a panoramic postcard.
```

## 结果限制

- 输出图：`level1-coast-platform-gameplay-blockout-v2.png`，2216×710。虽然构图更像平台游戏，图像模型仍把岩台画得过大、过于写实，且路线宽度未精确对应现有碰撞坐标。
- 这是关卡构图草图，不接入程序；正式版本应按 `ForestScene` 的地形坐标重绘可走顶面，并拆分视差层。
