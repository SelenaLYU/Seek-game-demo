import assert from 'node:assert/strict';
import test from 'node:test';
import { initialSearchlight, updateLight, isInBeam, belowStreet, DETECTION_MS, LIGHT_ORIGIN } from '../src/gameplay/chapterTwoRules.ts';
import fs from 'node:fs';

const input = (extra = {}) => ({ x: 700, y: 320, moving: true, covered: false, enabled: true, delta: 50, ...extra });
const aimed = () => ({ ...initialSearchlight(), angle: Math.atan2(90, 654) });

test('moving in the beam acquires and follows a target outside the old beam', () => {
  let state = updateLight(aimed(), input());
  assert.equal(state.tracking, true);
  assert.equal(isInBeam(state.angle, 1200, 720), false);
  state = updateLight(state, input({ x: 1200, y: 720 }));
  assert.equal(state.tracking, true);
  assert.equal(isInBeam(state.angle, 1200, 720), true);
  assert.equal(state.exposure, 100);
});

test('stopping releases tracking and resumes slowly without snapping away', () => {
  const following = updateLight(aimed(), input());
  const stopped = updateLight(following, input({ moving: false }));
  assert.equal(stopped.tracking, false);
  assert.equal(stopped.exposure, 0);
  assert.ok(Math.abs(stopped.angle - following.angle) < .02);
});

test('cover breaks tracking; leaving the light cannot instantly erase suspicion', () => {
  let state = { ...aimed(), tracking: true, exposure: 700 };
  state = updateLight(state, input({ covered: true }));
  assert.equal(state.tracking, false);
  assert.equal(state.exposure, 625);
  state = updateLight(state, input({ x: 500, y: 780, delta: 1000 }));
  assert.equal(state.tracking, false);
  assert.equal(state.exposure, 475);
});

test('continued movement is caught in 950ms at different frame rates; safe states reset tracking', () => {
  for (const fps of [30, 60, 120]) {
    let state = aimed(), elapsed = 0;
    while (state.exposure < DETECTION_MS) {
      state = updateLight(state, input({ delta: 1000 / fps }));
      elapsed += 1000 / fps;
    }
    assert.ok(elapsed >= 949 && elapsed < 950 + 1000 / fps + 1);
    state = updateLight(state, input({ enabled: false }));
    assert.equal(state.exposure, 0);
    assert.equal(state.tracking, false);
  }
});

test('slow sweep reaches all three routes from the fixed world light source', () => {
  for (const [x, y] of [[550, 286], [1500, 576], [480, 786], [3200, 916]]) {
    let state = initialSearchlight(), reached = false;
    for (let t = 0; t < 13000; t += 20) {
      state = updateLight(state, input({ moving: false, delta: 20 }));
      reached ||= isInBeam(state.angle, x, y);
    }
    assert.equal(reached, true, `unreachable beam target ${x},${y}`);
  }
  assert.ok(LIGHT_ORIGIN.x > 50 && LIGHT_ORIGIN.x < 55);
  assert.ok(LIGHT_ORIGIN.y > 200 && LIGHT_ORIGIN.y < 205);
});

test('street recovery catches bottom pits and under-floor pockets but allows normal landings', () => {
  for (const [x, feet] of [[100, 920], [329, 900], [600, 1000], [1500, 1050], [3500, 1099]]) {
    assert.equal(belowStreet(x, feet), true);
  }
  for (const [x, feet] of [[380, 790], [485, 820], [1500, 610], [1500, 865], [2200, 910], [3500, 950]]) {
    assert.equal(belowStreet(x, feet), false);
  }
});

// ── 模块 C：甩动竹竿支点东迁 930→1050、相位 1.7→2.6 ──────────────────────────
// 模块推导自 key=C-pivot 规格书：支点东迁后站位列 x[944,1156] 全带为杀区（旧雨棚
// 不再是安全岛）；姊妹档（tests/chapterTwoArt.test.mjs）完成「木凳顶 528 > 杆最低 543」
// 的防杆安全岛证明。本文件负责摆相位窗口数值断言（自回归：任何改动打破时序即红）。

const BULLET = {
  X: 1050, Y: 492, L: 112, R: 25, PHASE: 2.6, AMP: .82, OMEGA: .0021, WALK_Y: 574, SPEED: 225,
};
const seg = (t) => ({
  x: BULLET.X, y: BULLET.Y,
  ex: BULLET.X + Math.sin(BULLET.AMP * Math.sin(BULLET.OMEGA * t + BULLET.PHASE)) * BULLET.L,
  ey: BULLET.Y + Math.cos(BULLET.AMP * Math.sin(BULLET.OMEGA * t + BULLET.PHASE)) * BULLET.L,
});
const d2 = (px, py, ax, ay, bx, by) => {
  const abx = bx - ax, aby = by - ay, l2 = abx * abx + aby * aby;
  const t = Math.max(0, Math.min(1, l2 ? ((px - ax) * abx + (py - ay) * aby) / l2 : 0));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
};
const theta = (t) => BULLET.AMP * Math.sin(BULLET.OMEGA * t + BULLET.PHASE);

