# 第二关：夜晚骑楼场景资产

本目录是已经按第二关灰盒接入并在本地 Demo 验证的运行时素材。世界尺寸为 `3680 × 1100`，坐标原点在左上角。关卡路线、碰撞、下落口、检查点、手电筒判定和摆动物判定均沿用灰盒，不因美术替换而改变。

## 内容

- `background-night.png`：连续夜晚江南骑楼底图，运行时放在世界坐标 `(0, 0)`。
- `p01.png`–`p09.png`：9 段平台表面，按 `geometry.json` 的原始坐标以 `origin=(0,0)` 放置。
- `h01.png`–`h09.png`：9 个固定障碍，图片为 2 倍导出；运行时缩放 `0.5`，`origin=(0.5,1)`。
- `c01.png`–`c10.png`：10 个遮挡模块，图片为 2 倍导出；运行时缩放 `0.5`，`origin=(0,1)`。遮挡模块不新增碰撞。
- `s01.png`、`s02.png`：两件摆动物，分别对应摆动晾衣物和竹竿。
- `w01.png`：折返路线的封路墙。
- `teacher.png`：值班老师；动态光锥仍由代码绘制。
- `old-banknote.png`：关卡终点的旧钞票。虽然文件名保留兼容名称，画面与文案均为旧钞票，不是旧票根。
- `door.png`：第二记忆房入口。
- `geometry.json`：所有素材的坐标、逻辑尺寸、原点、显示倍率与判定区域。
- `generation-log.json`：生成来源与提示词记录。

## 接入方式

`src/gameplay/ChapterTwoNightArt.ts` 是 `geometry.json` 的运行时映射；`src/scenes/ChapterTwoChallengeScene.ts` 已按该映射加载并放置全部素材。

背景与平台来自同一幅连续场景。`background-night.png` 中与平台相交的区域已经镂空，因此必须同时载入 `p01`–`p09` 和 `w01`，不可把 `chapter2-night-qilou-full-scene.png` 再叠一层，否则会重复显示。

旧钞票位于 `(3420, 898)`，显示尺寸 `50 × 26`，拾取范围仍为 `58 × 68`。内部传递 ID 继续使用 `memory-token-2`，以兼容第二记忆房流程。

## 预览与检查

- 普通关卡：`?scene=chapter2`
- 美术检查：`?scene=chapter2&artPreview=1`

美术检查模式提供“起点、二层、底层、长街、终点”和碰撞框开关，只在带 `artPreview=1` 时出现。

完整接入表和设计说明见 `art/chapter2-night-qilou-assets.md`；提示词见 `art/chapter2-night-qilou-prompts.md`。
