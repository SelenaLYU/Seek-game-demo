# 《Seek》项目深度分析报告

> **历史归档：** 历史工程分析快照，其完成度、测试状态、剧情流程与资源引用可能已过时，不作为当前验收依据。新故事以 GAME_STORY_AND_LEVEL_DESIGN.md 为准；清理与待制作项见 STORY_MIGRATION.md。

> 生成方式说明：本报告由多智能体蜂群分析（子系统地图 + 深度评审）+ 主控 agent 亲测验证（构建/测试/源码复读/git 考古/codely-flash 视觉读图验收）合并而成。原计划的五维度 bug 猎捕与三票对抗验证因本地代理过载部分中止，故 bug 清单为**单源深读结论**（标注「实测」的为主控亲手复现），未经独立复核，修复前请先自行确认。

---

## 一、TL;DR

1. **架构决策已 100% 落地且质量高**：`decisions/2026-10-01-gameplay-state-boundaries.md` 的状态边界（reducer 管 规则 / session 管快照 / persistence 管存档 / 场景做纯视图）在全部五个子系统一致执行，场景重进幂等、写失败诚实冒泡。
2. **但整个重构一行都没提交**：`ChapterOneRoomRules/Session/Progress/Persistence/ShadowBoatModel` 等 11 个 modified + 70+ untracked 文件全在工作区裸奔，`decisions/` 本身也未提交——一次误操作（`git clean`/换机器）即全灭。**这是当前第一优先级风险。**
3. **第一章核心玩法闭环完整可玩**：森林跑酷（手感调校是全项目亮点）→ 房间三谜题（照片拼图/收音机/影子船）→ 碎片合成 → 结尾动画 → 3D 岛屿点亮，含触摸适配、可访问性（aria）、存档降级。
4. **两个活 bug**（评审实测推导）：开门演出 550ms 内角色仍可自由移动（`freeze()` 形同虚设）；坠落重生残留脏状态（伪硬落地音效+震屏，狂按跳会原地自动起跳）。
5. **触摸端功能缺失**：松键变高跳只认键盘 JustUp 边沿，手机玩家只能满高度跳。
6. **约半数 2D 世界代码不可达**：Vine 整文件、Player 藤蔓链、autoWalkTo/freeze/teleportTo、Terrain 视觉层、部分 Effects 均为零调用的「优质死代码」——第二章动工前需做「接线或删除」收敛。
7. **测试安全网离线**（实测三连）：`shadowBoatGeometry.test.mjs` 因无扩展名 ESM 导入 + 无 test script，node 直接跑/`--experimental-strip-types` 均失败——62 行高质量谜题不变量规格形同虚设。
8. **第 2-6 章被 `id===1` 硬编码链挡住**：岛屿 onChapter 回调不带 id、四处硬编码文案/fork，加一章要改 ≥4 处 API。
9. **远端 ART 线有 8 个美术提交未合**（水彩大背景、年年 16 帧 sprite、影子船六件套+接入合约），代码尚未换装；包体已有硬伤（ending.mp4 27.8MB、index chunk 1.33MB）。
10. `manifest.json` 不是 PWA 清单，是 8 个文件的 SHA256 变更记录工件（地图 agent 更正了此前的误判）。

---

## 二、项目概览与现状

| 层 | 状态 | 说明 |
|---|---|---|
| 第一章·森林横版 | ✅ 灰盒完成 | 手感管线完整（土狼时间/跳跃缓冲/二段跳/分段重力），触摸适配，BGM 生命周期 |
| 第一章·房间解谜 | ✅ 灰盒完成 | 三谜题 + 道具依赖链（电池→手电→画笔）+ 碎片 HUD + 记忆球 |
| 结尾动画 | ✅ 框架完成 | DOM video + WebAudio 配音同步，自动播放策略完整绕行，播放失败兜底可进岛 |
| 3D 记忆之岛 | ✅ 灰盒完成 | 程序化海岸线/六街区，双模式相机，进度点亮演出，GPU 全量回收 |
| 序章/加载/菜单 | ⚠️ 占位 | Intro 是「新动画到货后只替换本场景」的隔离点；Loading 假进度条 1.3s |
| 第 2-6 章 | ❌ 空气 | 岛屿上有门牌与占位 toast；剧情六关设计文档已写完（364 行）但零实现 |
| 美术 | 🔶 双轨 | 灰盒程序绘制在跑；ART 分支正式水彩资产已交付待接线 |
| 测试/CI | ❌ 无 | 唯一测试文件跑不起来，无 test script |

