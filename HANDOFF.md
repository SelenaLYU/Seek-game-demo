# HANDOFF — Seek-game 当前状态与下一步

更新于 2026-10-05。这份是**唯一的当前状态文档**；历史口径全部收进 `archive/`。

## 0. 一句话状态

`main` 已包含第一关、第二关灰盒和岛屿章节入口。第一关的**新故事清理已完成**，玩法闭环可玩；回忆结尾已换成同风格分镜并定格到**正式家庭照片**（2026-10-05 提交），贝壳 HUD 也已换成正式美术；**只剩录音是显式占位**。第一关**四条体验遗留已全部修完**（石门裁切／礁石隐形墙／抓放海鸥突跳／触屏适配，探针 12/12，见第 5 节）。工程与剧情文档已收敛：当前状态看本文件，剧情看 `GAME_STORY_AND_LEVEL_DESIGN.md`，新旧故事边界看 `STORY_MIGRATION.md`。

## 1. 仓库与分支

- repo：`https://github.com/SelenaLYU/Seek-game-demo`（private）；我的身份 `gxinxing`，权限 push + triage（无 admin）。
- `origin/main` = `69ee915`（PR #23 队友整合：第二关小卖部记忆之房 v2/v3/v5/v6 美术、翻译与动画格式、音频入库）。
- **2026-10-06：`origin/main` 已合进本分支**（合并提交 `68739ad`，唯一冲突是 `ChapterTwoRoomScene.ts`，以 main 的 ART 帧表版本为准）。
  合并前该分支落后 main 9 个提交，直接合会把队友的 `TEAM_GUIDE.md`、音频、`RoomEnglish/RoomPaperTheme` 一并删掉——**落后时先 fetch + 把 main 合进分支，别直接开 PR 合**。
- 当前骑楼工作分支：`codex/level1-progress-music`（第一关 + UI/工程），本批提交基于 `139596f`；推送后该分支相对 `origin/main` 落后 7、领先 11 个提交。PR #18 已合并，本批变更是新的提交，不属于 PR #18；推送后需另开 PR / review。先 `git fetch` 再看 `git status -sb`，不要 force push。
- 同日并行会话在做第二关美术 / 第三关灰盒与**李雷童年 3D 建模**（`assets/characters/lilei/tripo-out/`、`tools/*chapter2*` 等未跟踪文件归它）；改动前先看 `git status`，别把对方的在改文件带进提交。
- 只读参考分支：`origin/ART`（**白昼**骑楼美术，2026-10-05 已废弃，见 `decisions/2026-10-05-qilou-art-night-only.md`）、`origin/island-prototype`、`origin/story-design`。**不要直接 merge `ART`**：它基于很旧的代码，会删掉近万行；只能挑文件。

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
| 贝壳 | **已全部接入正式美术**：房间书桌上是 `assets/items/room-memory-pearl-shell-v1.png`；HUD 合成进度用它的 168px 缩小版 `room-memory-pearl-shell-hud-v1.png`（三片记忆各点亮贝壳的一条带子，未收是淡色残影） |
| 结尾 | **已换成同风格分镜**（海边推近 + 逐句字幕 + 照片显影定格 + 相册收录），不再引用旧视频；正式动画到货后只替换 `EndingScene` |
| 相册其余格 | 只有第一章是正式照片，第二至六章未到货仍是「待制作」占位；结局揭示待接入 |

验收记录（2026-10-03，浏览器实跑）：清存档走通「贝壳 → 结尾 → 记忆之岛」，`chapterOneCompleted` 正确写入，旧存档 key 未被读取，0 console error；岛屿显示点亮状态与 `N/6`；相册显示 2/6 且与实际完成章节一致。

验收记录（2026-10-05，浏览器实跑）：新结尾分镜四条字幕 → 照片显影 → 相册收录 → 回岛，0 console error，点击回岛进入岛屿（3D 模型 11/11 已载入）；`menu / room / forest / ending / island / chapter2 / chapter2-room / chapter2-memory / chapter3-preview` 九个入口逐个冷启动，均 0 console error、0 失败请求。

验收记录（2026-10-05，四条体验遗留修复）：`tools/probe-level1-experience.mjs` 在 dev（5173）与生产包（4173，`npm run build` 后）各跑一次，**均 12/12**；`npm test` 49/49；`tools/test-e2e.mjs` 14/14、0 console error；竖屏 390×844 与横屏 844×390 截图各看一遍（门右侧完整、按钮不叠、状态栏折行、帮助面板正文不压按钮）。

