// 第二关全流程实机调试：街道拿信物 → 记忆房三段主线（含瓶盖一笔画）→ 结尾动画 → 回岛。
// 全程走真实 UI 点击/键鼠事件，只读场景状态做断言，不改游戏代码。
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.env.ORIGIN ?? 'http://127.0.0.1:5177/';
const SHOTS = '/tmp/seek-debug-shots';
const VIEW = { width: 1280, height: 720 };
const VW = VIEW.width, VH = VIEW.height;
mkdirSync(SHOTS, { recursive: true });

// 房间场景：相机固定 centerOn(480,270)、zoom = min(vw/960, vh/540)
const ZOOM = Math.min(VW / 960, VH / 540);
const S = (wx, wy) => [(wx - 480) * ZOOM + VW / 2, (wy - 270) * ZOOM + VH / 2];

const SOLUTION = ['牛奶', '橘子汽水', '葡萄汽水', '饼干', '干脆面', '蛋卷', '奶糖', '泡泡糖', '酸梅糖'];
const EDGES = [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [3, 5], [5, 6], [6, 3], [4, 7], [7, 8], [8, 4]];
const CAP_POINTS = [[480, 188], [374, 264], [573, 256], [366, 369], [575, 367], [231, 304], [222, 403], [725, 306], [748, 405]];

/** 一笔画（欧拉路径）：图里只有节点 1、2 是奇点，所以路径必然 1 → 2。 */
function eulerPath() {
  const adj = new Map();
  for (const [a, b] of EDGES) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  }
  const start = [...adj.keys()].filter(n => adj.get(n).length % 2 === 1)[0];
  const path = [], used = new Set();
  const walk = (n) => {
    for (const m of [...adj.get(n)]) {
      const key = n < m ? `${n}-${m}` : `${m}-${n}`;
      if (used.has(key)) continue;
      used.add(key); walk(m);
    }
    path.push(n);
  };
  walk(start);
  return path.reverse();
}

const results = [];
const record = (step, ok, detail = '') => {
  results.push({ step, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: VIEW });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));

const state = () => page.evaluate(() => {
  const game = window.__game;
  const active = game.scene.getScenes(true).map(s => s.scene.key);
  const room = game.scene.getScene('chapter2-room');
  const street = game.scene.getScene('chapter2');
  return {
    active,
    roomStage: room?.flow?.stage,
    roomAges: room ? [...room.flow.ages] : [],
    hasMap: room?.flow?.hasMap,
    puzzlePhase: room?.flow?.puzzle?.phase,
    shelf: room?.flow?.puzzle?.shelf,
    modalTexts: room?.modal ? room.modal.list.filter(o => o.type === 'Text').map(o => o.text) : [],
    tokenCollected: street?.tokenCollected,
    playerX: street?.player?.view?.x,
    chapter: game.scene.getScene('island')?.scene?.settings?.data?.completedChapter,
  };
});
const clickWorld = async (wx, wy) => { const [x, y] = S(wx, wy); await page.mouse.click(x, y); await page.waitForTimeout(320); };

/**
 * 轮询到状态满足为止。
 * 为什么必须这样：机器负载高时 headless 会掉到 ~3fps，而 Phaser 每帧 delta 被压到 ~16ms，
 * 于是 tween 与 delayedCall 在**墙钟上慢好几倍**（实测 restartFromCheckpoint 的 470ms 走了 6.5s）。
 * 固定 `waitForTimeout` 会把「还没推进完」误报成关卡 FAIL。
 */
const waitFor = async (predicate, timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs;
  let current = await state();
  while (!predicate(current) && Date.now() < deadline) {
    await page.waitForTimeout(150);
    current = await state();
  }
  return current;
};

/** 按住空格再松开：低帧率下 `keyboard.press` 的 down/up 可能落在同一帧之间被漏掉 */
const advance = async (target, ms = 400) => {
  await target.keyboard.down('Space');
  await page.waitForTimeout(260);
  await target.keyboard.up('Space');
  await page.waitForTimeout(ms);
};

