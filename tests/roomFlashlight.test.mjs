import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceChapterOneRoomProgress as reduce, canPowerFlashlight, canOpenShadowBoatPuzzle } from '../src/gameplay/ChapterOneRoomRules.ts';

const fresh = () => ({ photoSolved: false, batteryCollected: false, flashlightCollected: false, flashlightPowered: false });
test('locked box cannot give a battery or enable the desk', () => {
  let state = fresh();
  state = reduce(state, { type: 'battery-collected' });
  state = reduce(state, { type: 'flashlight-powered' });
  assert.equal(state.batteryCollected, false);
  assert.equal(canOpenShadowBoatPuzzle(state), false);
});

for (const order of [['flashlight-collected', 'battery-collected'], ['battery-collected', 'flashlight-collected']]) {
  test(`both pickup orders support assembly: ${order.join(' then ')}`, () => {
    let state = { ...fresh(), photoSolved: true };
    state = reduce(state, { type: order[0] });
    assert.equal(canPowerFlashlight(state), false);
    state = reduce(state, { type: 'flashlight-powered' });
    assert.equal(canOpenShadowBoatPuzzle(state), false);
    state = reduce(state, { type: order[1] });
    assert.equal(canPowerFlashlight(state), true);
    state = reduce(state, { type: 'flashlight-powered' });
    assert.equal(canOpenShadowBoatPuzzle(state), true);
    assert.equal(canPowerFlashlight(state), false, 'assembly should not replay');
  });
}
