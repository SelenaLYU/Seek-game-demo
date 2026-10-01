# 光影小船 Demo 交接说明

这份文档说明当前复合版本已经完成的内容，以及星星接入正式 Gameplay 时需要做的事情。

## 当前已经完成

相关文件：

- src/ui/ShadowBoatPuzzleUI.ts：光影小船近景 UI、拖拽、转向、画风和小船驶动演出。
- src/ui/shadowBoatGeometry.ts：光源、物件、墙面的投影几何和影子重合判定。
- src/ui/RoomInventoryUI.ts：右下角物品栏和物品选择，支持正式图片图标。
- src/scenes/RoomScene.ts：目前的临时测试入口和 UI 生命周期接线。

光影部分现在使用同一套光路计算：手电筒 → 桌面物件 → 右侧墙面。物件离开光束时不会产生影子，只照到一部分时只投出被照到的部分；移动手电筒会改变影子的方向、位置和透视大小。

玩家看到的三个桌面物件是：

1. 笔袋：作为船身。
2. 三角尺：作为船帆。
3. 细尺：作为桅杆。

这三个物件、亮灯/关灯手电筒和画笔都已经换成 `assets` 中的正式透明 PNG。投影继续读取 `shadowBoatGeometry.ts` 的轮廓，所以替换美术不会改变光路和重合判定。当前谜题默认显示亮灯手电筒；若 Gameplay 需要展示未装电池状态，可调用 `showShadowBoatPuzzleUI` 时传入 `flashlightPowered: false`。

三件物品初始分开放置。玩家拖动它们，点击物件可以在两个方向之间切换；正确摆放后，再移动手电筒，让合成后的船影落进右侧画框中的虚线船位。

当前判定不是要求像素级重合，而是计算三块投影影子的合并区域：整体重合度达到约 78%，并且每一块影子都有足够覆盖时，经过短暂稳定时间才算完成。完成后才允许使用物品栏中的画笔画风。

## 完成后的演出

完成船影对齐后：

- 右侧画框里出现三道稍大的、偏左的淡风痕。
- 选中物品栏中的画笔后，才能依次描画三道风。
- 第一笔：三角帆右侧角轻轻抖动。
- 第二笔：小船在原地上下浮动，不向前移动。
- 第三笔：小船慢慢驶向画面的最右侧。

2026-10-02 调整：三件实物使用共同的 1.7 倍前景变换；船影使用共同缩放中心，避免拼接处因各自缩放而断开。影子轮廓做了适度加粗，保留三角尺镂空。第一笔只变形帆的右角；第二笔原地浮动；第三笔用 3.5 秒向右航行。风痕改为画框内由长到短的三条卷曲曲线并裁切在画框内。选中物品栏画笔后，谜题区域的鼠标替换为画笔图像；第三笔完成后画笔从物品栏消耗，鼠标立即恢复。

墙画已接入 `room-wall-drawing-incomplete.png` 无船版和 `room-wall-boat.png` 独立小船。第三笔完成时，程序用约 1.2 秒让船影柔化淡出，同时让彩色小船从同一位置淡入，再由彩色小船完成 3.5 秒的向右航行；两层在过渡阶段重叠，不能瞬间硬切。

三道风在未描画时使用清楚的深色蜡笔提示线；玩家描过的部分使用较粗的月白蜡笔笔触，并通过轻微位移、毛边和纸面颗粒效果融入儿童墙画。完成一笔后，对应深色提示线隐藏，只保留白色成品笔触。

onAligned 只代表船影已经对齐；第三笔完成时才调用 onCompleted。记忆碎片、房间通关状态和存档应在 onCompleted 中结算。

光影小船对应房间里的第三个记忆碎片。UI 目前只在第三笔完成时调用 `onCompleted`，碎片发放继续由 Gameplay 接入。第三笔触发小船向右航行时，左侧同步显示两行文字：“那天是韩梅梅第一次见到大海 / 有一点点怕，但是又很喜欢……”。文字不会自动消失，玩家关闭光影小船界面时随界面一起移除。

## 现在的 I 键和 B 键是什么

