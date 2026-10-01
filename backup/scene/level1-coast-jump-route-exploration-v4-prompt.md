# 第一关海边跳跃路线探索 v4

## 参考图分工

- 队友海岸图只提供蓝绿色海水、暖沙色和舒适配色方向。
- 《悠悠长假》场景拼图只提供手绘动画的造型概括与线条方向。
- 本图按游戏代码中的横向关卡顺序绘制，不直接临摹参考图。

## 关卡路线约束

按左到右表现低沙滩、上一级、最高一级、下降一级、再回到长沙滩。台面作为连成一体的阶梯式海岸岩台，供角色起跳和落脚；海水退在路径后下方，不能切断可走路线。

## 生成提示词

```text
Illustrate one ultra-wide 3.5:1 horizontal side-scrolling platformer level concept, representing the full width of a 1900×540 game world. Original calm South China coast, no characters. Reference 1 is for palette only: comfortable soft blue-green sea, warm sand, muted natural greens. Reference 2 is for 2D animation illustration style only: hand-drawn contour lines, simplified forms and painted flat color areas. Do not reproduce either reference's composition.

SCENE RENDERING MUST BE ILLUSTRATION, NOT REALISTIC: simplified French children's TV animation background, readable dark umber hand ink outlines with slight line variation, broad opaque gouache color masses, only a few visible brush strokes, almost no fine texture. Clouds are a few small simple asymmetrical flat ink-and-gouache shapes with one cream fill and at most one pale-blue shadow shape; no realistic volumetric cumulus, no lit 3D cloud shading, no cloud texture. Sea uses a few broad horizontal strokes and calm bands, no realistic glitter or foam detail. Foliage and rocks are simplified into clear graphic silhouettes with restrained marks.

DEPTH: four visibly separated value planes—pale sky and distant simple islands; middle sea; coastal village and shore; dark close foreground accents. Foreground has varied near-camera silhouettes at the very bottom and outer corners (deep teal leaves, a few reeds, warm ochre and slate rocks), while the character route remains readable. Distant islands are few and distinct: one low island far left, broad open water across center, one asymmetrical higher island right, and one tiny far islet. No repeating mountain ridge or copied peaks. A single small group of 2–3 Lingnan coastal houses at left only.

GAMEPLAY PATH (match this exact left-to-right rhythm across the long panorama): a wide continuous pale sandy beach begins at the far left at low level; the playable sand-and-rock bank rises through three connected, clearly readable step ledges in the first half of the level; the middle ledge is highest; then the bank descends and becomes a long low continuous sandy beach all the way to the far right. The steps are joined as one coherent terraced coast form, not isolated floating islands, with clear horizontal tops where a child can stand and jump. Keep the beach silhouette connected from start to finish. Leave generous empty space around the steps so jumps read. Do not put foreground rocks, grass, plants or tide pools over the walking/jumping surfaces. Water sits behind and below the coast edge; do not make beach patches disconnected.

Strict side-on orthographic platform-game view, low horizon, no deep perspective, no isometric angle. Clear separation of foreground/midground/background. No visual labels, no UI, no collectible, no doorway, no bridge, no humans, no animals, no watermark, no collage. This is a painterly but simple 2D illustration concept sheet for a level artist to split into parallax layers, not a finished photorealistic landscape.
```

## 评估与接入注意

本图的沙岸轮廓已改成连续的阶梯路线，云、海、岩面纹理也更概括，但仍需对照参考检查插画线条和纹理密度。它是 2170×725、约 3:1 的整关构图探索图，不是 1900×540 成品底图；正式接入时需将远景、海面、岸线与近景分层，并让碰撞体顶面与台面坐标一致。主程序背景只负责绘画，不承担碰撞。
