## Decision: 骑楼美术以夜骑楼（`assets/level2/night-v1/`）为唯一真源，白昼骑楼全套废弃并删除

## Context

第二关「骑楼街逃课」曾并存两套互斥的美术：

1. **夜骑楼** — `assets/level2/night-v1/`，由 ruchengloria 在 `648cadd`（2026-10-03 17:57）连同运行时接线（`ChapterTwoNightArt.ts` + `ChapterTwoChallengeScene`）一起提交，已进 `main`。
2. **白昼骑楼** — `assets/level2/qilou/` 四组图集（平台砖块／遮挡模块／静态障碍／动态目标）加宽幅底图 `assets/scenes/chapter2/chapter2-qilou-water-town-background-hd-7360x2200.png`，来自 `origin/ART` 的 `def9c59`；另有一整套未进任何提交的接线方案：`src/gameplay/chapterTwoArt.ts`、`*.aligned.json`、`ALIGNMENT.md`、内容感知拼接与对位脚本、`art/chapter2-qilou-street-assets.md` 等。

白昼那套的接线工作曾完成并被独立审核判为「可交付」，但它依赖的底图随后被自己的一份规格书判定为不匹配——`art/chapter2-background-repaint-spec.md` 指出该底图是透视图街插画，而第二关是横版三层走道（`y = 260 / 610 / 820–950`），要求重画。于是接线成果既没有落进任何提交，也没有可交付的底图。

对夜骑楼的复核（2026-10-05）：

| 检查项 | 结果 |
| --- | --- |
| `assets/level2/night-v1/` vs `648cadd` | 逐字节相同（`main` 上唯一差异是 `Player.preload(this)` 替换了重复的 spritesheet 加载，与骑楼无关） |
| `ChapterTwoNightArt.ts` vs `geometry.json` | 一致：9 平台 + 9 障碍 + 10 遮挡 + 2 摆动 + 封路墙 + 老师 + 旧钞票 + 门 = 35 张全部接入 |
| PNG 尺寸 vs 逻辑尺寸×倍率 | 全部吻合（背景 3680×1100、平台/封路墙 1×，其余 2× 导出） |
| `?scene=chapter2` 实跑 | 起点/二层/落口/中段/底层/长街/终点 7 处取景，0 console error |
| 与 `CHAPTER_TWO_GAMEPLAY_DESIGN.md` | 四检查点、十遮挡、九障碍、两摆动一致 |

## Alternatives considered

- **接线白昼骑楼，替换掉夜骑楼**：等于推翻一套已入库、已实跑、与 `geometry.json` 一一对应且通过审核的资产，去换一套底图已被自己规格书判为要重画的半成品。
- **两套都留、用开关切换**：两套的地基坐标虽然相同，但柱列/廊道/遮挡表现不是同一套构图逻辑，长期维护成本高，且没有任何玩法理由需要白天版本。
- **只标废不删文件**：审查面板已经把白昼图集标成「尚未接入」，留着就会被下一次会话当成待办接线（这次就是）；32.81MiB 也会一直随仓库走。
- **顺手删掉 `origin/ART` 分支**：不必要——分支留着是历史，风险来自「把文件带进 main」，不是分支存在。

## Reasoning

夜骑楼是唯一「已入库 + 已实跑 + 与灰盒坐标逐项可验证」的那一套，白昼那套则是「没有可用底图 + 接线从未提交 + 无测试锁定」。在两者之间做选择时，决定性的不是画风偏好，而是可验证性：夜骑楼的每一张素材都能对着 `geometry.json` 断言，白昼那套连底图都要重做。

因此：骑楼运行时一律使用 `assets/level2/night-v1/`；白昼骑楼图集 4 组、宽幅底图及其 WebP（共 10 个文件、32.81MiB）与全套接线 WIP 一并删除。`origin/ART` 保留作历史，但**不要 merge**（它基于很旧的代码）。

## Trade-offs accepted

- 放弃白昼那套的骑楼柱列／模块化平台表现与内容感知拼接成果；如果以后要改回白天，需要重新出图并重做对位，等于从零开始。
- 夜骑楼是夜景加暖窗灯的美术，白天版本所具备的「日光下建筑结构可读」不再有替代方案。
- 素材审查面板少 5 个候选条目（21 → 16），面板不再覆盖白昼骑楼；`tools/optimize-images.py` 的 `RUNTIME_IMAGES` 从 83 条降到 78 条。

## 补充

- 关联 ADR：`decisions/2026-10-03-webp-and-load-optimization.md`（第 7 节的清单总量随本次删除重算：79.66MiB PNG → 7.54MiB WebP）
- 影响范围：`src/scenes/ChapterTwoRoomScene.ts`（审查面板候选清单）、`tools/optimize-images.py`、`tests/imagePipeline.test.mjs`（面板条目数 21 → 16）、`HANDOFF.md`；删除 `assets/level2/qilou/`、`assets/scenes/chapter2/chapter2-qilou-water-town-background-hd-7360x2200.{png,webp}`，以及未跟踪的 `src/gameplay/chapterTwoArt.ts`、`*.aligned.json`、`ALIGNMENT.md`、`art/chapter2-qilou-street-assets.md`、`art/chapter2-background-repaint-spec.md`、`art/chapter2-module-review.md` 与 `tools/*chapter2-background*`／`tools/align-chapter2-atlases.py` 等
- 验证方式：`npm test`（含 `tests/imagePipeline.test.mjs` 的清单与面板断言）、`npm run build`（`vite.config.mjs` 会拒绝任何指向已删图的字面量路径）、`/usr/bin/python3 tools/optimize-images.py --check`
