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

## 9. 记忆之岛 3D 接入（岛屿线，本轮）

六栋 Tripo 建筑、主角模型、章节灰化/点亮都已接入并跑通；此前这条线没写进本文件，事实与判据记在这里，
选型细节见 `decisions/2026-10-05-island-model-orientation.md`（朝向）与
`decisions/2026-10-05-island-hdr-lighting.md`（光照）。

- **朝向**（2026-10-05 修）：六栋 `buildingPresentation[].yaw` 与角色 `model.rotation.y` 都改成 `-Math.PI / 2`。
  此前六栋与角色都用 `π`，症状不同：建筑门面比门前交互点偏 90°；角色按 W 只看到侧脸（**横着走**）。
  原因是同一套 Tripo 流程的作者朝向是**本地 `+X`**（不是 glTF 常见的 `-Z`）。
- **量朝向的工具**：`node tools/orient-probe.mjs <glb> [端口]` 八向罗盘，入口正对相机那格的角度就是该模型的 yaw。
  **蒙皮模型必须每格重新加载 GLB**（`clone()` 的骨骼指向原骨架、复用节点会转双倍角度），且蒙皮罗盘只是旁证——
  角色罗盘的 90°/270° 两格都像正脸，最终判据是岛内实走：按 W 看背面、按 S 看正脸。
- **门前可达性**（按载入时实测 `fittedSize` 复算 `allowed()` 的轴对齐盒）：六栋门点到盒边界 0.25（04 树屋，
  `site.yaw = -π/4` 的斜向门点被轴对齐盒切掉一部分）～1.79（01 贝壳屋）个世界单位，都远小于 2.8 触发半径，
  不需要改碰撞；树屋的 0.25 是当前最小值，若以后加宽碰撞要重算。
- **光照**（2026-10-05 改）：原来「半球光 1.45 + 一盏定向光 2.15」且不做 tone mapping，症状是**没有形** **（配方已于 2026-10-06 再调：env 0.45→0.30、主光 2.8→5.5，见 §10.1）**
  （每个朝上的面都同一亮度，像平涂）。现在环境光走 HDR（`public/env/sky-sunny.hdr` → PMREM →
  `scene.environmentIntensity = 0.45`），渲染器改 `NeutralToneMapping` / exposure `1.32`，解析光只剩
  一盏主光（`2.8` + 投影）和一盏弱补光（`0.24`），半球光降到 `0.16` 只当防纯黑地板。**主光方向跟随
  HDR 里烤进像素的太阳**：CPU 扫 half-float 纹素取最亮方向，再把整个 environment 与主光一起转到
  `KEY_SUN_AZIMUTH`，避免两盏光源方向各说各话。顺带修掉旧阴影视锥 `±26 / far 80` 罩不住跨度 `±34`
  的岛屿——外圈建筑此前**投不出影子**。配方表、备选方案、验证数据见
  `decisions/2026-10-05-island-hdr-lighting.md`；改动前后对照图（本地，不入库）在
  `screenshots/island/lighting-before-after/`。
- **仍是评审脚手架**（不是成品内容）：`?focusChapter=N`、`?artPreview=color`、`?islandPreview=1`、
  `?ch05Candidate=1`（CH05 候选模型 + 屏上开关）、载入时打的 `console.info` 尺寸日志。
- **不许穿模（硬约束）**：判定在 `src/island/clipping.ts`，回归测试 `tests/islandClipping.test.mjs`（61 项里 8 组）。
  散布摆放必须走 `canPlace`（不过就丢点），摆完跑 `auditPlacements` 复核。已知待清的现场穿模清单见
  `decisions/2026-10-05-no-clipping-island.md`（栈桥断在半空、建筑底座陷沙、树压屋角、崖壁裙边接缝、道具探出岛缘）。
- **光照（2026-10-05 改）**：`scene.environment` 接 `public/env/sky-sunny.hdr`（439KB，Poly Haven CC0， **（2026-10-06 再调：env 0.45→0.30、主光 2.8→5.5，见 §10.1）**
  1k 原图 1.7MB 在软件渲染下让进岛从 18s 拖到 67s，已降到 512×256）。HDR 自带太阳在方位 54.5°/高度 16.5°
  （贴地平线且在镜头背后，形体和影子都不出来），所以把环境与主光一起转到 `KEY_SUN_AZIMUTH`。
  半球光 1.45→0.16、主光 2.15→2.8、`NeutralToneMapping` + exposure 1.32；阴影视锥 ±26 → ±38
  （原来外围地标落在视锥外，根本投不出影子）。
