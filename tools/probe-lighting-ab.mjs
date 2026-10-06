/**
 * 光照 A/B：借 MemoryIsland 的 ?debugView=1 拿到真实 renderer/scene，在真实管线上逐组改
 * environmentIntensity / 主光强度（可选主光仰角、半球光、补光），每组立刻截图并量像素。
 *
 * 指标（只统计岛屿区域 x330-970 / y300-780，裁掉天空/海/UI，免得背景把统计带偏）：
 *   blown%   过曝（亮度>=0.98）——烧白、高光丢细节
 *   dead%    死黑（亮度<=0.024）——暗部糊成一团、读不出形体
 *   contrast p95-p5 —— 最能反映「有没有形」的指标（坡面/屋檐亮部与暗部之差）
 *   mean     平均亮度
 *
 * 像素统计走浏览器 canvas，不依赖 python/PIL（早先那版用 `python3 -c` 传 JSON，
 * `\n` 被当成字面量，指标步骤从来没跑成功过，只是报错被当成「探针已跑」）。
 *
 * 用法：node tools/probe-lighting-ab.mjs [--origin=http://localhost:5173]
 * 默认用例是 2026-10-06 那次决策的 before/after，用来复现结论。
 */
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';

const ORIGIN = process.argv.find(a => a.startsWith('--origin='))?.slice(9) ?? 'http://localhost:5174';
const D2R = Math.PI / 180;

// 2026-10-06 决策（见 src/island/MemoryIsland.ts 的 sun 注释）：
// 唯一有效的杠杆是「抬主光 + 压 environmentIntensity」。抬仰角、改 exposure 都是死路。
const CASES = [
  { name: 'before-env45-sun28', env: 0.45, sun: 2.8 },
  { name: 'after-env30-sun55', env: 0.30, sun: 5.5 },
];

const CROP = { x: 330, y: 300, w: 640, h: 480 };

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const shots = [];

for (const c of CASES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.error('[pageerror]', String(e).slice(0, 200)));
  await page.goto(`${ORIGIN}/?scene=island&debugView=1`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => {
      const el = document.querySelector('.memory-island .asset-status');
      const m = el?.textContent?.match(/^3D 模型 (\d+)\/(\d+)/);
      return m && m[1] === m[2];
    }, undefined, { timeout: 180_000 });
  } catch { console.error(`${c.name}: 模型未就绪，继续`); }
  await page.waitForTimeout(1500);

  const applied = await page.evaluate(({ case_, d2r }) => {
    const { scene, renderer, camera } = window.__islandView;
    const directional = [];
    scene.traverse(o => { if (o.isDirectionalLight) directional.push(o); });
    const sun = directional.find(o => o.castShadow);
    const fill = directional.find(o => !o.castShadow);
    scene.environmentIntensity = case_.env;
    sun.intensity = case_.sun;
    if (case_.hemi !== undefined) scene.traverse(o => { if (o.isHemisphereLight) o.intensity = case_.hemi; });
    if (case_.fill !== undefined && fill) fill.intensity = case_.fill;
    let elev = Math.asin(sun.position.clone().normalize().y) / d2r;
    if (case_.elev !== undefined) {
      const dir = sun.position.clone().normalize();
      const azimuth = Math.atan2(dir.x, dir.z);
      const rad = case_.elev * d2r;
      sun.position.set(Math.cos(rad) * Math.sin(azimuth), Math.sin(rad), Math.cos(rad) * Math.cos(azimuth)).multiplyScalar(64);
      sun.updateMatrixWorld(true);
      elev = case_.elev;
    }
    renderer.render(scene, camera);
    return { env: scene.environmentIntensity, sun: sun.intensity, fill: fill?.intensity ?? null, elev: Number(elev.toFixed(1)) };
  }, { case_: c, d2r: D2R });

  await page.waitForTimeout(900);
  const path = `screenshots/island/lighting/ab-${c.name}.png`;
  await page.screenshot({ path });
  shots.push(path);
  console.log(`${c.name.padEnd(22)} env=${applied.env} sun=${applied.sun} fill=${applied.fill} elev=${applied.elev}°`);
  await page.close();
}

// 指标：同一套口径，裁岛屿区域。跑在浏览器 canvas 上，和 png-stats.mjs 一个路子。
const statsPage = await browser.newPage();
await statsPage.setContent('<canvas id="c"></canvas>');
const rows = await statsPage.evaluate(async ({ paths, crop }) => {
  const canvas = document.getElementById('c');
  const out = [];
  for (const { src, name } of paths) {
    const img = new Image();
    img.src = src;
    await img.decode();
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const lum = [];
    let wholeBlown = 0, wholePixels = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      wholePixels++;
      if (data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250) wholeBlown++;
      if (x >= crop.x && x < crop.x + crop.w && y >= crop.y && y < crop.y + crop.h) lum.push(l);
    }
    lum.sort((a, b) => a - b);
    const n = lum.length;
    const p = (q) => lum[Math.min(n - 1, Math.floor(n * q))];
    out.push({
      name: name.split('/').pop().replace(/^ab-|\.png$/g, ''),
      blown: lum.filter(v => v >= 0.98).length / n * 100,
      dead: lum.filter(v => v <= 0.024).length / n * 100,
      mean: lum.reduce((a, b) => a + b, 0) / n,
      contrast: p(0.95) - p(0.05),
      wholeBlown: wholeBlown / wholePixels * 100,
    });
  }
  return out;
}, { paths: shots.map(p => `data:image/png;base64,${readFileSync(p).toString('base64')}`).map((src, i) => ({ src, name: shots[i] })), crop: CROP });

console.log('\n（岛屿区域 x330-970 / y300-780；wholeBlown 是全图过曝，防止裁掉的天空把问题藏住）');
const cell = (v, width = 8, digits = 3) => v.toFixed(digits).padStart(width);
console.log('case'.padEnd(24) + 'blown%'.padStart(8) + 'dead%'.padStart(8) + 'mean'.padStart(8) + 'contrast'.padStart(10) + 'wholeBlown%'.padStart(12));
for (const r of rows) {
  console.log(r.name.padEnd(24) + cell(r.blown) + cell(r.dead) + cell(r.mean) + cell(r.contrast, 10) + cell(r.wholeBlown, 12));
}
await browser.close();