**技术栈**：Phaser 3.90 + Three.js 0.186 + Vite 8 + TypeScript，src 约 6450 行。构建通过（`tsc --noEmit` + vite，2.89s）。

---

## 三、架构地图

### 场景流转

```
main.ts(内联 BootScene：预载BGM+?scene=调试直进)
  → Menu ──「开始游戏」→ Intro → Loading → Forest ─门→ Room
       └─「查看记忆之岛·原型」→ Island
  Forest ─钥匙+门→ Room ─记忆球→ Ending ─{completedChapter:1}→ Island
  Island ─onHome→ Menu；─onChapter(仅id1)→ Forest
```

### 分层与数据流

- **场景层**（`src/scenes/`，1939 行）：RoomScene 1219 行是绝对重心。全层守「场景即视图」纪律：`create()` 一律 `ChapterOneRoomSession.restore()` 重水化；交互先过 `ChapterOneRoomRules.can*` 谓词，再以类型化 `ChapterOneRoomEvent` dispatch + 显式 `save()`；失败置 `progressStorageUnavailable`，文案自动追加「进度仅本次保留」。
- **玩法核心逻辑**（`src/gameplay/` 前五个文件）：`Rules` 是纯 reducer（所有 16 种事件带前置校验，非法事件原样返回）；`Session` 45 行薄壳持有快照；`Progress`（151 行）管序列化与 normalize 容错；`Persistence`（50 行）在 localStorage 拒写时用 `volatileValues` Map 兜底，且「拒写的新值优先于存储里的旧值」语义正确。
- **2D 世界**（Player/Terrain/Vine/Effects，1222 行）：Celeste 式手感管线 + 碰撞/画面分离契约。
- **UI 层**（`src/ui/`，10 文件）：全部为 fixed 960×540 DOM/SVG overlay 统一契约（幂等 style 注入、WeakMap 单例、SHUTDOWN 清理、三路关闭）；**自身零持久化**，影子船谜题经 `initial*` 注入 + `onStateChange` 回抛，状态全归 Gameplay 层。
- **岛屿与横切**（973 行）：IslandScene 动态 import 把 Three.js 隔离成独立 chunk（全项目唯一分割点，alive 标志防竞态）；`island/Progress` 把第 1 章（与房间碎片同源）与 2-6 章两个存储合并成统一读视图；`chapterState()` 是泛化的 1→6 解锁级联。
- **资产双通道**：ESM `?url` import（哈希化）与源码字面量 `'assets/...'`（`vite.config.mjs` 的 `copyPhaserRuntimeAssets` 插件扫描复制，路径无效即抛错）并存且同一文件混用——动态拼接路径会被静默漏掉。

---

## 四、各子系统评审

### 4.1 场景层 —— 亮点

- 状态边界纪律严格可验证：两个大场景 create 全量重建、preload `textures/cache.exists` 防重载，重进幂等。
- RoomScene `visibleBounds()` 用 canvas 逐像素扫描算贴图不透明包围盒（模块级缓存）——摆件按可见像素贴家具，一次解决所有 PNG 透明留白问题。
- 拼图棋盘几何提为共享常量、完成演出有「面板中途被关」防护；边界恢复完备（拼完 16 块但 300ms 延迟未触发就重进 → 有专门补发分支）。
- 注释即活文档：dragstart 基线、pointer.worldX 判定、killTweensOf、不用 setCrop 等实测怪癖全部留档。

