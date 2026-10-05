# TEAM_GUIDE — 队友上手指南

面向**队友本人 + 队友的 AI**：照抄命令就能跑起来，并绕开已知的坑。
本文只讲"怎么用"；项目当前状态看 `HANDOFF.md`，剧情看 `GAME_STORY_AND_LEVEL_DESIGN.md`。

更新于 2026-10-05。

## 0. 一句话

- 仓库：`https://github.com/SelenaLYU/Seek-game-demo`（private，需被邀请）
- **主线只有 `main`**：`git switch main && git pull` 就是最新。第一关、第二关、记忆之岛入口都在上面。
- 当前 `main` = `03fe100`（2026-10-05：修好了此前 main 的构建失败，并合入第一关全部分支进展）

## 1. 首次起步

```bash
git clone https://github.com/SelenaLYU/Seek-game-demo.git
cd Seek-game-demo
npm ci            # 仓库有 package-lock.json，统一用 npm（不要 pnpm/yarn）
npm test          # 期望：53 passed / 0 failed
npm run build     # tsc --noEmit && vite build，期望 exit 0
npm run dev       # 本地起 http://localhost:5173
```

- Node：Vite 8 要求 `^20.19.0 || >=22.12.0`（本机 22.23.1 验证通过）
- 若在 WorkBuddy 之类沙盒里，用 `bash dev.sh` 代替 `npm run dev`（脚本会清掉被注入的 `NODE_OPTIONS` shim，否则 HMR 连不上 broker 会 500）

## 2. 每日开工

```bash
git switch main
git fetch origin --prune
git status -sb        # 先确认工作区干净
git pull --ff-only
npm ci                # 仅当 package-lock.json 有变化
```

- 工作区有未提交改动时**不要直接 pull**（先 commit 或 stash）
- 同一台机器可能同时有多个会话 / agent 在改东西，动手前一定先 `git status`

## 3. 分支 / 提交 / PR

- 从 main 拉分支：`git switch -c codex/<主题>`
- 提交信息用 Conventional Commits + 中文描述：
  `feat(room): …` / `fix(chapter2): …` / `docs: …` / `chore(assets): …`
- 改完开 PR 到 `main`（main 由 Simon 合并）。推自己的分支没问题，**别直接推 main**
- 提交前自查：`git status` + `git diff --staged`；不要带进 `dist/`、`node_modules/`、`tools/tmp-*.mjs`、美术探索稿

## 4. 资源与资产的硬规则（最容易踩）

1. **代码引用资产 和 资产入库 必须在同一个提交里。**
   `vite.config.mjs` 里有 Phaser 资源守卫：只要代码引用了一个没入库的文件，`npm run build` 会直接失败（`Invalid Phaser asset path` 或 `UNRESOLVED_IMPORT`）。
   自查方法：

   ```bash
   grep -rhoE "assets/[^'\"]*\.(png|jpg|jpeg|webp|mp3|ogg|wav)" src | sort -u | while read p; do
     git ls-files --error-unmatch "$p" >/dev/null 2>&1 || echo "未入库: $p"
   done
   ```

2. **单文件 ≤ 50MB**（GitHub >50MB 警告、>100MB 直接拒绝）。当前仓库最大：`assets/animation/ending.mp4` 26.5MB、骑楼背景 22.2MB。
3. **只入最终版**：探索版 / 中间迭代图（例如 `assets/scenes/chapter2/chapter2-qilou-gen-v*.png`）留在本地，不要入库。
4. 目录约定：

   | 路径 | 内容 |
   | --- | --- |
   | `src/scenes/` | 场景：`MenuScene`、`IntroScene`、`ForestScene`（第一关海岸）、`RoomScene`（第一关记忆之房）、`ChapterTwoChallengeScene` / `ChapterTwoRoomScene` / `ChapterTwoMemoryScene`（第二关）、`IslandScene` + `src/island/MemoryIsland.ts`（记忆之岛） |
   | `src/ui/` | 界面与 HUD |
   | `src/gameplay/` | 纯规则逻辑（配套 `tests/*.test.mjs`） |
   | `src/story/` | 剧本与文案常量 |
   | `assets/level1/`、`assets/level2/<模块>/`、`assets/scenes/chapter2/`、顶层 `scene/` | 美术资源 |
   | `art/` | 美术提示词与资产清单（给人读） |
   | `decisions/` | 口径/架构决策记录（改口径前先 grep 这里） |
   | `archive/` | 历史文档，只作追溯 |

