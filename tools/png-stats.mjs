/** PNG 像素统计：出过曝（烧白）、死黑、平均亮度、分区直方图。
 * 用法：node tools/png-stats.mjs <file.png> [...]
 */
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

for (const file of files) {
  const stats = await page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.getElementById('c');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let blown = 0, dead = 0, lumSum = 0, count = 0;
    const hist = new Array(16).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (r >= 250 && g >= 250 && b >= 250) blown++;
      if (max <= 6) dead++;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      lumSum += lum; count++;
      hist[Math.min(15, Math.floor(lum * 16))]++;
    }
    const pct = (n) => Math.round(n / count * 1000) / 10;
    return {
      size: `${width}x${height}`,
      blownPct: pct(blown), deadPct: pct(dead),
      meanLum: Math.round(lumSum / count * 1000) / 1000,
      hist: hist.map(v => pct(v)),
    };
  }, `data:image/png;base64,${readFileSync(file).toString('base64')}`);
  console.log(`${file.split('/').pop()}  ${stats.size}`);
  console.log(`  blown(>=250 all): ${stats.blownPct}%   dead(<=6): ${stats.deadPct}%   meanLum: ${stats.meanLum}`);
  console.log(`  lum hist %: ${stats.hist.join(' ')}`);
}
await browser.close();
