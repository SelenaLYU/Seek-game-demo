import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * 骑楼（第二关）美术真源的回归防线。
 *
 * 裁定见 `decisions/2026-10-05-qilou-art-night-only.md`：骑楼运行时美术以
 * `assets/level2/night-v1/`（ruchengloria `648cadd`）为唯一真源，坐标系以同目录
 * `geometry.json` 为准；白昼骑楼图集与宽幅底图已废弃移除。
 *
 * 为什么需要它：`ChapterTwoNightArt.ts` 是 `geometry.json` 的**手工抄写**版本，
 * 场景里的 `COVERS` / `SWINGS` / 落下口坐标又是第三份硬编码。三份只要有一份被改动
 * 就会静默漂移——平台能站、但贴图与判定错位，不报错也不影响测试。
 * 旧的白昼版曾经有 `tests/chapterTwoArt.test.mjs` 守这件事，随白昼版一起删掉了，
 * 所以夜骑楼这边现在补上。
 */

const ROOT = new URL('..', import.meta.url);
const at = rel => new URL(rel, ROOT);
const p = rel => fileURLToPath(at(rel));

const geo = JSON.parse(readFileSync(at('assets/level2/night-v1/geometry.json'), 'utf8'));

/** `export const NIGHT = { … } as const;` → 对象 */
function readNIGHT() {
  const source = readFileSync(at('src/gameplay/ChapterTwoNightArt.ts'), 'utf8');
  const body = source
    .replace(/^[\s\S]*?export const NIGHT = /, '')
    .replace(/\s*as const;\s*$/, '');
  return JSON.parse(body);
}

