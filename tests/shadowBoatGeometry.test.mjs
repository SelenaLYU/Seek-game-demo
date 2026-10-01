import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PIECE_IDS, SOLUTION, TARGET, LIGHT_Y, alignment, piecePolygon,
  illuminatedPolygon, shadowPolygon, projectToWall, WALL_X_OFFSET, contains,
} from '../src/ui/shadowBoatGeometry.ts';

const area = polygon => Math.abs(polygon.reduce((sum, p, i) => {
  const q = polygon[(i + 1) % polygon.length];
  return sum + p.x * q.y - q.x * p.y;
}, 0)) / 2;

test('art contours preserve the triangle opening and rounded bag silhouette', () => {
  const sail = piecePolygon(SOLUTION.sail);
  assert.equal(contains({ x: SOLUTION.sail.x + 37 * .36, y: SOLUTION.sail.y + 52 * .69 }, sail), false);
  assert.equal(contains({ x: SOLUTION.sail.x + 37 * .15, y: SOLUTION.sail.y + 52 * .69 }, sail), true);
  const center = projectToWall({ x: 550, y: 360 }, 320);
  const hole = projectToWall({ x: SOLUTION.sail.x + 37 * .36, y: SOLUTION.sail.y + 52 * .69 }, 320);
  assert.equal(contains({ x: center.x + (hole.x-center.x)*.67, y: center.y + (hole.y-center.y)*.67 }, TARGET[1]), false);
  assert.ok(piecePolygon(SOLUTION.hull).length > 4);
});

test('each shadow vertex lies beyond its object on the same light ray', () => {
  for (const lightX of [220, 320, 545, 760]) {
    for (const id of PIECE_IDS) {
      for (const point of piecePolygon(SOLUTION[id])) {
        const shadow = projectToWall(point, lightX);
        const cross = (point.x - lightX) * (shadow.y - LIGHT_Y)
          - (point.y - LIGHT_Y) * (shadow.x - lightX - WALL_X_OFFSET);
        assert.ok(Math.abs(cross) < 1e-8);
        assert.ok(Math.hypot(shadow.x - lightX, shadow.y - LIGHT_Y)
          > Math.hypot(point.x - lightX, point.y - LIGHT_Y));
      }
    }
  }
});

test('moving the lamp left moves the shadow right and stretches it on the oblique wall', () => {
  const left = shadowPolygon(SOLUTION.hull, 320);
  const right = shadowPolygon(SOLUTION.hull, 545);
  assert.ok(left[0].x > right[0].x);
  assert.ok(area(left) > area(right));
});

test('unlit objects cast no shadow; a partially lit object casts only its lit portion', () => {
  const outside = { ...SOLUTION.sail, x: 720 };
  assert.deepEqual(illuminatedPolygon(outside), []);
  assert.deepEqual(shadowPolygon(outside, 320), []);
  const partial = { ...SOLUTION.sail, x: 635 };
  const lit = illuminatedPolygon(partial);
  assert.ok(area(lit) > 0);
  assert.ok(area(lit) < area(piecePolygon(partial)));
  assert.ok(area(shadowPolygon(partial, 545))
    < area(piecePolygon(partial).map(p => projectToWall(p, 545))));
});

test('rotating an object rotates the actual occluder before projection', () => {
  const rotated = { ...SOLUTION.sail, rotation: 1 };
  assert.notDeepEqual(shadowPolygon(rotated, 320), TARGET[1]);
  assert.ok(shadowPolygon(rotated, 320).length >= 3);
  assert.ok(shadowPolygon(rotated, 320).some(q => q.x < TARGET[1][0].x));
});

test('completion uses the rendered union, tolerates a small offset and rejects missing or misplaced pieces', () => {
  assert.equal(alignment(TARGET).overlap, 1);
  assert.equal(alignment(TARGET).ready, true);
  assert.equal(alignment(PIECE_IDS.map(id => shadowPolygon(SOLUTION[id], 322))).ready, true);
  assert.equal(alignment(PIECE_IDS.map(id => shadowPolygon(SOLUTION[id], 545))).ready, false);
  assert.equal(alignment([TARGET[0], [], TARGET[2]]).ready, false);
  assert.equal(alignment([TARGET[0], TARGET[1], []]).ready, false);
  assert.equal(alignment([TARGET[0], shadowPolygon({ ...SOLUTION.sail, rotation: 1 }, 320), TARGET[2]]).ready, false);
});
