import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALBUM_CHAPTERS, ALBUM_SIZE, albumEntries, albumPhotoCount } from '../src/story/Album.ts';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const story = read('GAME_STORY_AND_LEVEL_DESIGN.md');

test('album registers six chapters in order with a memory object each', () => {
  assert.equal(ALBUM_SIZE, 6);
  assert.deepEqual(ALBUM_CHAPTERS.map(entry => entry.chapter), [1, 2, 3, 4, 5, 6]);
  for (const entry of ALBUM_CHAPTERS) {
    assert.ok(entry.label.length > 0, `chapter ${entry.chapter} has no label`);
    assert.ok(entry.memory.length > 0, `chapter ${entry.chapter} has no memory object`);
    assert.match(story, new RegExp(entry.memory), `story document never mentions ${entry.memory}`);
  }
});

test('album unlocks exactly the completed chapters and stays locked otherwise', () => {
  assert.deepEqual(albumEntries([]).map(entry => entry.unlocked), [false, false, false, false, false, false]);
  assert.equal(albumPhotoCount([]), 0);
  const two = albumEntries([1, 2]);
  assert.deepEqual(two.slice(0, 3).map(entry => entry.unlocked), [true, true, false]);
  assert.equal(albumPhotoCount([1, 2]), 2);
  assert.equal(albumPhotoCount([1, 2, 2, 9]), 2, 'duplicates and unknown chapters must not inflate the count');
  assert.equal(albumEntries([3]).find(entry => entry.chapter === 1)?.unlocked, false);
});

test('album view is reachable from the island with the current chapter state', () => {
  const island = read('src/island/MemoryIsland.ts');
  assert.match(island, /data-album/);
  assert.match(island, /showAlbumUI\(\{ completed: completedChapters\(\)/);
  // 相册不自建进度存档：完成状态只有 island/Progress.ts 一处真源。
  assert.doesNotMatch(read('src/story/Album.ts'), /localStorage|ProgressPersistence/);
});

test('album is also reachable from the prologue and the main menu', () => {
  for (const scene of ['src/scenes/IntroScene.ts', 'src/scenes/MenuScene.ts']) {
    const source = read(scene);
    assert.match(
      source,
      /showAlbumUI\(\{\s*completed: completedChapters\(\)/,
      `${scene} must open the album with the shared chapter state`,
    );
  }
  // 相册是挂在 body 上的 DOM 覆盖层，离开场景不收掉就会跟到下一个场景。
  for (const scene of ['src/scenes/IntroScene.ts', 'src/scenes/MenuScene.ts']) {
    assert.match(read(scene), /SHUTDOWN/, `${scene} must close the album on shutdown`);
  }
});

test('album photos go through Vite so production builds include them', () => {
  const ui = read('src/ui/AlbumUI.ts');
  assert.match(ui, /CHAPTER_PHOTOS/);
  // 字面路径不会被打包：必须 `?url` 引入，否则生产环境相册显示不出照片。
  assert.match(ui, /assets\/story\/[^']+\.png\?url/);
  assert.match(ui, /seek-album__photo-img/);
});