### 4.1 场景层 —— 债

| # | 问题 | 位置 |
|---|---|---|
| S1 | **RoomScene 1219 行单体**：六物件交互 + 三谜题编排 + HUD/物品栏/存档降级全在一个类，后续五章若复制此模式不可维护，建议按物件/谜题拆 controller | RoomScene.ts |
| S2 | **双资产路径混用**，vite 字面量扫描插件成为承重墙 | RoomScene/ForestScene |
| S3 | DOM 文字面板依赖「必须 pause 场景」的隐式契约，忘了 pause 房间输入永久锁死 | RoomScene.openDomPanel |
| S4 | Forest/Room 各自复制一份 `applyProgressEvent/saveProgress/不可用后缀`，共享同一 localStorage 键靠 `scene.start` 顺带停场景避免并发写——应上提 helper | 两场景 |
| S5 | 章节完成记账两套（`ChapterOneRoomSession.completeChapterOne()` vs `island/Progress.completeChapter(1)`），权威源不唯一 | gameplay vs island |
| S6 | `manifest.json` 是 SHA256 变更记录工件非 PWA；scenes/README.md 空文件 | 根目录 |

### 4.2 玩法核心逻辑 —— 我亲读的结论

Reducer 纯净：photo 链（15 块摆位→捡缺块需 radio 完成→16 块解出）、道具链（photoSolved→电池→手电→影子船→画笔三笔风）全部前置条件化，`wind-stroke-completed` 强制 1→2→3 顺序。Session 45 行无一处越界。Persistence 的「拒写后读」语义（`!cached.persistent` 时用缓存新值覆盖旧存储值）是对的。**此层无问题**，唯一的债是 S5（完成记账双源）。

### 4.3 2D 世界与角色 —— 评审摘录

**亮点**：手感管线完整且参数集中带调参史注释（「此前 1.6× 落地过沉」「读作果冻」）；动画防抖工程化（滞回+低通滤波，注释对应已修复的用户反馈）；碰撞/画面分离；音效 DI；Effects 固定种子确定性；Vine 单摆物理数学经推导核对无误（但零接线）。

**问题**：

| # | 级别 | 问题 | 位置 |
|---|---|---|---|
| W1 | major | **约半数代码不可达**：Vine 全文件、Player 藤蔓链（attachVine→releaseVine→updateVineGrab→GRAB_* 全死）、autoWalkTo/freeze/unfreeze/teleportTo 场景侧零调用、Terrain 全部视觉与坡道、Effects.sparkBurst/fireflies——2026-10-01 按用户反馈移除藤蔓美术后机制代码成孤儿；地图所述「teleportTo 重生/藤蔓闭环」均为虚构 | Player/Vine/Terrain/Effects |
| W2 | major | 开门演出期间玩家可自由移动（详见 bug 清单 B1） | ForestScene:~250 |
| W3 | major | 坠落重生残留脏状态（详见 B2） | ForestScene:276 |
| W4 | major | 触摸端没有变高跳（详见 B3） | Player.ts:257 |
| W5 | major | **美术元数据硬编码**：AIR_FRAME 绝对帧号、FOOT_PADDING、GRAB_FLOWER 实测花心像素、GROUND_TRIM 裁边值、tileScale 0.236——换图必改代码；`ensureGroundTile` 在运行时 canvas 裁透明边属资产问题运行时打补丁 | Player/Vine/Terrain |
| W6 | major | Terrain 名义通用、实为第一章美术适配器（jasmine 主题贴图键+森林配色写死在通用层） | Terrain.ts |
| W7 | minor | dt 防御不一致（Vine 钳 50ms，Player 全裸奔）；addSlope 无视 drawVisuals 开关且文档宣称的 16px 钳制不存在；孤儿注释与缩进错乱；`setCollideWorldBounds(true)` 无选项硬编码 | 多处 |

### 4.4 UI 与谜题界面层 —— 地图摘录