test('module C: bullet pivot migrated and phase re-locked', () => {
  const source = fs.readFileSync(new URL('../src/scenes/ChapterTwoChallengeScene.ts', import.meta.url), 'utf8');
  assert.match(source, /\{ x: 1050, y: 492, baseY: 610, length: 112, phase: 2\.6, label: '甩动竹竿' \}/);
  assert.doesNotMatch(source, /x: 930, y: 492/);
  // 平台收口与布帘右缘一致，让第一层→第二层的下落口正对布帘安全带。
  assert.match(source, /addStreetPlatform\(1265, 440, 295, 28\)/);
  assert.match(source, /\{ from: 1190, to: 1265, baseY: 610, label: '摊位布帘' \}/);
});

test('module C: standing band kill zone spans [944,1156] on the level-2 walk line', () => {
  const CYCLE = Math.round(2 * Math.PI / BULLET.OMEGA);
  assert.equal(Math.round(2 * Math.PI / BULLET.OMEGA), 2992, 'swing period stays 2992ms');
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < CYCLE; t += 2) {
    const { ex, ey } = seg(t);
    for (let x = 850; x <= 1250; x += 1) {
      if (d2(x, BULLET.WALK_Y, BULLET.X, BULLET.Y, ex, ey) < BULLET.R) {
        lo = Math.min(lo, x); hi = Math.max(hi, x);
      }
    }
  }
  assert.equal(lo, 944, 'kill zone west edge');
  assert.equal(hi, 1156, 'kill zone east edge – leaves 14px to the 1170 crate, too narrow to stand');
});

test('module C: the pole can never reach the standing crate top (528 > pole lowest 543)', () => {
  // 木凳顶 feet=564 → 中心 528；杆端最低 y = 492+112=604，加杀判定半径 25 → 最低触及 543。
  for (let t = 0; t < 2992; t += 2) {
    const { ex, ey } = seg(t);
    assert.ok(d2(1170, 528, BULLET.X, BULLET.Y, ex, ey) >= BULLET.R, 'pole must never graze the crate-top stance point');
  }
});

test('module C: crate-top departures clear the band during the |theta|<0.45 calm window', () => {
  // 木凳顶 (1170,528) 等相位；危险间隙启动满跳西飞，长空 755px（含下落加重后的射程，
  // 脚本与 Player 跳跃参数一致：初速 630、重力 1100、下降加速 560）。
  const flight = (dt = 2) => {
    let x = 1170, y = 528, vy = -630, t = 0;
    const out = [];
    while (out.length < 700) {
      t += dt;
      const g = vy > 120 ? 1660 : 1100;
      x -= BULLET.SPEED * dt / 1000;
      y += vy * dt / 1000 + .5 * g * (dt / 1000) ** 2;
      vy += g * dt / 1000;
      if (y >= BULLET.WALK_Y && vy > 0) { out.push({ x, y, t, landed: true }); break; }
      out.push({ x, y, t, landed: false });
    }
    return out;
  };
  const path = flight();
  const calm = [];
  for (let t0 = 0; t0 < 2992; t0 += 4) {
    if (Math.abs(theta(t0)) < .45) calm.push(t0);
  }
  assert.ok(calm.length * 4 >= 1100, `calm window must stay near 1100ms per cycle (got ${calm.length * 4}ms)`);
  assert.ok(calm[0] * 4 >= 0, 'calm window exists');
  // 危险间隙中点启动（θ≈0 相位）：全程与杆段的最近距离严格 ≥25px——
  // 跳-1 在 755ms 内飞越 [1156..904]，东侧穿越点已越过死带，西半带在落地时
  // 由走道站定 + 旧雨棚屏灯补足。任何使这条距离跌破 25 的改动都会让本条变红。
  const mid = calm[Math.floor(calm.length / 2)];
  let min = Infinity, land = null;
  for (const p of path) {
    const { ex, ey } = seg(mid + p.t);
    min = Math.min(min, d2(p.x, p.y, BULLET.X, BULLET.Y, ex, ey));
    if (p.landed) land = p;
  }
  assert.ok(min >= BULLET.R, `crate-top hop must keep >=25px from the pole (got ${min.toFixed(1)}px)`);
  assert.ok(land && land.x < 944, `hop lands west of the band (land x=${land?.x?.toFixed(0)})`);
});
