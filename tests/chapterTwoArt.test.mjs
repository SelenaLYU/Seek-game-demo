import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PILLAR_TINT, SEAM_PILLARS, STREET_ART_SCALE, drawStreetSurface, streetRepeatRegion, streetSurfaceFrame, streetWallBodyRegion } from '../src/gameplay/chapterTwoArt.ts';
import { TEACHER, TEACHER_ART, LIGHT_ORIGIN } from '../src/gameplay/chapterTwoRules.ts';

const asset = (name) => JSON.parse(fs.readFileSync(new URL(`../assets/level2/qilou/${name}.aligned.json`, import.meta.url), 'utf8'));
const source = fs.readFileSync(new URL('../src/scenes/ChapterTwoChallengeScene.ts', import.meta.url), 'utf8');

test('aligned atlases preserve frame names and stay within their supplied PNG', () => {
  for (const name of ['chapter2-platform-tiles-4x2', 'chapter2-cover-modules-5x2', 'chapter2-static-obstacles-3x3', 'chapter2-dynamic-goal-modules-4x2']) {
    const aligned = asset(name);
    const original = JSON.parse(fs.readFileSync(new URL(`../assets/level2/qilou/${name}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(Object.keys(aligned.frames), Object.keys(original.frames));
    for (const [key, { frame, sourceSize }] of Object.entries(aligned.frames)) {
      assert.ok(frame.x >= 0 && frame.y >= 0 && frame.w > 0 && frame.h > 0, key);
      assert.ok(frame.x + frame.w <= original.meta.size.w, key);
      assert.ok(frame.y + frame.h <= original.meta.size.h, key);
      assert.deepEqual(sourceSize, { w: frame.w, h: frame.h });
    }
    assert.ok(source.includes(`${name}.aligned.json`));
  }
});

test('platform artwork excludes the next row and blocking pillar retains its head', () => {
  const frames = asset('chapter2-platform-tiles-4x2').frames;
  for (const key of ['platform-school-wall', 'platform-upper-qilou', 'platform-middle-gallery', 'platform-lower-street']) {
    assert.ok(frames[key].frame.y + frames[key].frame.h <= 365, key);
  }
  assert.ok(frames['route-blocking-wall'].frame.y < 444, 'equal grid cuts the pillar head off');
  const pillar = frames['route-blocking-wall'].frame;
  assert.ok(pillar.w < pillar.h * .6, 'pillar must not contain adjacent platform fragments');
});

test('awnings and market roof are not truncated at former grid boundaries', () => {
  const covers = asset('chapter2-cover-modules-5x2').frames;
  assert.ok(covers['cover-cloth-awning'].frame.x < 397);
  assert.ok(covers['cover-upper-column'].frame.h > 396);
  const obstacles = asset('chapter2-static-obstacles-3x3').frames;
  assert.ok(obstacles['market-stall-frame'].frame.y < 682);
});

test('street surfaces repeat their interior, not a black outline at every tile boundary', () => {
  for (const y of [260, 320, 380, 440, 610, 820, 865, 910, 950]) {
    const frame = asset('chapter2-platform-tiles-4x2').frames[streetSurfaceFrame(y)].frame;
    const region = streetRepeatRegion(frame.w, frame.h);
    assert.ok(region.x > 0 && region.width < frame.w);
    assert.equal(region.x + region.width + region.edge, frame.w);
    assert.equal(region.height, frame.h);
    assert.ok(region.edge * STREET_ART_SCALE < 4);
  }
});

test('drawing uses a wall body frame and exact bounds after Phaser constructor rounding', () => {
  const frames = new Map(Object.entries(asset('chapter2-platform-tiles-4x2').frames).map(([key, value]) => [key, {
    cutX: value.frame.x, cutY: value.frame.y, width: value.frame.w, height: value.frame.h,
  }]));
  const tiles = [];
  const texture = {
    get: key => frames.get(key),
    has: key => frames.has(key),
    add: (key, _index, x, y, width, height) => frames.set(key, { cutX: x, cutY: y, width, height }),
  };
  const chain = {
    setOrigin() { return this; }, setTileScale() { return this; }, setDepth() { return this; },
    setCrop() { return this; }, setScale() { return this; }, setTint() { return this; }, setAlpha() { return this; },
  };
  const scene = {
    textures: { get: () => texture },
    add: {
      image: () => Object.create(chain),
      tileSprite: (x, y, width, height, _texture, frame) => {
        const tile = Object.assign(Object.create(chain), { x, y, width: Math.floor(width), height: Math.floor(height), frame });
        tile.setDisplaySize = function(w, h) { this.displayWidth = w; this.displayHeight = h; return this; };
        tiles.push(tile);
        return tile;
      },
    },
  };
  drawStreetSurface(scene, 330, 820, 800, 280);
  const surface = tiles.find(tile => tile.frame === 'platform-lower-street-repeat');
  const edge = streetRepeatRegion(frames.get('platform-lower-street').width, 1).edge * STREET_ART_SCALE;
  assert.ok(Math.abs(surface.x + surface.displayWidth - (1130 - edge)) < 1e-9, 'interior meets right border');
  const wall = tiles.find(tile => tile.frame === 'canal-wall-body');
  assert.equal(wall, undefined, 'module brick wall removed with the generated background');
  assert.equal(tiles.find(tile => tile.frame === 'column-shaft'), undefined, 'module support columns removed');
  drawStreetSurface(scene, 330, 820, 800, 280); // Cached derived frames remain valid after scene recreation.
});

test('teacher feet and nozzle agree with the single rule origin', () => {
  const frame = asset('chapter2-dynamic-goal-modules-4x2').frames['teacher-flashlight'].frame;
  assert.equal(frame.w, TEACHER_ART.width);
  assert.equal(frame.h, TEACHER_ART.height);
  const scale = TEACHER_ART.displayHeight / frame.h;
  const top = TEACHER.groundY - frame.h * TEACHER_ART.originY * scale;
  const left = TEACHER.x - frame.w * TEACHER_ART.originX * scale;
  assert.equal(top + frame.h * scale, TEACHER.groundY);
  assert.ok(Math.abs(left + TEACHER_ART.nozzleX * scale - LIGHT_ORIGIN.x) < 1e-9);
  assert.ok(Math.abs(top + TEACHER_ART.nozzleY * scale - LIGHT_ORIGIN.y) < 1e-9);
  assert.match(source, /setOrigin\(TEACHER_ART.originX, TEACHER_ART.originY\)/);
});

test('image loading stays on the HTMLImageElement path', () => {
  // 本机 Chromium 的 XHR+blob 对 ~24MB 响应网络错误（arraybuffer 正常），
  // Phaser 默认 XHR+blob 曾导致背景静默加载失败渲染成绿棋盘（v2c~v4 四轮误诊）。
  const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /imageLoadType:\s*'HTMLImageElement'/);
});

test('scene uses the generated street background, not the patched panel stitch', () => {
  assert.match(source, /chapter2-qilou-gen-v3-7360x2200\.png/);
  // The rejected wide-blend candidate must not come back.
  assert.doesNotMatch(source, /background-stitched/);
});

test('joint cover pillars removed: the seam falls on the street step itself', () => {
  assert.equal(SEAM_PILLARS.length, 0, 'no cover pillars by design (review: wrong column family)');
  assert.doesNotMatch(source, /drawStreetSeamPillars\(this\)/);
});

test('swing visual rotation matches the collision segment direction', () => {
  assert.match(source, /this\.swingArt\[index\]\.setRotation\(-angle\)/);
  for (const angle of [-.82, 0, .82]) {
    const length = 98;
    // Phaser rotates local (0,length); world collision end uses (+sin,+cos).
    assert.ok(Math.abs(-Math.sin(-angle) * length - Math.sin(angle) * length) < 1e-9);
  }
});

// ── 模块 C：支点迁移（C-pivot）场景美术与几何一致性 ───────────────────────────

test('bamboo pivot art self-locates from SWINGS[1] (no baked-in 930 remains)', () => {
  // 甩动竹竿的杆身贴图、挂点支架、旋转锚点都直接读 swing.x/SWINGS[1]：
  // 支点迁到 x=1050 后，美术/碰撞不需要任何写死的 930 遗留值。
  assert.match(source, /\{ x: 1050, y: 492, baseY: 610, length: 112, phase: 2\.6, label: '甩动竹竿' \}/);
  assert.doesNotMatch(source, /x: 930/);
  // 挂点支架（bracket）与杆身贴图共用 swing.x：
  assert.match(source, /lineBetween\(swing\.x - 30/);
  assert.match(source, /add\.image\(swing\.x, swing\.y, 'chapter2-dynamic', frame\)/);
});

test('second-floor 旧雨棚 stays a light shelter but is explicitly no longer a swing island', () => {
  // 杀区 [944,1156] 罩住整个棚下走道（支点东迁后）；遮光范围 [1040,1145] 保留，供途中站定的玩家
  // 躲灯（不是防杆安全岛）。场景必须能在代码注释层面把这一点写清，防止后续调参误用作安全岛。
  assert.match(source, /from: 1040, to: 1145, baseY: 610, label: '旧雨棚'/);
  assert.match(source, /不再是安全岛/);
  // 杀区东沿留出的侦察带不得写成安全岛注释（精度参照测试已收口到 [944,1156]）。
  assert.doesNotMatch(source, /from: 1156, to: \d+, baseY: 610/);
});
