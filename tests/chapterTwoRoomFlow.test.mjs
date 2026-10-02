import assert from 'node:assert/strict';
import test from 'node:test';
import { ChapterTwoRoomFlow } from '../src/gameplay/chapterTwoRoomFlow.ts';

test('locked actions cannot skip growth, homework or magazine discovery', () => {
  const f = new ChapterTwoRoomFlow();
  assert.equal(f.answer(23, 12), false);
  f.discoverMap(); f.advanceShelfPreview(); f.viewCollection();
  assert.equal(f.takeSnack(), false);
  f.observeAge(5); f.observeAge(5); f.observeAge(99); f.observeAge(7);
  assert.equal(f.stage, 'growth');
  f.observeAge(12); assert.equal(f.stage, 'growth-done');
  assert.equal(f.answer(23, 12), false);
  f.closeGrowth(); assert.equal(f.stage, 'homework');
  f.discoverMap(); assert.equal(f.stage, 'homework');
  assert.equal(f.answer(12, 23), false);
  assert.equal(f.stage, 'homework');
  assert.equal(f.answer(23, 12), true);
  assert.equal(f.stage, 'homework-done');
  f.discoverMap(); assert.equal(f.hasMap, false);
  f.closeHomework();
  f.advanceShelfPreview(); assert.equal(f.stage, 'magazine');
  f.enterShelf(); assert.equal(f.stage, 'magazine');
  f.discoverMap(); assert.equal(f.stage, 'map'); assert.equal(f.hasMap, true);
  f.advanceShelfPreview(); assert.equal(f.shelfStep, 0);
  f.enterShelf(); assert.equal(f.stage, 'shelf');
});

test('preview resumes its step and finale requires collection; repeated actions do not replay', () => {
  const f = new ChapterTwoRoomFlow();
  [5, 7, 12].forEach(a => f.observeAge(a)); f.closeGrowth(); f.answer(23, 12); f.closeHomework(); f.discoverMap(); f.enterShelf();
  for (let n = 0; n < 3; n++) { f.advanceShelfPreview(); assert.equal(f.stage, 'shelf'); }
  assert.equal(f.takeSnack(), false);
  f.advanceShelfPreview(); assert.equal(f.stage, 'collection');
  assert.equal(f.takeSnack(), false);
  f.viewCollection(); assert.equal(f.stage, 'snack');
  assert.equal(f.takeSnack(), true); assert.equal(f.takeSnack(), false);
  f.observeAge(5); f.discoverMap(); f.advanceShelfPreview(); f.viewCollection();
  assert.equal(f.stage, 'memory'); assert.equal(f.shelfStep, 4);
  assert.equal(new ChapterTwoRoomFlow().stage, 'growth');
});
