/**
 * 岛屿几何体检截图。用法：node tools/shot-island-geometry.mjs [origin]
 * 输出 screenshots/island/geom-*.png，用于前后对比（截图 gitignore，只作本地证据）。
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

await page.goto(`${ORIGIN}/?scene=island&islandPreview=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => /3D 模型 (\d+)\/\d+ 已载入/.test(document.querySelector('.memory-island .asset-status')?.textContent ?? ''),
  null, { timeout: 180_000 },
).catch(() => {});
await page.waitForTimeout(6000);

const shots = [
  ['overview', null],
  ['topdown', 'top'],
  ['zoom-front', 'zoom'],
];
for (const [name] of shots) await page.screenshot({ path: `${OUT}/geom-${name}.png` });

for (let chapter = 1; chapter <= 6; chapter++) {
  await page.goto(`${ORIGIN}/?scene=island&islandPreview=1&focusChapter=${chapter}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/geom-ch0${chapter}.png` });
}

console.log(`errors=${errors.length}`);
for (const e of errors.slice(0, 6)) console.log('  ' + e.slice(0, 200));
await browser.close();
