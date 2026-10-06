/** 离线跑一遍 MemoryIsland 的 brightestDirection，验证 HDR 里那颗太阳到底落在哪个方向。
 * 直接解 Radiance RGBE 头 + 扫描 half-float 数据（HDRLoader 会在 CPU 上把 RGBE 转成 half）。
 * 用法：node tools/hdr-sun-scan.mjs [hdr路径]
 */
import { readFileSync } from 'node:fs';
import { HalfFloatType, Vector3 } from 'three';

const file = process.argv[2] ?? 'public/env/sky-sunny.hdr';
const buf = readFileSync(file);

// ── Radiance 头 ────────────────────────────────────────────────
let offset = 0;
const header = [];
for (;;) {
  const lineEnd = buf.indexOf(0x0a, offset);
  const line = buf.toString('latin1', offset, lineEnd);
  offset = lineEnd + 1;
  header.push(line.trim());
  // 尺寸行（-Y H +X W）出现在空行之后，见空行前必须先收下它
  if (/^-Y\s+\d+\s+\+\d+\s+\d+$/.test(line.trim())) break;
}
const dim = header.find(h => /^-Y\s+\d+\s+\+\d+\s+\d+$/.test(h)) ?? header.find(h => /^\+\d+\s+\d+$/.test(h));
if (!dim) { console.error('解析不出尺寸，头部：', header.slice(0, 10)); process.exit(1); }
const [, heightStr, , widthStr] = dim.match(/^-Y\s+(\d+)\s+\+\d+\s+(\d+)/) ?? [];
const width = Number(widthStr), height = Number(heightStr);
console.log('header:', header.join(' | ').slice(0, 120));
console.log(`尺寸 ${width}x${height}`);

// RGBE 扫描行（flat / RLE），HDRLoader 用 DataUtils 把它们解码成 half float
const scanline = Buffer.alloc(width * 4);
const R8G8B8_TO_HALF = [];
const half = (() => {
  // 复用 three 的 DataUtils 思路：HDRLoader 内部调用 DataUtils.toHalfFloat
  return null;
})();
const toHalfFloatTable = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    table[i] = DataUtilsToHalf(i);
  }
  function DataUtilsToHalf(val) {
    // three DataUtils.toHalfFloat 的位运算实现
    let v = Math.max(-65504, Math.min(val, 65504));
    v = (v < 0) ? (v | 0x8000) : 0;
    v = Math.round(v);
    const m = (v < 0) ? -v : v;
    let e = Math.floor(Math.log2(m));
    const st = Math.pow(2, e);
    let mant = m / st - (st - 1);
    let mh = Math.round(mant * 1024);
    if (mh > 1024) { e += 1; mh /= 2; mh |= 0; }
    v = v & 0x8000;
    const eNorm = (e + 127) * 1024;
    return (v | (eNorm | mh)) >>> 0;
  }
  return table;
})();

function decodeScanline(data, scanStart, scanWidth) {
  let x = 0, ptr = scanStart, rgbe = Buffer.alloc(4);
  while (x < scanWidth) {
    rgbe[0] = data[ptr++]; rgbe[1] = data[ptr++]; rgbe[2] = data[ptr++]; rgbe[3] = data[ptr++];
    const count = data[ptr++];
    if (count > 128) { // RLE run
      const repeats = count - 128;
      for (let i = 0; i < repeats; i++) { rgbe[0] = data[ptr++]; rgbe[1] = data[ptr++]; rgbe[2] = data[ptr++]; rgbe[3] = data[ptr++]; }
      rgbe.copy(scanline, x * 4, 0, 4);
      x += repeats;
    } else { // flat run
      const repeats = count;
      for (let i = 0; i < repeats; i++) {
        rgbe[0] = data[ptr++]; rgbe[1] = data[ptr++]; rgbe[2] = data[ptr++]; rgbe[3] = data[ptr++];
        rgbe.copy(scanline, x * 4, 0, 4);
        x++;
      }
    }
  }
  return scanline;
}

