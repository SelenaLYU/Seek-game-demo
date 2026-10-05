/**
 * 记忆之岛散布穿模探针：冷启动岛屿，抓审计日志并截图，判断「不许穿模」这条是否成立。
 *
 * 为什么是单独一个探针而不是看 npm test：
 *   `tests/islandScatter.test.mjs` 验证的是纯函数（规则没被改松），
 *   这里验证的是**真实场景里摆出来的那一批**——建筑 GLB 的尺寸、obstacles、
 *   道路折线都来自运行时，纯函数测试用的是手写的假 context。
 *   两者是互补的：一个管规则，一个管接线。
 *
 * 用法：node tools/probe-island-scatter.mjs [--headed]
 */
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:5173';
const HEADED = process.argv.includes('--headed');
const AUDIT_OK = /散布穿模审计通过/;
const AUDIT_FAIL = /散布穿模审计未通过/;

const browser = await chromium.launch({
  headless: !HEADED,
  args: ['--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', async message => {
  // 审计失败时参数里是对象数组，先 take 出来存好，退出时能打印具体是哪两件互穿
  let args = [];
  try {
    args = await Promise.all(message.args().map(arg => arg.jsonValue().catch(() => undefined)));
  } catch { /* 参数已 release，忽略 */ }
  logs.push({ type: message.type(), text: message.text(), args });
});
page.on('pageerror', error => logs.push({ type: 'pageerror', text: String(error) }));

await page.goto(`${ORIGIN}/?scene=island`, { waitUntil: 'domcontentloaded' });
// 审计在散布完成后立刻打，等模型就绪（资产结算）即可保证它已经跑过
await page.waitForFunction(
  () => /3D 模型 (\d+)\/\d+ 已载入/.test(document.querySelector('.memory-island .asset-status')?.textContent ?? ''),
  null,
  { timeout: 120_000 },
).catch(() => {});
await page.waitForTimeout(3500);

const auditOk = logs.some(l => AUDIT_OK.test(l.text));
const auditFail = logs.find(l => AUDIT_FAIL.test(l.text));
const consoleErrors = logs.filter(l => l.type === 'error' || l.type === 'pageerror');

const shot = 'screenshots/island/scatter-overview.png';
await page.screenshot({ path: shot }).catch(() => {});

await browser.close();

console.log(`ORIGIN ${ORIGIN}`);
console.log(`散布穿模审计: ${auditOk ? '通过' : auditFail ? '未通过' : '（没抓到审计日志）'}`);
if (auditFail) {
  // 具体是哪两件互穿，只有拿 console 的 args 才拿得到
  for (const arg of auditFail.args ?? []) console.log(`  ${JSON.stringify(arg)}`);
}
const scatterLog = logs.find(l => AUDIT_OK.test(l.text));
if (scatterLog) {
  const payload = await Promise.resolve(scatterLog.text);
  console.log(`  落地: ${payload.match(/\{.*\}/)?.[0] ?? ''}`);
}
console.log(`console errors: ${consoleErrors.length}`);
for (const entry of consoleErrors.slice(0, 5)) console.log(`  ${entry.type}: ${entry.text.slice(0, 300)}`);

const failed = !auditOk || consoleErrors.length > 0;
if (failed) process.exitCode = 1;
