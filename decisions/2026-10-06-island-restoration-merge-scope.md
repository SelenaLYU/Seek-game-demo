## Decision: 2026-10-06 仅合入本次岛屿还原及其直接依赖

## Context: 为什么需要限定合入范围

用户明确要求「推送到 GitHub 合入，只合入今天的还原改动，记住」。原工作分支还包含岸线重做提交，本地存在其他角色、美术、Marble 环境试验和排查脚本，不能一起提交。

## Alternatives considered: 其他选项

- 直接合并原工作分支。
- 从最新 origin/main 创建独立分支，仅复制当前还原场景及必要依赖。

## Reasoning: 选择理由

采用第二种方式，基于 origin/main 079693a 创建 codex/island-restore-2026-10-06。场景来自历史 Git blob 20a87da1016982c3a365161e9b2dbe2be83d41e3，保留青色海面、浅色天空雾气、旧总览镜头和岛屿地形。

本次白名单：

- src/island/MemoryIsland.ts：旧场景还原、Meshopt 解码支持、韩梅梅 v3 接入、删除用户标记的道路/溪流/步行桥/庭院平台、贝壳屋向右移至 (2,13) 并旋转、建筑落地修正。
- src/island/buildingGrounding.ts：真实底座落地、地形整平与树屋/相册屋低底面补土。
- public/island-models/character-han-meimei-v3*.glb：主模型及 idle/walk/run/jump 四个配套动画，为当前场景直接引用的运行资源。
- tests/islandBuildingGrounding.test.mjs、tools/audit-island-building-support.mjs：本次落地修复已有的用例及 CPU 几何排查工具。
- 本文件与 2026-10-06-island-building-ground-contact.md：合入范围与落地处理记录。

未纳入：岸线重做的未合入提交、Marble 环境探索、其他新角色/美术候选、旧场景恢复过程备份、未使用的 terrain/artDirection/surfaceRibbon/runtimeGeometry 试验和其他排查工具。main 上的第一、第二关及队友文件保持其现有版本。

## Trade-offs accepted: 接受的限制

- 这是恢复用户选定的旧场景，不声称已经还原水彩概念图。
- 源码已编译，底脚已做 CPU 几何检查，代码已复核；浏览器近景视觉尚未重新验收。
- CPU 检查范围：六栋建筑最低脚顶点，以及树屋和相册屋低底面中心；不能替代全模型穿模检查。
- 未来合入须继续逐次列出文件范围，不能把本次授权理解成允许合入所有本地改动。
