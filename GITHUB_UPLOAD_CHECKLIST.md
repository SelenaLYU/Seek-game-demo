# GitHub 上传清单（光影小船 + 第二段记忆灰盒）

更新日期：2026-10-02

## 本次上传范围

本次共有 **14 个待提交文件**：9 个修改文件，5 个新增文件。

### 一、光影小船复合版本

- [ ] `src/ui/ShadowBoatPuzzleUI.ts`（修改）
  - 接入笔袋、细尺、三角尺、亮灯/关灯手电筒、画笔、无船墙画和彩色小船正式资产。
  - 放大桌面实物但保持投影尺寸；三件投影使用共同缩放中心，维持船体连接。
  - 影子轮廓匹配正式物件形状，保留三角尺镂空。
  - 船影完成后才能画风；风痕改为画框内的深色提示线和白色蜡笔成品线。
  - 三笔效果调整为：帆右角抖动、原地浮动、3.5 秒向右航行。
  - 第三笔完成时，船影与彩色小船柔和交融，并显示韩梅梅第一次见到大海的记忆文字。
  - 画笔选中后替换鼠标指针，三笔完成后自动消耗并恢复鼠标。

- [ ] `src/ui/shadowBoatGeometry.ts`（修改）
  - 按正式美术轮廓重建三件物品的投影形状。
  - 调整投影比例、共同中心和重合采样精度。
  - 保持手电筒、物件与墙面之间的透视投影关系。

- [ ] `src/ui/RoomInventoryUI.ts`（修改）
  - 物品栏支持正式图片图标。
  - 保留文字 glyph 作为无图片时的备用显示。

- [ ] `src/scenes/RoomScene.ts`（修改）
  - 物品栏画笔接入正式图片。
  - 光影谜题第三笔完成后从物品栏移除画笔。

- [ ] `tests/shadowBoatGeometry.test.mjs`（修改）
  - 增加三角尺镂空和笔袋轮廓测试。
  - 更新正式投影几何对应的测试。

- [ ] `SHADOW_BOAT_HANDOFF.md`（修改）
  - 补充正式资产、光影比例、三笔风、画笔消耗、记忆文字和 Gameplay 接入说明。

### 二、第二段记忆流程灰盒

- [ ] `src/scenes/ChapterTwoChallengeScene.ts`（新增）
  - 第二关闯关灰盒。
  - 玩家取得记忆信物后开启右侧出口。
  - 出口连接第二记忆房。

- [ ] `src/scenes/ChapterTwoRoomScene.ts`（新增）
  - 第二记忆房灰盒。
  - 三处线索完成后出现记忆光球。
  - 记忆光球连接第二段记忆动画。

- [ ] `src/scenes/ChapterTwoMemoryScene.ts`（新增）
  - 第二段记忆动画占位接口。
  - 动画结束后携带 `completedChapter: 2` 返回记忆之岛。

- [ ] `src/island/MemoryIsland.ts`（修改）
  - 第二栋建筑在第一段记忆完成后可交互。
  - 第二栋建筑连接第二关灰盒。
  - 增加“进入学生时代冒险”交互提示。
  - 支持显示任意章节完成后的岛屿提示。

- [ ] `src/scenes/IslandScene.ts`（修改）
  - 支持结算第 1 至第 6 段记忆。
  - 根据建筑编号分别进入第一关或第二关。
  - 第二段完成后点亮第二栋建筑并解锁第三栋建筑。

- [ ] `src/main.ts`（修改）
  - 注册第二关、第二记忆房和第二段记忆动画场景。
  - 增加 `island`、`chapter2`、`chapter2-room`、`chapter2-memory` 调试入口。

- [ ] `CHAPTER_TWO_FLOW.md`（新增）
  - 记录第二段记忆完整流程和正式内容替换位置。

### 三、本清单

- [ ] `GITHUB_UPLOAD_CHECKLIST.md`（新增）
  - 本次 GitHub 上传范围和核对步骤。

## 美术资产说明

本次代码引用了以下正式资产，但它们目前没有出现在 Git 未提交列表中，说明已经存在于当前仓库基线，无需在这次提交中重复添加：

- `assets/environment/room-shadow-pencil-case.png`
- `assets/environment/room-shadow-triangle-ruler.png`
- `assets/environment/room-shadow-pencil.png`
- `assets/environment/room-flashlight-on.png`
- `assets/environment/room-flashlight-off.png`
- `assets/environment/room-wall-drawing-incomplete.png`
- `assets/environment/room-wall-boat.png`
- `assets/items/room-paint-brush.png`

## 上传前验证

- [x] `npm run build` 通过。
- [x] `node --test tests/shadowBoatGeometry.test.mjs` 通过，6 项测试全部成功。
- [x] `git diff --check` 通过。
- [x] 浏览器走通“第二记忆房 → 第二段记忆动画 → 返回记忆之岛”。
- [x] 返回岛屿后能够结算第二段记忆，并解锁下一栋建筑。

## 建议提交方式

如果希望历史更清楚，可以拆成两个提交：

1. `feat: 完成光影小船复合版本`
2. `feat: 搭建第二段记忆流程灰盒`

如果希望一次上传，可以使用：

`feat: 更新光影小船并搭建第二段记忆流程`

上传前运行 `git status --short`，确认清单中的 14 个文件全部在提交范围内，并确认没有混入个人配置、构建目录或临时文件。
