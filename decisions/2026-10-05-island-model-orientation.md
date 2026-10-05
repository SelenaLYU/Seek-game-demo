# 决策：记忆之岛资产一律按「作者朝向 +X」对齐，统一转 -π/2

日期：2026-10-05
状态：已生效（六栋建筑 + 韩梅梅主角模型都已按此对齐，并在岛内实走验证）

## Context

六栋可交互建筑与主角模型出自同一套 Tripo 流程（三视图 → multiview-to-model → 游戏用 GLB），
但导出结果**没有 glTF 常见的「朝 -Z」约定**：实测六栋建筑的入口与角色正脸都朝**模型本地 `+X`**。

代码此前假定「美术已朝前」，于是六栋 `buildingPresentation[].yaw` 与角色的 `model.rotation.y`
都写 `Math.PI`。两处都错，而且症状不一样，很容易各自被当成别的问题：

- **建筑**：门前交互点固定在 group 本地 `+Z`（`doorLocal = center + toCenter * (depth / 2 + 1.5)`），
  模型门面却朝 `-X` → 玩家走进 2.8 触发圈时，面对的是建筑侧面，门和触发点对不上。
- **角色**：`player.rotation.y = atan2(dx / mapScaleX, dz)` 已经把「移动方向」写成组本地 `+Z`，
  模型再转 π 等于把 `+X` 摆到组本地 `-X` → 角色**横着走**：按住 W（朝 -Z）时只看到左右侧脸，
  任何方向都看不到背面。

## Decision

**所有岛上 3D 资产按「作者朝向 = 本地 `+X`」处理，统一 `yaw = -Math.PI / 2` 把它摆到组本地 `+Z`。**

- 六栋建筑：`buildingPresentation[].yaw = -Math.PI / 2`（`src/island/MemoryIsland.ts`）。
- 主角：`model.rotation.y = -Math.PI / 2`，与建筑同值——同一套流程，同一个作者朝向。
- 新资产接入时，先量朝向再写 yaw，不要照抄 π。

## 怎么量（两个判据都要过）

```bash
node tools/orient-probe.mjs public/island-models/ch01-shell-house.glb   # 八向罗盘
```

探针把模型放进「水平相机 + 地面网格」，绕 Y 轴每 45° 拍一格（相机固定在 `+Z`、水平看 `-Z`）。
**入口/正脸正对相机的那一格标的角度，就是该模型需要的 `yaw`**；六栋与角色都落在 `270°`。

两个坑（都写进工具注释了）：

1. **蒙皮模型必须每格重新加载 GLB。** `clone(true)` 的骨骼仍指向原骨架，旋转对渲染无效，
   八格会长得一模一样（第一版探针就这样，白跑一轮）；复用同一个节点则骨骼世界矩阵与 mesh
   自身矩阵各转一次，转出双倍角度。探针现在每格 `loadAsync` 一份，静态模型结果不变
   （ch01 复跑与旧版像素级一致，`compare -metric AE` = 0）。
2. **蒙皮罗盘只是旁证，最终判据是游戏内实走。** 角色罗盘里 `90°` 与 `270°` 两格都像正脸
   （渲染假象），靠罗盘会判错。正确做法：进岛屿 → 第三人称，相机默认在玩家 `+Z` 侧，
   **按 W（朝 -Z 走）应看到背面、按 S 应看到正脸**；两次都只看到侧面就是偏了 90°。

## Alternatives considered

- **改 `site.yaw`／改门前交互点方向去迁就模型**：`site.yaw` 是通行规划图里评审过的入口朝向
  （小咪交付的本地文档 `art/memory-island-layout-walkability-v01.md`，按 `.gitignore` 规则未入库），
  改它等于动布局；只转模型是局部改动。
- **在 Blender 里把 GLB 转正后重新导出**：等价效果，但每来一版新资产都要多一道人工工序，
  且会让「美术交付的原始 GLB」和「仓库里的 GLB」不再一致，排查问题时要记住两层变换。
- **逐栋手工试角度**：六栋同源、同一个答案，逐个试是浪费；罗盘一次跑完六栋也便于复核。

## Trade-offs accepted

- 依赖「同一套 Tripo 流程 → 同一作者朝向」这个观察。换模型来源（自建低模、其它生成器）时，
  必须重新跑一次罗盘，不能沿用 `-π/2`。
- 探针的 yaw 语义依赖「水平相机 + 门前交互点在 `+Z`」这条约定；若将来门点改到别的方向，
  探针和 yaw 值都要一起改。

## Verification

截图证据都在本地（`screenshots/` 按 `.gitignore` 不入库），要复现按上面的命令重跑即可：

- 六栋罗盘（`screenshots/island/orient/ch0N-compass.jpg`）：`270°` 格分别是贝壳屋拱门、
  辣条屋辣椒门头、画室月洞门、树屋楼梯、帐篷门帘、相册屋拱门，其他格只见侧面／背面。
- 彩色态实景（`screenshots/island/color/color-ch0N-focus.png`）：六栋门面都朝镜头／主路一侧。
- 角色实走（`/tmp` 一次性脚本，非入库）：修前按 W、S 都只看到左右侧脸；改成 `-π/2` 后
  按 W 看到背面、按 S 看到正脸。
- 门前可达性：按载入时实测 `fittedSize` 复算 `allowed()` 的世界轴对齐障碍盒，六栋门点到盒边界
  的距离为 `0.25`（04 树屋：`site.yaw = -π/4`，斜向门点被轴对齐盒切掉一部分）～`1.79`
  （01 贝壳屋）个世界单位，都远小于 `2.8` 的触发半径 → 不需要为对齐再改碰撞。
- 回归：`npx tsc --noEmit` 0 error、`npm test` 53/53、`npm run build` 通过、
  `node tools/probe-island-load.mjs` 11/11 模型 · 0 console error。
