/**
 * 光照 A/B 探针（岛屿总览）：量 console、帧时间、模型就绪、以及截图后的像素统计。
 *
 * 和 probe-island-load.mjs 的分工：那个量「加载性能」，这个量「光照结果」——
 * 过曝(blown)、死黑(dead)、平均亮度、以及最能反映「有没有形」的对比度 p95-p5。
 * 截图存 screenshots/island/lighting/<tag>-overview.png，可用 tools/png-stats.mjs 复核。
 *
 * 用法：node tools/probe-island-lighting.mjs --tag=名字 [--origin=http://localhost:5174]
 */
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';

const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ORIGIN = arg('origin', 'http://localhost:5174');
const TAG = arg('tag', 'run');

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

const t0 = Date.now();
await page.goto(`${ORIGIN}/?scene=island`, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction(() => {
    const el = document.querySelector('.memory-island .asset-status');
    const m = el?.textContent?.match(/^3D 模型 (\d+)\/(\d+)/);
    return m && m[1] === m[2];
  }, undefined, { timeout: 180_000 });
} catch { /* 超时也继续取证 */ }
const settledMs = Date.now() - t0;
await page.waitForTimeout(2500);

const frame = await page.evaluate(() => new Promise(resolve => {
  const times = []; let last = performance.now(), n = 0;
  const tick = () => {
    const now = performance.now(); times.push(now - last); last = now;
    if (++n < 80) requestAnimationFrame(tick);
    else {
      const t = times.slice(30).sort((a, b) => a - b);
      resolve({ medianMs: Math.round(t[Math.floor(t.length / 2)] * 10) / 10, p90Ms: Math.round(t[Math.floor(t.length * 0.9)] * 10) / 10 });
    }
  };
  requestAnimationFrame(tick);
}));

await page.screenshot({ path: `screenshots/island/lighting/${TAG}-overview.png` });

console.log(JSON.stringify({ tag: TAG, origin: ORIGIN, settledMs, frame, errors: errors.slice(0, 8) }, null, 2));
await browser.close();
