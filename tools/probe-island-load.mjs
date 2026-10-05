/**
 * 记忆之岛加载探针：量「进入岛屿到全部 3D 模型就绪」的真实时间与传输字节。
 *
 * 为什么单独做一个：岛屿是全流程里最重的入口（public/island-models 约 47MB），
 * 玩家在第一关/第二关结束后各回岛一次。只靠 build 体积看不出首屏等待，
 * 必须量到「模型 x/11 已载入」那一刻，才有可比较的数字。
 *
 * 用法：
 *   node tools/probe-island-load.mjs                     # dev server :5173
 *   ORIGIN=http://localhost:4173 node tools/probe-island-load.mjs   # 生产产物
 *   node tools/probe-island-load.mjs --runs=3 --headed
 */
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:5173';
const RUNS = Number(process.argv.find(a => a.startsWith('--runs='))?.slice(7) ?? 3);
const HEADED = process.argv.includes('--headed');
const SETTLED = /^3D 模型 (\d+)\/(\d+) 已载入/;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

async function runOnce(browser, index) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(String(error)));

  const started = Date.now();
  await page.goto(`${ORIGIN}/?scene=island`, { waitUntil: 'domcontentloaded' });

  // 等 asset-status 报告全部就绪（或失败），超时也返回已观测到的部分。
  let settledText = '';
  try {
    await page.waitForFunction((pattern) => {
      const el = document.querySelector('.memory-island .asset-status');
      const match = el?.textContent?.match(new RegExp(pattern));
      return match ? Number(match[1]) === Number(match[2]) : false;
    }, SETTLED.source, { timeout: 120_000 });
    settledText = await page.textContent('.memory-island .asset-status');
  } catch {
    settledText = (await page.textContent('.memory-island .asset-status').catch(() => '')) ?? '(未就绪)';
  }
  const settledMs = Date.now() - started;

  const resources = await page.evaluate(() => performance.getEntriesByType('resource')
    .map(entry => ({
      name: entry.name,
      bytes: Math.round(entry.transferSize || entry.encodedBodySize || 0),
      ms: Math.round(entry.duration),
    })));
  const modelResources = resources.filter(r => r.name.includes('/island-models/'));
  const totalModelBytes = modelResources.reduce((sum, r) => sum + r.bytes, 0);

  const canvasPresent = await page.locator('.memory-island canvas').count() > 0;
  await page.screenshot({ path: `screenshots/island/load-probe-${index}.png` }).catch(() => {});
  await page.close();

  return {
    settledMs,
    settledText,
    canvasPresent,
    totalModelBytes,
    modelCount: modelResources.length,
    models: modelResources.sort((a, b) => b.bytes - a.bytes),
    allBytes: resources.reduce((sum, r) => sum + r.bytes, 0),
    errors,
  };
}

const browser = await chromium.launch({
  headless: !HEADED,
  args: ['--enable-unsafe-swiftshader'],
});
const runs = [];
for (let i = 0; i < RUNS; i++) {
  const result = await runOnce(browser, i + 1);
  runs.push(result);
  console.log(`run ${i + 1}: ${result.settledMs}ms · ${(result.totalModelBytes / 1048576).toFixed(1)}MB models · ${result.settledText}`);
}
await browser.close();

const first = runs[0];
console.log(`\nORIGIN ${ORIGIN} · ${RUNS} runs`);
console.log(`模型就绪中位数: ${median(runs.map(r => r.settledMs))}ms`);
console.log(`模型传输中位数: ${(median(runs.map(r => r.totalModelBytes)) / 1048576).toFixed(1)}MB (${median(runs.map(r => r.modelCount))} 个文件)`);
console.log(`页面总传输中位数: ${(median(runs.map(r => r.allBytes)) / 1048576).toFixed(1)}MB`);
console.log('\n最重的模型:');
for (const model of first.models.slice(0, 8)) {
  console.log(`  ${(model.bytes / 1048576).toFixed(2)}MB  ${model.name.replace(ORIGIN, '').replace(/^.*island-models\//, '')}`);
}
const failed = runs.flatMap(r => r.errors);
if (failed.length) console.log(`\nconsole errors (${failed.length}):\n${failed.slice(0, 10).join('\n')}`);
else console.log('\nconsole errors: 0');
