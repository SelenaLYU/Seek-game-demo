import assert from 'node:assert/strict';
import test from 'node:test';
import { initialSearchlight, updateLight, isInBeam, belowStreet, DETECTION_MS, LIGHT_ORIGIN } from '../src/gameplay/chapterTwoRules.ts';

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
  assert.deepEqual(LIGHT_ORIGIN, { x: 46, y: 230 });
});

test('street recovery catches bottom pits and under-floor pockets but allows normal landings', () => {
  for (const [x, feet] of [[100, 920], [329, 900], [600, 1000], [1500, 1050], [3500, 1099]]) {
    assert.equal(belowStreet(x, feet), true);
  }
  for (const [x, feet] of [[380, 790], [485, 820], [1500, 610], [1500, 865], [2200, 910], [3500, 950]]) {
    assert.equal(belowStreet(x, feet), false);
  }
});
