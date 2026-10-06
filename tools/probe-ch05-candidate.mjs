// CH05 候选模型评审：默认隐藏（overview-off）与 ?ch05Show=1 显示（overview-on）各拍一张。
// 不写死「N/N」：模型清单会变（六栋 + 主角 + 四段动画，带候选是 12），只等「已载入的分子 == 分母」。
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('screenshots/island/ch05-candidate', { recursive: true });
const SETTLED = () => {
  const text = document.querySelector('.asset-status')?.textContent ?? '';
  const match = text.match(/(\d+)\/(\d+) 已载入/);
  return !!match && match[1] === match[2];
};
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', error => errors.push(String(error)));
for (const [suffix, shot] of [['', 'overview-off.png'], ['&ch05Show=1', 'overview-on.png']]) {
  await page.goto(`http://localhost:5173/?scene=island&islandPreview=1&ch05Candidate=1${suffix}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(SETTLED, undefined, { timeout: 90000 });
  await page.screenshot({ path: `screenshots/island/ch05-candidate/${shot}` });
}
console.log(JSON.stringify({ status: (await page.locator('.asset-status').textContent()).trim(), errors }));
await browser.close();
