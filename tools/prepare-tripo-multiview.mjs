#!/usr/bin/env node
/** Crop the existing 3-view house sheet into clean, equally sized Tripo inputs. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const index = Number(process.argv[2] ?? 5);
if (!Number.isInteger(index) || index < 1 || index > 6) throw new Error('Usage: node tools/prepare-tripo-multiview.mjs <1..6>');
const images = [
  '01-贝壳屋-三视图-透明底.png', '02-辣条屋-三视图-透明底.png', '03-画室狗窝屋-三视图-透明底.png',
  '04-粉紫树屋-三视图-透明底.png', '05-海边帐篷屋-三视图-透明底.png', '06-相册书屋-三视图-透明底.png',
];
const input = path.resolve('art/island/图片', images[index - 1]);
const outputDir = path.resolve(`art/island/models/tripo-out/ch${String(index).padStart(2, '0')}-multiview-prepared`);
fs.mkdirSync(outputDir, { recursive: true });
const { width, height } = JSON.parse(execFileSync('magick', ['identify', '-format', '{"width":%w,"height":%h}', input], { encoding: 'utf8' }));
// The hand-authored sheets use three near-equal panels. Crop each with a small
// overlap to avoid cutting rooflines at panel boundaries; retain alpha as white.
const panel = Math.floor(width / 3);
for (const [view, col] of [['front', 0], ['right', 1], ['back', 2]]) {
  const overlap = Math.round(panel * 0.035);
  const left = Math.max(0, col * panel - (col === 0 ? 0 : overlap));
  const right = Math.min(width, (col + 1) * panel + (col === 2 ? 0 : overlap));
  const cropped = path.join(outputDir, `${view}-crop.png`);
  execFileSync('magick', [input, '-crop', `${right - left}x${height}+${left}+0`, '+repage', '-background', 'white', '-alpha', 'remove', '-alpha', 'off', '-fuzz', '5%', '-trim', '+repage', cropped]);
  execFileSync('magick', [cropped, '-resize', '1024x1024', '-background', 'white', '-gravity', 'center', '-extent', '1024x1024', path.join(outputDir, `${view}.png`)]);
  fs.unlinkSync(cropped);
}
console.log(outputDir);
