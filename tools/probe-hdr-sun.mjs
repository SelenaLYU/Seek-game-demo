/**
 * 实测 MemoryIsland.brightestDirection 把主光摆到哪个方向。
 *
 * 关键公式（three equirectUv 的反解）：
 *   u = atan2(z,x)/2π + 0.5      →  phi   = (u-0.5)*2π
 *   v = asin(y)/π     + 0.5      →  elev  = asin(y), y = sin((v-0.5)*π)
 * 注意是 sin((v-0.5)*π) 不是 sin(v*π)：少减这个 π/2 会算出 73° 仰角，
 * 把「主光被摆到天顶」误判成 bug（排查时真踩过这个坑）。
 *
 * 判定：扫到的最亮纹素所在行，在「图顶=天顶」的前提下落在哪条仰角。
 * 白天户外 HDR 的太阳仰角应在 10~35°（造型出影子的角度）；>70° 就是顶光平涂。
 *
 * 用法：node tools/probe-hdr-sun.mjs [--origin=http://localhost:5174]
 */
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';

const ORIGIN = process.argv.find(a => a.startsWith('--origin='))?.slice(9) ?? 'http://localhost:5174';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', e => console.error('[pageerror]', String(e).slice(0, 300)));
await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async (origin) => {
  const { HDRLoader } = await import('/node_modules/three/examples/jsm/loaders/HDRLoader.js');
  const tex = await new Promise((res, rej) => new HDRLoader().load(`${origin}/env/sky-sunny.hdr`, res, undefined, rej));
  const { data, width, height } = tex.image;
  const h2f = v => {
    const s = v & 0x8000 ? -1 : 1, e = (v >> 10) & 0x1f, m = v & 0x3ff;
    if (e === 0) return s * 2 ** -14 * (m / 1024);
    if (e === 31) return m ? NaN : s * Infinity;
    return s * 2 ** (e - 15) * (1 + m / 1024);
  };
  const lum = i => 0.2126 * h2f(data[i * 4]) + 0.7152 * h2f(data[i * 4 + 1]) + 0.0722 * h2f(data[i * 4 + 2]);

  // 复刻 MemoryIsland：每 2px
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    const l = lum(y * width + x);
    if (l > best) { best = l; bx = x; by = y; }
  }

  // 正确反解：elev = asin(sin((v-0.5)*π))，v 从「图顶=天顶」换算
  const vz = 1 - (by + 0.5) / height;          // 假设图片第 0 行是天顶
  const vn = (by + 0.5) / height;              // 假设图片第 0 行是天底
  const deg = r => (r * 180 / Math.PI);
  const elevOf = v => deg(Math.asin(Math.sin((v - 0.5) * Math.PI)));

  // MemoryIsland 的消歧：两个候选各算一遍，取"y 更大"的
  const yOf = v => Math.sin((v - 0.5) * Math.PI);
  const vTop = 1 - (by + 0.5) / height, vBot = (by + 0.5) / height;
  const pickedV = yOf(vTop) >= yOf(vBot) ? vTop : vBot;

  return {
    dims: `${width}x${height}`,
    brightestTexel: `(${bx}, ${by}) lum=${best.toFixed(1)}`,
    'row as fraction': ((by + 0.5) / height).toFixed(4),
    'elev if row=top is zenith': `${elevOf(vTop).toFixed(1)}°`,
    'elev if row=top is nadir': `${elevOf(vn).toFixed(1)}°`,
    'MemoryIsland picks (bigger y)': `${elevOf(pickedV).toFixed(1)}°`,
    note: '两个候选 y 相反数，比较有效；若太阳行在图上/下半球任一，结果如上',
  };
}, ORIGIN);

console.log(JSON.stringify(result, null, 2));
await browser.close();
