/**
 * 地形/崖壁几何体检：把 MemoryIsland.ts 的顶点与索引构造原样重放，
 * 在 Node 里量化几个「破面」指标——零面积三角形、法线朝下、法线不足、接缝。
 *
 * 为什么不在浏览器里看：截图看得出「像破面」，看不出「哪一圈三角形零面积」。
 * 这里直接按同样的算式重放，指标是可复现的数字。
 */
import * as THREE from 'three';
import { coastlineRadius, terrainHeight } from '../src/island/terrain.ts';

const terrainSegments = 192, terrainRings = 64;

// ---- 与 MemoryIsland.ts 完全一致的构造 ----
const terrainVertices = [], terrainIndices = [];
function addVertex(x, z) { terrainVertices.push(x, terrainHeight(x, z), z); }
addVertex(0, 0);
for (let ring = 1; ring <= terrainRings; ring++) for (let segment = 0; segment <= terrainSegments; segment++) {
  const angle = segment / terrainSegments * Math.PI * 2;
  const radius = (coastlineRadius(angle) - 0.45) * ring / terrainRings;
  addVertex(Math.sin(angle) * radius, Math.cos(angle) * radius);
}
const ringSize = terrainSegments + 1;
const ringVertex = (ring, segment) => 1 + (ring - 1) * ringSize + segment;
for (let segment = 0; segment < terrainSegments; segment++) {
  terrainIndices.push(0, ringVertex(1, segment), ringVertex(1, segment + 1));
}
for (let ring = 1; ring < terrainRings; ring++) for (let segment = 0; segment < terrainSegments; segment++) {
  const a = ringVertex(ring, segment), b = ringVertex(ring + 1, segment);
  const c = b + 1, d = a + 1;
  terrainIndices.push(a, b, c, a, c, d);
}

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(terrainVertices, 3));
geometry.setIndex(terrainIndices);
geometry.computeVertexNormals();

const pos = geometry.getAttribute('position');
const nrm = geometry.getAttribute('normal');
const index = geometry.getIndex();

console.log('=== terrain ===');
console.log(`vertices=${pos.count} (expected ${1 + terrainRings * (terrainSegments + 1)} = ${1 + terrainRings * (terrainSegments + 1)})`);
console.log(`triangles=${index.count / 3} (expected ${terrainSegments + (terrainRings - 1) * terrainSegments * 2})`);

// 零面积三角形
let degenerate = 0, downward = 0, maxDegenerateArea = 0;
const a0 = new THREE.Vector3(), b0 = new THREE.Vector3(), c0 = new THREE.Vector3();
const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
for (let t = 0; t < index.count; t += 3) {
  const i = index.getX(t), j = index.getX(t + 1), k = index.getX(t + 2);
  a0.fromBufferAttribute(pos, i); b0.fromBufferAttribute(pos, j); c0.fromBufferAttribute(pos, k);
  ab.subVectors(b0, a0); ac.subVectors(c0, a0);
  n.crossVectors(ab, ac);
  const area = n.length() / 2;
  if (area < 1e-9) { degenerate++; maxDegenerateArea = Math.max(maxDegenerateArea, area); continue; }
  n.normalize();
  if (n.y < 0) downward++;
}
console.log(`zero-area triangles: ${degenerate} (max area ${maxDegenerateArea.toExponential(2)})`);
console.log(`triangles with downward geometric normal: ${downward}`);

// 顶点法线
let badNormals = 0, zeroNormals = 0, downwardNormals = 0, minNy = 2;
for (let v = 0; v < nrm.count; v++) {
  const x = nrm.getX(v), y = nrm.getY(v), z = nrm.getZ(v);
  const len = Math.hypot(x, y, z);
  if (len < 1e-6) { zeroNormals++; continue; }
  if (Math.abs(len - 1) > 1e-3) badNormals++;
  if (y / len < 0) downwardNormals++;
  minNy = Math.min(minNy, y / len);
}
console.log(`vertex normals: zero=${zeroNormals} notUnit=${badNormals} downward=${downwardNormals} minNy=${minNy.toFixed(4)}`);

// 中心扇区：只统计直接引用中心顶点 0 的三角形
const perCenterNormal = new THREE.Vector3();
let centerTriangles = 0;
for (let t = 0; t < index.count; t += 3) {
  if (index.getX(t) !== 0 && index.getX(t + 1) !== 0 && index.getX(t + 2) !== 0) continue;
  const i = index.getX(t), j = index.getX(t + 1), k = index.getX(t + 2);
  a0.fromBufferAttribute(pos, i); b0.fromBufferAttribute(pos, j); c0.fromBufferAttribute(pos, k);
  ab.subVectors(b0, a0); ac.subVectors(c0, a0);
  n.crossVectors(ab, ac).normalize();
  perCenterNormal.add(n); centerTriangles++;
}
perCenterNormal.normalize();
console.log(`center fan: ${centerTriangles} triangles, mean normal y=${perCenterNormal.y.toFixed(4)} (x=${perCenterNormal.x.toFixed(3)} y=${perCenterNormal.y.toFixed(3)} z=${perCenterNormal.z.toFixed(3)})`);

