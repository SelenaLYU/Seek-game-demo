# GitHub 上传清单：第二关骑楼街灰盒

更新日期：2026-10-02

当前工作区共有 **8 个待提交文件**：4 个修改文件，4 个新增文件。

## 待上传文件

- [ ] `src/gameplay/chapterTwoRules.ts`（新增）
  - 固定灯源、慢速扫视、移动追踪及底部掉落判定。
- [ ] `tests/chapterTwoRules.test.mjs`（新增）
  - 验证移动追踪、停下解除、遮挡、抓捕时长及底部恢复区域。

- [ ] `src/scenes/ChapterTwoChallengeScene.ts`（修改）
  - 将原来的第二关平台占位改为骑楼街逃课灰盒。
  - 加入三层右—左—右折返路线、九个静态障碍和十处遮挡区。
  - 老师固定在起点地面，灯光发现移动后追踪；持续移动约 `0.95 秒`警觉拉满。
  - 放慢离开灯光后的警觉恢复，并修正第二层木凳处的跳跃净高和通路。
  - 保留摆动晾衣架和竹竿，移除小猫、小狗和皮球等地面巡逻物。
  - 放慢扫光并加入移动追踪，加入镜头震动、红色覆盖和更强的警觉边缘。
  - 加入四个检查点、快速重试、旧票根和第二记忆房出口。

- [ ] `src/island/MemoryIsland.ts`（修改）
  - 在岛屿总览增加清楚可见的“记忆入口”面板。
  - 第一关和第二关可以从总览直接点击进入。
  - 第二关未解锁时显示条件；第一段完成后自动变为可进入状态。
  - 保留进入岛屿、走到建筑门口按 `E` 的原有入口。

- [ ] `CHAPTER_TWO_GAMEPLAY_DESIGN.md`（新增）
  - 第二关完整玩法设计。
  - 记录骑楼街场景、玩法规则、难度递进、公平性和后续增强方向。

- [ ] `CHAPTER_TWO_GAMEPLAY_HANDOFF.md`（新增）
  - 提供给 Gameplay 的代码与设计交接说明。
  - 标明正式美术替换位置、状态契约、参数和验收标准。

- [ ] `CHAPTER_TWO_FLOW.md`（修改）
  - 把第二关流程更新为骑楼街灯光潜行玩法。
  - 补充旧票根、第二记忆房和后续动画的连接。

- [ ] `GITHUB_UPLOAD_CHECKLIST.md`（修改）
  - 本次上传范围与验证结果。

## 当前场景流程

```text
记忆之岛第二栋建筑
→ chapter2 骑楼街逃课
→ 取得 memory-token-2 旧票根
→ chapter2-room 第二记忆房
→ chapter2-memory 第二段记忆动画
→ 返回记忆之岛并完成第二段记忆
```

## 验证结果

- [x] `npm run build` 通过。
- [x] `node --test tests/chapterTwoRules.test.mjs tests/shadowBoatGeometry.test.mjs` 通过，12 项测试全部成功。
- [x] `git diff --check` 通过；仅有 Windows 换行提示。
- [x] 浏览器确认骑楼背景、三层路线、老师灯光、遮挡物、障碍和 HUD 正常显示。
- [x] 浏览器确认岛屿总览能够看到第一关和第二关入口及解锁条件。
- [x] 原有 `chapter2-room` 与 `chapter2-memory` 场景接口保持不变。

## 建议提交信息

```text
feat: build chapter two qilou street stealth greybox
```

上传前运行 `git status --short`，确认以上 8 个文件在提交范围内。

## 本轮修正：追踪与底部防卡死

- 老师站在固定起点；灯光约 6 秒扫过一个方向，发现光内移动后持续跟随，站定或进入遮挡即解除追踪。
- 保留 0.95 秒移动暴露抓捕；追踪解除后从当前角度缓慢继续扫描。
- 底层路基填充到世界底部，封住道路下的空洞；掉进左侧灰色区域或误入路面下方，自动返回最近检查点。
- 检查点只在实际落到对应路面时激活，掉落途中不再误记进度。
- 自动回归：`node --test tests/chapterTwoRules.test.mjs`。
