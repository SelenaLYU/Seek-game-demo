import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAM_PADDING, EDGE_RELATIVE, FAR_RELATIVE, beamAlphaAt, coneHalfWidth } from '../src/gameplay/chapterTwoBeamProfile.ts';

/**
 * 光束贴图的衰减曲线。
 *
 * 为什么值得单测：这条曲线同时担着两件事——「像不像光」（中轴亮、边缘化开、远端衰减）
 * 与「公不公平」（命中锥边界必须仍然看得见，不能让玩家在看不见光的边缘被抓）。
 * 用 Graphics 画硬边多边形时这两件事都没法锁，换成贴图之后可以。
 */

const EDGE = 1 / BEAM_PADDING;

test('锥形：近端窄、远端宽——贴图不能是矩形光带', () => {
  // 灯口附近只占贴图高度的一小条：u=0.25 处的命中锥半宽只有锥尾的 1/4
  assert.ok(coneHalfWidth(0.25) < coneHalfWidth(1) * 0.26, '命中锥必须随距离张开');
  // 近端在该高度之外必须完全没有亮度（旧版矩形贴图这里还亮着，整屏被抬成雾）
  assert.equal(beamAlphaAt(0.25, 0.9), 0, 'u=0.25 处 v=0.9 应在柔边之外，亮度为 0');
  assert.equal(beamAlphaAt(0.1, 0.5), 0, 'u=0.1 处 v=0.5 应在柔边之外，亮度为 0');
  // 边界随距离外移：近端在外的点，远端必须落在锥内（这就是楔形张开）
  assert.ok(coneHalfWidth(1) > coneHalfWidth(0.6), '命中锥半宽必须随 u 增大');
  assert.ok(beamAlphaAt(1, coneHalfWidth(0.6)) > 0, 'u=0.6 的边界在 u=1 处应已在锥内');
  // 同一相对位置（都在各自命中锥边界之外一点点）都必须为 0
  for (const u of [0.3, 0.6, 1]) {
    assert.equal(beamAlphaAt(u, coneHalfWidth(u) * BEAM_PADDING * 1.001), 0, `u=${u} 柔边最外必须为 0`);
  }
});

test('截面：中轴最亮，向外单调衰减，命中锥边缘仍保留可见亮度', () => {
  assert.ok(Math.abs(beamAlphaAt(0, 0) - 1) < 1e-9, '灯口中轴应满亮度');
  // 边缘相对中轴的亮度：太低读不出「光到哪儿为止」，太高又变回硬边
  for (const u of [0.25, 0.5, 1]) {
    const ratio = beamAlphaAt(u, coneHalfWidth(u)) / beamAlphaAt(u, 0);
    assert.ok(ratio > 0.12 && ratio < 0.42, `命中锥边缘/中轴 的亮度比应落在 0.12–0.42（太低看不出边界、太高变回硬边），实际 ${ratio.toFixed(3)}（u=${u}）`);
  }
  assert.ok(beamAlphaAt(0.5, coneHalfWidth(0.5)) > 0.02, '中段命中锥边缘仍要看得见（公平性要求）');
  let previous = Infinity;
  for (let i = 0; i <= 40; i++) {
    const value = beamAlphaAt(0, (i / 40) / BEAM_PADDING);
    assert.ok(value <= previous + 1e-9, `从 0 到命中锥边缘必须单调不增（在 ${i}/40 处回升）`);
    previous = value;
  }
});

test('柔边：命中锥之外继续衰减到 0，且不会超过锥内', () => {
  // 柔边最外沿：对任意 u，贴图坐标 ±1 都必须完全透明
  for (const u of [0.3, 0.6, 1]) {
    assert.equal(beamAlphaAt(u, 1), 0, `u=${u} 的贴图最外圈必须完全透明，否则会看到硬边`);
  }
  for (const u of [0.5, 1]) {
    const edge = coneHalfWidth(u);
    assert.ok(beamAlphaAt(u, edge - 0.01) > beamAlphaAt(u, edge + 0.01), '跨越命中锥边界必须继续变暗');
    const edgeAlpha = beamAlphaAt(u, edge);
    for (let i = 0; i <= 20; i++) {
      const v = edge + ((1 - edge) * i) / 20;
      assert.ok(beamAlphaAt(u, v) <= edgeAlpha + 1e-9, '柔边不能比命中锥边缘更亮');
    }
  }
});

test('长度：灯口最亮、锥尾保留底亮度（远端边界仍看得见）', () => {
  assert.ok(beamAlphaAt(0, 0) > beamAlphaAt(0.5, 0), '沿长度必须衰减');
  assert.ok(beamAlphaAt(0.5, 0) > beamAlphaAt(1, 0), '尾部应继续衰减');
  assert.ok(beamAlphaAt(1, 0) >= FAR_RELATIVE - 1e-9, '锥尾不能衰减到看不见');
  // 近端要有比线性更快的"灯口热区"（灯口会因求和而封顶到 1，所以在 0.1 与 0.4 处比）
  assert.ok(beamAlphaAt(0.1, 0) > beamAlphaAt(0.4, 0) * 1.3, '灯口附近应有明显热区');
});

test('左右对称（贴图不会一边亮一边暗）', () => {
  for (const u of [0.25, 0.5, 0.75, 1]) {
    for (const v of [0.1, 0.3, 0.6, 0.9]) {
      assert.equal(beamAlphaAt(u, v), beamAlphaAt(u, -v));
    }
  }
});
