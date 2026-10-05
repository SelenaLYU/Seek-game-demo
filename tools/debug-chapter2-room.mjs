// 追加调试：可选交互不推进主线、重玩重置、第一关与记忆之岛冒烟、非 16:9 比例下的小卖部叠加。
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.env.ORIGIN ?? 'http://127.0.0.1:5177/';
const SHOTS = '/tmp/seek-debug-shots';
mkdirSync(SHOTS, { recursive: true });
const results = [];
const record = (step, ok, detail = '') => { results.push({ step, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`); };

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const errors = [];
const newPage = async (viewport) => {
  const page = await browser.newPage({ viewport });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', r => errors.push(`requestfailed ${r.url()}`));
  return page;
};

// ---------- 1. 房间：可选观察不推进主线 ----------
console.log('\n=== 1. 记忆房可选交互与重玩 ===');
const page = await newPage({ width: 1280, height: 720 });
const ZOOM = Math.min(1280 / 960, 720 / 540);
const S = (wx, wy) => [(wx - 480) * ZOOM + 640, (wy - 270) * ZOOM + 360];
const clickWorld = async (wx, wy) => { await page.mouse.click(...S(wx, wy)); await page.waitForTimeout(300); };
const roomState = () => page.evaluate(() => {
  const s = window.__game.scene.getScene('chapter2-room');
  return { stage: s.flow.stage, modal: !!s.modal, texts: s.modal ? s.modal.list.filter(o => o.type === 'Text').map(o => o.text) : [] };
});

await page.goto(`${BASE}?scene=chapter2-room`, { waitUntil: 'load' });
await page.waitForTimeout(2200);
const spots = [['三好学生奖状', 358, 116], ['作业旁的纸手工', 743, 418], ['兔子橡皮', 797, 422], ['旧糖罐', 885, 401], ['货架后的小伙伴', 616, 323]];
for (const [name, x, y] of spots) {
  await clickWorld(x, y);
  const st = await roomState();
  const expect = name.replace('三好学生奖状', '三好学生');
  const opened = st.modal && st.texts.some(t => t.includes(expect));
  record(`可选观察「${name}」可点开`, opened, opened ? '' : `modal=${st.modal} texts=${st.texts.slice(0, 4)}`);
  await clickWorld(804, 95);
  const after = await roomState();
  record(`可选观察「${name}」不推进主线`, after.stage === 'growth' && !after.modal, `stage=${after.stage}`);
}

// 走到作业阶段后按“重玩”，应回到门框
await clickWorld(30, 260); for (const y of [371, 278, 181]) await clickWorld(246, y); await clickWorld(804, 95);
await page.waitForTimeout(300);
let st = await roomState();
record('重玩前处于作业阶段', st.stage === 'homework', `stage=${st.stage}`);
await clickWorld(116, 473);
await page.waitForTimeout(900);
st = await roomState();
record('点「重玩」后回到门框重新开始', st.stage === 'growth', `stage=${st.stage}`);

// ---------- 2. 16:10 视口下的小卖部叠加 ----------
console.log('\n=== 2. 非 16:9 视口 ===');
const wide = await newPage({ width: 1280, height: 800 });
await wide.goto(`${BASE}?scene=chapter2-room&storeArt=1`, { waitUntil: 'load' });
await wide.waitForTimeout(2600);
const layout = await wide.evaluate(() => {
  const canvas = document.querySelector('canvas').getBoundingClientRect();
  const panel = document.getElementById('chapter2-room-art-preview')?.getBoundingClientRect();
  return { canvas: { w: Math.round(canvas.width), h: Math.round(canvas.height) }, panel: panel && { x: Math.round(panel.x), y: Math.round(panel.y), bottom: Math.round(panel.bottom) }, inner: { w: innerWidth, h: innerHeight } };
});
record('16:10 下画布铺满视口', layout.canvas.w === layout.inner.w && layout.canvas.h === layout.inner.h, JSON.stringify(layout));
record('16:10 下调试面板在视口内', !!layout.panel && layout.panel.bottom <= layout.inner.h, JSON.stringify(layout.panel));
await wide.screenshot({ path: `${SHOTS}/D1-room-art-16x10.png` });

// ---------- 3. 第一关与记忆之岛冒烟 ----------
console.log('\n=== 3. 第一关与记忆之岛 ===');
const l1 = await newPage({ width: 1280, height: 720 });
await l1.goto(`${BASE}?scene=forest`, { waitUntil: 'load' });
await l1.waitForTimeout(3000);
const before = await l1.evaluate(() => window.__game.scene.getScene('forest').player.view.x);
await l1.keyboard.down('ArrowRight');
await l1.waitForTimeout(1500);
await l1.keyboard.up('ArrowRight');
await l1.waitForTimeout(400);
const after = await l1.evaluate(() => window.__game.scene.getScene('forest').player.view.x);
record('第一关角色能跑动', after > before + 40, `x: ${Math.round(before)} → ${Math.round(after)}`);
await l1.screenshot({ path: `${SHOTS}/D2-forest.png` });

await l1.goto(`${BASE}?scene=room`, { waitUntil: 'load' });
await l1.waitForTimeout(2600);
const room1 = await l1.evaluate(() => {
  const s = window.__game.scene.getScene('room');
  const keys = ['room-bg', 'room-radio-art', 'room-book-art', 'room-frame-art', 'room-box-closed-art', 'room-box-open-art', 'room-battery-art', 'room-aquarium-art', 'room-wall-drawing-incomplete'];
  return { active: s.scene.isActive(), missing: keys.filter(k => !window.__game.textures.exists(k)) };
});
record('第一关记忆之房可加载且贴图齐全', room1.active === true && room1.missing.length === 0, room1.missing.length ? `缺贴图: ${room1.missing.join(', ')}` : '');
await l1.screenshot({ path: `${SHOTS}/D3-room-level1.png` });

await l1.goto(`${BASE}?scene=island`, { waitUntil: 'load' });
await l1.waitForTimeout(2600);
const island = await l1.evaluate(() => window.__game.scene.getScene('island').scene.isActive());
record('记忆之岛可加载', island === true);
await l1.screenshot({ path: `${SHOTS}/D4-island.png` });

console.log('\n=== console 错误 ===');
console.log(errors.length ? `发现 ${errors.length} 条:\n` + errors.slice(0, 10).join('\n') : '无');
const failed = results.filter(r => !r.ok).length;
console.log(`\n汇总: ${results.length - failed}/${results.length} 步通过，console 错误 ${errors.length} 条`);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
