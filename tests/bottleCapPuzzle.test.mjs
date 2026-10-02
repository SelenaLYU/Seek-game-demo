import assert from 'node:assert/strict';
import test from 'node:test';
import { BottleCapPuzzle, fitsClues, CAP_EDGES } from '../src/gameplay/bottleCapPuzzle.ts';
const ready = () => {
  const p = new BottleCapPuzzle();
  for (let i = 0; i < 9; i++) if (p.shelf[i] !== i) p.swap(i, p.shelf.indexOf(i));
  assert.equal(p.checkShelf(), true); return p;
};
const draw = p => { p.beginTrace(1); [0,2,1,3,5,6,3,4,7,8,4,2].forEach(n => p.visit(n)); };
test('eight movable items have exactly one solution among 40320 arrangements', () => {
  const slots = [0,1,2,3,5,6,7,8], solutions = [];
  const enumerate = (left, chosen = []) => {
    if (!left.length) {
      const a = Array.from({length:9}, (_, i) => i); slots.forEach((slot,i) => a[slot] = chosen[i]);
      if (fitsClues(a)) solutions.push(a); return;
    }
    left.forEach(n => enumerate(left.filter(x => x !== n), [...chosen,n]));
  };
  enumerate(slots); assert.deepEqual(solutions, [[0,1,2,3,4,5,6,7,8]]);
});
test('trace requires a continuous valid stroke, permits retry and only completes on release', () => {
  const p = ready(); assert.equal(p.beginTrace(99), false);
  assert.equal(p.beginTrace(0), true); assert.equal(p.endTrace(), false);
  p.beginTrace(0); p.visit(1); assert.equal(p.endTrace(), false);
  p.beginTrace(0); draw(p); assert.equal(p.phase, 'trace'); assert.equal(p.endTrace(), true); assert.equal(p.phase, 'done');
  assert.equal(p.beginTrace(0), false);
});
test('locked shelf, leaving panel and wrong stroke retain solved layout', () => {
  const p = new BottleCapPuzzle(); assert.equal(p.swap(4,0), false); assert.equal(p.checkShelf(), false); assert.equal(p.beginTrace(0), false);
  const solved = ready(); solved.beginTrace(0); solved.visit(1); solved.cancelTrace();
  assert.equal(solved.endTrace(), false); assert.equal(solved.phase, 'trace'); assert.deepEqual(solved.shelf,[0,1,2,3,4,5,6,7,8]);
  assert.equal(solved.swap(0,1), false);
});