**亮点**：生命周期契约 9 组件全一致；可访问性远超原型（role=dialog/aria-modal/aria-live/键盘替代/prefers-reduced-motion）；`shadowBoatGeometry` 教科书式纯函数抽离，TARGET 由 SOLUTION 生成杜绝「影子对不上」；房间检视面板的暂停时序处理（等 FLASH_COMPLETE 再 POST_RENDER pause）细致。

**债**：谜题解法泄漏进展示层（时钟 4:15 硬编码在 confirm 监听、收音机文案埋 UI）；CSS 模板串占每组件 50-60% 行数且三处近逐行重复；z-index 三套并存 + BEM 前缀 recall-/seek- 分裂；Clock/Radio 无 WeakMap 单例守卫（复用会叠两层）；影子船每次拖拽帧全量 IoU 1.9 万采样点；频道 0 是隐藏初值需调用方自行知晓。

### 4.5 3D 岛屿与横切系统 —— 评审摘录

**亮点**：GPU 资源回收模范（单 AbortController 全解绑 + traverse 逐个 dispose + forceContextLoss）；`coastlineRadius()` 单函数驱动地形/树分布/行走边界三处；ADR 落地干净（第 1 章完成态与房间同源、写失败冒泡成 toast）；跨界握手无懈可击；Resolution 高清策略推导扎实（DPR-clamped 缓冲、跟随相机豁免、双调用去重）；几何测试**作为规格**质量很高（守护的是设计不变量而非实现细节）。

**问题**：

| # | 级别 | 问题 | 位置 |
|---|---|---|---|
| I1 | major | 几何测试套件不可运行（实测确认），安全网离线 | tests/ + shadowBoatGeometry.ts:1 + package.json |
| I2 | major | 章节分发 `id===1` 硬编码死路：`onChapter` 不带 id、interact 只有 id1 走真流程、toast/按钮文案写死「童年」、IslandScene 绑死 scene.start('forest')、Progress 合并点 if-chain——第 2 章接入要改 ≥4 处 | MemoryIsland/IslandScene/Progress |
| I3 | minor | Sfx 的 UNLOCKED 监听器 destroy() 不清理（对照 MenuRoomMusic 是正确写法），存在孤儿风声的结构性漏洞 | Sfx.ts:138,150 |
| I4 | minor | 房间 BGM 暂停经 magic string 挖 sound manager 内部数组；音乐层 API 两条导入路径 + ForestScene 手抄生命周期模板 | RoomScene:1211 |
| I5 | minor | Resolution 经 as-cast 读相机私有 `_follow`（升级雷区）+ 死导出/过时注释；Parallax.placeParallax 零调用方；岛屿树木无碰撞、旋转建筑世界轴 AABB 近似；MemoryIsland 密度全仓最高（HUD/CSS/章节名内联）；Progress/MusicSettings 均为 import 时快照 | 多处 |

---

## 五、已确认 bug 清单

| # | 严重度 | 位置 | 描述 | 验证状态 |
|---|---|---|---|---|
| B0 | **critical** | git 工作区 | 全部拆模块重构 + 70+ 新资产未提交未推送 | ✅ 主控实测（`git status`） |
| B1 | major | ForestScene 进门 overlap | `body.stop()` 只清一次速度，550ms 开门演出期间 `player.update` 照常响应输入，角色可走开/跳走；`Player.freeze()`（注释即为此设计）全项目零调用 | 评审代码推导，未实测 |
| B2 | major | ForestScene.update:276 | 坠落重生直接 `body.reset(checkpoint)` 绕过零调用的 `teleportTo`：死亡瞬间 prevFallSpeed≈1000>700 触发伪硬落地（音效+震屏+挤压动画）叠在死亡白闪上；死亡前狂按跳则 jumpBufferTimer 残留 → 重生瞬间自动起跳；airJumpsLeft/rotation 未清 | 评审代码推导，每次坑死必复现，建议实测确认 |
| B3 | major | Player.ts:257 | `jumpReleased` 的第二组条件只认键盘 JustUp 边沿，纯触摸输入永远不满足 → 松键截断（轻重两档跳高）在手机上不生效，触摸玩家无法短跳精准落台 | 评审代码推导 |
| B4 | major | tests/shadowBoatGeometry.test.mjs | 无扩展名 ESM 导入 + 无 test script，三种方式均跑不起来 | ✅ 主控实测三连 |
| B5 | major | 全 2D 世界层 | 约 50% 代码零调用（详见 W1）——不可达代码与已验证骨架混在一起，静默腐化风险 | 评审 grep 全仓核实 |

