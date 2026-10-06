/**
 * 岛缘 / 建筑底座 低角度取证：俯视总览看不出「塑料底座盘」和底座悬空，
 * 必须换机位。借 MemoryIsland 的 ?debugView=1 直接摆相机（不影响正常场景）。
 *
 * 用法：node tools/shot-island-rim.mjs [--origin=http://localhost:5173] [--tag=before]
 * 输出：screenshots/island/rim/<tag>-<机位>.png（按 .gitignore 不入库）
 */
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const ORIGIN = process.argv.find(a => a.startsWith('--origin='))?.slice(9) ?? 'http://localhost:5173';
const TAG = process.argv.find(a => a.startsWith('--tag='))?.slice(6) ?? 'shot';

// 四向低角度（能看到近岸 + 近处建筑底座的接地关系）
const quadrants = [0, 90, 180, 270].map(az => {
  const rad = az * Math.PI / 180;
  return {
    name: `quad-${az}`,
    position: [Math.sin(rad) * 46, 7.5, Math.cos(rad) * 46],
    target: [Math.sin(rad) * 6, 1.5, Math.cos(rad) * 6],
  };
});

const SHOTS = [
  ...quadrants,
  // 贴水面掠视：岛缘那圈「盘」和直壁在这个机位最明显
  { name: 'grazing-water', position: [0, 1.1, 41], target: [0, -1.2, 24] },
  // 贴地近岸：看崖壁分段的色带
  { name: 'rim-close', position: [17, 5.5, 25], target: [4, -0.8, 24] },
];

mkdirSync('screenshots/island/rim', { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.error('[pageerror]', String(e).slice(0, 200)));

await page.goto(`${ORIGIN}/?scene=island&debugView=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const el = document.querySelector('.memory-island .asset-status');
  const m = el?.textContent?.match(/^3D 模型 (\d+)\/(\d+)/);
  return m && m[1] === m[2];
}, undefined, { timeout: 180_000 });
await page.waitForTimeout(2000);

const ready = await page.evaluate(() => Boolean(window.__islandView));
if (!ready) throw new Error('window.__islandView 不存在：确认 URL 带 ?debugView=1');

for (const shot of SHOTS) {
  await page.evaluate(({ position, target }) => {
    const { camera, controls } = window.__islandView;
    camera.position.set(...position);
    controls.target.set(...target);
    controls.update();
  }, shot);
  await page.waitForTimeout(600);
  const path = `screenshots/island/rim/${TAG}-${shot.name}.png`;
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
}

await browser.close();