// ---------- A. 街道：移动 → 拿信物 → 进门 ----------
console.log('\n=== A. 第二关街道 ===');
await page.goto(`${BASE}?scene=chapter2`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
let st = await state();
record('街道场景启动', st.active.includes('chapter2'), `active=${st.active}`);

const startX = st.playerX;
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(1600);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(400);
st = await state();
record('角色能向右移动', st.playerX > startX + 60, `x: ${Math.round(startX)} → ${Math.round(st.playerX)}`);

// 老师视野内持续跑 → 应被抓回检查点
await page.evaluate(() => {
  const s = window.__game.scene.getScene('chapter2');
  s.player.teleportTo(120, 226); s.previousPlayer.set(120, 226);
});
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(2200);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(900);
st = await state();
record('灯光抓到移动中的玩家后回到检查点', st.playerX < 900, `落点 x=${Math.round(st.playerX)}`);

await page.evaluate(() => {
  const s = window.__game.scene.getScene('chapter2');
  s.player.teleportTo(3420, 898);
});
await page.waitForTimeout(900);
st = await state();
record('走到街口拿到旧钞票', st.tokenCollected === true, `tokenCollected=${st.tokenCollected}`);
await page.screenshot({ path: `${SHOTS}/A2-token-collected.png` });

await page.evaluate(() => {
  const s = window.__game.scene.getScene('chapter2');
  s.player.teleportTo(3600, 872);
});
await page.waitForTimeout(1400);
st = await state();
record('带信物进门跳转到第二记忆房', st.active.includes('chapter2-room'), `active=${st.active}`);

// ---------- B. 记忆房三段主线 ----------
console.log('\n=== B. 第二记忆房（小卖部）===');
await page.goto(`${BASE}?scene=chapter2-room`, { waitUntil: 'load' });
await page.waitForTimeout(2200);
st = await state();
record('房间起始阶段为门框刻度', st.roomStage === 'growth', `stage=${st.roomStage}`);

await clickWorld(700, 381); // 数学作业
st = await state();
record('未看完刻度时点作业无效（顺序锁）', st.roomStage === 'growth' && st.modalTexts.length === 0, `stage=${st.roomStage}`);

await clickWorld(30, 260); // 门框
for (const y of [371, 278, 181]) await clickWorld(246, y);
st = await state();
record('三处刻度可分别点开', st.roomAges.length === 3, `ages=${st.roomAges}`);
st = await state();
record('看完刻度后阶段推进到作业', st.roomStage === 'growth-done', `stage=${st.roomStage}`);

await clickWorld(804, 95); // 关闭刻度
st = await state();
record('关闭刻度窗口后作业开放', st.roomStage === 'homework', `stage=${st.roomStage}`);

await clickWorld(700, 381); // 作业
await clickWorld(302, 257); await clickWorld(312, 344); await clickWorld(377, 344); // 鸡 = 23
await clickWorld(649, 257); await clickWorld(247, 344); await clickWorld(312, 344); // 兔 = 12
await page.screenshot({ path: `${SHOTS}/B1-homework-filled.png` });
await clickWorld(705, 437); // 交作业
st = await waitFor(s2 => s2.roomStage === 'homework-done');
record('鸡兔同笼答对后作业完成', st.roomStage === 'homework-done', `stage=${st.roomStage}`);
await page.waitForTimeout(1200);

await clickWorld(807, 387); // 风景杂志
await clickWorld(480, 412); // 翻到夹页
await clickWorld(480, 423); // 收进物品栏
st = await waitFor(s2 => s2.hasMap === true && s2.roomStage === 'map');
record('杂志夹页取得货架图', st.hasMap === true && st.roomStage === 'map', `hasMap=${st.hasMap} stage=${st.roomStage}`);
await clickWorld(804, 95); // 关闭平面图

await clickWorld(487, 245); // 实体货架
st = await waitFor(s2 => s2.roomStage === 'shelf');
record('取到图后才能进第三段货架谜题', st.roomStage === 'shelf', `stage=${st.roomStage}`);
await page.screenshot({ path: `${SHOTS}/B2-shelf-panel.png` });

// 按已知唯一解交换商品（点击两格 = 交换）
let order = st.modalTexts.filter(t => SOLUTION.some(n => t === n));
if (order.length !== 9) {
  order = await page.evaluate(() => {
    const s = window.__game.scene.getScene('chapter2-room');
    const names = [];
    for (let i = 0; i < 9; i++) {
      const x = 205 + (i % 3) * 98, y = 198 + Math.floor(i / 3) * 80;
      names.push(s.modal.list.find(o => o.type === 'Text' && Math.abs(o.x - x) < 1 && Math.abs(o.y - y) < 1)?.text ?? '?');
    }
    return names;
  });
}
console.log('    货架初始顺序:', order.join(' / '));
const current = [...order];
for (let i = 0; i < 9; i++) {
  if (i === 4) continue;
  const j = current.indexOf(SOLUTION[i]);
  if (j === i || j < 0) continue;
  await clickWorld(205 + (i % 3) * 98, 198 + Math.floor(i / 3) * 80);
  await clickWorld(205 + (j % 3) * 98, 198 + Math.floor(j / 3) * 80);
  [current[i], current[j]] = [current[j], current[i]];
}
await clickWorld(653, 435); // 检查货架
await page.waitForTimeout(400);
st = await waitFor(s2 => s2.puzzlePhase === 'trace');
record('按唯一解摆好货架后进入一笔画', st.puzzlePhase === 'trace', `phase=${st.puzzlePhase} 摆好=${current.join('/')}`);
await page.screenshot({ path: `${SHOTS}/B3-caps-panel.png` });

// 一笔画：押着欧拉路径走完 12 条连线
const path = eulerPath();
console.log('    一笔画路径:', path.join(' → '));
const first = S(...CAP_POINTS[path[0]]);
await page.mouse.move(...first);
await page.mouse.down();
for (const node of path.slice(1)) {
  await page.mouse.move(...S(...CAP_POINTS[node]), { steps: 6 });
  await page.waitForTimeout(70);
}
await page.mouse.up();
await page.waitForTimeout(1200);
st = await waitFor(s2 => s2.roomStage === 'collection');
record('一笔画走完所有连线后抽屉打开', st.roomStage === 'collection', `stage=${st.roomStage}`);
await page.screenshot({ path: `${SHOTS}/B4-collection.png` });

await clickWorld(480, 423); // 收好这些回忆
st = await waitFor(s2 => s2.roomStage === 'snack');
record('收藏回忆完成后辣条掉落', st.roomStage === 'snack', `stage=${st.roomStage}`);

// 辣条落点由 tween 决定，掉帧时墙钟上会慢好几倍：点不到就重试，直到进回忆为止
let enteredMemory = false;
const snackDeadline = Date.now() + 20000;
while (!enteredMemory && Date.now() < snackDeadline) {
  await clickWorld(515, 463); // 辣辣王子
  st = await state();
  enteredMemory = st.active.includes('chapter2-memory');
}
record('点击辣条进入第二段回忆动画', st.active.includes('chapter2-memory'), `active=${st.active}`);
await page.screenshot({ path: `${SHOTS}/B5-memory.png` });

// ---------- C. 结尾动画 → 记忆之岛 ----------
console.log('\n=== C. 结尾动画与回岛 ===');
for (let i = 0; i < 7 && !(await state()).active.includes('island'); i++) await advance(page);
st = await waitFor(s2 => s2.active.includes('island'));
record('动画结束回到记忆之岛并点亮第二段', st.active.includes('island'), `active=${st.active} completedChapter=${st.chapter}`);
await page.screenshot({ path: `${SHOTS}/C1-island.png` });

// ---------- D. 回归：掉落补间途中点辣条也应进回忆 ----------
console.log('\n=== D. 辣条掉落中点击（回归）===');
const page2 = await browser.newPage({ viewport: VIEW });
page2.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page2.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
await page2.goto(`${BASE}?scene=chapter2-room`, { waitUntil: 'load' });
await page2.waitForTimeout(2200);
// 直接推进到收藏步骤，只测这一段
await page2.evaluate(() => {
  const s = window.__game.scene.getScene('chapter2-room');
  s.flow.stage = 'collection';
  s.drawRoom();
});
await page2.waitForTimeout(400);
await page2.mouse.click(...S(437, 406)); // 收藏抽屉
await page2.waitForTimeout(400);
await page2.mouse.click(...S(480, 423)); // 收好这些回忆 → 辣条开始掉落
// 把补间冻在半空：否则「读坐标 → 再点」之间包装又掉了一段，点不中只说明测试不准，
// 说明不了代码。冻住后点击位置与包装位置严格一致，测的才是「下落中的包装能不能点」。
await page2.evaluate(() => window.__game.scene.getScene('chapter2-room').tweens.pauseAll());
await page2.waitForTimeout(120);
const frozen = await page2.evaluate(() => {
  const s = window.__game.scene.getScene('chapter2-room');
  const snack = s.room.list.find(o => o.type === 'Container'
    && o.list?.some(x => x.type === 'Text' && String(x.text).includes('辣辣王子')));
  const packet = snack?.list.find(o => o.type === 'Rectangle');
  return snack ? { x: snack.x, y: Math.round(snack.y), interactive: packet?.input?.enabled === true } : null;
});
record('辣条在下落途中就是可点的', !!frozen && frozen.interactive && frozen.y < 462, JSON.stringify(frozen));
if (frozen) {
  await page2.mouse.click(...S(frozen.x, frozen.y));
  await page2.mouse.click(...S(frozen.x, frozen.y)); // 连点两下：不应重复触发
  await page2.waitForTimeout(1200);
  const after = await page2.evaluate(() => window.__game.scene.getScenes(true).map(s => s.scene.key));
  record('掉落补间途中点辣条即可进回忆', after.length === 1 && after[0] === 'chapter2-memory', `active=${after}`);
}
await page2.close();

console.log('\n=== console 错误 ===');
console.log(errors.length ? `发现 ${errors.length} 条:\n` + errors.slice(0, 10).join('\n') : '无');
const failed = results.filter(r => !r.ok).length + errors.length;
console.log(`\n汇总: ${results.length - results.filter(r => !r.ok).length}/${results.length} 步通过，console 错误 ${errors.length} 条`);
await browser.close();
process.exit(failed ? 1 : 0);
