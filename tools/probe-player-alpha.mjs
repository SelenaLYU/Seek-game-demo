#!/usr/bin/env node
/**
 * 诊断／验收脚本：落地压扁补间会不会误杀「重生淡入」，把角色永久卡在半透明。
 *
 * 现象：死亡回到检查点后，角色一直半透明（alpha 停在 0.5~0.9 之间的某个值），
 * 直到下一次死亡才恢复。根因与修法见 decisions/2026-10-03-player-alpha-tween-isolation.md。
 *
 * 用法：
 *   node tools/probe-player-alpha.mjs [url] [scene] [gapMs]
 *   默认 http://localhost:5173 / chapter2 / 600
 *
 * 前置：本地 dev server 已启动；Playwright 可用（会依次尝试几个常见安装位置）。
 * 输出最后一行是 PASS / FAIL；FAIL 表示 alpha 没回到 1（即问题仍存在）。
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const [url = 'http://localhost:5173', scene = 'chapter2', gapMs = '600'] = process.argv.slice(2);

async function loadPlaywright() {
  const candidates = [
    'playwright',
    '/Users/simon/node_modules/playwright/index.mjs',
    new URL('../../node_modules/playwright/index.mjs', import.meta.url).pathname,
  ];
  for (const candidate of candidates) {
    try {
      if (candidate.startsWith('/') && !existsSync(candidate)) continue;
      return await import(candidate.startsWith('/') ? candidate : candidate);
    } catch { /* 试下一个 */ }
  }
  throw new Error('找不到 Playwright：请先 npm i -D playwright 或设置可用的安装路径');
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', error => console.error('[页面异常]', error.message.slice(0, 160)));

await page.goto(`${url}/?scene=${scene}`);
await page.waitForFunction(key => globalThis.__game?.scene.isActive(key), scene, { timeout: 25000 });
await page.waitForTimeout(2000);

const result = await page.evaluate(async ([key, waitMs]) => {
  const gameScene = globalThis.__game.scene.getScene(key);
  if (typeof gameScene.restartFromCheckpoint !== 'function') {
    return { skipped: `场景 ${key} 没有 restartFromCheckpoint，本脚本只适用于有检查点重生的场景` };
  }
  const timeline = [];
  const read = tag => timeline.push([tag, Number(gameScene.player.view.alpha.toFixed(2))]);
  read('死亡前');
  gameScene.restartFromCheckpoint('probe-player-alpha');
  await new Promise(resolve => setTimeout(resolve, waitMs)); // 落在淡入窗口里
  read('淡入中');
  gameScene.player.squash(1.12, 0.88);                     // 触发压扁：旧代码在这里 killTweensOf(view)
  // 隔离：不让角色再掉下去触发第二次死亡（那会 setAlpha(1) 掩盖问题）
  gameScene.player.view.body.setAllowGravity(false);
  gameScene.player.view.body.setVelocity(0, 0);
  for (const step of [200, 400, 400, 400]) {
    await new Promise(resolve => setTimeout(resolve, step));
    read(`+${step}ms`);
  }
  return { timeline, finalAlpha: gameScene.player.view.alpha };
}, [scene, Number(gapMs)]);

await browser.close();

if (result.skipped) {
  console.log(result.skipped);
  process.exit(0);
}
console.log(`观察目标：${url}/?scene=${scene}`);
for (const [tag, alpha] of result.timeline) console.log(`  ${tag.padEnd(8)} alpha=${alpha.toFixed(2)}`);
const ok = result.finalAlpha >= 0.99;
console.log(ok
  ? 'PASS —— 压扁后 alpha 回到 1，重生淡入没有被误杀'
  : `FAIL —— alpha 停在 ${result.finalAlpha.toFixed(2)}，重生淡入被压扁补间杀掉了`);
process.exit(ok ? 0 : 1);
