# HANDOFF — Seek-game 当前状态与下一步

更新于 2026-10-05。这份是**唯一的当前状态文档**；历史口径全部收进 `archive/`。

## 0. 一句话状态

`main` 已包含第一关、第二关灰盒和岛屿章节入口。第一关的**新故事清理已完成**，玩法闭环可玩；回忆结尾已换成同风格分镜并定格到**正式家庭照片**（2026-10-05 提交），录音与贝壳 HUD 仍是显式占位。工程与剧情文档已收敛：当前状态看本文件，剧情看 `GAME_STORY_AND_LEVEL_DESIGN.md`，新旧故事边界看 `STORY_MIGRATION.md`。

## 1. 仓库与分支

- repo：`https://github.com/SelenaLYU/Seek-game-demo`（private）；我的身份 `gxinxing`，权限 push + triage（无 admin）。
- `origin/main` = `0f3c916`（PR #11：第二关记忆之房后半段灰盒 + 后续灰盒至此版结尾）。
- 我的工作分支：`codex/level1-progress-music`（第一关 + UI/工程）。**本地领先远端若干提交，未推送**；推送前先 `git fetch` 再看 `git status -sb`。
- 同日并行会话在做第二关美术 / 第三关灰盒与**李雷童年 3D 建模**（`assets/characters/lilei/tripo-out/`、`tools/*chapter2*` 等未跟踪文件归它）；改动前先看 `git status`，别把对方的在改文件带进提交。
- 只读参考分支：`origin/ART`（骑楼美术）、`origin/island-prototype`、`origin/story-design`。**不要直接 merge `ART`**：它基于很旧的代码，会删掉近万行；只能挑文件。

## 2. 剧情依据（唯一）

- 主角定名：**韩梅梅**（`decisions/2026-10-03-protagonist-name.md`；代码常量 `src/story/ChapterOneStory.ts` 的 `PROTAGONIST_NAME`）。
- 第一关：5–7 岁海边 → 记忆之房 → 三碎片合成**贝壳** → 回忆动画定格家庭照片、收入相册 → 点亮记忆之岛。
- 旧 Demo 的「外公／外婆／鱼鱼／回南城」已从运行时代码中移除；旧结尾视频经核验是**鱼鱼 + 公公 + 粤语信件**，与本故事冲突，**不可复用**（证据见 `STORY_MIGRATION.md`）。

## 3. 第一关（我这一侧）现状

已完成：海边跑酷（第一块低礁出生、海鸥横渡、单朵长距离滚浪与浪后实体落脚礁、只显示实体门楣钥匙、须落地后从门口进入）、房间四谜题链（录音机 → 缺片 → 照片 → 电池 → 手电筒 → 光影小船三笔风）、贝壳合成、存档与版本迁移、HUD、音乐开关、岛屿点亮、相册（六格登记 + 获得状态，入口已接到序章 / 主菜单 / 记忆之岛，第一章已显示正式照片）。

仍是占位（不可当成已完成内容）：

| 项 | 现状 |
| --- | --- |
| 录音 | 3 秒**静默**占位，提前关闭不结算；台词与留声人未定 |
| 家庭照片 | **已接入正式美术**：`assets/story/chapter1-family-photo-seaside.png`（从 `interactive-family-zoo-photo-frame` 裁出画面部分），相册与结尾共用同一份真源 |
| 贝壳 | 房间书桌上已是正式图 `assets/items/room-memory-pearl-shell-v1.png`；HUD 合成进度里的贝壳轮廓仍是代码绘制的灰盒 |
| 结尾 | **已换成同风格分镜**（海边推近 + 逐句字幕 + 照片显影定格 + 相册收录），不再引用旧视频；正式动画到货后只替换 `EndingScene` |
| 相册其余格 | 只有第一章是正式照片，第二至六章未到货仍是「待制作」占位；结局揭示待接入 |

验收记录（2026-10-03，浏览器实跑）：清存档走通「贝壳 → 结尾 → 记忆之岛」，`chapterOneCompleted` 正确写入，旧存档 key 未被读取，0 console error；岛屿显示点亮状态与 `N/6`；相册显示 2/6 且与实际完成章节一致。

