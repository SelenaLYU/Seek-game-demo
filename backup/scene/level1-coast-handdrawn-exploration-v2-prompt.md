# 第一关海边风格探索 v2

## 参考图用法

- 队友海岸图：只参考舒服的蓝绿海水、暖沙色与海边气氛，不复用其构图、物件或人物。
- 《悠悠长假》场景拼图：只参考手绘动画的轮廓线和概括形状，不复用具体建筑或构图。
- v1：只作为自身迭代对象，用来针对远景重复、前景单调的问题调整层次；不是已认可的风格基准。

## 生成提示词

```text
Create a new 16:9 concept image for a side-scrolling 2D platform game set on a quiet South China coast. Reference 1 is palette inspiration only (comfortable turquoise and blue sea, warm ochre sand, muted greens); do not copy its composition or objects. Reference 2 is style inspiration only (hand-drawn French children's animation, expressive ink outlines and concise shapes); do not copy its characters or buildings.

Make the depth and rhythm unmistakable. Use three visual distance bands with different value and detail: FAR distance is pale blue-green sea and islands with varied silhouettes and irregular spacing: one low broad island on the left, a broken gap of open sea in the center, a single taller uneven headland on the right, and only a few tiny separated islets. Avoid repeated rounded hills, evenly spaced peaks, mirrored forms, tiled scenery, or a continuous same-shaped mountain ridge. MID distance is one compact group of small coastal houses and wind-shaped trees near the left third, tapering to a sparse shoreline toward open water; don't repeat the village across the image. NEAR foreground has tangible depth and varied shapes: layered dark teal coastal plants framing the extreme left and right, a few broad leaf clusters, reeds, pale sand, warm brown and blue-gray stones, and one or two small tide pools with muted aqua reflections. Vary the foreground forms, scale, color and overlap; it must not be one uniform strip of grass. Foreground can overlap the image edges to suggest close camera depth.

Maintain a strict side-on orthographic game view, not isometric and not a deep perspective painting. Reserve a clear continuous level sandy walking path across the lower middle from edge to edge; keep stones and plants outside that play lane or only at the far margins. The sky fills the upper third. Give the near foreground darker, clearer shapes, the middle coast moderate contrast, and the far islands lighter and softer for strong depth separation. Render in confident hand-drawn animation background style: fine irregular dark-brown outlines, broad simplified matte gouache/watercolor shapes, only a few visible brush strokes, sparse details. Palette is comfortable and varied, with blue-green water, pale sky, warm sand, muted olive foliage, restrained dark teal foreground accents. No characters, no bridge, no doorway, no key, no text, no collage, no repeated or stamped shapes.
```

## 评估

这张图用于检查远景轮廓节奏和前景色彩/纵深，不是可直接接入的成品背景。搭配同版透明前景 `level1-coast-parallax-foreground-v1.png` 测试分层视差；后续还需拆出独立远景与海面层。
