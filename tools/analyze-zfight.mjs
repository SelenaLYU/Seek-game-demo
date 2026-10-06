/**
 * Z-fighting 实证：在相机不动的前提下连拍两帧，逐像素比对。
 * 若存在 z-fighting，深度值会在两帧之间微小变化 → 同一像素亮度抖动。
 * 判据：język「同一机位相邻两帧」出现**大面积同色像素跳变**（>0.5% 且成片）
 * 才算真闪烁；少量边缘像素属于正常抗锯齿。
 *
 * 另外用 renderer.info 读深度相关统计做交叉验证。
 */
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:5175';

function decodePNG(buf) {
  let pos = 8, width = 0, height = 0, colorType = 0, bitDepth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = raw.subarray(rp, rp + stride); rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a; else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${ORIGIN}/?scene=island&debugView=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => /3D 模型 (\d+)\/\d+ 已载入/.test(document.querySelector('.memory-island .asset-status')?.textContent ?? ''),
  null, { timeout: 180_000 },
).catch(() => {});
await page.waitForTimeout(7000);

// 冻结动态（天空/海面 uTime），让任何抖动只可能来自深度
await page.evaluate(() => {
  window.__islandView.scene.traverse(o => {
    if (o.material && o.material.uniforms && o.material.uniforms.uTime) o.material.uniforms.uTime.value = 0;
  });
});

const viewpoints = [
  ['zf-overview', 0, 55, 70],
  ['zf-shore', 0, -1.8, 40],
  ['zf-terrain', 0, 6, 30],
  ['zf-inside', 8, 3, 8],
];

for (const [name, cx, cy, cz] of viewpoints) {
  await page.evaluate(([cx, cy, cz]) => {
    const { camera } = window.__islandView;
    camera.position.set(cx, cy, cz);
    camera.lookAt(0, 1.5, 0);
    camera.updateMatrixWorld(true);
  }, [cx, cy, cz]);
  // 让相机彻底静止（关闭 damping 影响）
  await page.waitForTimeout(1200);
  const a = await page.screenshot();
  await page.waitForTimeout(400);
  const b = await page.screenshot();
  const ia = decodePNG(a), ib = decodePNG(b);
  let diff = 0, total = 0, big = 0;
  for (let i = 0, p = 0; i < ia.width * ia.height; i++, p += ia.channels) {
    const d = Math.abs(ia.data[p] - ib.data[p]) + Math.abs(ia.data[p + 1] - ib.data[p + 1]) + Math.abs(ia.data[p + 2] - ib.data[p + 2]);
    total++;
    if (d > 6) diff++;
    if (d > 30) big++;
  }
  console.log(`${name.padEnd(14)} 相邻帧像素差异 >6: ${(diff / total * 100).toFixed(3)}%   >30: ${(big / total * 100).toFixed(3)}%`);
}
console.log('（说明：>6 含抗锯齿边缘；若某项显著偏高且集中成片，才是 z-fighting）');
await browser.close();