验收记录（2026-10-05，浏览器实跑）：新结尾分镜四条字幕 → 照片显影 → 相册收录 → 回岛，0 console error，点击回岛进入岛屿（3D 模型 11/11 已载入）；`menu / room / forest / ending / island / chapter2 / chapter2-room / chapter2-memory / chapter3-preview` 九个入口逐个冷启动，均 0 console error、0 失败请求。

## 4. 第二关（Selena 那一侧）现状

PR #11 已合入：货架八件可交换（穷举 40320 种确认唯一解）、瓶盖一盘一笔画、六幕可点击分镜、回岛点亮第二段、岛屿章节列表 1–3、第三关入口提示「未完待续」+ 选项查看**第三关站位预告**（3 秒灰盒，可跳过，自动回岛）。

注意：第三关「预告」没有动画文件，是 Phaser 画的灰盒站桩；分镜里用的是「韩梅梅／李雷」，李雷仍是暂称。

## 5. 待办

按顺序（我这一侧）：

1. **录音台词**：留声人与内容待定，**不阻塞**——正式内容到位前一直用「3 秒静默 + 明确标注占位」的版本，提前关闭不结算（2026-10-03 决定）。
2. ~~相册接入正式照片，并把入口扩展到序章/主菜单。~~（2026-10-05 完成：第一章照片已接正式美术，入口见 `AlbumUI`）
3. 贝壳正式美术：只剩 HUD 合成进度里那段代码绘制的贝壳轮廓待换成美术。
4. ~~第一章结尾改用同风格分镜占位~~（2026-10-05 完成）；正式动画到位后替换 `EndingScene` 即可。
5. 第一关体验遗留：**已实测复现**（2026-10-05，工具 `tools/probe-level1-experience.mjs`，基线 **1/8 通过**）：
   - **已不存在**：礁石下方隐形碰撞墙（碰撞柱已改为停在岩体贴图内容底边 327/374/402/444/449/499/524，全部 < 水面 540；只有起点沙滩与右岸两块厚地面按设计到 540）。
   - **待修 · 石门右侧裁切**：门美术不透明内容右缘 2913.2 vs 世界右界 2870 → **出界 43.2px**（含透明边 51.3px）。互动区在界内，只是美术被切。
   - **待修 · 抓海鸥瞬间突跳**：真实自动抓取半径是 `tryGrabVine` 默认的 **78px**（场景里 95px 那个只是握点光环的 near 判定）。入口 76px 时单帧位移：渲染框中心 25.4px / 脚底 17.7px / 顶点 33.2px / 碰撞体中心 35.7px。放在 90ms 收回补间里的松手段已有改善（旧账的「瞬间 39px」已被 tween 替代），现在最大 21.8px/帧。
   - **待修 · 触屏（仅竖屏）**：390×844 dpr2 → 缓冲 960×2078、zoom 3.847、逻辑视口宽 250。▶/↑ 重叠 134.7×204.3px（▶ 有 59% 按不到）；状态栏被 zoom 放大 3.85× 后宽 1623.6px，**右溢 732.8px**；起点教学卡只剩 90px 可见且文案是键盘键位。横屏 844×390 三项均正常。
   - 另记（玩家不可见但会影响后续设计）：悬挂期间 `body.enable=false`，Phaser 会跳过 `preUpdate/update/postUpdate`，**碰撞体一直停在抓取前的位置**，松手那一帧才跳回握点。以后若想让海鸥带人撞到礁石／门区，这里会立刻变成 bug。
   - `archive/2026-10-02-bugs-and-ux-review.md` 里的条目仍不可直接当待修清单：其中 P1-5（隐形墙）、P2-2（松手 39px 突跳）已经被后续代码修掉了。
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
- 第一关四条体验遗留（石门裁切／礁石隐形墙／抓放海鸥突跳／触屏适配）用 `node tools/probe-level1-experience.mjs` 量，改前改后各跑一次看数字（`--json` 出原始数据；截图写 `screenshots/level1-experience/`；任一阈值超标退出码 1）。它的探针里记了两个坑：手动步进不推进 tween（量松手补间必须走真实 rAF），以及 sf0 层位置被 `screenSpaceOrigin` 补偿但**尺寸仍被 zoom 放大**（触屏判定要在放大后的缓冲像素里比边界）。
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