验收记录（2026-10-05，贝壳 HUD 接正式美术）：`?scene=room` 逐片触发 0/3 → 1/3 → 2/3 → 3/3，四张卡片截图对照（残影 → 逐带点亮 → 满片辉光），0 console error；竖屏 390×844 下卡片只有 43×19.5 CSS px，贝壳仍分辨得出“灰影 vs 彩贝”；`npm test` 51/51；`npm run build` 后 `dist/assets/room-memory-pearl-shell-hud-v1-*.png` 存在（37.6KB）。

验收记录（2026-10-05，WebP 补漏）：记忆之房传输 **16710KB → 2611KB**（png 8 张 → 0 张）、第二关夜骑楼 **11903KB → 1487KB**；`ORIGIN=http://localhost:4173 node tools/probe-load-perf.mjs --runs=3` 海边 212ms / 房间 381ms、0 长任务 0 失败；`?scene=chapter2` 逐个 texture 检查 10/10 存在且尺寸正确、0 console error；两个场景截图眼检无色损；`npm test` 54/54；`tools/probe-level1-experience.mjs` 12/12；`tools/test-e2e.mjs` 14/14。根因与防线见 `decisions/2026-10-03-webp-and-load-optimization.md` 第 7 节。

验收记录（2026-10-05，第二关素材审查面板 WebP）：AssetReviewOverlay 与房间调试背景接入 `resolveImageUrl()`；审查清单 12 张图新增 WebP，总清单 **109.22MB → 10.81MB（节省 90.1%）**。面板浏览器逐个检查 **21/21** 加载成功，0 console error / 失败请求；宽幅底图目视无色损。`npm test` 55/55、`npm run build`、`tools/probe-level1-experience.mjs` 12/12、`tools/optimize-images.py --check` 通过。`tools/test-e2e.mjs` 与 `tools/probe-load-perf.mjs` 因 Chrome CDP `127.0.0.1:9333` 未启动而未运行；待补验。详见 `decisions/2026-10-03-webp-and-load-optimization.md` 第 7 节。

验收记录（2026-10-05，骑楼美术定源 + 白昼骑楼清除）：骑楼美术以**夜骑楼** `assets/level2/night-v1/`（ruchengloria `648cadd`，10-03 17:57）为**唯一真源**；复核过 PNG 与该提交逐字节相同、35 张图（34 件场景素材 + 1 张背景）全部接入、尺寸与 `geometry.json` 逐项吻合、`?scene=chapter2` 七处取景 0 console error。白昼骑楼图集 4 组 + 宽幅底图连同接线 WIP 全部移除，**共删 32.81MiB**（PNG 29.55 + WebP 3.26）。素材审查面板 21 → 16 条（PNG 52.38 → 22.83MiB、WebP 5.23 → 1.97MiB）；`tools/optimize-images.py` 清单 83 → 78 条（PNG 109.22 → 79.66MiB、WebP 10.81 → 7.54MiB）。裁定见 `decisions/2026-10-05-qilou-art-night-only.md`。

## 4. 第二关（Selena 那一侧）现状

验收记录（2026-10-05，骑楼修正）：路线现在靠场景构图，不叠箭头文字；底部 status/checkpoint 文案隐藏，章节标题固定在起点世界坐标。封墙碰撞从世界顶边延伸至 y=734，避免跳过二层折返；**2026-10-06 修正：视觉必须跟着碰撞一起加高**——先前只加碰撞、贴图仍按原始 38×286 绘制，玩家看到矮墙却过不去，就是第 5 节的「隐形墙」写法。`w01` 是 38×286 的连续柱面切片（无顶无底），所以按 `ceil(height / NIGHT.wall.height)` 纵向平铺盖满碰撞盒，**不拉伸**（拉伸会把石砌纹理抹成条纹）；探针 A1 现改为检查「平铺堆叠是否刚好盖住碰撞盒」。修复长街 p09 与背景亮檐之间的暗缝：`tools/fix-chapter2-p09-coping.py` 将 p09 顶部两行从同坐标背景亮檐取样重建，PNG 保留、WebP 同步；`--check` 通过。此前 ROUTE_HINT_DEPTH=17 的文字提示已由本次无箭头方案取代。**2026-10-06 复验**：「底层向右连跳翻不过封路墙」这件事现已入库为探针 G1，并用 G2 把碰撞盒改回 `1682,448,38×286` 重跑作对照——旧碰撞盒下同一次冲刺能跑到 x=2434（旧墙右沿 1701），证明加高之前玩家确实能翻过墙跳过「向左折返」；还原后最远停在 x=1646（墙左沿 1663）。当前探针 `tools/probe-chapter2-qilou.mjs` **13/13 通过**（A1 35 张贴图对齐 geometry；B1/B2 遮挡与空地对照；C1 无箭头/底栏、起点标题固定；C2 无文字遮挡；D1–D4 可玩性；E1 四检查点；G1/G2 封路墙；F1 0 console error）；`npm test` 74/74，`npm run build` 通过。

