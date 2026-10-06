/**
 * 正常游玩视角截图（不加 islandPreview/artPreview），用于看真实渲染下的
 * 自阴影 acne / 黑面 / 破面。用法：ORIGIN=... node tools/shot-island-play.mjs
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

// 真实游玩（灰盒 + HUD），带 debugView 以便自定义机位
await page.goto(`${ORIGIN}/?scene=island&debugView=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => /3D 模型 (\d+)\/\d+ 已载入/.test(document.querySelector('.memory-island .asset-status')?.textContent ?? ''),
  null, { timeout: 180_000 },
).catch(() => {});
await page.waitForTimeout(7000);
await page.screenshot({ path: `${OUT}/play-overview.png` });

// 切到探索模式看第三人称（自阴影 acne 最明显的地方）
await page.click('[data-switch]');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/play-explore.png` });

// 贴地低机位：最容易看到地形破面与阴影 acne
const ground = [
  ['low-front', 0, 3.2, 26, 0, 1.5, 0],
  ['low-right', 26, 3.2, 0, 0, 1.5, 0],
  ['low-back', 0, 3.2, -26, 0, 1.5, 0],
  ['low-left', -26, 3.2, 0, 0, 1.5, 0],
];
for (const [name, cx, cy, cz, tx, ty, tz] of ground) {
  await page.evaluate(([cx, cy, cz, tx, ty, tz]) => {
    const { camera } = window.__islandView;
    camera.position.set(cx, cy, cz);
    camera.lookAt(tx, ty, tz);
    camera.updateMatrixWorld(true);
  }, [cx, cy, cz, tx, ty, tz]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/play-${name}.png` });
}

console.log(`errors=${errors.length}`);
for (const e of errors.slice(0, 6)) console.log('  ' + e.slice(0, 200));
await browser.close();