**性能/包体（主控实测）**：index chunk 1.33MB（gzip 361KB）、MemoryIsland chunk 580KB——建议把 RoomScene/ForestScene 等场景也做动态 import 分割；ending.mp4 27.8MB、menu-room-bgm 5.3MB、forest-bgm 3.9MB、ending-voice.wav 4.8MB——视频走压缩/HLS，音频 wav→压缩格式。

---

## 六、设计 vs 实现差距

**承诺未做**（出处：GAME_STORY_AND_LEVEL_DESIGN.md / GAME_DESIGN_OVERVIEW.md）：
- 第 2-6 章全部（学生时代/青年/中年/晚年/终章）——仅岛屿门牌+占位 toast
- 序章「弥留蒙太奇 + 第一次触碰相册」——Intro 是占位
- 分支结局（继续寻找 vs 接受新记忆）——Ending 是线性单结局
- 每章「记忆物触碰回忆」过场——第 1 章有记忆球+结尾动画，无物件触发回忆
- Loading 真实资源加载进度——假进度条 1.3s

**已做未写档**：
- 触摸虚拟按键、可访问性全套、localStorage 拒写内存兜底、HD DPR 渲染管线——README 全空（根 README 16 字节，scenes/ui/gameplay 三处 README 空文件）
- `manifest.json` 实为变更记录工件，用途未在任何文档说明

**设计与实现矛盾 / 资产脱节**：
- SHADOW_BOAT_HANDOFF.md 的「星星接入正式流程」清单已大部分由 reducer 落实（battery-collected/flashlight-powered 事件链在），但 I/B 开发快捷键仍在（文档自认应删或加开发开关）
- ART 分支正式美术已交付但代码零接线：年年 16 帧 sprite（assets/character/README.md 写好了 Phaser 接入参数：frameWidth 128×160、缩放 0.525、frameRate 16/18）、两张 1900×540 水彩大背景、影子船六件套（合约：不改 shadowBoatGeometry 投影多边形、手电筒开关同锚点）——全部躺在分支里
- `art/shadow-boat-assets.md` 自述「本次只交付素材与说明，不修改 Gameplay/UI」——灰盒图形与正式资产的换装是下一个明确动作

---

## 七、美术资产视觉验收（codely-flash 视觉模型）

> 对 ART 分支正式资产的实际读图验收，原始输出存于 `/tmp/seek-art/vis_{bg,sprite,props}.json`。

### 7.1 两张大背景对比（早期版 vs 正式水彩版）

| 基准项 | 判定 |
|---|---|
| a. 藍绿色调（避免荧光蓝/钴蓝） | ✅ 符合 |
| b. 手绘勾线粗细变化、远山减线 | ✅ 符合 |
| c. 水彩色块+纸纹、完整色面阴影 | ✅ 符合 |
| d. 前景岩群只勾外轮廓不逐石包边 | ⚠️ 部分符合（底部礁石仍有逐石包边） |
| e. 中央及右侧留白供交互元素 | ✅ 符合 |
| f. 夏日儿童动画气质 | ⚠️ 部分符合（细节偏密偏写实，概括度不足） |