5. `.gitignore` 已排除：`node_modules/`、`dist/`、`.env*`、`screenshots/`、`backup/` 下的大图、`art/island/`（Gloria 要求本地交付）。

## 5. 怎么看内容 / 自测

- 主流程：主菜单 → 序章 → 第一关海岸 → 记忆之房（四谜题链）→ 贝壳回忆 → 相册 → 记忆之岛
  记忆之岛总览里可直接进第二关（未解锁时会显示条件）
- Debug query flag（加在 URL 后）：
  - `?assetReview` 素材审查叠层（`src/ui/AssetReviewOverlay.ts`）
  - `?storeArt` 第二关小卖部美术叠加调试模式
- 测试：`npm test`（即 `node --test tests/*.test.mjs`，当前 53 项）。改了规则 / 交互请补测试

## 6. 合并大改动后必须做的验证（血泪教训）

工作区里有未入库文件时，`npm run build` 可能"假通过"。请用**干净副本**验证：

```bash
git worktree add --detach /tmp/verify HEAD
ln -s "$PWD/node_modules" /tmp/verify/node_modules
(cd /tmp/verify && npm test && npm run build)
git worktree remove --force /tmp/verify
```

为什么必须这样 —— 2026-10-05 踩过两次，都是"本地看着正常、干净 clone 直接挂"：

1. 一次合并把 **27 个文件**（4 个 UI 模块 + 1 个测试 + 22 个小卖部资产）从 main 的树里丢了，而代码还在 `import` 它们 → `TS2307`，构建失败；
2. 分支删掉了占位文件 `assets/story/seek-childhood-photo-placeholder.svg`，但 main 版 `RoomScene.ts` 还在引用 → `UNRESOLVED_IMPORT`。

两处现已修复（`03fe100`）。**合并后跑一遍上面的命令**应成为习惯。

## 7. 文档地图

| 文档 | 用途 |
| --- | --- |
| `HANDOFF.md` | **当前状态与下一步**（唯一权威状态文档，Simon 维护） |
| `GAME_STORY_AND_LEVEL_DESIGN.md` | 剧情依据（主角：韩梅梅） |
| `STORY_MIGRATION.md` | 新旧故事边界、不可复用内容 |
| `CHAPTER_TWO_*.md` | 第二关玩法 / 流程 / 记忆之房设计 |
| `CHAPTER1_ROOM_PUZZLE_COLLABORATION.md` | 第一关房间玩法（只定义交互，不定义台词） |
| `TEAM_GUIDE.md` | 本文：怎么拉、怎么跑、怎么提交 |

## 8. 给队友 AI 的启动提示词（可直接复制）

```text
仓库 https://github.com/SelenaLYU/Seek-game-demo，主线分支 main。
先在 main 上拉新分支 codex/<主题>；开工前跑 git fetch origin --prune && git status -sb 确认工作区干净。

硬规则：
1) 代码引用的任何 assets/ 资源必须和代码在同一个提交里入库，否则 vite.config.mjs 的资源守卫会让 npm run build 直接失败。
2) 不要提交 dist/、node_modules/、tools/tmp-*.mjs、美术探索版；单文件不要超过 50MB。
3) 提交信息用 Conventional Commits + 中文，例如 feat(room): / fix(chapter2): / docs: 。

完成标准：npm test 与 npm run build 都要通过；涉及大合并时，请在干净副本（git worktree）里复跑一遍再报完成。
```
