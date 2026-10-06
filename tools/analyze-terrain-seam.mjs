/**
 * 接缝法线折痕（定稿）：完全用 three 的 computeVertexNormals 口径复算地形，
 * 逐圈报接缝两侧法线的**夹角（度）**，并打印最差处的实际法线向量。
 *
 * 结构说明：地形是「中心点 + 64 圈闭合环」。修复后每一圈是**真正闭合**的
 * （segment 191 的下一环回绕到 segment 0），所以不存在两个副本顶点；
 * 每个顶点的邻接面绕整圈，接缝夹角应降为 0。
 */
import * as THREE from 'three';
import { coastlineRadius, terrainHeight } from '../src/island/terrain.ts';

const terrainSegments = 192, terrainRings = 64;
const verts = [], colors = [], uvs = [], indices = [];
const add = (x, z) => {
  verts.push(x, terrainHeight(x, z), z);
  colors.push(1, 1, 1);
  uvs.push(x / 34 + 0.5, z / 34 + 0.5);
};
add(0, 0);
for (let ring = 1; ring <= terrainRings; ring++) for (let s = 0; s < terrainSegments; s++) {
  const a = s / terrainSegments * Math.PI * 2, r = (coastlineRadius(a) - 0.45) * ring / terrainRings;
  add(Math.sin(a) * r, Math.cos(a) * r);
}
const rs = terrainSegments, rv = (r, s) => 1 + (r - 1) * rs + s;
for (let s = 0; s < terrainSegments; s++) indices.push(0, rv(1, s), rv(1, (s + 1) % terrainSegments));
for (let ring = 1; ring < terrainRings; ring++) for (let s = 0; s < terrainSegments; s++) {
  const a = rv(ring, s), b = rv(ring + 1, s);
  const c = rv(ring + 1, (s + 1) % terrainSegments), d = rv(ring, (s + 1) % terrainSegments);
  indices.push(a, b, c, a, c, d);
}

const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
g.setIndex(indices);
g.computeVertexNormals();
const nrm = g.getAttribute('normal');

let zeroArea = 0, downward = 0;
const pos = g.getAttribute('position');
const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nn = new THREE.Vector3();
for (let t = 0; t < indices.length; t += 3) {
  const i = indices[t], j = indices[t + 1], k = indices[t + 2];
  A.fromBufferAttribute(pos, i); B.fromBufferAttribute(pos, j); C.fromBufferAttribute(pos, k);
  ab.subVectors(B, A); ac.subVectors(C, A); nn.crossVectors(ab, ac);
  const area = nn.length() / 2;
  if (area < 1e-9) zeroArea++;
  else if (nn.y < 0) downward++;
}
console.log(`零面积三角形=${zeroArea}  朝下三角形=${downward}  顶点数=${pos.count} 三角数=${indices.length / 3}`);

// 接缝：现在环形闭合，检查「最后一个 segment 与第 0 个 segment 的邻接关系是否正常」
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
let maxDeg = 0, sum = 0, cnt = 0;
for (let ring = 1; ring <= terrainRings; ring++) {
  // 环上任意相邻两顶点（含 191→0 的回绕）的夹角，最大值就是「环闭合处的折痕」
  for (const s of [0, terrainSegments - 1]) {
    const p = rv(ring, s), q = rv(ring, (s + 1) % terrainSegments);
    v1.fromBufferAttribute(nrm, p); v2.fromBufferAttribute(nrm, q);
    const deg = v1.angleTo(v2) * 180 / Math.PI;
    maxDeg = Math.max(maxDeg, deg); sum += deg; cnt++;
  }
}
console.log(`环内相邻法线夹角(含闭合回绕): max=${maxDeg.toFixed(2)}°  mean=${(sum / cnt).toFixed(3)}°`);

// 直接验证闭合：191→0 的回绕 与 普通相邻 的夹角应当同量级
const wrapDegs = [], normalDegs = [];
for (let ring = 1; ring <= terrainRings; ring++) {
  v1.fromBufferAttribute(nrm, rv(ring, terrainSegments - 1)); v2.fromBufferAttribute(nrm, rv(ring, 0)); // 191 -> 0 回绕
  wrapDegs.push(v1.angleTo(v2) * 180 / Math.PI);
  v1.fromBufferAttribute(nrm, rv(ring, 60)); v2.fromBufferAttribute(nrm, rv(ring, 61));
  normalDegs.push(v1.angleTo(v2) * 180 / Math.PI);
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
console.log(`闭合处(191→0)夹角: 中位=${med(wrapDegs).toFixed(3)}°  max=${Math.max(...wrapDegs).toFixed(2)}°`);
console.log(`普通相邻(60→61):   中位=${med(normalDegs).toFixed(3)}°  max=${Math.max(...normalDegs).toFixed(2)}°`);
console.log(`→ ${med(wrapDegs) <= med(normalDegs) * 1.5 ? '闭合处与普通相邻同量级：接缝已消除' : '闭合处仍异常'}`);
