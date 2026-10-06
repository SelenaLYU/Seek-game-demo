/**
 * 岛缘 / 崖壁 / 裙边 专项体检：把相机压到接近水面的低角度，
 * 让「崖壁接缝、裙边漏光、岛缘破洞」这类问题必须进画面，而不是缩在总览里几像素。
 *
 * 做法：不走 UI，直接把 window.__islandView 暴露出来的 scene/camera 借出来，
 * 摆一个贴海面（y≈-1.9）的近景机位绕岛一圈打点。
 *
 * 用法：ORIGIN=http://localhost:5175 node tools/probe-island-shoreline.mjs
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

await page.goto(`${ORIGIN}/?scene=island&islandPreview=1&debugView=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => /3D 模型 (\d+)\/\d+ 已载入/.test(document.querySelector('.memory-island .asset-status')?.textContent ?? ''),
  null, { timeout: 180_000 },
).catch(() => {});
await page.waitForTimeout(6000);

// 借内部 scene/camera 摆机位。舞台上挂了 window.__islandView（若存在）就直接用。
const ok = await page.evaluate(() => {
  const hook = window.__islandView;
  return !!hook;
});
console.log(`islandView hook present: ${ok}`);

if (ok) {
  // 绕岛一圈，低角度贴海面拍岛缘
  const views = [];
  for (let i = 0; i < 8; i++) views.push(i * Math.PI / 4);
  await page.evaluate(() => { /* placeholder */ });
  for (let i = 0; i < views.length; i++) {
    await page.evaluate(angle => {
      const { scene, camera } = window.__islandView;
      const r = 46, y = -1.4;
      camera.position.set(Math.sin(angle) * r, y, Math.cos(angle) * r);
      camera.lookAt(0, 0.5, 0);
      camera.updateMatrixWorld(true);
    }, views[i]);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/shore-${i}.png` });
  }
}

console.log(`errors=${errors.length}`);
for (const e of errors.slice(0, 6)) console.log('  ' + e.slice(0, 200));
await browser.close();
