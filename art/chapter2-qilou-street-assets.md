# 第二关骑楼街场景与模块资产

## 本次内容

本批资产用于第二关“骑楼街逃课”的正式美术替换，覆盖当前灰盒中的主背景、路面、静态路障、遮挡安全区、动态障碍、老师、手电筒、旧票根与第二记忆房入口。

### 主场景

- `assets/scenes/chapter2/chapter2-qilou-water-town-background-hd-7360x2200.png`
- 高清像素尺寸：`7360 × 2200`
- 对应游戏世界逻辑尺寸：`3680 × 1100`
- 接入时使用 `setDisplaySize(3680, 1100)`，即 2× 像素密度。
- 已在本地第二关灰盒中验证，清晰度适合当前高清/Retina 渲染方式。

场景是学校后墙与江南骑楼水街的连续长景，包含远海、山体、白墙黛瓦、河道与小桥。人物、老师、灯光、路障和收集物没有画死在背景里，由游戏单独叠加。

## 模块图集

PNG 均保留透明通道。每张 PNG 旁边提供同名 Phaser JSON atlas，可直接通过 `load.atlas()` 使用，无需程序再次测量格子。

### 静态路障

- `chapter2-static-obstacles-3x3.png`
- `chapter2-static-obstacles-3x3.json`

帧名：

- `road-barricade`：路障
- `laundry-rack-static`：静态晾衣架
- `construction-rail`：施工栏
- `wooden-stool`：木凳
- `cargo-crate`：货箱
- `bamboo-pole-rack`：竹竿架
- `market-stall-frame`：摊位架
- `road-repair-barrier`：修路栏
- `street-wood-rack`：街口木架

### 遮挡与安全区

- `chapter2-cover-modules-5x2.png`
- `chapter2-cover-modules-5x2.json`

帧名依次为：`cover-upper-column`、`cover-cloth-awning`、`cover-shop-sign`、`cover-second-floor-column`、`cover-old-rain-awning`、`cover-cargo-stack`、`cover-ground-arcade`、`cover-market-curtain`、`cover-street-column`、`cover-corner-stall`。

它们分别对应代码中 `COVERS` 的十处范围。贴图只负责视觉表现，安全判定继续使用 `COVERS.from / to / baseY`，不要根据图片透明边缘重新计算判定。

### 动态障碍与通关物

- `chapter2-dynamic-goal-modules-4x2.png`
- `chapter2-dynamic-goal-modules-4x2.json`

帧名：

- `swing-laundry-rest`、`swing-laundry-right`
- `swing-bamboo-rest`、`swing-bamboo-left`
- `teacher-flashlight`
- `flashlight`
- `memory-ticket`
- `memory-room-door`

摆动物建议使用静止帧作为主体，以现有 `SWINGS` 支点旋转整张 sprite。另一摆动帧可用于美术预览或补间参考。碰撞仍使用现有支点、长度和 `distanceToSegment()`，保证画面与判定一致。

### 平台与墙体

- `chapter2-platform-tiles-4x2.png`
- `chapter2-platform-tiles-4x2.json`

帧名：`platform-school-wall`、`platform-upper-qilou`、`platform-middle-gallery`、`platform-lower-street`、`platform-school-endcap`、`platform-drop-endcap`、`route-blocking-wall`、`canal-embankment`。

这些贴图用于替换 `addStreetPlatform()` 当前的灰色矩形。碰撞体坐标和顶缘必须保持不变；视觉贴图可以横向重复或缩放，但不要改变可站立顶边。

## Phaser 接入示例

```ts
const backgroundKey = 'chapter2-qilou-background';
this.load.image(
  backgroundKey,
  'assets/scenes/chapter2/chapter2-qilou-water-town-background-hd-7360x2200.png',
);

this.load.atlas(
  'chapter2-obstacles',
  'assets/level2/qilou/chapter2-static-obstacles-3x3.png',
  'assets/level2/qilou/chapter2-static-obstacles-3x3.json',
);

this.add.image(0, 0, backgroundKey)
  .setOrigin(0)
  .setDisplaySize(3680, 1100)
  .setDepth(-30);

this.add.image(560, 320, 'chapter2-obstacles', 'road-barricade')
  .setOrigin(0.5, 1)
  .setDisplaySize(90, 70);
```

其余三个 atlas 使用相同方式加载。建议把 sprite 原点设为 `(0.5, 1)`，让资源底边对齐现有 `baseY`。

## 与现有灰盒的对应关系

- 世界尺寸继续使用 `3680 × 1100`。
- 三层路线继续保持：第一层向右、第二层向左、第三层向右。
- 九个静态障碍沿用 `addHurdle()` 的现有世界坐标与碰撞尺寸。
- 十处遮挡沿用 `COVERS`。
- 两个摆动障碍沿用 `SWINGS`。
- 老师与光源沿用 `TEACHER`、`LIGHT_ORIGIN` 和现有光束判定。
- 旧票根和入口门沿用 `createGoal()` 中的交互坐标。

## 美术说明

整体沿用第一关确认的画风：水彩和水粉大色块、纸张颗粒、粗细不均的深炭色手绘轮廓、中式青碧与月白配色。背景采用 2× 像素密度，避免在高清画布里再次放大低分辨率图片造成模糊。

## 接入后的检查

1. 在 `?scene=chapter2` 中走完整条右—左—右路线。
2. 检查每张障碍贴图的底边是否贴住平台顶缘。
3. 检查遮挡贴图与 `COVERS` 判定是否重合。
4. 检查晾衣架和竹竿围绕代码支点旋转时是否穿帮。
5. 确认旧票根拾取和第二记忆房入口逻辑不变。
6. 在 Retina 屏幕和普通屏幕分别检查背景清晰度。

