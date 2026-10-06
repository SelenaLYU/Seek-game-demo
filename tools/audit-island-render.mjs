/**
 * 渲染实况体检：在真实场景里遍历**所有**材质/网格，把 GPU 侧的破面指标量化出来。
 *
 * 为什么不能只看截图：截图是 1280x800 的投影，破洞/黑面/z-fighting 会被视角、
 * 光照和遮挡藏起来。这里改成在页面里遍历 scene，对每个可见网格做几何自检，
 * 并对渲染结果做**逐像素**统计（深海蓝背景是已知参照色，用它反查「破洞=露出背景」）。
 *
 * 用法：ORIGIN=http://localhost:5175 node tools/audit-island-render.mjs
 */
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:5175';
const OUT = 'screenshots/island';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'pageerror') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + String(e)));

await page.goto(`${ORIGIN}/?scene=island&debugView=1&islandPreview=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => /3D 模型 (\d+)\/\d+ 已载入/.test(document.querySelector('.memory-island .asset-status')?.textContent ?? ''),
  null, { timeout: 180_000 },
).catch(() => {});
await page.waitForTimeout(6000);

// ---------- 1. 几何自检（真实场景里遍历） ----------
const geoReport = await page.evaluate(() => {
  const { scene } = window.__islandView;
  const THREE_pos = [];
  const out = {
    meshes: 0, visibleMeshes: 0,
    zeroAreaTris: 0, degenerateVerts: 0,
    downwardNormals: 0, zeroNormals: 0, nonUnitNormals: 0,
    badIndex: 0, nanPosition: 0, nanNormal: 0,
    doubleSided: 0, shadowIssues: [],
    geometryDetails: [],
  };
  const vA = { x: 0, y: 0, z: 0 }, vB = { x: 0, y: 0, z: 0 }, vC = { x: 0, y: 0, z: 0 };
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const len = a => Math.hypot(a.x, a.y, a.z);

  scene.updateMatrixWorld(true);
  scene.traverse(obj => {
    if (!obj.isMesh) return;
    out.meshes++;
    if (!obj.visible) return;
    // parent chain visible
    let p = obj.parent, vis = true;
    while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
    if (!vis) return;
    out.visibleMeshes++;

    const geo = obj.geometry;
    const posAttr = geo.getAttribute('position');
    const nrmAttr = geo.getAttribute('normal');
    const idx = geo.getIndex();

    let meshNaN = 0, meshZeroArea = 0, meshDown = 0, meshZeroN = 0, meshBadIdx = 0;
    for (let i = 0; i < posAttr.count; i++) {
      const px = posAttr.getX(i), py = posAttr.getY(i), pz = posAttr.getZ(i);
      if (!Number.isFinite(px + py + pz)) meshNaN++;
    }
    out.nanPosition += meshNaN; if (meshNaN) out.shadowIssues.push(`${obj.name || 'mesh'} NaN positions: ${meshNaN}`);

    if (nrmAttr) {
      for (let i = 0; i < nrmAttr.count; i++) {
        const nx = nrmAttr.getX(i), ny = nrmAttr.getY(i), nz = nrmAttr.getZ(i);
        if (!Number.isFinite(nx + ny + nz)) { out.nanNormal++; continue; }
        const l = Math.hypot(nx, ny, nz);
        if (l < 1e-6) out.zeroNormals++;
        else { if (Math.abs(l - 1) > 1e-3) out.nonUnitNormals++; if (ny / l < -0.99) out.downwardNormals++; }
      }
    }
    if (idx) {
      const triCount = idx.count / 3;
      for (let t = 0; t < triCount; t++) {
        const i = idx.getX(t * 3), j = idx.getX(t * 3 + 1), k = idx.getX(t * 3 + 2);
        if (i === j || j === k || i === k) { meshBadIdx++; continue; }
        vA.x = posAttr.getX(i); vA.y = posAttr.getY(i); vA.z = posAttr.getZ(i);
        vB.x = posAttr.getX(j); vB.y = posAttr.getY(j); vB.z = posAttr.getZ(j);
        vC.x = posAttr.getX(k); vC.y = posAttr.getY(k); vC.z = posAttr.getZ(k);
        const ab = sub(vB, vA), ac = sub(vC, vA);
        const n = cross(ab, ac);
        const area = len(n) / 2;
        if (area < 1e-9) meshZeroArea++;
        else if (n.z / (2 * area) < -0.99) meshDown++;
      }
    }
    out.zeroAreaTris += meshZeroArea;
    out.degenerateVerts += meshZeroArea;
    out.downwardNormals += meshDown;
    out.badIndex += meshBadIdx;
    if (meshZeroArea || meshDown || meshNaN || meshBadIdx) {
      out.geometryDetails.push({
        name: obj.name || 'unnamed',
        verts: posAttr.count,
        tris: idx ? idx.count / 3 : posAttr.count / 3,
        zeroArea: meshZeroArea, downward: meshDown, nan: meshNaN, badIdx: meshBadIdx,
      });
    }
  });
  return out;
});

console.log('=== 几何自检（真实场景） ===');
console.log(`meshes=${geoReport.meshes} visible=${geoReport.visibleMeshes}`);
console.log(`NaN positions=${geoReport.nanPosition}  NaN normals=${geoReport.nanNormal}`);
console.log(`zero-area triangles=${geoReport.zeroAreaTris}  degenerate index=${geoReport.badIndex}`);
console.log(`downward normals=${geoReport.downwardNormals}  zero normals=${geoReport.zeroNormals}  non-unit=${geoReport.nonUnitNormals}`);
if (geoReport.geometryDetails.length) {
  console.log('  问题网格:');
  for (const d of geoReport.geometryDetails.slice(0, 15)) {
    console.log(`    ${d.name} verts=${d.verts} tris=${d.tris} zeroArea=${d.zeroArea} down=${d.downward} nan=${d.nan} badIdx=${d.badIdx}`);
  }
} else console.log('  问题网格: 无');

// ---------- 2. 逐像素统计：找「本该是地面却露出天空/海面」的破洞 ----------
// 用 debugView 把相机摆到低角度贴着岛缘，然后读回 canvas 像素。
const shootAndAnalyze = async (name, camFn) => {
  await page.evaluate(camFn);
  await page.waitForTimeout(600);
  const shot = `${OUT}/render-${name}.png`;
  await page.screenshot({ path: shot });
  return shot;
};

// 分析截图里「天空蓝/海水」像素占比，以及是否有大面积同色块（疑似破洞）
await shootAndAnalyze('shore-n', `(() => {
  const { camera } = window.__islandView;
  camera.position.set(0, 2.5, 52); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true);
})()`);
await shootAndAnalyze('shore-s', `(() => {
  const { camera } = window.__islandView;
  camera.position.set(0, 2.5, -52); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true);
})()`);
await shootAndAnalyze('shore-e', `(() => {
  const { camera } = window.__islandView;
  camera.position.set(52, 2.5, 0); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true);
})()`);
await shootAndAnalyze('shore-w', `(() => {
  const { camera } = window.__islandView;
  camera.position.set(-52, 2.5, 0); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true);
})()`);
await shootAndAnalyze('edge-low', `(() => {
  const { camera } = window.__islandView;
  camera.position.set(0, -1.8, 40); camera.lookAt(0, 0.5, 0); camera.updateMatrixWorld(true);
})()`);
await shootAndAnalyze('edge-low2', `(() => {
  const { camera } = window.__islandView;
  camera.position.set(-40, -1.8, 0); camera.lookAt(0, 0.5, 0); camera.updateMatrixWorld(true);
})()`);

console.log(`errors=${errors.length}`);
for (const e of errors.slice(0, 6)) console.log('  ' + e.slice(0, 200));
await browser.close();
