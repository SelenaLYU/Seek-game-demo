/**
 * 岛缘三层衔接专项（地形 / 崖壁 / 裙边 shore）在真实场景里的贴合度。
 *
 * 三层：
 *   1) 地形（land）：最外圈半径 = coastlineRadius(angle) - 0.45
 *   2) 崖壁（cliff）：内缘同上，外缘 +0.5，底 y=-1.88
 *   3) 裙边（shore 圆柱，经 islandGeometry 按 coastlineRadius 缩放）：
 *      顶 27 / 底 27.5 / 高 1.8 / position.y=-1 → 顶面 y=-0.1，底面 y=-1.9
 *
 * 要查的问题：
 *   - 地形外圈与崖壁内缘是否完全重合（不重合 → 漏缝）
 *   - 地形最外圈之外是否**还露出** shore 顶面（露出 → 岛缘一圈浅色塑料台）
 *   - 崖壁底边 y=-1.88 是否高过海面 y=-1.92（高过 → 水线以下露出崖壁底边）
 */
import * as THREE from 'three';
import { coastlineRadius, terrainHeight } from '../src/island/terrain.ts';

const SEA_Y = -1.92;
const SHARE_TOP_Y = -0.1, SHARE_BOTTOM_Y = -1.9;

// 复刻 islandGeometry(27, 27.5, 1.8)：CylinderGeometry 顶点按 coastlineRadius 缩放
function islandGeometry(topR, bottomR, height) {
  const g = new THREE.CylinderGeometry(topR, bottomR, height, 192);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const radius = Math.hypot(x, z);
    if (radius < 0.001) continue;
    const scale = (radius + coastlineRadius(Math.atan2(x, z)) - 27) / radius;
    p.setXYZ(i, x * scale, p.getY(i), z * scale);
  }
  p.needsUpdate = true;
  return g;
}

const shoreGeo = islandGeometry(27, 27.5, 1.8);
const sp = shoreGeo.getAttribute('position');
let shoreMaxRadius = 0, shoreMinRadius = 1e9;
for (let i = 0; i < sp.count; i++) {
  const r = Math.hypot(sp.getX(i), sp.getZ(i));
  shoreMaxRadius = Math.max(shoreMaxRadius, r);
  shoreMinRadius = Math.min(shoreMinRadius, r);
}
console.log(`裙边 shore 顶点半径范围: [${shoreMinRadius.toFixed(3)}, ${shoreMaxRadius.toFixed(3)}]  (顶 27 → 缩放后应≈coastline(θ))`);

const samples = 384;
let terrainBeyondShore = 0, cliffInnerGap = 0, terrainCliffGap = 0;
let worstShore = 0, worstShoreAngle = 0;
let terrainOutsideCliffInner = 0;

for (let s = 0; s < samples; s++) {
  const angle = s / samples * Math.PI * 2;
  const c = coastlineRadius(angle);
  const terrainOuterR = c - 0.45;
  const cliffInnerR = c - 0.45;
  const cliffOuterR = c + 0.5;

  // 地形最外圈（ring=terrainRings）的顶点半径 == terrainOuterR（构造保证）
  // 1) 崖壁内缘 vs 地形外圈：应为 0
  if (Math.abs(cliffInnerR - terrainOuterR) > 1e-9) cliffInnerGap++;

  // 2) 地形外圈 vs 它下方 shore 顶面的高度：地形必须高于 shore 顶面，否则露出浅色台
  const tx = Math.sin(angle) * terrainOuterR, tz = Math.cos(angle) * terrainOuterR;
  const terrainOuterY = terrainHeight(tx, tz);
  const shoreSurfaceY = -0.1; // shore 顶面（position.y=-1 + height/2）
  const exposed = shoreSurfaceY - terrainOuterY; // >0 表示地形比 shore 顶面低 → 露出 shore
  if (exposed > 0) {
    terrainBeyondShore++;
    if (exposed > worstShore) { worstShore = exposed; worstShoreAngle = angle; }
  }

  // 3) 崖壁是否覆盖地形外圈与 shore 之间的环带（cliffInner ~ cliffOuter）
  if (terrainOuterR > cliffOuterR) terrainOutsideCliffInner++;
}

console.log(`\n[1] 崖壁内缘与地形外圈半径不一致的角度: ${cliffInnerGap}/${samples}`);
console.log(`[2] 地形外圈低于 shore 顶面(会露出浅色裙边台)的角度: ${terrainBeyondShore}/${samples}` +
  (worstShore > 0 ? `  最大露出 ${worstShore.toFixed(3)} @ ${(worstShoreAngle * 180 / Math.PI).toFixed(1)}°` : ''));
console.log(`[3] 地形外圈超出崖壁外缘(=露出岛体侧壁)的角度: ${terrainOutsideCliffInner}/${samples}`);

// 崖壁底边与海面
console.log(`\n[4] 崖壁底边 y=-1.88 vs 海面 ${SEA_Y}: ${-1.88 < SEA_Y ? '低于海面(正确,被淹没)' : '高于海面(水线露出底边)'}`);
console.log(`[5] shore 底 y=${SHARE_BOTTOM_Y} vs 海面 ${SEA_Y}: ${SHARE_BOTTOM_Y < SEA_Y ? '低于海面' : '高于海面'}`);
console.log(`[6] shore 顶 y=${SHARE_TOP_Y} —— 若地形外圈低于它，岛缘会露出一圈浅色台面`);

// 地形外圈高度分布（决定上面 [2] 是否真的会露出）
let minY = Infinity, maxY = -Infinity, belowCnt = 0;
for (let s = 0; s < samples; s++) {
  const angle = s / samples * Math.PI * 2;
  const r = coastlineRadius(angle) - 0.45;
  const y = terrainHeight(Math.sin(angle) * r, Math.cos(angle) * r);
  minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  if (y < -0.1) belowCnt++;
}
console.log(`\n地形外圈高度范围 [${minY.toFixed(3)}, ${maxY.toFixed(3)}]，低于 shore 顶面(-0.1) 的角度数: ${belowCnt}/${samples}`);
