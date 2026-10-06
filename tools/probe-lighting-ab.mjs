/**
 * 光照 A/B：借 MemoryIsland 的 ?debugView=1 拿到 renderer/scene，在真实管线上逐组改
 * toneMappingExposure / environmentIntensity / 主光强度 / 主光方向，每组立刻截图并量像素。
 *
 * 指标（只统计岛屿区域 x330-970 / y300-780，裁掉天空/海/UI，免得背景把统计带偏）：
 *   blown%   过曝（亮度>=0.98）——烧白、高光丢细节
 *   dead%    死黑（亮度<=0.024）——暗部糊成一团、读不出形体
 *   contrast p95-p5 —— 最能反映「有没有形」的指标（坡面/屋檐亮部与暗部之差）
 *   mean     平均亮度
 *
 * 用法：node tools/probe-lighting-ab.mjs [--origin=http://localhost:5174]
 */
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';

const ORIGIN = process.argv.find(a => a.startsWith('--origin='))?.slice(9) ?? 'http://localhost:5174';

const CASES = [
  { name: 'baseline', exp: 1.32, env: 0.45, sun: 2.8 },
  { name: 'sun5', exp: 1.32, env: 0.45, sun: 5.0 },
  { name: 'sun5-env25', exp: 1.32, env: 0.25, sun: 5.0 },
  { name: 'sun5-hemi0', exp: 1.32, env: 0.45, sun: 5.0, hemi: 0.0 },
];

const METRICS = `
from PIL import Image
import glob, os
def stats(path):
    im=Image.open(path).convert('RGB').crop((330,300,970,780))
    px=list(im.getdata()); n=len(px)
    lum=sorted((0.2126*r+0.7152*g+0.0722*b)/255 for r,g,b in px)
    return (sum(1 for l in lum if l>=0.98)/n*100,
            sum(1 for l in lum if l<=0.024)/n*100,
            sum(lum)/n,
            lum[int(n*0.95)]-lum[int(n*0.05)])
for f in sorted(glob.glob('screenshots/island/lighting/ab-*.png')):
    b,d,m,c=stats(f)
    print('%-14s blown%6.3f  dead%6.3f  mean%6.3f  contrast%7.3f'%(os.path.basename(f)[3:-4],b,d,m,c))
`;

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });

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
  } catch { /* 超时也继续 */ }
  await page.waitForTimeout(1500);

  const applied = await page.evaluate((case_) => {
    const { scene, renderer, camera } = window.__islandView;
    renderer.toneMappingExposure = case_.exp;
    scene.environmentIntensity = case_.env;
    const sun = scene.children.find(o => o.isDirectionalLight && o.castShadow);
    sun.intensity = case_.sun;
    if (case_.hemi !== undefined) scene.traverse(o => { if (o.isHemisphereLight) o.intensity = case_.hemi; });
    renderer.render(scene, camera);
    return { exp: renderer.toneMappingExposure, env: scene.environmentIntensity, sun: sun.intensity };
  }, c);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `screenshots/island/lighting/ab-${c.name}.png` });
  console.log(`${c.name.padEnd(12)} exp=${applied.exp} env=${applied.env} sun=${applied.sun}`);
  await page.close();
}

const { execSync } = await import('node:child_process');
console.log('\n' + execSync(`python3 -c ${JSON.stringify(METRICS)}`).toString());
await browser.close();