**玩法可读性警告（进关前必须处理）**：左侧木栈桥/码头最像可站立平台，玩家会尝试跳上去；底部岩群轮廓像可踩地面，会与真实可跳礁石混淆；海面连续横向浪沫容易被读成薄平台；左侧整体视觉过重，抢中央玩法区注意力。可跳礁石/钥匙等交互物叠加时需与背景浪线在色相/黑度/线宽上明显区分。

### 7.2 年年跑步 sprite（16 帧，2048x160）

**切片规格合格**：实际 16 帧等距、无空帧/断帧/残影，色调为暖棕手绘线+低饱和蓝绿，符合水彩方向。

**进游戏前需二修**：帧内 pivot 漂移 1-3px（缩 0.525 后成亚像素抖动，需统一脚底基线）；关键 pose 区分弱、重心起伏小，易读成「平移滑步」；摆臂幅度小且部分帧被躯干遮挡；双辫/衣摆跟随弱；侧视下第二根辫子易被遮挡，缩后可能读成单马尾；无脚底接地阴影易显悬浮；0.525 非整数缩放有边缘模糊风险（建议 mipmap+linear 或按 0.5 缩后微调）。**定位：当前适合预览/原型，正式接入前需重修动画 pose 与 pivot。**

### 7.3 光影小船道具三件套（手电筒/排笔/三角尺）

**基本可用、系列感统一**（月白/藍碧/青碧主色+朱红点缀+细炭勾线+纸纹）。需修：三角尺刻度在 37x52 逻辑像素下会糊成虚线（减刻度密度或出小尺寸简化版）；手电筒比例偏细长、「短柄」感不足（压筒身放大灯头）；排笔笔杆木色偏黄应向藍碧靠拢、笔锋略毛糙缩后像扫帚；alpha 边缘需做去杂边处理，深色背景下可能显浅灰描边。

---

## 八、下一步建议（按优先级）

1. **立即提交**（B0）：先 `git add` 拆模块重构 + decisions/ + 关键资产，分主题 commit（重构/资产/文档），push 后再谈其他。*这步需要你点头我才动。*
2. **合并美术**：把 origin/integration（= main + ART 8 commits）合回 main，再按 README 合约接线年年 sprite 与影子船资产（先做 shadow boat——合约最明确）。
3. **测试上线**（B4）：给 `shadowBoatGeometry.ts` 的内部导入补扩展名或上 vitest，加 `"test": "vitest"`——62 行现成规格立刻变成回归防线。
4. **修活 bug**（B1/B2/B3）：三处都是小改——进门回调改调 `player.freeze()`；重生改调 `teleportTo()`（它就是为此写的）；`pressTouchJump` 记录 release 边沿。
5. **死代码收敛**（B5/W1）：第二章动工前做「接线或删除」——Vine 机制要么接回来要么删，别让未验证代码混进复用判断。
6. **美术元数据外置**（W5）：AIR_FRAME/裁边值/花心坐标/ tileScale 提为资产数据文件，第二章换图不改代码。
7. **章节分发去硬编码**（I2）：`onChapter: (id) => void` + 路由表 + 文案常量化，一次性还清第二章接入的技术债。
8. **包体**：场景级动态 import 分割；媒体压缩（27.8MB 的 mp4 不该进 dist）。
9. **美术验收已做**：视觉模型按水彩基准逐项验收完毕（见第七节）——背景 d 项与可读性、sprite pivot、三角尺刻度三处需返修，建议随「合并 ART」一起走一轮美术迭代。

## 九、完备性缺口（本次分析没做到的）

- bug 清单未经三票对抗验证（蜂群 Verify 阶段中止），B1-B3/B5 修复前请实测确认；若蜂群自然跑完，其验证结果将增量并入本报告
- CHAPTER1_ROOM_PUZZLE_COLLABORATION.md（355 行）仅扫读，协作分工细节未逐条对照
- 没有实际运行游戏的体验报告（谜题手感/卡点/UI 节奏）——建议你自己跑一遍补上这个维度
- 视觉验收基于缩放后的 JPEG/PNG，未在真实游戏分辨率（960x540 镜头）下叠加交互物验证
