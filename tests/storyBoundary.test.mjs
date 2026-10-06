import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { RADIO_PREVIEW_MS, RADIO_PREVIEW_TEXT, CHAPTER_ONE_MEMORY_TEXT, PROTAGONIST_NAME } from '../src/story/ChapterOneStory.ts';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? sources(path) : /\.ts$/.test(path) ? [path] : [];
  });
}

test('runtime sources cannot reintroduce predecessor characters or narrative media', () => {
  for (const path of sources(resolve(root, 'src'))) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /外公|外婆|鱼鱼|回南城|radio-grandpa|radio-song|assets\/audio\/ending-voice\.wav/, path);
  }
});

test('the approved family photo drives both the puzzle and its missing inventory piece', () => {
  const room = read('src/scenes/RoomScene.ts');
  assert.match(room, /interactive-family-zoo-photo-frame-384x256\.png\?url/);
  assert.match(room, /imageCrop: \{ column: 3, row: 3, columns: 4, rows: 4 \}/);
  assert.match(room, /photoSolved \? 'room-frame-complete-art' : 'room-frame-art'/);
  assert.match(room, /room-memory-pearl-shell-v1\.png\?url/);
  assert.match(room, /\.image\(0, 0, 'room-memory-shell'\)/);
});

test('new-story placeholders are explicit and follow the documented childhood memory', () => {
  assert.equal(RADIO_PREVIEW_MS, 3000);
  assert.match(RADIO_PREVIEW_TEXT, /静默占位/);
  assert.match(CHAPTER_ONE_MEMORY_TEXT, /贝壳/);
  assert.match(CHAPTER_ONE_MEMORY_TEXT, /妈妈/);
  assert.match(CHAPTER_ONE_MEMORY_TEXT, /爸爸/);
});

test('chapter-one ending plays the real animation instead of the predecessor video', () => {
  const ending = read('src/scenes/EndingScene.ts');
  // 旧 Demo 的「鱼鱼 + 公公」动画已核验为冲突内容（STORY_MIGRATION.md）：不得再引用。
  assert.doesNotMatch(ending, /ending\.mp4/);
  // 正式第一章动画到货，结尾由同风格分镜占位换成 assets/animation/chapter1.mp4。
  assert.match(ending, /assets\/animation\/chapter1\.mp4\?url/);
  assert.match(ending, /跳过/);
  // 分镜占位已删除：逐句字幕 / 照片显影那套时间线不得再回来。
  assert.doesNotMatch(ending, /CHAPTER_ONE_MEMORY_TEXT/);
  assert.doesNotMatch(ending, /seek-ending__beat/);
  assert.doesNotMatch(ending, /seek-ending__photo/);
  // 动画位置：只属于「贝壳 → 结尾」，不得再出现在开场动画与海边之间的加载页。
  assert.doesNotMatch(read('src/scenes/LoadingScene.ts'), /chapter1\.mp4/);
  // 相册第一格仍是正式家庭照片，删掉分镜不影响收录内容。
  assert.match(read('src/ui/AlbumUI.ts'), /chapter1-family-photo-seaside\.png\?url/);
  // 旧占位图已由正式照片取代，不得再被任何运行时源码引用。
  for (const path of sources(resolve(root, 'src'))) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /seek-childhood-photo-placeholder/, path);
  }
});

// These are source boundary guards, not substitutes for browser interaction tests.
test('closing the radio has no completion side effect', () => {
  const room = read('src/scenes/RoomScene.ts');
  const close = room.slice(room.indexOf('  private closePanel()'), room.indexOf('  private playRadioAudio('));
  assert.doesNotMatch(close, /type: 'radio-message-heard'/);
  assert.match(close, /this\.stopRadioAudio\(\)/);
});

test('all four radio channels award the photo piece directly to inventory', () => {
  const radio = read('src/ui/RadioPuzzleUI.ts');
  const room = read('src/scenes/RoomScene.ts');
  const completion = room.slice(room.indexOf('  private completeRadioSequence()'), room.indexOf('  // ---------- 挂钟'));
  assert.match(radio, /visitedChannels\.size === 4/);
  assert.match(radio, /options\.onAllChannelsVisited\?\.\(\)/);
  assert.match(completion, /type: 'radio-message-heard'/);
  assert.match(completion, /type: 'photo-piece-collected'/);
  assert.match(completion, /addItem\(\{\s*id: 'photo-piece'/);
});

test('story progress is isolated from predecessor saves', () => {
  assert.match(read('src/gameplay/ChapterOneRoomProgress.ts'), /seek-life-chapter-one-v1/);
  assert.match(read('src/island/Progress.ts'), /seek-life-memory-island-v1/);
});

test('room navigation has no HUD bypass and the memory orb requires all fragments', () => {
  const room = read('src/scenes/RoomScene.ts');
  const hud = room.slice(room.indexOf('  private buildHud()'), room.indexOf('  private showHint('));
  const orb = room.slice(room.indexOf('  private touchMemoryOrb()'), room.indexOf('  // ---------- HUD'));
  assert.doesNotMatch(hud, /onNext:/);
  assert.match(orb, /!hasAllRoomFragments\(this\.progress\)/);
  assert.doesNotMatch(orb, /showLevelClearedModal/);
  assert.match(orb, /this\.scene\.start\('ending', \{ completedChapter: 1 \}\)/);
});

test('island is a chapter hub, not an ending label', () => {
  assert.doesNotMatch(read('src/scenes/MenuScene.ts'), /终章|激浪蹦床|高空钥匙/);
  assert.match(read('src/scenes/MenuScene.ts'), /章节枢纽/);
});

test('room background is imported through Vite so production includes it', () => {
  const room = read('src/scenes/RoomScene.ts');
  assert.match(room, /import roomBackgroundUrl from .*level1-memory-room-night-empty-v2-1920x1080\.png\?url/);
  assert.match(room, /\['room-bg', roomBackgroundUrl\]/);
});

test('protagonist name is locked in code and the story document, not left as a placeholder', () => {
  assert.equal(PROTAGONIST_NAME, '韩梅梅');
  const story = read('GAME_STORY_AND_LEVEL_DESIGN.md');
  assert.match(story, /主角定名：\*\*韩梅梅\*\*/);
  assert.doesNotMatch(story, /主角最终姓名|本文统一写作“主角”/);
  // The placeholder survives only in the header line that records the naming decision.
  assert.equal((story.match(/主角/g) ?? []).length, 1, 'story document still uses the placeholder name');
  assert.match(story, /主角定名：\*\*韩梅梅\*\*/);
  assert.match(read('decisions/2026-10-03-protagonist-name.md'), /## Decision: 主角定名「韩梅梅」/);
});