当前 RoomScene.ts 里的 installInventoryGreyboxPreview() 是临时开发入口：

- 按 I：循环往物品栏加入“照片拼块”“手电筒电池”“画笔”三个测试物品。
- 按 B：直接打开光影小船 UI。

这两个按键只用于开发时快速看到界面，不能作为正式玩法入口。它们不会完成真实的收音机、照片拼图、盒子、电池安装或房间状态，也不会自动发放记忆碎片。

正式版本应删除这组全局快捷键，或者放在明确的开发模式开关后面。

## 星星需要接入的正式流程

### 1. 用真实状态解锁光影玩法

星星负责判断：

- 照片拼图已经完成。
- 盒子已经打开。
- 手电筒电池已经拿到并安装。
- 光影小船是否已经完成。
- 三笔风已经完成到第几笔。

只有电池安装完成后，房间中的手电筒或对应交互点才应该打开光影小船 UI。

### 2. 用真实物品填充物品栏

获得物品时调用物品栏接口，而不是按 I：

    this.inventoryBar?.addItem({
      id: 'flashlight-battery',
      glyph: '电',
      label: '手电筒电池',
    });

    this.inventoryBar?.addItem({
      id: 'paint-brush',
      glyph: '笔',
      imageUrl: paintBrushUrl,
      label: '画笔',
    });

`paintBrushUrl` 从 `assets/items/room-paint-brush.png?url` 导入。`glyph` 仍作为没有图片时的备用显示。

玩家点击画笔后，RoomScene 会通过 getSelectedItem() 判断当前是否选中了 paint-brush，再传给光影 UI 的 setBrushEquipped()。画笔不应在光影 UI 里重复生成。

### 3. 从真实交互点打开 UI

当前测试函数叫 openShadowBoatGreybox()，正式接入时可以改名为 openShadowBoatPuzzle()，由房间中的手电筒或桌面交互调用：

    private openShadowBoatPuzzle(): void {
      if (this.interacting || this.shadowBoatPanel || !this.flashlightPowered) return;

      this.interacting = true;
      this.shadowBoatPanel = showShadowBoatPuzzleUI(this, {
        onAligned: () => {
          this.shadowBoatAligned = true;
          this.inventoryBar?.setExpanded(true);
        },
        onWindStrokeCompleted: index => {
          this.windStrokeCount = Math.max(this.windStrokeCount, index);
        },
        onCompleted: () => {
          this.shadowBoatSolved = true;
          this.gainFragment('shadow-boat');
        },
        onClose: () => {
          this.shadowBoatPanel = undefined;
          this.interacting = false;
        },
      });

      this.shadowBoatPanel.setBrushEquipped(
        this.inventoryBar?.getSelectedItem()?.id === 'paint-brush',
      );
    }

shadow-boat 只是示例状态名；应按星星现有的存档和碎片枚举调整。onAligned 不要在这里发放最终奖励。

### 4. 保存和恢复状态

建议至少保存：

    flashlightPowered
    shadowBoatAligned
    shadowBoatSolved
    windStrokeCount
    roomPuzzleCompleted

如果玩家关闭近景后重新进入，已经对齐或已经完成的状态应由 Gameplay 决定是否锁定、跳过或恢复。UI 本身只负责当前这一轮的交互和演出。

## 建议的验收顺序

1. 没有电池时，玩家不能从房间正式打开光影 UI。
2. 安装电池后，玩家从房间交互点打开光影 UI。
3. 三件物品分开放置，必须由玩家拖动并转向。
4. 只移动手电筒不能直接完成；三件物品也必须组成正确船形。
5. 影子必须落在画框目标上，才出现风痕。
6. 没有选中画笔时，风痕不能被描画。
7. 三笔按顺序完成；第二笔原地浮动，第三笔驶向画面右侧。
8. 第三笔完成后才发放记忆碎片，并写入房间完成状态。

## 开发验证命令

    node --experimental-strip-types --test tests/shadowBoatGeometry.test.mjs
    npm run build

测试通过后，可以继续替换正式物件素材和墙上插画；光影判定和房间状态由星星接入。
