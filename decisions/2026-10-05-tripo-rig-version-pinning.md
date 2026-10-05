# 决策：Tripo rig 必须显式钉住 v1.0-20240301，否则 retarget 失败

日期：2026-10-05
状态：已生效（李雷童年角色生成时发现并验证）

## Context

给李雷童年角色生成骨骼动画时，按韩梅梅（2026-10-04）的既有流水线复刻：

```bash
tripo generate multiview-to-model front.png back.png right.png \
  --model tripo-v3.1 -p face_limit=80000 -p geometry_quality=detailed -p texture_quality=detailed
tripo anim rig <model> --rig-type biped --spec tripo --out-format glb
tripo anim retarget <rig-task> --animation preset:idle --animate-in-place --out-format glb
```

模型生成（60 积分）与绑定（25 积分）都成功，但**四段 retarget 全部失败**，服务端返回
`error_code 1004 / Invalid input parameter`。失败不计费（预扣自动退还），但整条动画链卡住。

隔离过程：

1. 拿韩梅梅昨天成功的 rig 任务 id 重新 retarget `preset:idle` → **成功**。说明 API、CLI 0.5.1、
   `preset:idle` 命名和 `original_model_id` 字段都没有问题。
2. 不带 `--animate-in-place`、显式补 `-p model=v2.5-20260210` 重试我的 rig → 仍失败。
3. 直接对比两份 rig 产物的骨骼命名，根因明确：

| rig 来源 | 骨骼节点 | 命名形态 |
| --- | --- | --- |
| 韩梅梅（2026-10-04，成功） | 43 | `Root/Hip/Waist/Spine01/L_Upperarm/L_Thigh/L_Foot/L_ToeBase…` 人形骨架 |
| 李雷（2026-10-05，`tripo anim rig` 默认参数） | 53 | `tripo::0_Left_Limb_0..6`、`tripo::Head_*`、`bone_6..43` **肢体分段骨架** |
| 李雷（显式 `-p model=v1.0-20240301`） | 43 | 与韩梅梅逐节点同名的人形骨架 |

默认 rig 模型在 10-04 与 10-05 之间发生了变化：新的默认产出「肢体分段」骨架，人形
动画预设（idle/walk/run/jump）没有可映射的骨骼，服务端以 1004 拒绝。旧的人形 rig 模型
仍然可用。

## Decision

**调用 `tripo anim rig` 时必须显式指定 `-p model=v1.0-20240301`**，不要依赖服务器默认值。
链式 `tripo make --then rig,…` 会自带 `model=v2.5-20260210`，同样产出分段骨架，**不可用于本项目角色**。

```bash
tripo anim rig <model.glb> --rig-type biped --spec tripo --out-format glb \
  -p model=v1.0-20240301 --name <name>
tripo anim retarget <rig-task-id> --animation preset:idle --animate-in-place --out-format glb
```

判定标准：绑定后骨架应为 43 节点，包含 `Root/Hip/Waist/Spine01/Spine02/L_Clavicle/L_Upperarm/
L_Forearm/L_Hand/NeckTwist01-02/Head/L_ThighTwist01-02/L_Calf/L_Foot/L_ToeBase` 等命名。
若出现 `*_Left_Limb_*` 或 `bone_NN`，即为错误的默认 rig，必须重绑。

## Alternatives considered

- **改用人形预设之外的分段动画**：Tripo 未提供分段骨架的行走/待机预设，且岛上代码按
  `idle/walk/run/jump` 片段名驱动状态机，改动成本远高于钉版本。
- **接受 v2.5 骨架并自行在 Three.js 里映射骨骼**：要维护两套骨骼命名映射，且韩梅梅与
  李雷会长期共存于同一场景，收益为负。
- **放弃 Tripo 动画、在 Three.js 手写程序化动画**：与既有韩梅梅资产不一致，且 demo 时间不允许。

## Trade-offs accepted

- 依赖一个被服务端标为「server default 之前」的人形 rig 版本；若 Tripo 未来下线
  `v1.0-20240301`，需要重新评估（届时优先尝试 `rig-v2.0` 之外的其它人形 rig）。
- 生成时必须逐个核对骨架命名，多一步人工校验。

## Verification

- 李雷 rig 产物 `assets/characters/lilei/tripo-out/lilei-rig-v1-23097ef5/model.glb`：
  43 节点 / 41 关节 / 79390 三角面，骨骼命名与韩梅梅逐节点一致。
- 四段动画 retarget 全部成功（各 10 积分）：idle 15.37s、walk 2.37s、run 1.27s、jump 2.23s，
  每段 123 条轨道、41 个目标关节，与基础模型节点名**零未匹配**。
- 剥离网格后的运行时资产在 `public/island-models/character-lilei-child*.glb`（55–207KB/段）。
- 完整流水线记录见 `assets/characters/lilei/README.md`。