function pngSize(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(1, 4).toString('latin1'), 'PNG', `${file} 不是 PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** geometry.json 里所有带 file 的条目 */
function entries() {
  const list = [];
  for (const key of ['platforms', 'hurdles', 'covers', 'swings']) {
    for (const item of geo[key]) list.push({ group: key, ...item });
  }
  for (const key of ['wall', 'teacher', 'ticket', 'door']) list.push({ group: key, ...geo[key] });
  return list;
}

test('ChapterTwoNightArt 与 geometry.json 逐字段一致（唯一真源不能漂移）', () => {
  const NIGHT = readNIGHT();
  assert.deepEqual(
    { version: NIGHT.version, baseCommit: NIGHT.baseCommit, world: NIGHT.world, background: NIGHT.background },
    { version: geo.version, baseCommit: geo.baseCommit, world: geo.world, background: geo.background },
    'ChapterTwoNightArt 的版本 / 世界尺寸 / 背景名与 geometry.json 不一致',
  );
  for (const key of ['platforms', 'hurdles', 'covers', 'swings']) {
    assert.deepEqual(NIGHT[key], geo[key], `ChapterTwoNightArt.${key} 与 geometry.json 不一致`);
  }
  for (const key of ['wall', 'teacher', 'ticket', 'door']) {
    assert.deepEqual(NIGHT[key], geo[key], `ChapterTwoNightArt.${key} 与 geometry.json 不一致`);
  }
});

test('每张骑楼素材存在，且 PNG 像素 = 逻辑尺寸 × 导出倍率', () => {
  const problems = [];
  for (const item of entries()) {
    const file = `assets/level2/night-v1/${item.file}`;
    if (!existsSync(p(file))) {
      problems.push(`${file} 不存在`);
      continue;
    }
    const scale = item.scale ?? 1;
    const { width, height } = pngSize(p(file));
    if (width !== item.width * scale || height !== item.height * scale) {
      problems.push(
        `${item.id}: PNG ${width}×${height} ≠ 逻辑 ${item.width}×${item.height} × ${scale}`,
      );
    }
  }
  const background = pngSize(p('assets/level2/night-v1/background-night.png'));
  if (background.width !== geo.world.width || background.height !== geo.world.height) {
    problems.push(
      `background-night.png ${background.width}×${background.height} ≠ 世界 ${geo.world.width}×${geo.world.height}`,
    );
  }
  assert.deepEqual(problems, [], `骑楼素材尺寸不符：\n  ${problems.join('\n  ')}`);
});

test('场景 preload 只加载 geometry.json 里登记的骑楼素材', () => {
  const scene = readFileSync(at('src/scenes/ChapterTwoChallengeScene.ts'), 'utf8');
  const loaded = [...scene.matchAll(/this\.load\.image\(\s*'([^']+)'\s*,\s*resolveImageUrl\('(assets\/[^']+)'\)/g)]
    .map(m => ({ key: m[1], file: m[2] }));
  const nightLoaded = loaded.filter(entry => entry.file.includes('level2/night-v1/'));
  const registered = new Set(entries().map(item => `assets/level2/night-v1/${item.file}`));
  registered.add('assets/level2/night-v1/background-night.png');

  const unregistered = nightLoaded.filter(entry => !registered.has(entry.file)).map(entry => entry.file);
  const missing = [...registered].filter(file => !nightLoaded.some(entry => entry.file === file));
  assert.deepEqual(unregistered, [], `场景加载了 geometry.json 未登记的骑楼素材：\n  ${unregistered.join('\n  ')}`);
  assert.deepEqual(missing, [], `geometry.json 登记但场景没加载的骑楼素材：\n  ${missing.join('\n  ')}`);
  assert.equal(nightLoaded.length, 35, `场景应加载 34 件素材 + 1 张背景 = 35 张图，实际 ${nightLoaded.length}`);
});

test('场景硬编码的坐标与 geometry.json 一致（遮挡区 / 摆动物 / 世界尺寸）', () => {
  const scene = readFileSync(at('src/scenes/ChapterTwoChallengeScene.ts'), 'utf8');
  const num = (re, what) => {
    const m = scene.match(re);
    assert.ok(m, `场景里找不到 ${what}`);
    return Number(m[1]);
  };
  assert.equal(num(/const WORLD_WIDTH = (\d+)/, 'WORLD_WIDTH'), geo.world.width);
  assert.equal(num(/const WORLD_HEIGHT = (\d+)/, 'WORLD_HEIGHT'), geo.world.height);

  // COVERS：每个 geometry zone 的 from / to 必须逐字出现在场景里，baseY = maxY - 24
  for (const cover of geo.covers) {
    assert.match(
      scene,
      new RegExp(`\\{ from: ${cover.zone.from}, to: ${cover.zone.to}, baseY: \\d+`),
      `${cover.id} 的遮挡区 (from ${cover.zone.from}, to ${cover.zone.to}) 与 geometry.json 不一致`,
    );
  }
  // SWINGS：支点与长度必须一致
  for (const swing of geo.swings) {
    assert.match(
      scene,
      new RegExp(`\\{ x: ${swing.x}, y: ${swing.y}, length: ${swing.height}, phase: ${String(swing.phase)}`),
      `${swing.id} 的支点 / 长度 / 相位与 geometry.json 不一致`,
    );
  }
});

test('白昼骑楼不得回流（已裁定的作废素材不能被重新接线）', () => {
  const sources = [
    'src/scenes/ChapterTwoChallengeScene.ts',
    'src/scenes/ChapterTwoRoomScene.ts',
    'src/gameplay/ChapterTwoNightArt.ts',
    'src/ui/AssetReviewOverlay.ts',
  ];
  const offenders = [];
  for (const source of sources) {
    const text = readFileSync(at(source), 'utf8');
    for (const [index, line] of text.split('\n').entries()) {
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
      if (/level2\/qilou|chapter2-qilou/.test(line)) offenders.push(`${source}:${index + 1}`);
    }
  }
  assert.deepEqual(offenders, [], `白昼骑楼素材已被删除，不能再被引用：\n  ${offenders.join('\n  ')}`);
  for (const gone of ['assets/level2/qilou', 'assets/scenes/chapter2/chapter2-qilou-water-town-background-hd-7360x2200.png']) {
    assert.equal(existsSync(p(gone)), false, `${gone} 应该已经删除`);
  }
  assert.equal(existsSync(p('src/gameplay/chapterTwoArt.ts')), false, 'src/gameplay/chapterTwoArt.ts 应该已经删除');
});