- **栈桥桥面改成分段贴地**（2026-10-05，清掉 decisions 现场清单第一条「栈桥与岸线衔接」）：
  根因是 deck 整块钉在桥中心一处固定高度，而地形沿桥跨起伏，实测桥面相对地形
  栈桥A +0.151 悬空 / -0.711 深陷，栈桥B +0.989 / -0.363——一头埋进坡里、一头悬在半空。
  现在沿桥跨密集采样真实地形（12 段，段间线性插值；**不能只取两岸端点直线插值**，
  直线会插过地形，桥中悬空 0.38），抬升分两段：两端 15% 压进岸里 -0.06 严丝合缝、
  过岸线才抬到桥板厚 +0.12（架在水上是对的）。deck 拆 9 段各自倾斜，桥柱/扶手挂同一曲线。
  `walkableHeight` 也改走这条 `surfaceAt` 曲线，否则玩家会踩在看不见的平面上。
  验证：`node tools/audit-island-ground-seams.mjs` + 逐点复核，岸段悬空 0.000、跨溪 +0.120。
- **art/ 未跟踪素材处置**（2026-10-05）：
  · `art/island-assets-by-xiaomi/`（15MB 六栋建筑三视图 + 全景图）**继续排除**——
    该目录自带 README 写明「本文件夹为本地交付资料，暂不上传 GitHub」，是交付方决定，
    已固化进 `.gitignore` 并注明出处，以后别误提交。
  · 入库三份参考文档：协作稿 `memory-island-buildings-collaboration.md`、
    通行规划 `memory-island-layout-walkability-v01.md + .svg`（矢量源，md 里
    「需要程序/整合验收的点」是待落实实测项，含两座木桥的桥面通行例外）。
  · 两个大 PNG（3.4MB / 6.1MB）是评审产物未入库，SVG + md 已够追溯；要留就单独说。
- **散布系统接进场景（2026-10-05 补齐，此前判定层与测试层都在、唯独没接线）**：
  环岛 18 棵树、粉色树丛 4 棵、38 丛地被原先是三处硬编码循环（固定角度/固定螺旋），
  只判「离岸/离路/离溪」，**从不跑穿模判定**；props/README 与 decisions 却写着
  「由 `src/island/scatter.ts` 摆放并过审计」，而那个文件根本不存在。现在：
  - 新增 `src/island/terrain.ts`——地形/岸线/溪流/山头算式抽成单一真源。
    原先这些公式只躺在 `MemoryIsland.ts` 里，探针若要量地形只能抄一份，
    抄的那份迟早和渲染漂移（「审计过了但岛上一眼看得出穿模」就是这么来的）。
  - 新增 `src/island/scatter.ts`——所有落点先过 `canPlace`，**被否决就丢，不挪**；
    摆完 `auditPlacements` 全量复核。散布一律世界坐标（x 未经 `MAP_SCALE_X`），
    与 `clipping.ts` 的 `Footprint` 口径一致；只有地形高度函数吃岛本地坐标，故经
    `terrainHeightWorld()` 换算。
  - 8 件 Tripo 道具真正上岛（此前只是入库，运行时没加载）：按目标高度缩放后
    **底面贴地**摆放（模型原点在几何中心，直接放会有一半埋土里）。
  - 回归 `tests/islandScatter.test.mjs` 6 项（规则没被改松、种子可复现、压盒/压门前圈/压路被丢、
    落点坐地）；`npm test` 67/67。`node tools/probe-island-scatter.mjs` 实跑：
    审计通过 `{trees: 18, grove: 4, cover: 38}`，0 console error，基线截图 `screenshots/island/scatter-overview.png`。
  - 接线时当场抓出 3 条互穿（`tree#2` 压 `cover#0/#4`、`tree#15` 压 `cover#2`）：
    原因是 `cover` 规划时没把已摆好的 `trees`/`grove` 放进 `placed`，
    正是「摆的时候一套规则、审的时候另一套」这个失效模式本身。修掉后审计转绿。
  坐标口径提醒：`walkwayPaths`/`sites` 存岛本地坐标，散布要世界坐标，
  接的时候经 `walkwaysInWorld` 换算过一次；别再抄一份地图缩放。
- **散布道具**：Tripo P1 生成 8 件（岩石×2、珊瑚、花丛、灌木、棕榈、阔叶树、樱树，共 320 积分），
  `node tools/import-island-props.mjs` 归一化命名并压到 512 贴图 → `public/island-models/props/`（14.3MB → 872KB）。
  原始产物与 task id 见 `public/island-models/props/README.md` 与 `art/island/props/tripo-out/`（本地）。