const halfData = new Uint16Array(width * height * 4);
for (let y = 0; y < height; y++) {
  const rgbeLine = decodeScanline(buf, offset, width);
  offset += width * 4 + 1;
  for (let x = 0; x < width; x++) {
    const o = x * 4, r = rgbeLine[o], g = rgbeLine[o + 1], b = rgbeLine[o + 2], e = rgbeLine[o + 3];
    if (e === 0) { halfData[((y * width + x) * 4)] = 0; halfData[((y * width + x) * 4) + 1] = 0; halfData[((y * width + x) * 4) + 2] = 0; continue; }
    const scale = toHalfFloatTable[e] >>> 0;
    halfData[((y * width + x) * 4)] = (toHalfFloatTable[r] >>> 0) ^ scale;
    halfData[((y * width + x) * 4) + 1] = (toHalfFloatTable[g] >>> 0) ^ scale;
    halfData[((y * width + x) * 4) + 2] = (toHalfFloatTable[b] >>> 0) ^ scale;
    halfData[((y * width + x) * 4) + 3] = 0x3c00; // half = 1.0
  }
}

const h2f = (value) => {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const mantissa = value & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (mantissa / 1024);
  if (exponent === 31) return mantissa ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
};

// 复刻 brightestDirection 的扫描
let best = -1, bestX = 0, bestY = 0;
const top = [];
for (let y = 0; y < height; y += 2) {
  for (let x = 0; x < width; x += 2) {
    const i = (y * width + x) * 4;
    const lum = 0.2126 * h2f(halfData[i]) + 0.7152 * h2f(halfData[i + 1]) + 0.0722 * h2f(halfData[i + 2]);
    if (lum > best) { best = lum; bestX = x; bestY = y; top.push([lum, x, y]); }
  }
}
console.log(`\n最亮纹素: (${bestX},${bestY}) lum=${best.toFixed(2)}`);

const toDir = (px, py, flip) => {
  const phi = ((px + 0.5) / width - 0.5) * Math.PI * 2;
  const v = flip ? 1 - (py + 0.5) / height : (py + 0.5) / height;
  const theta = (v - 0.5) * Math.PI;
  return new Vector3(Math.cos(theta) * Math.cos(phi), Math.sin(theta), Math.cos(theta) * Math.sin(phi));
};
const direct = toDir(bestX, bestY, false);
const flipped = toDir(bestX, bestY, true);
const pick = direct.y >= flipped.y ? direct : flipped;
const az = (d) => (Math.atan2(d.x, d.z) * 180 / Math.PI).toFixed(1);
const el = (d) => (Math.asin(d.y / d.length()) * 180 / Math.PI).toFixed(1);
console.log(`  直接  az=${az(direct)}° el=${el(direct)}°  y=${direct.y.toFixed(3)}`);
console.log(`  翻转  az=${az(flipped)}° el=${el(flipped)}°  y=${flipped.y.toFixed(3)}`);
console.log(`→ 采用   az=${az(pick)}° el=${el(pick)}°  (${pick.x.toFixed(3)},${pick.y.toFixed(3)},${pick.z.toFixed(3)})`);

// 全图统计：最亮的是不是一颗小太阳 disc，还是一片云
const lums = [];
for (let i = 0; i < width * height; i++) {
  lums.push(0.2126 * h2f(halfData[i * 4]) + 0.7152 * h2f(halfData[i * 4 + 1]) + 0.0722 * h2f(halfData[i * 4 + 2]));
}
lums.sort((a, b) => a - b);
const q = (p) => lums[Math.floor(lums.length * p)].toFixed(3);
console.log(`\n亮度分位: p50=${q(0.5)} p90=${q(0.9)} p99=${q(0.99)} p99.9=${q(0.999)} max=${lums[lums.length - 1].toFixed(1)}`);
const over = (t) => (lums.filter(l => l > t).length / lums.length * 100).toFixed(3);
console.log(`>1.0: ${over(1)}%  >10: ${over(10)}%  >100: ${over(100)}%  >1000: ${over(1000)}%`);

// 太阳候选：统计有多少像素显著超过常规天空（>50）
const bright = [];
for (let i = 0; i < lums.length; i++) if (lums[i] > 50) bright.push(i);
console.log(`亮斑(>50) 像素数 ${bright.length} = ${(bright.length / lums.length * 100).toFixed(2)}%`);
if (bright.length) {
  const xs = bright.map(i => i % width), ys = bright.map(i => Math.floor(i / width));
  console.log(`  包围盒 x:[${Math.min(...xs)}-${Math.max(...xs)}] y:[${Math.min(...ys)}-${Math.max(...ys)}] 中心=(${Math.round(xs.reduce((a, b) => a + b) / xs.length)},${Math.round(ys.reduce((a, b) => a + b) / ys.length)})`);
}
