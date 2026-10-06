// 第二关街道稳健性：四个检查点能否正常落脚、掉出路面是否回到检查点、没拿信物时门是否拦住。
//
// 用法：ORIGIN=http://localhost:5179/ node tools/debug-chapter2-street.mjs（默认 5177）
// 两个坑：① 站定判定别用 body.blocked.down（只在分离那一帧为真，静止时会抖），
// 用「脚底落在该层走道面附近」；② 一切计时相关的断言都必须轮询——机器负载高时
// headless 会掉到 ~3fps，Phaser 每帧 delta 被压到 ~16ms，470ms 的 delayedCall
// 在墙钟上要 6–10 秒）。
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.env.ORIGIN ?? 'http://127.0.0.1:5177/';
const SHOTS = '/tmp/seek-debug-shots';
mkdirSync(SHOTS, { recursive: true });
const results = [];
const record = (step, ok, detail = '') => { results.push({ step, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`); };

const CHECKPOINTS = [
  ['学校后墙', 110, 212],
  ['骑楼二层', 1510, 566],
  ['骑楼底层', 485, 776],
  ['长街中段', 2100, 866],
];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));

const street = () => page.evaluate(() => {
  const s = window.__game.scene.getScene('chapter2');
  const body = s.player.view.body;
  return {
    x: Math.round(s.player.view.x), y: Math.round(s.player.view.y),
    blockedDown: body.blocked.down,
    // 站定判据：headless 掉帧时 1200ms 可能只推进一两帧，而且 body.blocked.down 只在分离那一帧为真、
    // 静止时会抖（实测学校后墙落点 y=225 = 该层站立高度 224±1 却被判 FAIL）。
    // 用「脚底落在该层走道面附近」当判据，blockedDown 仅作参考。
    standing: (() => {
      const floorTop = [260, 610, 820, 910].find(top => Math.abs(s.player.view.y - (top - 36)) <= 6);
      return floorTop !== undefined;
    })(),
    checkpoint: s.checkpointIndex,
    restarting: s.restarting, tokenCollected: s.tokenCollected, leaving: s.leaving,
    hint: s.title?.text ?? '', active: s.scene.isActive(),
  };
});

await page.goto(`${BASE}?scene=chapter2`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

console.log('=== 四个检查点落点 ===');
for (const [label, x, y] of CHECKPOINTS) {
  await page.evaluate(([x, y]) => {
    const s = window.__game.scene.getScene('chapter2');
    s.player.teleportTo(x, y);
  }, [x, y]);
  await page.evaluate(([x, y]) => {
    const s = window.__game.scene.getScene('chapter2');
    s.previousPlayer.set(x, y);
  }, [x, y]);
  // 轮询到真的站定：掉帧时固定等待不够
  let st = await street();
  const deadline = Date.now() + 4000;
  while (!st.standing && Date.now() < deadline) {
    await page.waitForTimeout(150);
    st = await street();
  }
  record(`${label} 落点能站稳`, st.standing && !st.restarting, `x=${st.x} y=${st.y} 站定=${st.standing} blockedDown=${st.blockedDown}`);
}

console.log('\n=== 掉出路面 / 掉进空区 ===');
await page.evaluate(() => {
  const s = window.__game.scene.getScene('chapter2');
  s.checkpointIndex = 2;
  s.player.teleportTo(700, 1240); // 世界高度 1100，直接放到路面下方
});
// 轮询而不是固定等待：掉帧环境下 Phaser 每帧 delta 被压到 ~16ms，
// restfromCheckpoint 的 470ms delayedCall 在墙钟上要 6–10 秒才走完（实测 6.5s）。
let st = await street();
const settleDeadline = Date.now() + 15000;
while ((st.restarting || st.y >= 1100) && Date.now() < settleDeadline) {
  await page.waitForTimeout(300);
  st = await street();
}
record('掉到路面下方会回到检查点', st.restarting === false && st.y < 1100 && st.checkpoint >= 2, `x=${st.x} y=${st.y} checkpoint=${st.checkpoint}`);

console.log('\n=== 没拿信物时的门 ===');
await page.evaluate(() => {
  const s = window.__game.scene.getScene('chapter2');
  s.player.teleportTo(3600, 872);
});
await page.waitForTimeout(1400);
st = await street();
record('没拿旧钞票时进不了门', st.active === true && st.leaving !== true, `active=${st.active} hint="${st.hint}"`);
await page.screenshot({ path: `${SHOTS}/E1-door-locked.png` });

console.log('\n=== 拿到信物后失败判定应停用 ===');
await page.evaluate(() => {
  const s = window.__game.scene.getScene('chapter2');
  s.player.teleportTo(3420, 898);
});
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const s = window.__game.scene.getScene('chapter2');
  s.player.teleportTo(700, 900); // 拿完信物再回到灯光区乱跑
});
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(1800);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(400);
st = await street();
record('拿到信物后不再被老师抓', st.restarting === false && st.tokenCollected === true, `x=${st.x} restarting=${st.restarting}`);

console.log('\n=== console 错误 ===');
console.log(errors.length ? errors.slice(0, 10).join('\n') : '无');
const failed = results.filter(r => !r.ok).length;
console.log(`\n汇总: ${results.length - failed}/${results.length} 步通过，console 错误 ${errors.length} 条`);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
