/**
 * 记忆之岛「不许穿模」审计的回归测试。
 *
 * 为什么需要它：穿模是用户点名的硬约束（2026-10-05），而散布摆放是程序化生成的，
 * 几百件道具靠肉眼在总览截图里找穿模根本不现实。这里把判定锁成纯函数的测试，
 * 于是「规则被改松」「阈值被调大」「两两互穿漏检」这几类退化会直接测试变红。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SINK,
  auditPlacement,
  auditPlacements,
  canPlace,
  circleIntersectsFootprint,
  circlesOverlap,
  seededRandom,
} from '../src/island/clipping.ts';

// 注意：这里刻意不写 `import { type Placement }`——node 直跑 ESM 只做类型擦除，
// 内联 type 修饰符会报 SyntaxError（实测）。helper 用 JSDoc 标注即可。
/** @returns {import('../src/island/clipping.ts').Placement} */
const item = (over = {}) => ({
  id: 'prop#0',
  x: 0,
  z: 0,
  radius: 1,
  baseY: 0,
  groundY: 0,
  ...over,
});

test('贴地的物体没有任何问题', () => {
  assert.deepEqual(auditPlacement(item()), []);
  // 允许的轻微下陷（坡地上刻意留的重叠）不算穿模
  assert.deepEqual(auditPlacement(item({ baseY: -MAX_SINK + 0.001 })), []);
});

test('悬空与陷入地形都被判为穿模', () => {
  const floating = auditPlacement(item({ baseY: 0.5 }));
  assert.equal(floating.length, 1);
  assert.equal(floating[0].kind, 'floating');

  const sunken = auditPlacement(item({ baseY: -0.5 }));
  assert.equal(sunken.length, 1);
  assert.equal(sunken[0].kind, 'sunken');
  // 刚刚超过阈值也要判出来——阈值边缘是最容易被悄悄放宽的地方
  assert.equal(auditPlacement(item({ baseY: -MAX_SINK - 0.001 }))[0]?.kind, 'sunken');
});

test('占地圆相交判定包含「恰好相切不算穿」', () => {
  assert.equal(circlesOverlap({ x: 0, z: 0, radius: 1 }, { x: 1.9, z: 0, radius: 1 }), true);
  assert.equal(circlesOverlap({ x: 0, z: 0, radius: 1 }, { x: 2, z: 0, radius: 1 }), false);
  assert.equal(circlesOverlap({ x: 0, z: 0, radius: 1 }, { x: 2.1, z: 0, radius: 1 }), false);
  // 斜向也要算真实距离，不能只比轴向间隔（1.2,1.2 → 距离 1.70 < 2 才算相交）
  assert.equal(circlesOverlap({ x: 0, z: 0, radius: 1 }, { x: 1.2, z: 1.2, radius: 1 }), true);
});

test('圆与建筑占地盒：盒内、压边、贴角、越界四种情况', () => {
  const box = { minX: 10, maxX: 20, minZ: -5, maxZ: 5 };
  assert.equal(circleIntersectsFootprint({ x: 15, z: 0, radius: 0.1 }, box), true, '圆心在盒内');
  assert.equal(circleIntersectsFootprint({ x: 21, z: 0, radius: 1.5 }, box), true, '圆压到右边缘');
  // 压角：最近点 (20,5) 距离 0.707，半径 0.8 才算压到（0.6 会擦不到，属于正确的不报）
  assert.equal(circleIntersectsFootprint({ x: 20.5, z: 5.5, radius: 0.8 }, box), true, '圆压到角');
  assert.equal(circleIntersectsFootprint({ x: 20.5, z: 5.5, radius: 0.6 }, box), false, '差一点没压到角就不报');
  assert.equal(circleIntersectsFootprint({ x: 21, z: 0, radius: 1 }, box), false, '圆刚好碰到边不算压');
  assert.equal(circleIntersectsFootprint({ x: 0, z: 0, radius: 3 }, box), false, '离得很远');
});

test('压建筑与压净空圈都报出来，并带上可定位的 id', () => {
  const context = {
    footprints: [{ minX: 8, maxX: 14, minZ: -3, maxZ: 3 }],
    keepClear: [{ x: -6, z: 0, radius: 2.8, label: '贝壳屋门前' }],
  };
  const onBuilding = auditPlacement(item({ id: 'rock#7', x: 12, z: 0, radius: 1 }), context);
  assert.equal(onBuilding.length, 1);
  assert.equal(onBuilding[0].kind, 'building');
  assert.equal(onBuilding[0].id, 'rock#7');

  const inDoorway = auditPlacement(item({ id: 'bush#2', x: -4.5, z: 1, radius: 0.8 }), context);
  assert.equal(inDoorway.length, 1);
  assert.equal(inDoorway[0].kind, 'keep-clear');
  assert.match(inDoorway[0].detail, /贝壳屋门前/);
});

test('全量复核抓两两互穿，且只报一次', () => {
  const items = [
    item({ id: 'a', x: 0, z: 0, radius: 1.2 }),
    item({ id: 'b', x: 1.5, z: 0, radius: 1.2 }),
    item({ id: 'c', x: 20, z: 0, radius: 1 }),
  ];
  const issues = auditPlacements(items);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, 'overlap');
  assert.equal(issues[0].id, 'a');
  assert.match(issues[0].detail, /b/);

  const clean = auditPlacements([item({ id: 'a', x: 0, z: 0 }), item({ id: 'b', x: 5, z: 0 })]);
  assert.deepEqual(clean, []);
});

test('canPlace 与审计同一套口径：能被接受就一定过得了单项检查', () => {
  const context = {
    footprints: [{ minX: 8, maxX: 14, minZ: -3, maxZ: 3 }],
    keepClear: [{ x: -6, z: 0, radius: 2.8, label: '贝壳屋门前' }],
  };
  const placed = [item({ id: 'rock#1', x: 0, z: 0, radius: 1.5 })];
  assert.equal(canPlace(item({ id: 'ok', x: 4, z: 0, radius: 1 }), placed, context), true, '不与任何东西相交');
  assert.equal(canPlace(item({ id: 'too-close', x: 2, z: 0, radius: 1 }), placed, context), false, '与已有道具相交');
  assert.equal(canPlace(item({ id: 'float', x: 4, z: 0, baseY: 1 }), placed, context), false, '悬空');
  assert.equal(canPlace(item({ id: 'in-house', x: 10, z: 0 }), placed, context), false, '压建筑');
  assert.equal(canPlace(item({ id: 'in-door', x: -6, z: 0 }), placed, context), false, '压门前圈');
});

test('散布随机是可复现的：同种子同序列，不同种子不同序列', () => {
  const a = seededRandom(20261005);
  const b = seededRandom(20261005);
  const c = seededRandom(1);
  const first = [a(), a(), a()];
  const second = [b(), b(), b()];
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, [c(), c(), c()]);
  for (const value of first) assert.ok(value >= 0 && value < 1);
});
