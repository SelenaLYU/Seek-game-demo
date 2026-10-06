/**
 * 定位 84 个零面积三角形与 3 个 NaN 法线来自哪个网格。
 * 上一轮 audit-island-render 报出：zero-area=84、NaN normals=3。
 * 这里把每个网格的这两个计数单独打出来，定位到具体几何。
 */
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:5175';
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${ORIGIN}/?scene=island&debugView=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => /3D 模型 (\d+)\/\d+ 已载入/.test(document.querySelector('.memory-island .asset-status')?.textContent ?? ''),
  null, { timeout: 180_000 },
).catch(() => {});
await page.waitForTimeout(7000);

const rep = await page.evaluate(() => {
  const { scene } = window.__islandView;
  scene.updateMatrixWorld(true);
  const rows = [];
  scene.traverse(obj => {
    if (!obj.isMesh) return;
    const g = obj.geometry;
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const idx = g.getIndex();
    let zeroArea = 0, nanN = 0, nanP = 0;
    if (pos) for (let i = 0; i < pos.count; i++) if (!Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))) nanP++;
    if (nrm) for (let i = 0; i < nrm.count; i++) {
      const s = nrm.getX(i) + nrm.getY(i) + nrm.getZ(i);
      if (!Number.isFinite(s)) nanN++;
      else if (Math.abs(Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i)) - 1) > 1e-3) nanN++;
    }
    if (idx) {
      const A = { x: 0, y: 0, z: 0 }, B = { x: 0, y: 0, z: 0 }, C = { x: 0, y: 0, z: 0 };
      for (let t = 0; t < idx.count; t += 3) {
        const i = idx.getX(t), j = idx.getX(t + 1), k = idx.getX(t + 2);
        if (i === j || j === k || i === k) continue;
        A.x = pos.getX(i); A.y = pos.getY(i); A.z = pos.getZ(i);
        B.x = pos.getX(j); B.y = pos.getY(j); B.z = pos.getZ(j);
        C.x = pos.getX(k); C.y = pos.getY(k); C.z = pos.getZ(k);
        const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z;
        const vx = C.x - A.x, vy = C.y - A.y, vz = C.z - A.z;
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        if (Math.hypot(cx, cy, cz) / 2 < 1e-9) zeroArea++;
      }
    }
    if (zeroArea || nanN || nanP) {
      rows.push({ type: g.type, verts: pos ? pos.count : 0, tris: idx ? idx.count / 3 : 0, zeroArea, nanN, nanP, name: obj.name || '(unnamed)' });
    }
  });
  return rows;
});

console.log(`问题网格数=${rep.length}`);
let tz = 0, tn = 0;
for (const r of rep) {
  console.log(`  ${r.type.padEnd(22)} verts=${String(r.verts).padStart(6)} tris=${String(Math.round(r.tris)).padStart(6)} zeroArea=${r.zeroArea} nanNormal=${r.nanN} nanPos=${r.nanP}`);
  tz += r.zeroArea; tn += r.nanN;
}
console.log(`合计: zeroArea=${tz}  nanNormal=${tn}`);
await browser.close();
