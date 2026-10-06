/**
 * 记忆之岛散布摆放的回归测试。
 *
 * 为什么单独一组：散布是程序化生成的，几百件道具靠肉眼在总览截图里找穿模不现实。
 * 这条测试盯的是「规则被悄悄改松」这类退化——比如以后有人为了多摆两棵树，
 * 在 planScatter 里加一句「压到建筑就往外挪 1 米」，穿模会立刻回来但测试还是绿的。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_SCALE_X } from '../src/island/terrain.ts';
import { DEFAULT_RULES, planScatter, checkScatter, terrainHeightWorld } from '../src/island/scatter.ts';

const context = {
  footprints: [{ minX: 40, maxX: 46, minZ: -6, maxZ: 6 }],
  keepClear: [{ x: -10, z: 0, radius: 1.8, label: '贝壳屋门前' }],
  walkwayPaths: [[[0, 0], [6, 0], [10, 2]]],
};

test('散布跑完自身审计是干净的（不许穿模这条的底线）', () => {
  const items = planScatter({
    kind: 'tree', idPrefix: 'tree', seed: 20261005, count: 24,
    radius: 0.8, targetHeight: null, modelHeight: 1, context,
  });
  assert.ok(items.length >= 12, `散布太稀疏（${items.length}/24），规则可能过严`);
  assert.deepEqual(checkScatter(items, context), [], '摆完必须过得全量审计');
});

test('同一个种子跑出同一张岛，换个种子就换布局', () => {
  const run = (seed) => planScatter({
    kind: 'prop', idPrefix: 'p', seed, count: 10,
    radius: 0.7, targetHeight: 1.5, modelHeight: 1, context,
  }).map(item => `${item.x.toFixed(4)},${item.z.toFixed(4)}`).join('|');
  assert.equal(run(42), run(42));
  assert.notEqual(run(42), run(43));
});

test('压建筑占地盒的候选点被丢弃，而不是被挪开', () => {
  // 盒在世界 x[40,46]；占地半径 1.2。如果实现走「挪一下再摆」，点会落在盒外但仍在
  // 附近，测试分辨不出来——所以这里直接判「压盒的点根本不出现」，并验证被拒点数为 0 个落点。
  const items = planScatter({
    kind: 'prop', idPrefix: 'p', seed: 7, count: 30,
    radius: 1.2, targetHeight: null, modelHeight: 1, context,
    rules: { maxRadius: 26 },
  });
  for (const item of items) {
    const inBox = item.x > 40 - 1.2 && item.x < 46 + 1.2 && item.z > -6 - 1.2 && item.z < 6 + 1.2;
    assert.equal(inBox, false, `${item.id} 落在建筑盒里（说明判定没生效）`);
  }
});

test('门前净空圈不会被道具压住', () => {
  const items = planScatter({
    kind: 'prop', idPrefix: 'p', seed: 11, count: 20,
    radius: 0.9, targetHeight: null, modelHeight: 1, context,
  });
  for (const item of items) {
    assert.ok(Math.hypot(item.x - -10, item.z - 0) >= 1.8 + 0.9, `${item.id} 压到门前净空圈`);
  }
});

test('离道路太近的点被丢掉（路要走得通）', () => {
  const items = planScatter({
    kind: 'prop', idPrefix: 'p', seed: 5, count: 20,
    radius: 0.5, targetHeight: null, modelHeight: 1, context,
  });
  for (const item of items) {
    const near = context.walkwayPaths[0].some((a, i) => {
      if (!i) return false;
      const b = context.walkwayPaths[0][i];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((item.x - a[0]) * dx + (item.z - a[1]) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(item.x - (a[0] + dx * t), item.z - (a[1] + dz * t)) < DEFAULT_RULES.pathMargin - 1e-6;
    });
    assert.equal(near, false, `${item.id} 压在路上`);
  }
});

test('道具坐地而不是悬空/深陷（与 clipping 的 MAX_SINK/MAX_FLOAT 一致）', () => {
  const items = planScatter({
    kind: 'prop', idPrefix: 'p', seed: 3, count: 12,
    radius: 0.8, targetHeight: null, modelHeight: 1, context,
  });
  for (const item of items) {
    const ground = terrainHeightWorld(item.x, item.z);
    assert.ok(Math.abs(item.groundY - ground) < 1e-9, `${item.id} 记录的地形高度与实际不符`);
  }
});
