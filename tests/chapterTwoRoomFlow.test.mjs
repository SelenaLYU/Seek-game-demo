import assert from 'node:assert/strict';
import test from 'node:test';
import { ChapterTwoRoomFlow } from '../src/gameplay/chapterTwoRoomFlow.ts';
import { CAP_EDGES } from '../src/gameplay/bottleCapPuzzle.ts';

test('homework is available immediately; map and shelf still require solving it', () => {
  const f = new ChapterTwoRoomFlow();
  f.discoverMap(); f.finishShelf(); f.viewCollection();
  assert.equal(f.takeSnack(), false);
  f.observeAge(5); f.observeAge(5); f.observeAge(99); f.observeAge(7);
  assert.equal(f.stage, 'homework');
  assert.deepEqual([...f.ages], [5, 7]);
  f.observeAge(12); assert.equal(f.stage, 'homework');
  f.closeGrowth(); assert.equal(f.stage, 'homework');
  f.discoverMap(); assert.equal(f.stage, 'homework');
  assert.equal(f.answer(12, 23), false);
  assert.equal(f.stage, 'homework');
  assert.equal(f.answer(23, 12), true);
  assert.equal(f.stage, 'homework-done');
  f.discoverMap(); assert.equal(f.hasMap, false);
  f.closeHomework();
  f.finishShelf(); assert.equal(f.stage, 'magazine');
  f.enterShelf(); assert.equal(f.stage, 'magazine');
  f.discoverMap(); assert.equal(f.stage, 'map'); assert.equal(f.hasMap, true);
  f.finishShelf(); assert.equal(f.stage, 'map');
  f.enterShelf(); assert.equal(f.stage, 'shelf');
});

test('growth memories can be viewed in any order before or after homework without resetting progress', () => {
  const f = new ChapterTwoRoomFlow();
  assert.equal(f.answer(23, 12), true);
  f.closeHomework();
  [12, 5, 7, 12].forEach(age => f.observeAge(age));
  f.closeGrowth();
  assert.equal(f.stage, 'magazine');
  assert.deepEqual([...f.ages], [12, 5, 7]);
  f.discoverMap(); f.enterShelf();
  f.observeAge(5); f.closeGrowth();
  assert.equal(f.stage, 'shelf');
  assert.equal(f.hasMap, true);
});

test('the snack waits until all three growth marks have been viewed', () => {
  const f = new ChapterTwoRoomFlow();
  f.stage = 'snack';
  f.observeAge(5); f.observeAge(7);
  assert.equal(f.growthComplete, false);
  assert.equal(f.takeSnack(), false);
  f.observeAge(12);
  assert.equal(f.growthComplete, true);
  assert.equal(f.takeSnack(), true);
});

test('finale requires solving shelf and caps, following route and viewing collection', () => {
  const f = new ChapterTwoRoomFlow();
  [5, 7, 12].forEach(a => f.observeAge(a)); f.closeGrowth(); f.answer(23, 12); f.closeHomework(); f.discoverMap(); f.enterShelf();
  f.finishShelf(); assert.equal(f.stage, 'shelf');
  const p = f.puzzle;
  for (let i = 0; i < 9; i++) if (p.shelf[i] !== i) p.swap(i, p.shelf.indexOf(i));
  assert.equal(p.checkShelf(), true);
  f.finishShelf(); assert.equal(f.stage, 'shelf');
  p.beginTrace(1);
  [0,2,1,3,5,6,3,4,7,8,4,2].forEach(n => p.visit(n));
  assert.equal(p.endTrace(), true);
  assert.equal(f.takeSnack(), false);
  f.finishShelf(); assert.equal(f.stage, 'collection');
  assert.equal(f.takeSnack(), false);
  f.viewCollection(); assert.equal(f.stage, 'snack');
  assert.equal(f.takeSnack(), true); assert.equal(f.takeSnack(), false);
  f.observeAge(5); f.discoverMap(); f.finishShelf(); f.viewCollection();
  assert.equal(f.stage, 'memory');
  assert.equal(new ChapterTwoRoomFlow().stage, 'homework');
});
