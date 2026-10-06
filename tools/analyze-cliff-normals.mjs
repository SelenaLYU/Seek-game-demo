/**
 * 崖壁法线朝向专项：崖壁是 DoubleSide 的环带，法线若指向岛心，
 * 渲染时可见的**外侧**墙面会被当成背面打光 → 黑面/死面。
 * 这里逐顶点算法线与「径向外」方向的点积，正数=朝外（对），负数=朝内（错）。
 */
import * as THREE from 'three';
import { coastlineRadius, terrainHeight } from '../src/island/terrain.ts';

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
const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.Float32BufferAttribute(cliffVertices, 3));
g.setIndex(cliffIndices);
g.computeVertexNormals();
const pos = g.getAttribute('position'), nrm = g.getAttribute('normal');

let inward = 0, outward = 0, worstDot = 2;
const worstAt = [];
for (let v = 0; v < pos.count; v++) {
  const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
  const nx = nrm.getX(v), ny = nrm.getY(v), nz = nrm.getZ(v);
  const r = Math.hypot(px, pz);
  const rx = px / r, rz = pz / r; // 径向外单位向量
  const dot = nx * rx + nz * rz;
  if (dot < 0) { inward++; worstAt.push({ v, angle: v % 2 === 0 ? 'inner' : 'outer', dot: +dot.toFixed(3) }); }
  else outward++;
  worstDot = Math.min(worstDot, dot);
}
console.log(`崖壁顶点法线：朝外=${outward} 朝内=${inward}  最小径向点积=${worstDot.toFixed(3)}`);
if (worstAt.length) console.log('  朝内的顶点样例:', JSON.stringify(worstAt.slice(0, 6)));

// 三角形绕向（面法线）是否朝外
let triOut = 0, triIn = 0;
const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
for (let t = 0; t < cliffIndices.length; t += 3) {
  const i = cliffIndices[t], j = cliffIndices[t + 1], k = cliffIndices[t + 2];
  A.fromBufferAttribute(pos, i); B.fromBufferAttribute(pos, j); C.fromBufferAttribute(pos, k);
  ab.subVectors(B, A); ac.subVectors(C, A);
  n.crossVectors(ab, ac);
  if (n.lengthSq() < 1e-12) continue;
  n.normalize();
  const center = new THREE.Vector3((A.x + B.x + C.x) / 3, 0, (A.z + B.z + C.z) / 3).normalize();
  if (n.dot(center) > 0) triOut++; else triIn++;
}
console.log(`崖壁三角形绕向：面法线朝外=${triOut} 朝内=${triIn}`);

// 对照：地形法线应朝上
console.log('=== 对照：地形 ===');
const tSeg = 192, tRings = 64;
const tv = [], ti = [];
const add = (x, z) => tv.push(x, terrainHeight(x, z), z);
add(0, 0);
for (let ring = 1; ring <= tRings; ring++) for (let s = 0; s <= tSeg; s++) {
  const a = s / tSeg * Math.PI * 2, r = (coastlineRadius(a) - 0.45) * ring / tRings;
  add(Math.sin(a) * r, Math.cos(a) * r);
}
const rs = tSeg + 1, rv = (r, s) => 1 + (r - 1) * rs + s;
for (let s = 0; s < tSeg; s++) ti.push(0, rv(1, s), rv(1, s + 1));
for (let ring = 1; ring < tRings; ring++) for (let s = 0; s < tSeg; s++) {
  const a = rv(ring, s), b = rv(ring + 1, s);
  ti.push(a, b, b + 1, a, b + 1, a + 1);
}
const tg = new THREE.BufferGeometry();
tg.setAttribute('position', new THREE.Float32BufferAttribute(tv, 3));
tg.setIndex(ti);
tg.computeVertexNormals();
const tn = tg.getAttribute('normal');
let tDown = 0;
for (let v = 0; v < tn.count; v++) if (tn.getY(v) < 0) tDown++;
console.log(`地形顶点法线朝下的数量=${tDown} / ${tn.count}`);
