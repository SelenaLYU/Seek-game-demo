# Chapter 3 资产

本文件夹集中存放第三关已完成并接入 Demo 的美术资产。

- `office/`：刷卡上班、城市夜景、公司大堂、电梯及楼上办公区、屋顶到画笔门口；详情见 `office/ASSET_MANIFEST.md`。
- `painting-world/`：第三关画中世界背景图。

运行时分别由 `src/scenes/ChapterThreeOfficeScene.ts` 与 `src/scenes/ChapterThreePaintingScene.ts` 引用。办公室关卡的碰撞与检查点依然遵循原灰盒；美术替换没有修改 `main`。
