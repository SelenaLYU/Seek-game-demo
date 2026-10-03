## Decision: 压扁补间只销毁自己，不用 `killTweensOf(view)`

## Context: 角色在**死亡后被传送回复活点**时会永久半透明（alpha 停在 0.5~0.91 之间），直到下一次死亡才恢复。第二关的复活演出是「淡出 → 传送 → 淡入」，而淡入的执行窗口正好是角色落地的时间点：落地会触发 `Player.squash()`，它原来调用了 `this.scene.tweens.killTweensOf(this.view)`，把**场景挂在角色 view 上的重生淡入补间一并杀掉**，alpha 就停在补间最后写入的值。

隔离复现（`tools/probe-player-alpha.mjs`，在只含本决策的检出上跑第二关）：

```
未修：死亡前 1.00 → 淡入中 0.91 → +200ms 0.91 → +600ms 0.91 → 1.2s 0.91 → 2.0s 0.91   ← 卡住
已修：死亡前 1.00 → 淡入中 1.00 → 之后一直 1.00
```

## Alternatives considered: 保留 `killTweensOf(view)`，改由场景在复活时重新 `setAlpha(1)`（治标，且要每个场景都记得写）；把淡入改到 Player 内部统一管（改动面大，跨章节）；给压扁补间加 key 后用 `killTweensOf(view, key)`（可行但语义隐晦）。

## Reasoning: 压扁要清理的只是**它自己上一次的还原补间**，而 `killTweensOf(view)` 的作用域是整条 view，天然会踩到别人。用一个字段保存并 `destroy()` 自己那条补间，作用域最小、与场景的 alpha 演出彻底解耦，第一关与第二关共用同一个 `Player` 时都成立。

## Trade-offs accepted: `Player` 多一个字段（`squashTween`）；如果以后有别的代码也用 `killTweensOf(view)` 做清理，同样会踩到场景补间——这条决策只覆盖压扁路径。

---

## 补充
- 关联决策：`decisions/2026-10-01-gameplay-state-boundaries.md`（场景与玩法状态的职责边界）
- 影响范围：`src/gameplay/Player.ts`（`squash()`）；第一关、第二关所有「传送复活 + 淡入」的演出
- 验证方式：`node tools/probe-player-alpha.mjs http://localhost:5173 chapter2` → 末行 PASS；`npm test` 全绿
- 给第二关（以及任何并行分支）的说明：如果你本地也改了 `Player.ts` 的 `squash()`，**请丢弃本地那一份**（本次已覆盖根因），只保留你自己的场景侧改动，避免重复提交或冲突。场景自己的淡入写法不在本次范围内，可以照旧。
