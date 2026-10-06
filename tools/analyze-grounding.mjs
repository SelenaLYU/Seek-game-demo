/**
 * 接地检查：地形接收面（land）与投影体是否真的接触。
 * 若某物体「离地 > MAX_FLOAT」或「陷入 > MAX_SINK」，clipping 审计应当报出来，
 * 但审计只看 scatter 的 props；建筑/桥/栈桥不在里面。这里补一遍覆盖。
 *
 * 判据：对每个可见 mesh，取它的最低世界 y，与它水平投影内的地形高度比较。
 */
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';
import { MAP_SCALE_X, terrainHeight } from '../src/island/terrain.ts';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:5175';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${ORIGIN}/?scene=island&debugView=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => /3D 模型 (\d+)\/\d+ 已载入/.test(document.querySelector('.memory-island .asset-status')?.textContent ?? ''),
  null, { timeout: 180_000 },
).catch(() => {});
await page.waitForTimeout(7000);

const report = await page.evaluate(({ MAP_SCALE_X }) => {
  const { scene } = window.__islandView;
  scene.updateMatrixWorld(true);
  const out = [];
  const v = new (window.__islandView.scene.constructor.prototype.constructor)();
  // 简易 AABB（不依赖 three 的 import）
  const items = [];
  scene.traverse(obj => {
    if (!obj.isMesh || !obj.visible) return;
    let p = obj.parent, vis = true;
    while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
    if (!vis) return;
    const g = obj.geometry; g.computeBoundingBox();
    const bb = g.boundingBox;
    // 8 角点转世界
    const pts = [];
    for (const xx of [bb.min.x, bb.max.x]) for (const yy of [bb.min.y, bb.max.y]) for (const zz of [bb.min.z, bb.max.z]) {
      const p = new obj.position.constructor(xx, yy, zz);
      p.applyMatrix4(obj.matrixWorld);
      pts.push(p);
    }
    let minY = Infinity;
    for (const p of pts) minY = Math.min(minY, p.y);
    items.push({ minY, cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2, sx: bb.max.x - bb.min.x, sz: bb.max.z - bb.min.z, geo: g.type, verts: g.getAttribute('position').count });
  });
  return items;
}, { MAP_SCALE_X });

console.log(`可见 mesh=${report.length}`);

// 与地形高度比较：只挑「扁平/大块」的（地形本身除外）
const terrain = report.find(m => m.verts > 10000);
console.log(`地形网格(verts>10000) 存在=${!!terrain}`);

let floating = [], sunken = [];
for (const m of report) {
  if (m === terrain) continue;
  if (m.sx * m.sz < 1.2) continue; // 小碎块跳过（花/叶）
  // 采样物体中心附近的地形高度
  const localX = m.cx / MAP_SCALE_X;
  const ground = terrainHeight(localX, m.cz);
  const off = m.minY - ground;
  if (off > 0.04) floating.push({ ...m, off: +off.toFixed(3) });
  else if (off < -0.12) sunken.push({ ...m, off: +off.toFixed(3) });
}
floating.sort((a, b) => b.off - a.off);
sunken.sort((a, b) => a.off - b.off);
console.log(`\n悬空 (off>0.04) 的网格: ${floating.length}`);
for (const f of floating.slice(0, 12)) console.log(`  +${f.off}  ${f.geo}(${f.verts}v) 宽${f.sx.toFixed(1)}x${f.sz.toFixed(1)}`);
console.log(`陷入 (off<-0.12) 的网格: ${sunken.length}`);
for (const s of sunken.slice(0, 12)) console.log(`  ${s.off}  ${s.geo}(${s.verts}v) 宽${s.sx.toFixed(1)}x${s.sz.toFixed(1)}`);
await browser.close();
