/**
 * 现场穿模清单的实测脚本（纯函数侧，不需要浏览器）。
 * 三条待清项：栈桥/码头与岸线衔接、建筑底座与坡地、崖壁与裙边接缝。
 * 用法：node tools/audit-island-ground-seams.mjs
 */
import { MAP_SCALE_X, coastlineRadius, terrainHeight } from '../src/island/terrain.ts';

const MAX_FLOAT = 0.02;
const MAX_SINK = 0.08;
const pad = (v, n = 3) => Number(v).toFixed(n).padStart(7);

/** 绕 Y 轴旋转后的世界位移（与 three.js Group.rotation.y 同口径）。 */
function rotate(x, z, theta) {
  return { x: x * Math.cos(theta) + z * Math.sin(theta), z: -x * Math.sin(theta) + z * Math.cos(theta) };
}

console.log('=== 1. 栈桥 / 码头 与岸线衔接 ===');
console.log('判定：桥面（或码头面）在陆地处高出地形即为悬空穿模；低于地形超过 MAX_SINK 即深陷。\n');

// 两座 footbridge
for (const [label, bx, bz, yaw] of [['栈桥 A', -7, 6.5, -Math.PI / 4], ['栈桥 B', 7, 0, -Math.PI / 4]]) {
  const groupY = terrainHeight(bx, bz) - 0.02;
  const deckTop = groupY + 0.12;                    // BoxGeometry(2.65,0.12,5.6) 位于 y=0.06
  const halfDeck = 2.8;                             // 桥面沿局部 z 从 -2.8 到 2.8
  console.log(`${label} @ (${bx}, ${bz}) 桥面顶 y=${pad(deckTop)}`);
  let worstFloat = -Infinity, worstSink = Infinity;
  for (let t = -halfDeck; t <= halfDeck; t += 0.4) {
    for (const off of [-1.2, 0, 1.2]) {
      const local = rotate(off, t, yaw);
      const wx = bx + local.x, wz = bz + local.z;
      const ground = terrainHeight(wx, wz);
      const delta = deckTop - ground;
      if (delta > worstFloat) worstFloat = delta;
      if (delta < worstSink) worstSink = delta;
    }
  }
  console.log(`  全桥面最高/最低相对地形: +${pad(worstFloat)} (悬空) / ${pad(worstSink)} (陷入)`);
  const verdict = worstFloat > MAX_FLOAT ? '❌ 桥面悬空' : worstSink < -MAX_SINK ? '❌ 桥面深陷' : '✓';
  console.log(`  ${verdict}\n`);
}

// 栈桥两端伸出的桥头柱（长 1，中心 y=0.73 → 从 0.23 到 1.23）
const dockX = -18.5, dockZ = 18.5, dockYaw = -0.48;
const dockGround = terrainHeight(dockX, dockZ);
console.log(`码头 @ (${dockX}, ${dockZ}) 基准地形 y=${pad(dockGround)}`);
const deckLocalZFar = 2.3 + 8.2 / 2;   // 远海端
const deckLocalZNear = 2.3 - 8.2 / 2;  // 靠岸端
for (const [label, lz] of [['靠岸端', deckLocalZNear], ['远海端', deckLocalZFar]]) {
  const local = rotate(0, lz, dockYaw);
  const wx = dockX + local.x, wz = dockZ + local.z;
  const ground = terrainHeight(wx, wz);
  const surface = dockGround + 0.08;   // 甲板 Box(4.5,0.08,8.2) 局部中心 y=0.04 → 顶面 0.08
  console.log(`  ${label} 本地 z=${pad(lz, 1)} 世界(${pad(wx, 2)},${pad(wz, 2)}) 地形 y=${pad(ground)} 甲板面 y=${pad(surface)} 差=${pad(surface - ground)}`);
}
console.log('');

console.log('=== 2. 建筑底座与坡地 ===');
console.log('判定：底座按 baseGround = max(地形) 坐地；低侧因此悬空，落差 = max - min。\n');
const sites = [
  { id: 1, x: -14, z: 16, w: 7.8, d: 6.2 },
  { id: 2, x: -15, z: -10, w: 7, d: 5.6 },
  { id: 3, x: -2, z: -5, w: 7.2, d: 6.1 },
  { id: 4, x: 12, z: 1, w: 6.8, d: 6.1 },
  { id: 5, x: 10, z: 16, w: 7.6, d: 6.4 },
  { id: 6, x: 13, z: -19, w: 8.8, d: 7 },
];
for (const site of sites) {
  // 复刻 GLB 落位时的采样：fittedSize 的 x 已乘 mapScaleX，故本地半宽要除回去
  const halfWorldX = (site.w * MAP_SCALE_X) / 2 * 0.9;
  const halfWorldZ = (site.d / 2) * 0.9;
  const samples = [];
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
    samples.push(terrainHeight(site.x + (sx * halfWorldX) / MAP_SCALE_X, site.z + sz * halfWorldZ));
  }
  const max = Math.max(...samples), min = Math.min(...samples);
  console.log(`CH0${site.id} @ (${site.x}, ${site.z}) 底座走 max=${pad(max)} → 低侧悬空 ${pad(max - min)}（地形 ${pad(min)}~${pad(max)}）`);
}
console.log('');

console.log('=== 3. 崖壁与裙边接缝 ===');
console.log('判定：地面网格边缘半径、崖壁内缘/外缘、裙边上下缘是否对齐（有缝即穿帮）。\n');
let seamMaxGap = 0, seamAt = null;
for (let i = 0; i <= 360; i += 5) {
  const angle = (i * Math.PI) / 180;
  const inner = coastlineRadius(angle) - 0.45;
  const outer = coastlineRadius(angle) + 0.5;
  // 地面网格最外一圈顶点（terrainGeometry 用 coastlineRadius-0.45）
  const groundEdgeY = terrainHeight(Math.sin(angle) * inner, Math.cos(angle) * inner);
  // 崖壁内缘顶点用同一个高度，所以二者本应严丝合缝；这里查的是崖壁自身的内外缘高度差
  const cliffTopY = groundEdgeY;
  const cliffBottomY = -1.88;
  if (cliffTopY - cliffBottomY > seamMaxGap) { seamMaxGap = cliffTopY - cliffBottomY; seamAt = (i * Math.PI) / 180; }
}
console.log(`崖壁竖直跨度（内缘地形 → 外缘 -1.88）最大 ${pad(seamMaxGap)} @ ${((seamAt * 180) / Math.PI).toFixed(0)}°`);
// 裙边（ shore 圆柱）顶面 y=-1+0.9=-0.1，半径 coastline；崖壁内缘顶在地形高度（> -1.9）
let skirtGap = 0, skirtAt = null;
for (let i = 0; i <= 360; i += 5) {
  const angle = (i * Math.PI) / 180;
  const inner = coastlineRadius(angle) - 0.45;
  const groundEdgeY = terrainHeight(Math.sin(angle) * inner, Math.cos(angle) * inner);
  const skirtTop = -0.1;   // shore 圆柱顶面中心 y = -1 + 1.8/2
  const gap = groundEdgeY - skirtTop;
  if (Math.abs(gap) > Math.abs(skirtGap)) { skirtGap = gap; skirtAt = (i * Math.PI) / 180; }
}
console.log(`地面边缘 vs 裙边顶面（-0.1）: 最大差 ${pad(skirtGap)} @ ${((skirtAt * 180) / Math.PI).toFixed(0)}°`);
console.log('（正值 = 地面边缘高于裙边顶，露缝；负值 = 地面边缘埋进裙边）');
