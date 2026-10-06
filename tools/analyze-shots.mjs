/**
 * 截图像素体检：自动找「黑面 / 破洞 / 平涂」这三类症状。
 *
 * 为什么这一步必要：人眼盯 1280x800 的图容易把暗部看成阴影、把阴影看成破面。
 * 这里把症状写成可测的判据：
 *   - 黑面：一整块/mesh 面片接近纯黑（亮度 < 0.04），且面积不小；
 *   - 破洞：本该连续的区域里出现「背景色（海/天）」的单像素级空洞；
 *   - 接缝/平涂：大面积极均匀的色块（方差极低）说明没有光照层次。
 *
 * 用法：node tools/analyze-shots.mjs <dir> [globPart]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// --- 极简 PNG 解码（只支持 three 出图的 8bit RGB/RGBA + filter） ---
function decodePNG(buf) {
  let pos = 8, width = 0, height = 0, colorType = 0, bitDepth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('unsupported bitDepth ' + bitDepth);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error('unsupported colorType ' + colorType);
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
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); break;
        }
        default: throw new Error('bad filter ' + filter);
      }
      cur[x] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function analyze(path) {
  const img = decodePNG(readFileSync(path));
  const { width, height, channels, data } = img;
  let dark = 0, total = 0;
  const lumMap = new Float32Array(width * height);
  for (let i = 0, p = 0; i < width * height; i++, p += channels) {
    const l = lum(data[p], data[p + 1], data[p + 2]);
    lumMap[i] = l;
    total++;
    if (l < 0.04) dark++;
  }
  // 破洞：统计「海/天蓝」像素被非蓝像素包围的单点（简化：统计极小连通暗/亮异常）
  // 这里主要报黑面比例与大均匀块比例
  let uniformBlocks = 0, blockTotal = 0;
  const B = 16;
  for (let by = 0; by + B <= height; by += B) {
    for (let bx = 0; bx + B <= width; bx += B) {
      let mean = 0, sq = 0, n = 0;
      for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) {
        const l = lumMap[y * width + x]; mean += l; n++;
      }
      mean /= n;
      for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) {
        const l = lumMap[y * width + x]; sq += (l - mean) ** 2;
      }
      const sd = Math.sqrt(sq / n);
      blockTotal++;
      // 极暗且极均匀 = 疑似黑面/平涂
      if (mean < 0.06 && sd < 0.02) uniformBlocks++;
    }
  }
  return { path: path.split('/').slice(-2).join('/'), darkPct: (dark / total * 100), uniformPct: (uniformBlocks / blockTotal * 100) };
}

const dir = process.argv[2] ?? 'screenshots/island';
const part = process.argv[3] ?? '';
const files = readdirSync(dir).filter(f => part === '' || f.includes(part)).filter(f => /\.(png|jpg)$/i.test(f));
console.log(`dir=${dir}  files=${files.length}`);
console.log('file'.padEnd(34), 'blackPct'.padStart(10), 'flatBlocksPct'.padStart(14));
const suspects = [];
for (const f of files) {
  let r;
  try { r = analyze(`${dir}/${f}`); } catch (e) { continue; }
  console.log(r.path.padEnd(34), r.darkPct.toFixed(3).padStart(10), r.uniformPct.toFixed(2).padStart(14));
  if (r.darkPct > 1.0 || r.uniformPct > 8) suspects.push(r);
}
console.log('\n可疑（黑面>1% 或 平涂块>8%）:');
if (!suspects.length) console.log('  无');
for (const s of suspects) console.log(`  ${s.path}  black=${s.darkPct.toFixed(2)}%  flat=${s.uniformPct.toFixed(2)}%`);