- **未入库美术待 Simon 处置**：`public/island-models-candidates/ch05-tent/`、`art/island/`
  （`.gitignore` 写明「本地交付资料，暂不上传」）、`art/memory-island-*.{png,svg,md}`。
- **待确认（光照素材授权）**：`public/env/sky-sunny.hdr` 已随光照改动一起入库，但**来源与授权没有记录**
  （文件内只剩 `#?RADIANCE` 头，无作者/软件注释；同目录 `/tmp/keep-1k.hdr` 是它的 1024×512 上游版本，
  也无线索）。观感像 Poly Haven 一类 CC0 户外 HDR，但无证据——需要 Simon 确认来源，或换成有明确出处的素材。

## 10. 三维（记忆之岛）问题状态（2026-10-06）

分三栏写清楚：**已修**才敢写「完成」，其余一律标注未解/未验证。上一轮把四个方向
（地形破面 / 光照 HDR / 人物模型 / 体验性能）拆成四个并行 agent 跑，结果是
**3 个死在 provider 503（`no_healthy_account`）、1 个被中止**，所以这一批基本没产出结论，
只有地形那条摸到了根因并留下修复。这也解释了「为什么看起来没人解决」：不是没人查，
是整批没跑完，而且唯一跑出来的改动当时没提交。

### 10.1 已修（有实测数字）

- **岛缘「塑料底座盘」（本轮修，提交 `57df578`）**：两条成因都不是配色——岸壁剖面只有两行
  等于一堵无起伏直墙，且地形外缘高度整圈恒为 1.15，于是檐口是一条水平圆环（直墙 + 水平檐口
  + 完美圆 = 机切塑料件）；另一条是水线以上挂了一圈 1.8 高的竖直浅色浅滩带，半径与崖壁几乎重合。
  现在改四行剖面（地形边缘 → 外挑檐口 → 中段岩体 → 水下脚）+ 确定性半径/高度扰动 +
  按角度连续取色（原来 `segment % 4` 是 48 组硬条纹），浅滩压到水下，礁石从 coastline+1.05
  收到岸脚 +0.55±0.45。**顺手修掉岸壁末列重复导致法线接缝被劈开的那条竖直硬边**
  （与地形环同一个坑）。取证探针 `tools/shot-island-rim.mjs`（俯视总览看不出岛缘，必须换机位）。
  人眼确认：`screenshots/island/rim/cmp-grazing-final2.png`（按 `.gitignore` 不入库）。
- **建筑在坡地上一侧悬空（本轮修，提交 `57df578`）**：落位原取 footprint 九采样的**最高**地形，
  下坡侧整个挂空——实测跨度 ch03 0.688 / ch04 0.608 / ch05 0.614 世界单位（ch01 0.077、
  ch02 0.138 本是平地看不出来）。改取最低点并采样真正的四角；六栋 `worldMinY` 相对最低点
  实测 −0.005…+0.004，代价是上坡侧最多埋进坡里 0.72（房子坐在坡里 vs 悬空，前者才对）。
- **整岛「没有形」（光照偏平，本轮修，提交 `fff0a4e`）**：`environmentIntensity` 0.45→0.30、
  主光 2.8→5.5，实测岛屿区域对比度 **0.671→0.730**、区域内过曝 0%、全图过曝 0.056%→0.056%
  不变（`node tools/probe-lighting-ab.mjs --origin=http://localhost:5173`）。
  两条死路也量掉了：**改 exposure 不动对比度**（1.15→1.50 只把均值 0.360→0.411），
  **抬主光仰角反而更平**（16.5°→45° 对比度 0.671→0.660，只是把均值抬到 0.493）。
  env 压到 0.18 对比度还能到 0.756，但死黑 0.126%→0.356%，暗部开始糊，不划算，停在 0.30。
  人眼确认（本地 `screenshots/island/lighting/contact-before-after.png`，按 `.gitignore` 不入库）：
  中央沙丘有了受光/背光面，树影与屋檐明暗可读。**这是本轮唯一做过视觉确认的 3D 改动。**
- **地形法线折痕（本轮修，提交 `696bf08`）**：地形每圈多一列重复顶点，几何上重合但把
  邻接面劈成两半，两半法线不同 → 从**岛心到岸线一条笔直的光照折痕**，并产生零面积三角形。
  改成真正闭合（索引收尾 `% terrainSegments` 回绕）。实测 `node tools/analyze-terrain-seam.mjs`：
  零面积三角形 0 / 朝下 0；**闭合处法线夹角中位 1.472°、max 13.08°，普通相邻中位 1.254°、
  max 19.41°** → 闭合处与普通相邻同量级，折痕消除。`npm test` 67/67、`npm run build` 通过。
