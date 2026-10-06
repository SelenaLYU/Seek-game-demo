/**
 * 地形接缝专项：地形外环与崖壁内缘在半径上是否严丝合缝。
 * 若地形外环半径 > 崖壁内缘半径 → 地形盖住崖壁（正常，无洞）；
 * 若地形外环半径 < 崖壁内缘半径 → 中间有一圈缝，从低角度能看穿（破洞/漏海）。
 */
import { coastlineRadius, terrainHeight } from '../src/island/terrain.ts';

const terrainSegments = 192, terrainRings = 64;
const cliffSegments = 192;

console.log('=== 地形外环 vs 崖壁内缘 ===');
let gapMax = -Infinity, gapWorstAngle = 0, covered = 0;
const samples = 384;
for (let s = 0; s < samples; s++) {
  const angle = s / samples * Math.PI * 2;
  const terrainOuter = (coastlineRadius(angle) - 0.45) * (terrainRings / terrainRings); // ring=terrainRings → 1.0 系数
  const cliffInner = coastlineRadius(angle) - 0.45;
  const gap = terrainOuter - cliffInner; // >=0 表示地形盖到崖壁
  if (gap < 0) { /* 缝 */ } else covered++;
  if (gap > gapMax) { gapMax = gap; gapWorstAngle = angle; }
}
console.log(`主锚点重合（同算式应为 0）: 最大差 ${gapMax.toExponential(2)} @ ${(gapWorstAngle * 180 / Math.PI).toFixed(1)}°`);
console.log(`覆盖=${covered}/${samples}`);

// 更关键的：地形**最外圈顶点**的实际半径 vs 崖壁内缘半径
console.log('\n=== 最外圈顶点实际半径（采样点，非锚点） ===');
let worstGap = 0, worstInfo = '';
let gapCount = 0;
for (let s = 0; s < samples; s++) {
  const angle = s / samples * Math.PI * 2;
  const terrainVertexRadius = coastlineRadius(angle) - 0.45;
  const cliffInner = coastlineRadius(angle) - 0.45;
  const gap = cliffInner - terrainVertexRadius; // >0 = 崖壁内缘在地形外圈之外 → 有缝
  if (gap > 1e-6) {
    gapCount++;
    if (gap > worstGap) { worstGap = gap; worstInfo = `${(angle * 180 / Math.PI).toFixed(1)}° gap=${gap.toFixed(4)}`; }
  }
}
console.log(`地形外圈半径与崖壁内缘半径之差 >0 的角度数: ${gapCount}/${samples}`);
console.log(`最大: ${worstInfo || '无（完全重合）'}`);

// 崖壁外缘 vs 海面 y=-1.88
console.log('\n=== 崖壁外缘底边 y 与海面 ===');
const outerY = -1.88, seaY = -1.92;
console.log(`崖壁外缘底 y=${outerY}, 海面 y=${seaY} → 崖壁底边${outerY < seaY ? '在海面之下(被淹没，正确)' : '在海面之上(会露出边)'}`);

// 地形最外圈高度与海面比较（决定岛缘是否插入水里）
console.log('\n=== 地形外圈高度（决定岛缘形态） ===');
let above = 0, below = 0, maxH = -Infinity, minH = Infinity;
for (let s = 0; s < samples; s++) {
  const angle = s / samples * Math.PI * 2;
  const r = coastlineRadius(angle) - 0.45;
  const h = terrainHeight(Math.sin(angle) * r, Math.cos(angle) * r);
  if (h > 0) above++; else below++;
  maxH = Math.max(maxH, h); minH = Math.min(minH, h);
}
console.log(`外圈在水上=${above}/${samples} (y>0), 水下=${below}；高度范围 [${minH.toFixed(3)}, ${maxH.toFixed(3)}]`);

// shore 圆柱（裙边）
console.log('\n=== 裙边 shore（islandGeometry 27/27.5 高1.8 y=-1） ===');
function islandGeometryTopBottom(topR, bottomR, height) {
  // 复刻 MemoryIsland 的 islandGeometry：按 coastlineRadius 缩放圆柱顶点
  const { CylinderGeometry } = require('three');
}
console.log(`shore 顶半径 27, 底 27.5, 中心 y=-1 → 顶面 y=-0.1, 底面 y=-1.9`);
// 地形在 r≈27 附近的高度
let shoreTopCover = 0, shoreTopAbove = 0;
for (let s = 0; s < samples; s++) {
  const angle = s / samples * Math.PI * 2;
  const h = terrainHeight(Math.sin(angle) * 27, Math.cos(angle) * 27);
  if (h > -0.1) shoreTopCover++; else shoreTopAbove++;
}
console.log(`r=27 处地形高度 > shore 顶面(-0.1) 的角度数: ${shoreTopCover}/${samples}（说明地形盖住裙边顶面）`);
