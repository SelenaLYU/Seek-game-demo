import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { groundIslandBuilding, foundationTerrainHeight } from '../src/island/buildingGrounding.ts';

test('a rotated building with an offset origin settles on grass instead of its hill center', () => {
  const parent = new THREE.Group();
  parent.position.set(8, 5, -3);
  parent.rotation.y = Math.PI / 3;
  parent.scale.set(1.3, 2, 0.9);
  const model = new THREE.Group();
  const steps = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 3));
  steps.position.set(0.8, 1.1, 0.6);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 20));
  roof.position.y = 8;
  model.add(steps, roof);
  parent.add(model);
  const naturalHeight = (x, z) => 1 + 0.15 * x + 0.09 * z;
  const foundation = groundIslandBuilding(model, naturalHeight);
  const bounds = new THREE.Box3().setFromObject(steps);
  assert.ok(Math.abs(bounds.min.y - (foundation.height - 0.025)) < 1e-6);
  assert.ok(foundation.maxX - foundation.minX < 12, 'the roof must not enlarge the support footprint');
  for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) {
    const ground = foundationTerrainHeight(x, z, naturalHeight(x, z), [foundation]);
    assert.ok(Math.abs(ground - foundation.height) < 1e-6);
    assert.ok(bounds.min.y - ground >= -0.08, 'steps must not be deeply buried');
    assert.ok(bounds.min.y - ground <= 0.02, 'steps must not float');
  }
});

test('terraced grass preserves distant hills and joins the boundary smoothly', () => {
  const foundation = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, height: 1 };
  const at = x => foundationTerrainHeight(x, 0, 3, [foundation]);
  assert.equal(at(0), 1);
  assert.equal(at(4), 3);
  assert.ok(Math.abs(at(2 - 0.0001) - at(2 + 0.0001)) < 1e-6);
  assert.ok(Math.abs(at(3.25 - 0.0001) - at(3.25 + 0.0001)) < 1e-6);
});