验收记录（2026-10-06，并入 main 后的收口）：
- **主菜单相册入口补回**：base 里有、被队友 `e626923`（翻译与动画格式）静默删掉（`album.test.mjs` 因此长期红）。封面只画了 4 个按钮、没有空位，所以挂在「关卡与阶段快速选择」面板里，并在 `SHUTDOWN` 收掉 DOM 覆盖层。浏览器实测：面板出现「【 相册 · 回忆收藏 】 已收录 0 / 6 张」，点开 `.seek-album` 出现、关闭后不残留。
- **同面板层级 bug**：面板背景是**最后** `add` 进容器的，把按钮与说明压在 0.98 不透明的板下面（标签几乎看不见、只有溢出板外的部分露出来）。背景改为先入容器，面板 520 → 700 宽（说明文字原来溢出板外）。
- **WebP 管线覆盖 PR #23 的新美术**：小卖部 8 张 + 菜单封面 + 信纸共 9MB 此前未登记，且 `resolveImageUrl` 只剥 `png/webp`——`.jpg` 源（货架、商品母版、信纸 4 张）永远命中不了同名 webp、会安静拉原图。修后运行产物合计 **77.28MB → 7.38MB（-90.4%）**；实测 `?scene=chapter2-room` 7 张图与信纸全部走 `.webp`，菜单封面走 `menu-main-v1.webp`，0 console error。
- **电台频道数分歧（需 Simon / Selena 裁定）**：队友把写死的 4 个频道重构成 `CHANNEL_COUNT`，值改成 **3**（UI 写 `/ 03`、文案「三个频道都听过了」）；`CHAPTER1_ROOM_PUZZLE_COLLABORATION.md` 仍写「四频道」。测试不再钉死数字，只锁「集齐 → `onAllChannelsVisited` → 发照片拼块」不变量，并校验界面频道数与常量一致。

PR #11 已合入：货架八件可交换（穷举 40320 种确认唯一解）、瓶盖一盘一笔画、六幕可点击分镜、回岛点亮第二段、岛屿章节列表 1–3、第三关入口提示「未完待续」+ 选项查看**第三关站位预告**（3 秒灰盒，可跳过，自动回岛）。

注意：第三关「预告」没有动画文件，是 Phaser 画的灰盒站桩；分镜里用的是「韩梅梅／李雷」，李雷仍是暂称。

## 5. 待办

按顺序（我这一侧）：

