# 光影小船 Demo 交接说明

这份文档说明当前灰盒已经完成的内容，以及星星接入正式 Gameplay 时需要做的事情。

## 当前已经完成

相关文件：

- src/ui/ShadowBoatPuzzleUI.ts：光影小船近景 UI、拖拽、转向、画风和小船驶动演出。
- src/ui/shadowBoatGeometry.ts：光源、物件、墙面的投影几何和影子重合判定。
- src/ui/RoomInventoryUI.ts：右下角物品栏灰盒和物品选择。
- src/scenes/RoomScene.ts：目前的临时测试入口和 UI 生命周期接线。

光影部分现在使用同一套光路计算：手电筒 → 桌面物件 → 右侧墙面。物件离开光束时不会产生影子，只照到一部分时只投出被照到的部分；移动手电筒会改变影子的方向、位置和透视大小。

玩家看到的三个桌面物件是：

1. 笔袋：作为船身。
2. 三角尺：作为船帆。
3. 细尺：作为桅杆。

三件物品初始分开放置。玩家拖动它们，点击物件可以在两个方向之间切换；正确摆放后，再移动手电筒，让合成后的船影落进右侧画框中的虚线船位。

当前判定不是要求像素级重合，而是计算三块投影影子的合并区域：整体重合度达到约 78%，并且每一块影子都有足够覆盖时，经过短暂稳定时间才算完成。完成后才允许使用物品栏中的画笔画风。

## 完成后的演出

完成船影对齐后：

- 右侧画框里出现三道稍大的、偏左的淡风痕。
- 选中物品栏中的画笔后，才能依次描画三道风。
- 第一笔：三角帆右侧角轻轻抖动。
- 第二笔：小船在原地上下浮动，不向前移动。
- 第三笔：小船慢慢驶向画面的最右侧。

onAligned 只代表船影已经对齐；第三笔完成时才调用 onCompleted。记忆碎片、房间通关状态和存档应在 onCompleted 中结算。

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
      label: '画笔',
    });

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
