# 第一关水彩游戏大背景：固定画风与提示词说明

## 状态

本画风已于 2026-10-01 确认，作为第一关海岸场景及后续同类场景资产的统一美术基准。

正式参考图：

`scene/level1-watercolor-game-background-v1-1900x540.png`

游戏世界尺寸为 `1900 × 540`，单次镜头为 `960 × 540`。后续场景和元素需要在实际游戏镜头中检查线条粗细、色彩明度与角色可读性。

## 固定视觉语言

### 1. 色彩

- 主色为明亮但不过艳的缥碧、青碧和天水碧。
- 海面保持蓝绿色层次，深海、近岸浅水与浪沫通过明度和冷暖区分。
- 云和浪沫使用带暖意的月白、牙白，避免纯数字白。
- 远山使用较灰、较淡的蓝绿色，随距离降低对比。
- 植物使用竹青、苍艾和少量松花色高光。
- 沙滩使用米色、牙白和淡杏黄；岩石使用苍灰、浅赭石与茶褐阴影。
- 整体保留夏日阳光与空气感，避免荧光蓝、强钴蓝、浑浊灰绿和阴天色调。

### 2. 黑色手绘勾线

- 黑色或深炭色勾线是固定画风特征，不能删除。
- 线条略有粗细变化和轻微不规则感，避免均匀矢量线。
- 建筑、树冠、近景岩群和主要浪脊可以使用清晰轮廓。
- 远山、远岛和远景植物逐渐减线、减黑、减对比。
- 线条可以有小段断开，让水彩颜色自然溢出，不必封闭所有形状。
- 不逐片勾树叶、不逐道勾水纹、不逐块勾瓦片或石头。

### 3. 水彩与色块

- 先用较大的水彩、水粉色块建立天空、云、树林、山体、海面和岩岸，再以少量线条收形。
- 保留纸张纹理、颜料深浅变化和轻微套色偏差。
- 阴影使用完整色面，不使用密集排线、碎笔触或照片式细节。
- 云层使用大块暖白色面和少量灰蓝阴影，内部线条克制。
- 海面使用宽阔水平色带与少量关键浪脊，避免铺满重复的细横线。

### 4. 前景岩群

- 多块相连岩石要读成一组连续岩岸，而不是许多单独石头。
- 每组岩群只画一条清楚、较细的深色外轮廓。
- 石块接触处不画完整黑色分割线，不给每块石头单独包边。
- 内部体积主要通过连续水彩色块、共同阴影、湿痕、苔藓、海藻、沙和浪沫表现。
- 只在重要转折或深缝处保留少量短结构线。
- 起始礁石需要保持可读的站立顶面，但其周围碎石仍应融入同一岩群。

### 5. 场景与游戏元素分层

- 大背景只负责天空、远山、开阔海面、远处渔村、沙滩和装饰性前景岩岸。
- 可跳礁石、海鸥、动态浪尖、钥匙、门、收集物和其他交互对象必须单独制作并由游戏叠加。
- 背景中央与右侧应保留开阔区域，避免固定图像干扰人物和交互元素。
- 装饰性前景不能形成与实际路线相似的规则台阶或跳跃节奏。

## 标准场景提示词模板

```text
Create a production-ready 2D side-scrolling game background using the approved Seek watercolor art direction.

VISUAL LANGUAGE:
- bright but restrained Piao Bi, Qing Bi and Tian Shui Bi blue-green palette
- warm Yue Bai clouds and foam, muted blue-green distant mountains, warm ivory sunlight
- hand-painted watercolor and gouache color masses with visible paper grain
- selective black to deep-charcoal hand-drawn outlines with organic, slightly uneven pressure
- clear outlines on important foreground silhouettes, architecture and major wave ridges
- progressively softer and fewer lines toward the distance
- occasional broken contours and slight color/line registration imperfection
- broad cel-like shadow shapes rather than dense micro-detail

FOREGROUND ROCK RULE:
- connected stones form a continuous rock-bank cluster
- one thin dark outer contour around each entire cluster
- no complete black outline around each individual stone
- internal volume is shown through continuous watercolor planes, shared shadows, wet stains, moss, seaweed, sand and foam
- only a few short broken structural strokes at major plane changes

GAME LAYERING:
- keep the playable field readable and open
- interactive stepping rocks, birds, waves, keys, doors and collectibles are separate transparent assets
- do not bake the gameplay route into the background

Preserve a cheerful summer atmosphere, simple readable silhouettes and a handcrafted children's animation feeling.
```

## 固定负面约束

```text
Avoid photorealism, glossy 3D rendering, vector-clean outlines, uniform line weight, manga linework, heavy comic-book shadows, dense hatching, excessive texture, AI micro-detail, outlining every leaf, outlining every ripple, outlining every stone, repeated scalloped boulders, neon cyan, electric blue, strong cobalt, muddy gray-green, dark storm lighting, teal-orange grading, text, labels, UI, borders or watermarks.
```

## 后续资产一致性检查

- 在 `960 × 540` 镜头比例下检查，而不只看整张超宽图。
- 黑色勾线应可见，但不能压过水彩色面。
- 近景线条比远景清楚，远景不能出现同样粗重的黑边。
- 岩群必须先读成整体，再读到内部体积。
- 新元素的颜色、纸纹、线条粗细和光源方向需要与正式参考图一致。
