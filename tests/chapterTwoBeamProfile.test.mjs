import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAM_PADDING, EDGE_RELATIVE, FAR_RELATIVE, beamAlphaAt, coneHalfWidth, crossSectionAt } from '../src/gameplay/chapterTwoBeamProfile.ts';

/**
 * 光束贴图的衰减曲线。
 *
 * 为什么值得单测：这条曲线同时担着三件事——
 * 「像不像光」（中轴亮、边缘化开、远端衰减、**处处光滑没有硬截断**）、
 * 「是不是锥形」（近端窄、随距离张开，不能是矩形光带）、
 * 以及「公不公平」（命中锥边界必须仍然看得见，不能让玩家在看不见光的边缘被抓）。
 * 用 Graphics 画硬边多边形时这三件事都没法锁，换成贴图之后可以。
 */

test('锥形：近端窄、远端宽——贴图不能是矩形光带', () => {
  assert.ok(coneHalfWidth(0.25) < coneHalfWidth(1) * 0.26, '命中锥必须随距离张开');
  // 同一横向位置：近端在锥外（几乎为 0），远端在锥内（明显有亮度）
  assert.ok(beamAlphaAt(0.1, 0.3) < 0.01, `u=0.1 的 v=0.3 应在锥外，实际 ${beamAlphaAt(0.1, 0.3).toFixed(4)}`);
  assert.ok(beamAlphaAt(0.9, 0.3) > 0.02, 'u=0.9 处同一高度应已在锥内（远端比近端亮 20 倍以上）');
  assert.ok(beamAlphaAt(0.9, 0.3) > beamAlphaAt(0.1, 0.3) * 20, '楔形张开：同一横向位置远端必须显著更亮');
  for (const u of [0.3, 0.6, 1]) {
    assert.ok(beamAlphaAt(u, coneHalfWidth(u) * BEAM_PADDING * 1.001) < 0.01, `u=${u} 贴图最外沿必须看不见（否则留硬边）`);
  }
});

test('截面：处处光滑，没有硬截断（第三轮「边缘不符合物理规律」的回归）', () => {
  // 双瓣高斯：中轴最亮，向外单调，任何相邻采样的跳变都很小
  let previous = Infinity;
  for (let i = 0; i <= 400; i++) {
    const t = i / 100; // 0 → 4，覆盖锥内与外溢
    const value = crossSectionAt(t);
    assert.ok(value <= previous + 1e-9, `t=${t.toFixed(2)} 处截面回升（应单调不增）`);
    if (previous !== Infinity) {
      assert.ok(previous - value < 0.02, `t=${t.toFixed(2)} 处出现跳变 ${(previous - value).toFixed(3)}——截面有硬边`);
    }
    previous = value;
  }
  assert.ok(Math.abs(crossSectionAt(0) - 1) < 1e-9, '中轴应满亮度');
  assert.ok(Math.abs(crossSectionAt(1) - EDGE_RELATIVE) < 0.02, '命中锥边界必须落在 EDGE_RELATIVE 这一档（公平性口径）');
  assert.ok(crossSectionAt(BEAM_PADDING) < 0.01, '贴图最外沿必须衰减到看不见');
});

test('长度：灯口最亮、锥尾保留底亮度（远端边界仍看得见）', () => {
  assert.ok(beamAlphaAt(0, 0) > beamAlphaAt(0.5, 0), '沿长度必须衰减');
  assert.ok(beamAlphaAt(0.5, 0) > beamAlphaAt(1, 0), '尾部应继续衰减');
  assert.ok(beamAlphaAt(1, 0) >= FAR_RELATIVE - 1e-9, '锥尾不能衰减到看不见');
  assert.ok(beamAlphaAt(0.1, 0) > beamAlphaAt(0.4, 0) * 1.3, '灯口附近应有明显热区');
});

test('左右对称（贴图不会一边亮一边暗）', () => {
  for (const u of [0.25, 0.5, 0.75, 1]) {
    for (const v of [0.1, 0.3, 0.6, 0.9]) {
      assert.equal(beamAlphaAt(u, v), beamAlphaAt(u, -v));
    }
  }
});