1. **录音台词**：留声人与内容待定，**不阻塞**——正式内容到位前一直用「3 秒静默 + 明确标注占位」的版本，提前关闭不结算（2026-10-03 决定）。
2. ~~相册接入正式照片，并把入口扩展到序章/主菜单。~~（2026-10-05 完成；2026-10-06 补回被 main 静默删掉的**主菜单入口**，见第 4 节验收记录）
2b. **裁定电台频道数**：代码 3 个 vs 设计文档「四频道」，二选一后同步文档与 UI（不阻塞）。
3. ~~贝壳正式美术~~（2026-10-05 完成）：HUD 那段手绘 SVG 灰盒已换成正式水彩贝的 168px 缩小版（`assets/items/room-memory-pearl-shell-hud-v1.png`，派生命令写在 `src/ui/FragmentHud.ts` 文件头）。三片记忆不再分割手绘轮廓，而是各用一条渐变遮罩点亮同一张真图的左/中/右带；未收集的部分是淡色残影，三片到齐给整只壳加暖光。锁进 `tests/hudShellArt.test.mjs`（必须走 Vite `?url`、不得回退到内联 `<svg>`、图标必须是缩小版而不是 1.7MB 源图）。
4. ~~第一章结尾改用同风格分镜占位~~（2026-10-05 完成）；正式动画到位后替换 `EndingScene` 即可。
5. ~~第一关体验遗留~~（2026-10-05 全部修完，工具 `tools/probe-level1-experience.mjs` 从基线 **1/8 到 12/12**，dev 与生产包各跑一次都是 12/12）：
   - **已不存在**：礁石下方隐形碰撞墙（碰撞柱已改为停在岩体贴图内容底边 327/374/402/444/449/499/524，全部 < 水面 540；只有起点沙滩与右岸两块厚地面按设计到 540）。
   - **已修 · 石门右侧裁切**：`WORLD_WIDTH` 2870 → **2930**（按门贴图反推：开口中心 2680、贴图不透明内容右缘 2913.2，旧值白切 43.2px）；右岸地面同步到 2930。
   - **已修 · 抓海鸥瞬间突跳**：真实自动抓取半径是 `tryGrabVine` 默认的 **78px**。新增 130ms `Sine.InOut` 接近插值，把根节点位置/旋转与精灵锚点一起插到抓取姿态；入口 76px 时单帧角色身体中心位移 **25.4px → 2.99px**（根节点 4.32px）。缓动必须用 InOut：锚点从「脚底对齐」换到「握点对齐」自带 ~101px 局部偏移，`Cubic.Out` 会把 39% 挤在第一帧。
   - **已修 · 松手突跳**：53px 悬垂量由 90ms `Quad.easeOut`（峰值 21.8px/帧）改为 160ms `Sine.easeInOut`（峰值 **≈8px/帧**，含甩出初速的整体峰值 10.3px/帧）；抓取接近途中松手时用当前实际脚底偏移当起点，锚点不硬切。
   - **已修 · 触屏（仅竖屏，逻辑视口宽 250）**：按钮按字号实测宽度重排（原来 ▶/↑ 重叠 134.7×204.3px，▶ 有 59% 按不到）；状态栏缩字号 + 按显示宽度折行（右溢 732.8px → 界内）；教学卡与帮助面板窄屏缩放居中，文案按触摸/键盘分流（原来教学卡只剩 90px 可见且是键盘键位）。帮助面板高度改为按正文实测高度算（写死 360 时正文压住关闭按钮：landscape 重叠 30.2px / portrait 13.1px，探针 D7 盯这个）。横屏一直正常。
   - 另记（玩家不可见但会影响后续设计）：悬挂期间 `body.enable=false`，Phaser 会跳过 `preUpdate/update/postUpdate`，**碰撞体一直停在抓取前的位置**，松手那一帧才跳回握点。以后若想让海鸥带人撞到礁石／门区，这里会立刻变成 bug。
   - `archive/2026-10-02-bugs-and-ux-review.md` 里的条目仍不可直接当待修清单：P1-5（隐形墙）、P2-2（松手突跳）早已修掉。
6. 推送分支 + 开 PR。

已裁定（2026-10-05）：骑楼美术以夜骑楼（ruchengloria `648cadd`）为准，白昼骑楼图集与宽幅底图及全套接线 WIP 已废弃并删除（`decisions/2026-10-05-qilou-art-night-only.md`）。并发编辑归属仍按下节规矩处理。

## 6. ⚠️ 并发编辑风险

同一个工作区里可能有**另一个会话**同时在改第二关（观察到 `src/scenes/ChapterTwoChallengeScene.ts`、`src/gameplay/chapterTwoRules.ts`、`tests/chapterTwoRules.test.mjs` 被反复改写）。另注意：工作区随时可能被那个会话切分支（2026-10-05 18:08 就被从 `codex/level1-progress-music` 切到 `main`），动手前先 `git branch --show-current`。

规矩：

- **禁止 `git add -A`**；一律显式路径提交，且提交前先 `git status` 确认没把别人的在改文件卷进来。
- 提交只用 `git commit -F - -- <显式路径>`（`-F -` 必须写在 `--` 前面）。
- 需要隔离改动时用 worktree，不要切分支（切分支会把未提交改动带走）。

## 7. 常用命令与坑

```bash
bash dev.sh                 # 本地起（绕开 WorkBuddy 的 HMR shim；直接 npm run dev 可能 500）
npm test                    # = node --test tests/*.test.mjs（当前 71 项）
npm run build               # tsc --noEmit + vite build
```

