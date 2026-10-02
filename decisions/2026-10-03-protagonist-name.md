## Decision: 主角定名「韩梅梅」

## Context: 第一关要接正式录音、照片与贝壳文案，第二关分镜灰盒里也已经把主角写成「韩梅梅」；`GAME_STORY_AND_LEVEL_DESIGN.md` 一直用「主角」占位，注明「等团队确认名字后再批量替换」。旧 Demo 与旧素材里还有第三个称呼「年年」。名字不定，所有玩家可见文案都只能继续占位。

## Alternatives considered: 沿用旧 Demo 的「年年」；改用「念念」；继续推迟，等美术或剧情再定。

## Reasoning: 2026-10-03 团队确认「韩梅梅」。它已经出现在第二关分镜与门框刻度的回忆文案里，改名的成本只会随章节增加；「年年」属于旧项目角色，与新故事的人物设定没有连续性。

## Trade-offs accepted: 第一关角色序列帧、动画键名与注释仍保留旧资产名（`char-niannian-*` / `niannian-run` 等），只作为技术标识，不是剧情称呼；重命名涉及三个二进制文件与多处键名，等第一关验收后再统一处理，避免与并行改动冲突。第四关角色「李雷」仍是暂称。

---

## 补充
- 影响范围：`GAME_STORY_AND_LEVEL_DESIGN.md`（主角 → 韩梅梅）、`src/story/ChapterOneStory.ts`（`PROTAGONIST_NAME`）、第二关分镜文案（已在用）、后续全部玩家可见文案。
- 验证方式：`tests/storyBoundary.test.mjs` 断言代码常量与剧情文档一致，且名字不再列为待确认；`npm test` + `npm run build`。
