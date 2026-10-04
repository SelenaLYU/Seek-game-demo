# HANDOFF — Seek-game 当前状态与下一步

更新于 2026-10-03。这份是**唯一的当前状态文档**；历史口径全部收进 `archive/`。

## 0. 一句话状态

`main` 已包含第一关、第二关灰盒和岛屿章节入口。第一关的**新故事清理已完成**，玩法闭环可玩，但录音、照片、贝壳美术与结尾动画仍是显式占位。工程与剧情文档已收敛：当前状态看本文件，剧情看 `GAME_STORY_AND_LEVEL_DESIGN.md`，新旧故事边界看 `STORY_MIGRATION.md`。

## 1. 仓库与分支

- repo：`https://github.com/SelenaLYU/Seek-game-demo`（private）；我的身份 `gxinxing`，权限 push + triage（无 admin）。
- `origin/main` = `0f3c916`（PR #11：第二关记忆之房后半段灰盒 + 后续灰盒至此版结尾）。
- 我的工作分支：`codex/level1-progress-music`（第一关 + UI/工程）。**本地领先远端若干提交，未推送**；推送前先 `git fetch` 再看 `git status -sb`。
- 只读参考分支：`origin/ART`（骑楼美术）、`origin/island-prototype`、`origin/story-design`。**不要直接 merge `ART`**：它基于很旧的代码，会删掉近万行；只能挑文件。

## 2. 剧情依据（唯一）

- 主角定名：**韩梅梅**（`decisions/2026-10-03-protagonist-name.md`；代码常量 `src/story/ChapterOneStory.ts` 的 `PROTAGONIST_NAME`）。
- 第一关：5–7 岁海边 → 记忆之房 → 三碎片合成**贝壳** → 回忆动画定格家庭照片、收入相册 → 点亮记忆之岛。
- 旧 Demo 的「外公／外婆／鱼鱼／回南城」已从运行时代码中移除；旧结尾视频经核验是**鱼鱼 + 公公 + 粤语信件**，与本故事冲突，**不可复用**（证据见 `STORY_MIGRATION.md`）。

## 3. 第一关（我这一侧）现状

已完成：海边跑酷（第一块低礁出生、海鸥横渡、单朵长距离滚浪与浪后实体落脚礁、只显示实体门楣钥匙、落地离开门洞后再走回石门）、房间四谜题链（录音机 → 缺片 → 照片 → 电池 → 手电筒 → 光影小船三笔风）、贝壳合成、存档与版本迁移、HUD、音乐开关、岛屿点亮。

仍是占位（不可当成已完成内容）：

| 项 | 现状 |
| --- | --- |
| 录音 | 3 秒**静默**占位，提前关闭不结算；台词与留声人未定 |
| 家庭照片 | 标注「待制作」的占位图，拼图机制完整 |
| 贝壳 | 灰盒图形 |
| 结尾 | 文字占位；旧视频已断开 |
| 相册 | **骨架**：六格登记 + 获得状态 + 岛屿入口（`src/story/Album.ts`、`src/ui/AlbumUI.ts`）；正式照片、序章入口、结局揭示待接入 |

验收记录（2026-10-03，浏览器实跑）：清存档走通「贝壳 → 结尾 → 记忆之岛」，`chapterOneCompleted` 正确写入，旧存档 key 未被读取，0 console error；岛屿显示点亮状态与 `N/6`；相册显示 2/6 且与实际完成章节一致。

## 4. 第二关（Selena 那一侧）现状

PR #11 已合入：货架八件可交换（穷举 40320 种确认唯一解）、瓶盖一盘一笔画、六幕可点击分镜、回岛点亮第二段、岛屿章节列表 1–3、第三关入口提示「未完待续」+ 选项查看**第三关站位预告**（3 秒灰盒，可跳过，自动回岛）。

注意：第三关「预告」没有动画文件，是 Phaser 画的灰盒站桩；分镜里用的是「韩梅梅／李雷」，李雷仍是暂称。

## 5. 待办

按顺序（我这一侧）：

