/**
 * 地形接缝（从岛心贯穿到岸边的光照折痕）实证。
 * 复刻 MemoryIsland 的地形构造，把接缝两侧的法线差异换算成「一条多大范围的
 * 明暗折线」，并渲染出局部俯视图用来肉眼对比。
 */
import * as THREE from 'three';
import { coastlineRadius, terrainHeight } from '../src/island/terrain.ts';

const S = 192, R = 64;
const pos = [], idx = [];
const add = (x, z) => { pos.push(x, terrainHeight(x, z), z); };
add(0, 0);
for (let r = 1; r <= R; r++) for (let s = 0; s <= S; s++) {
  const a = s / S * Math.PI * 2, rad = (coastlineRadius(a) - 0.45) * r / R;
  add(Math.sin(a) * rad, Math.cos(a) * rad);
}
const rs = S + 1, rv = (r, s) => 1 + (r - 1) * rs + s;
for (let s = 0; s < S; s++) idx.push(0, rv(1, s), rv(1, s + 1));
for (let r = 1; r < R; r++) for (let s = 0; s < S; s++) {
  const a = rv(r, s), b = rv(r + 1, s);
  idx.push(a, b, b + 1, a, b + 1, a + 1);
}
const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
g.setIndex(idx);
g.computeVertexNormals();
const n = g.getAttribute('normal');

// 接缝是 segment 0 列与 segment 192 列。它们在**同一位置**，法线却不同。
// 沿一圈扫法线，看接缝处是否有一条突变。
console.log('沿角度扫 ring=30 的法线（接缝在 seg 0 / seg 191-192 交界）:');
for (const s of [0, 1, 2, 3, 188, 189, 190, 191, 192]) {
  const i = rv(30, s);
  const p = new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), i);
  const nn = new THREE.Vector3().fromBufferAttribute(n, i);
  console.log(`  seg=${String(s).padStart(3)}  pos=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)})  n=(${nn.x.toFixed(3)},${nn.y.toFixed(3)},${nn.z.toFixed(3)})`);
}

// 量化：整圈接缝夹角的分布（ring 无关，取最大）
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
let maxDeg = 0, sum = 0, cnt = 0;
const rows = [];
for (let r = 1; r <= R; r++) {
  v1.fromBufferAttribute(n, rv(r, 0)); v2.fromBufferAttribute(n, rv(r, S));
  const deg = v1.angleTo(v2) * 180 / Math.PI;
  rows.push(deg); maxDeg = Math.max(maxDeg, deg); sum += deg; cnt++;
}
rows.sort((a, b) => b - a);
console.log(`\n接缝夹角: max=${maxDeg.toFixed(2)}°  均值=${(sum / cnt).toFixed(3)}°  分布 top5=[${rows.slice(0, 5).map(x => x.toFixed(1)).join(', ')}]`);

// 对照：环内相邻（非接缝）夹角
const ctrl = [];
for (let r = 1; r <= R; r++) for (const s of [1, 50, 100, 150]) {
  v1.fromBufferAttribute(n, rv(r, s)); v2.fromBufferAttribute(n, rv(r, s + 1));
  ctrl.push(v1.angleTo(v2) * 180 / Math.PI);
}
ctrl.sort((a, b) => a - b);
console.log(`对照·非接缝相邻: 中位=${ctrl[ctrl.length >> 1].toFixed(2)}°  p95=${ctrl[Math.floor(ctrl.length * .95)].toFixed(2)}°`);

// 渲染俯视图：把法线差异画成明暗，肉眼可见接缝
const scene = new THREE.Scene();
const mat = new THREE.MeshStandardMaterial({ color: '#8fae74', roughness: 1, side: THREE.DoubleSide });
const land = new THREE.Mesh(g, mat);
scene.add(land);
const cam = new THREE.OrthographicCamera(-14, 14, -14, 14, 0.1, 100);
cam.position.set(0, 40, 0.001); cam.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight('#ffffff', '#666666', 2.2));
const sun = new THREE.DirectionalLight('#ffffff', 1.2); sun.position.set(-6, 10, 4); scene.add(sun);
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(900, 900);
renderer.render(scene, cam);
renderer.domElement.toBlob(blob => { console.log('rendered'); });
