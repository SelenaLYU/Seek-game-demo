import * as THREE from 'three';

export type BuildingFoundation = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
};

/** Measure the base after all authored node, scale and placement transforms. */
export function groundIslandBuilding(
  model: THREE.Object3D,
  naturalHeight: (x: number, z: number) => number,
): BuildingFoundation {
  model.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(model);
  const base = new THREE.Box3();
  const point = new THREE.Vector3();
  const center = bounds.getCenter(new THREE.Vector3());
  // Preserve the building's island tier while grading its support area.
  const height = naturalHeight(center.x, center.z);
  const band = Math.min(0.35, (bounds.max.y - bounds.min.y) * 0.08);
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    if (!positions) return;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      if (point.y > bounds.min.y + band) continue;
      base.expandByPoint(point);
    }
  });
  if (base.isEmpty() || !Number.isFinite(height)) {
    throw new Error('Island building has no finite base geometry');
  }
  // Convert the required world translation through the actual parent transform.
  // A 2.5 cm contact overlap closes the seam without hiding the steps or roots.
  const worldOrigin = model.getWorldPosition(new THREE.Vector3());
  worldOrigin.y += height - bounds.min.y - 0.025;
  model.position.copy(model.parent ? model.parent.worldToLocal(worldOrigin) : worldOrigin);
  model.updateWorldMatrix(true, true);
  return {
    minX: base.min.x - 0.7, maxX: base.max.x + 0.7,
    minZ: base.min.z - 0.7, maxZ: base.max.z + 0.7,
    height,
  };
}

/** One grass surface supplies both rendered terrain and the walking height. */
export function foundationTerrainHeight(
  x: number, z: number, naturalY: number,
  foundations: readonly BuildingFoundation[],
): number {
  let height = naturalY;
  for (const foundation of foundations) {
    const dx = Math.max(foundation.minX - x, 0, x - foundation.maxX);
    const dz = Math.max(foundation.minZ - z, 0, z - foundation.maxZ);
    const distance = Math.hypot(dx, dz);
    if (distance >= 1.25) continue;
    const t = Math.min(1, distance / 1.25);
    const blend = 1 - t * t * (3 - 2 * t);
    height = THREE.MathUtils.lerp(height, foundation.height, blend);
  }
  return height;
}

/** Close intrinsic gaps under low, downward-facing feet with solid grass soil. */
export function buildingGroundFill(
  model: THREE.Object3D,
  terrainHeight: (x: number, z: number) => number,
): THREE.BufferGeometry | null {
  model.updateWorldMatrix(true, true);
  const minimum = new THREE.Box3().setFromObject(model).min.y;
  const vertices: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const normal = new THREE.Vector3(), edge = new THREE.Vector3();
  const faces: THREE.Vector3[][] = [];
  const cells = new Map<string, THREE.Vector3[][]>();
  const key = (x: number, z: number) => `${x},${z}`;
  const lowest = (point: THREE.Vector3) => {
    let y = Infinity;
    for (const [p, q, r] of cells.get(key(Math.floor(point.x), Math.floor(point.z))) ?? []) {
      const denominator = (q.z - r.z) * (p.x - r.x) + (r.x - q.x) * (p.z - r.z);
      if (Math.abs(denominator) < 1e-10) continue;
      const u = ((q.z - r.z) * (point.x - r.x) + (r.x - q.x) * (point.z - r.z)) / denominator;
      const v = ((r.z - p.z) * (point.x - r.x) + (p.x - r.x) * (point.z - r.z)) / denominator;
      if (u < -1e-5 || v < -1e-5 || u + v > 1.00001) continue;
      y = Math.min(y, u * p.y + v * q.y + (1 - u - v) * r.y);
    }
    return y;
  };
  const triangle = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) => {
    vertices.push(...p.toArray(), ...q.toArray(), ...r.toArray());
  };
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    if (!positions) return;
    const indices = object.geometry.index;
    const count = indices ? indices.count : positions.count;
    for (let i = 0; i + 2 < count; i += 3) {
      a.fromBufferAttribute(positions, indices ? indices.getX(i) : i).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(positions, indices ? indices.getX(i + 1) : i + 1).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(positions, indices ? indices.getX(i + 2) : i + 2).applyMatrix4(object.matrixWorld);
      normal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
      if (normal.y > -0.5 || Math.max(a.y, b.y, c.y) > minimum + 0.35) continue;
      faces.push([a.clone(), b.clone(), c.clone()]);
    }
  });
  for (const face of faces) {
    const minX = Math.floor(Math.min(...face.map(point => point.x)));
    const maxX = Math.floor(Math.max(...face.map(point => point.x)));
    const minZ = Math.floor(Math.min(...face.map(point => point.z)));
    const maxZ = Math.floor(Math.max(...face.map(point => point.z)));
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      const cellKey = key(x, z);
      const bucket = cells.get(cellKey) ?? [];
      bucket.push(face);
      cells.set(cellKey, bucket);
    }
  }
  for (const face of faces) {
    const center = face[0].clone().add(face[1]).add(face[2]).multiplyScalar(1 / 3);
    // Split around the center so stacked feet are supported at their lower
    // envelope instead of discarding a whole stair when one corner overlaps.
    for (let part = 0; part < 3; part++) {
      const points = [face[part], face[(part + 1) % 3], center];
      const top = points.map(point => new THREE.Vector3(point.x, Math.min(point.y, lowest(point)) - 0.008, point.z));
      const bottom = top.map(point => new THREE.Vector3(point.x, terrainHeight(point.x, point.z) - 0.04, point.z));
      if (top.every((point, index) => point.y <= bottom[index].y + 0.06)) continue;
      triangle(top[0], top[2], top[1]);
      for (let side = 0; side < 3; side++) {
        const next = (side + 1) % 3;
        triangle(top[side], top[next], bottom[next]);
        triangle(top[side], bottom[next], bottom[side]);
      }
    }
  }
  if (!vertices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