1. **录音台词**：留声人与内容待定，**不阻塞**——正式内容到位前一直用「3 秒静默 + 明确标注占位」的版本，提前关闭不结算（2026-10-03 决定）。
2. **相册接入正式照片**，并把入口扩展到序章/主菜单。
3. 家庭照片与贝壳正式美术。
4. 第一章结尾：不要复用旧视频；要么等正式动画，要么先做同风格的分镜占位。
5. 第一关体验遗留：石门右侧裁切、礁石下方隐形碰撞墙、抓放海鸥位置突跳、触屏适配——**先实测复现再修**，`archive/2026-10-02-bugs-and-ux-review.md` 里的条目不可直接当待修清单。
6. 推送分支 + 开 PR。

需要用户决策：旧素材（6 张已删文件的删除动作、`assets/level2/qilou` 等未跟踪美术）如何处置；并发编辑归属（见下）。

## 6. ⚠️ 并发编辑风险

同一个工作区里可能有**另一个会话**同时在改第二关（观察到 `src/scenes/ChapterTwoChallengeScene.ts`、`src/gameplay/chapterTwoRules.ts`、`tests/chapterTwoRules.test.mjs` 被反复改写，且 `assets/level2/qilou/`、`assets/scenes/chapter2/` 的美术素材尚未被任何提交跟踪）。

规矩：

- **禁止 `git add -A`**；一律显式路径提交，且提交前先 `git status` 确认没把别人的在改文件卷进来。
- 提交只用 `git commit -F - -- <显式路径>`（`-F -` 必须写在 `--` 前面）。
- 需要隔离改动时用 worktree，不要切分支（切分支会把未提交改动带走）。

## 7. 常用命令与坑

```bash
bash dev.sh                 # 本地起（绕开 WorkBuddy 的 HMR shim；直接 npm run dev 可能 500）
npm test                    # = node --test tests/*.test.mjs（当前 47 项）
npm run build               # tsc --noEmit + vite build
```

- 调试入口：`?scene=forest` / `?scene=room` / `?scene=island` / `?scene=chapter2` / `?scene=chapter2-room` / `?scene=chapter2-memory` / `?scene=chapter3-preview`。
- 美术改动后跑一次 `/usr/bin/python3 tools/optimize-images.py`（PNG 保留，生成同名 WebP）。
- 加载改动用 `node tools/probe-load-perf.mjs` 验收（`ORIGIN=http://localhost:4173` 量生产包）。
- 测试里 `import` 相对模块需要带 `.ts` 后缀（node 直跑 ESM），`tsconfig` 已开 `allowImportingTsExtensions`。
- Vite 只打包被 `import` 的素材；用字面路径加载的文件（如 `scene/*.png`）必须改成 `import ... ?url`，否则构建产物里没有这张图。
- 浏览器验收脚本可用 Playwright：`import { chromium } from '/Users/simon/node_modules/playwright/index.mjs'`，启动加 `--enable-unsafe-swiftshader`；在 WebGL 画布上叠加 DOM 时避免大面积 `backdrop-filter`（会拖慢截图与渲染）。

## 8. 文档地图

| 文件 | 作用 |
| --- | --- |
| `README.md` | 入口与运行方式 |
| `HANDOFF.md` | 当前状态与下一步（本文件） |
| `GAME_STORY_AND_LEVEL_DESIGN.md` | 剧情与六关设计（唯一依据） |
| `STORY_MIGRATION.md` | 新旧故事边界、清理结果、核验证据 |
| `CHAPTER1_ROOM_PUZZLE_COLLABORATION.md` | 第一关房间交互与依赖（玩法规格，不含人物台词） |
| `CHAPTER_TWO_MEMORY_ROOM_DESIGN.md` | 第二关房间设计（Selena 维护） |
| `decisions/2026-10-03-webp-and-load-optimization.md` | WebP 化与加载优化（工具、接入点、实测数据、下一档待办） |
| `decisions/` | 架构与设定决策记录 |
| `archive/` | 全部历史文档，仅作追溯 |