- **栈桥与岸线衔接**（提交 `c3944a2`，见 §9）。
- **树/道具回避建筑 footprint、散布离岸距离**（随散布系统接入解决，见 §9）。

### 10.2 未解（decisions 现场清单里剩下的）

- **岛轮廓仍接近椭圆**（本轮修完后仍在）：扰动幅度只有 ±0.5 世界单位，总览机位读不出来；
  要真正打破机切感得做数十单位的低频起伏，那会动到 coastlineRadius（共用真源），不建议顺手做。
- **地形内部可见同心色带**（本轮对照图里看到、还没量）：外圈绿色带是高程环的顶点色分段
  上的，近看有台阶感。要治得加一层噪声到顶点色或改用贴图，属于另一轮的事。
### 10.3 角色线：已验数字与仍未验的部分（2026-10-06 补测）

用独立探针 `tools/probe-character-grounding.mjs` 逐帧采样 1211 帧（W 行走、爬坡、Shift 跑、原地跳 ×3）。

**已验（成立）**

- **贴地校正不写成累加，成立**。`model.position.y − groundOffset` 全场只出现 **1 个值（3.36e-7）**，
  模型单帧最大跳变 **0**；另一轮在坡上确实触发过 clamp，也只出现 `{0, −0.08}` 两个值，**无累加**。
  注释声称的「不要逐帧积分」是真的。
- **`player.position.y` 没有无界单调漂移**：796 个静止帧每帧 Δy 恒为 **0**；移动帧最大单帧 0.317
  （2.0/s，是地形跟随不是漂移）。`|feetError| > 0.08` 那条分支确实会动，但它是**跳到新平衡点**
  （取脚底世界坐标做不动点迭代，几帧内收敛），不是累积。
  ⚠️ 读到「出生点起 `player.position.y` 比裸地形高 0.12 且不回归」不要当成 bug——那正是本轮新增的
  `pavingLift`（踩在路面上补回路面 ribbon 的 0.12 抬升），见 10.1。
- **比例不失真（数字）**：缩放 2.05，角色世界尺寸 `0.749 × 2.05 × 1.055`；设计门洞 2.25，
  角色是门洞的 0.91，**不超过门高**；建筑可见高 4.08–5.86；路面世界宽 1.89–3.49。
  **没量到**：渲染出来的 GLB 门高（blockout 门 `visible=false`，无法从几何里分离）。
- **灰化只作用在建筑上**：6 个建筑材质挂 `uIslandGray`（值 1 = 本段记忆未点亮；预置已完成章节时
  对应建筑转 0）；**角色 0 挂载**、非建筑挂载 0，标题是 DOM。链接程序 6/6 确实含该 uniform。
  语义提醒：灰 = 「这段记忆没点亮」，**与「是否已解锁可玩」不是一回事**（空存档下 ch1 也是灰的）。

**新发现（重要，本轮没修）**

- **贴地校正读的是 `SkinnedMesh` 首次缓存的 bind-pose 包围盒**，对骨骼动画完全不敏感：
  跳跃时真实蒙皮脚底抬到 **+0.336**，而校正看到的 `feetError` 恒为 0；最坏姿势下真实脚底比站立面
  低 **0.047**。也就是说这套校正对动画/步态**实际近乎 no-op**，它治的只是根节点偏移。
  影响量级很小（最坏 4.7cm），本轮按「先记录不扩大改动面」处理；真要修得按骨骼取脚点，
  不能再用 `Box3.setFromObject`。

**仍未验**

- **性能无基线**：`tick` 里每帧 `updateMatrixWorld(true)` + `Box3.setFromObject`、遮挡回退 raycast、
  散布材质 `material.clone` 都只是「重点怀疑」，没有数字（本机软件渲染，绝对帧率无意义，需要相对基线）。
- **视觉确认**：光照与岛缘两条看过 before/after 对照图（本地 `screenshots/`，不入库）；
  角色这条只看过站立/行走/跳跃近景，**动画切换瞬间、长时间静止没做人眼确认**。

### 10.4 未入库（待 Simon 处置）

`assets/character/tripo-out/`（83MB）、`assets/characters/lilei/tripo-out/*/model.glb`（6×约 12MB）、
`assets/character/han-meimei-*.png`、`public/island-models-candidates/`、`art/memory-island-*.{png}`、
以及 `tools/analyze-*.mjs` 里除本轮入库 5 个之外的其余排查脚本。体积大或归属并发的第二/三关会话，
一律没进本次提交。