- 调试入口：`?scene=forest` / `?scene=room` / `?scene=island` / `?scene=chapter2` / `?scene=chapter2-room` / `?scene=chapter2-memory` / `?scene=chapter3-preview`。
- 美术改动后跑一次 `/usr/bin/python3 tools/optimize-images.py`（PNG 保留，生成同名 WebP）；只体检用 `--check`（缺 WebP 或 WebP 比 PNG 旧就退出码 1）。
- 第二关骑楼（贴图对齐／遮挡可用／提示克制／可玩性／检查点）用 `node tools/probe-chapter2-qilou.mjs` 量（`ORIGIN=http://localhost:5179` 指定端口；`--json` 出原始数据；截图写 `screenshots/chapter2-qilou/`；任一条不达标退出码 1）。**当前 13 条全过**。它记了四个坑：采样不能放在自写的 rAF 循环里 await（headless 下 180ms 只有 1–3 帧游戏帧，会读到「角色还没起步」→ 十处遮挡全假绿），要按游戏帧数而非墙钟等待；落地判定要轮询（掉帧时 500ms 重力只推进一两帧）；位移别靠键盘投递，用 `preupdate` 里的小幅摆动制造 `moved` 判定；同层对照点不能落在摆动障碍扫掠范围内（610 层的 900 正好在「甩动竹竿」下面，角色一放下去就被打回检查点，会被报成「没落到平台上」的假 FAIL，已挪到 1250）。改探针前先看文件头。
- 加载改动用 `node tools/probe-load-perf.mjs` 验收（`ORIGIN=http://localhost:4173` 量生产包）。
- 第一关体验（石门裁切／礁石隐形墙／抓放海鸥突跳／触屏适配）用 `node tools/probe-level1-experience.mjs` 量，改前改后各跑一次看数字（`--json` 出原始数据；截图写 `screenshots/level1-experience/`；任一阈值超标退出码 1）。**当前 12 项全过**（A 门裁剪 · B 礁柱 · C1 抓取突跳 / C2 收身补间 / C3 收身整体 / D1–D7 触屏）。当年基线是 8 项，后来拆成 C1/C2/C3 并补了 D5–D7，所以「基线 1/8」与「现在 12/12」不是同一张表，数字对照要按同一版脚本跑。它的探针里记了两个坑：手动步进不推进 tween（量松手补间必须走真实 rAF），以及 sf0 层位置被 `screenSpaceOrigin` 补偿但**尺寸仍被 zoom 放大**（触屏判定要在放大后的缓冲像素里比边界）。测「角色在哪」不能用 `sprite.getBounds()`（含透明边的帧矩形，换帧会被读成位移），要按当前帧 alpha>128 内容中心算（脚本里 `installOpaqueCenter`）。
- 测试里 `import` 相对模块需要带 `.ts` 后缀（node 直跑 ESM），`tsconfig` 已开 `allowImportingTsExtensions`。
- 浏览器验收脚本（`probe-*` / `debug-chapter2-*`）在**机器负载 ≳15 时会不稳**：headless 掉到 ~3fps，Phaser 每帧 delta 被压到 ~16ms，实测出现过 room 16/17、flow 13/20、骑楼探针 9/10 这类假 FAIL（负载降下来重跑即恢复）。所以结论要在 **load < 15** 时采集；这些脚本已按「轮询到状态为止」写，不依赖固定等待。机制是：headless 掉到 ~3fps：Phaser 每帧 delta 被压到 ~16ms，于是 `delayedCall(470)` 这类计时在墙钟上要 6–10 秒才走完（实测 `restartFromCheckpoint` 6.5s，正常 60fps 下 0.47s）。所以计时相关的断言必须**轮询到状态为止**，不能固定 `waitForTimeout`；同理「站定」不能用 `body.blocked.down`（只在分离那一帧为真）。踩过的详细记录见 `tools/probe-chapter2-qilou.mjs` 与 `tools/debug-chapter2-street.mjs` 的文件头。
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
| `decisions/2026-10-03-webp-and-load-optimization.md` | WebP 化与加载优化（工具、接入点、实测数据、下一档待办；第 7 节是 2026-10-05 的补漏） |
| `decisions/` | 架构与设定决策记录 |
| `archive/` | 全部历史文档，仅作追溯 |
