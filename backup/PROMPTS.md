# Seek 美术探索提示词库

本目录保存团队美术探索时实际使用过的提示词。它们记录探索过程，不代表全部都是已定稿规范。

## 当前方向

- **角色参考**：团队认可的女孩动作与绘本质感参考图见 `character/teammate-approved-girl-style-reference.jpg`。该图目前没有对应的原始提示词。
- **场景探索**：江南水岸横版关卡 v2 是当前场景提示词起点，强调清晰手绘线稿、克制平涂、轻微干刷纹理和可读的游戏路线；避免厚重水彩晕染与柔光。详见 [`scene/seek-childhood-jiangnan-coastal-path-exploration-v2-prompt.md`](scene/seek-childhood-jiangnan-coastal-path-exploration-v2-prompt.md)。
- 角色 v1–v5 是连续探索记录。队友后来提供了更明确的女孩动作参考；早期男孩设定和服装探索不应覆盖该参考。

## 角色提示词

| 版本 | 探索内容 | 提示词 |
| --- | --- | --- |
| v1 | 中性童年主角、三视图 | [`child-protagonist-exploration-v1-prompt.md`](character/child-protagonist-exploration-v1-prompt.md) |
| v2 | 法国动画方向、单人全身像 | [`child-protagonist-exploration-v2-prompt.md`](character/child-protagonist-exploration-v2-prompt.md) |
| v3 | 女孩、中国元素日常服装、6:3:1 配色 | [`child-protagonist-girl-chinese-inspired-v3-prompt.md`](character/child-protagonist-girl-chinese-inspired-v3-prompt.md) |
| v4 | 从核心故事出发的女孩叙事探索 | [`seek-girl-protagonist-story-exploration-v4-prompt.md`](character/seek-girl-protagonist-story-exploration-v4-prompt.md) |
| v5 | 海边 × 江南服装剪影探索 | [`seek-girl-seaside-jiangnan-outfit-exploration-v5-prompt.md`](character/seek-girl-seaside-jiangnan-outfit-exploration-v5-prompt.md) |

## 场景提示词

| 版本 | 探索内容 | 提示词 |
| --- | --- | --- |
| v1 | 江南河道连向海湾，水彩绘本背景 | [`seek-childhood-jiangnan-coastal-path-exploration-v1-prompt.md`](scene/seek-childhood-jiangnan-coastal-path-exploration-v1-prompt.md) |
| v2 | 江南海岸横版关卡，平涂线稿、清晰可玩路线 | [`seek-childhood-jiangnan-coastal-path-exploration-v2-prompt.md`](scene/seek-childhood-jiangnan-coastal-path-exploration-v2-prompt.md) |
| v3 | 童年森林横版关卡 | [`seek-childhood-forest-level-exploration-v1-prompt.md`](scene/seek-childhood-forest-level-exploration-v1-prompt.md) |
| v4 | 家庭记忆房间与可交互物件 | [`seek-childhood-family-memory-room-exploration-v1-prompt.md`](scene/seek-childhood-family-memory-room-exploration-v1-prompt.md) |
| v5 | 记忆之岛枢纽与灰暗/苏醒建筑状态 | [`seek-memory-island-hub-exploration-v1-prompt.md`](scene/seek-memory-island-hub-exploration-v1-prompt.md) |
| v6 | 家庭记忆房间不同朝向与时段光影（2×2） | [`seek-family-memory-room-angle-lighting-exploration-v2-prompt.md`](scene/seek-family-memory-room-angle-lighting-exploration-v2-prompt.md) |
| v7 | 童年森林远景、中景、近景（连续三镜头） | [`seek-childhood-forest-shot-scale-exploration-v2-prompt.md`](scene/seek-childhood-forest-shot-scale-exploration-v2-prompt.md) |
| v8 | 广州西关骑楼街巷童年关卡 | [`seek-guangzhou-xiguan-arcade-childhood-exploration-v1-prompt.md`](scene/seek-guangzhou-xiguan-arcade-childhood-exploration-v1-prompt.md) |
| v9 | 江南临水街巷与运河横版关卡 | [`seek-jiangnan-canalside-level-exploration-v1-prompt.md`](scene/seek-jiangnan-canalside-level-exploration-v1-prompt.md) |
| v10 | 用户原图构图不变，仅转换动画画风 | [`seek-jiangnan-canalside-user-composition-style-transfer-v2-prompt.md`](scene/seek-jiangnan-canalside-user-composition-style-transfer-v2-prompt.md) |
| v11 | 强化可见手绘墨线、排线与铺色笔触 | [`seek-jiangnan-canalside-visible-hand-brush-style-v3-prompt.md`](scene/seek-jiangnan-canalside-visible-hand-brush-style-v3-prompt.md) |

## 复用与迭代约定

1. 先选用当前角色参考和场景 v2 的画面语言，再写具体构图与内容。
2. 新生成内容另存新版本，不覆盖旧提示词或试验图。
3. 每个提示词注明用途、参考图角色、必须保留的视觉点和需要避免的偏差。
4. 角色图与场景图分别记录；若模型或生成工具支持参考图，明确说明参考图只用于风格、角色或构图中的哪一项。