// 接缝：segment==0 与 segment==terrainSegments 是同一个位置的重复顶点，
// 检查重复顶点之间的法线差（几何接缝）
let maxSeamNormalDelta = 0, seamPairs = 0;
for (let ring = 1; ring <= terrainRings; ring++) {
  const p = ringVertex(ring, 0), q = ringVertex(ring, terrainSegments);
  const d = Math.hypot(pos.getX(p) - pos.getX(q), pos.getY(p) - pos.getY(q), pos.getZ(p) - pos.getZ(q));
  if (d > 1e-6) console.log(`  !! seam position mismatch ring ${ring}: ${d.toFixed(6)}`);
  seamPairs++;
  const nx = nrm.getX(p) - nrm.getX(q), ny = nrm.getY(p) - nrm.getY(q), nz = nrm.getZ(p) - nrm.getZ(q);
  maxSeamNormalDelta = Math.max(maxSeamNormalDelta, Math.hypot(nx, ny, nz));
}
console.log(`seam: ${seamPairs} duplicated pairs, max normal delta = ${maxSeamNormalDelta.toExponential(2)}`);

// 半径处地形高度 vs 崖壁内缘
console.log('=== coastline seam vs cliff ===');
let mismatch = 0, worst = 0;
for (let s = 0; s < 96; s++) {
  const angle = s / 96 * Math.PI * 2;
  const r = coastlineRadius(angle) - 0.45;
  const h = terrainHeight(Math.sin(angle) * r, Math.cos(angle) * r);
  if (h > 0.05) mismatch++;
  worst = Math.max(worst, h);
}
console.log(`rings ending above water (y>0.05): ${mismatch}/96, worst=${worst.toFixed(3)}`);

// 组织环带（ring<terrainRings）三角形竖直覆盖
console.log('=== ring vertical coverage ===');
let ringHeightMin = Infinity, ringHeightMax = -Infinity;
for (let ring = 1; ring <= terrainRings; ring++) {
  for (let s = 0; s < terrainSegments; s++) {
    const p = ringVertex(ring, s), q = ringVertex(ring, s + 1);
    ringHeightMin = Math.min(ringHeightMin, Math.abs(pos.getY(p) - pos.getY(q)));
    ringHeightMax = Math.max(ringHeightMax, Math.abs(pos.getY(p) - pos.getY(q)));
  }
}
console.log(`adjacent-ring vertical step: min=${ringHeightMin.toFixed(5)} max=${ringHeightMax.toFixed(4)}`);
let segStepMax = 0;
for (let ring = 1; ring <= terrainRings; ring++) for (let s = 0; s < terrainSegments; s++) {
  const p = ringVertex(ring, s), q = ringVertex(ring, s + 1);
  segStepMax = Math.max(segStepMax, Math.hypot(pos.getX(p) - pos.getX(q), pos.getZ(p) - pos.getZ(q)));
}
console.log(`within-ring angular step (max chord): ${segStepMax.toFixed(4)}`);

// ---- 崖壁 ----
console.log('=== cliff ===');
const cliffSegments = 192;
const cliffVertices = [], cliffIndices = [];
for (let segment = 0; segment <= cliffSegments; segment++) {
  const angle = segment / cliffSegments * Math.PI * 2;
  const innerRadius = coastlineRadius(angle) - 0.45;
  const outerRadius = coastlineRadius(angle) + 0.5;
  const innerX = Math.sin(angle) * innerRadius, innerZ = Math.cos(angle) * innerRadius;
  const outerX = Math.sin(angle) * outerRadius, outerZ = Math.cos(angle) * outerRadius;
  cliffVertices.push(innerX, terrainHeight(innerX, innerZ), innerZ, outerX, -1.88, outerZ);
  if (segment < cliffSegments) {
    const a = segment * 2, b = a + 1, c = a + 3, d = a + 2;
    cliffIndices.push(a, b, c, a, c, d);
  }
}
const cliffGeo = new THREE.BufferGeometry();
cliffGeo.setAttribute('position', new THREE.Float32BufferAttribute(cliffVertices, 3));
cliffGeo.setIndex(cliffIndices);
cliffGeo.computeVertexNormals();
const cp = cliffGeo.getAttribute('position'), cn = cliffGeo.getAttribute('normal'), ci = cliffGeo.getAttribute('normal');
let cliffDown = 0, cliffUp = 0;
for (let t = 0; t < cliffIndices.length; t += 3) {
  const i = cliffIndices[t], j = cliffIndices[t + 1], k = cliffIndices[t + 2];
  a0.fromBufferAttribute(cp, i); b0.fromBufferAttribute(cp, j); c0.fromBufferAttribute(cp, k);
  ab.subVectors(b0, a0); ac.subVectors(c0, a0); n.crossVectors(ab, ac).normalize();
  if (n.y > 0.001) cliffUp++; else if (n.y < -0.001) cliffDown++;
}
console.log(`cliff triangles: up=${cliffUp} down=${cliffDown}`);
let cliffMinNz = 2, cliffMaxNz = -2;
for (let v = 0; v < cn.count; v++) { cliffMinNz = Math.min(cliffMinNz, cn.getZ(v)); cliffMaxNz = Math.max(cliffMaxNz, cn.getZ(v)); }
console.log(`cliff normal z range: [${cliffMinNz.toFixed(3)}, ${cliffMaxNz.toFixed(3)}]`);
