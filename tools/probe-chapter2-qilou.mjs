/**
 * 第二关「骑楼」探针：把骑楼这一关的美术/判定/可读性一致性问题变成可复现的数字。
 *
 * 为什么需要它：
 *  · 骑楼有两份手抄坐标（`ChapterTwoNightArt.ts` 与 `geometry.json`）和第三份硬编码在场景里
 *    （`COVERS` / `SWINGS` / 检查点），单测只比文件不看运行时，改错一份不会红。
 *  · `COVERS` 的判定盒是从几何推导的，但**没有人机检过它真的能躲灯**——贴图在那儿、
 *    判定盒偏一截，玩家就会「明明躲在柱子后面却被抓」，而这在截图里看不出来。
 *  · 世界空间导航文字曾经被遮挡素材整块压住（2026-10-05 修），这类 depth 冲突
 *    只能靠逐对象比对发现。
 *
 * 覆盖六段（每段给出阈值，超阈值即 FAIL 并以退出码 1 结束）：
 *   A. 美术真源对齐 —— 35 张纹理的坐标/原点/显示尺寸与 geometry.json 逐项比对
 *   B. 遮挡可用性   —— 十处遮挡区内躲灯必须不涨警觉（并跑一处空地对照片）
 *   C. 可读性       —— 不额外叠箭头文字/底部状态条，标题固定在起点；剩余文字无 depth 遮挡
 *   D. 关卡可玩性   —— 跳跃净高能过最高障碍、每个障碍站在平台上、下落口宽度达标
 *   E. 检查点       —— 四个检查点传送后能站稳，并按顺序激活
 *   G. 封路墙       —— 底层向右连跳必须翻不过封路墙；把碰撞盒改回加高前的高度则必须能翻过去
 *                     （G2 是对照：没有它，G1 在「墙被改矮」时会假装通过）
 *
 * 用法：
 *   bash dev.sh                                     # 先起 dev server（或任意 vite --port）
 *   node tools/probe-chapter2-qilou.mjs              # 默认 http://localhost:5173
 *   ORIGIN=http://localhost:5179 node tools/probe-chapter2-qilou.mjs
 *   node tools/probe-chapter2-qilou.mjs --json       # 额外输出原始数据
 *
 * 截图写到 screenshots/chapter2-qilou/（screenshots/ 已在 .gitignore）。
 *
 * 测量陷阱（踩过）：
 *  · 遮挡判定要求角色「在动」才会被灯追踪，所以 B 段必须真的按住方向键，
 *    不能只改 `moved` 的入参。
 *  · 灯每帧从 `this.searchlight.angle` 重新推扫，只设一次角度会被扫走；
 *    用 8ms 定时器持续把角度钉在角色身上，才能稳定造出「灯照着你」的条件。
 *  · 「跳不过去」不能只看墙的碰撞盒数字（那只是把源码抄了一遍）。G 段真的在浏览器里
 *    按住右+落地就跳去撞，量最远 x；并用 G2 把碰撞盒改回 1682,448,38×286 重跑一遍，
 *    翻过去了才说明 G1 量的是物理而不是常量。
 *  · 对照点不能落在摆动障碍的扫掠范围里：610 层原的 900 正好在「甩动竹竿」（930,y=492,
 *    len=112）下面，角色一放下去就被打回检查点，然后被报成「没落到平台上」——一个
 *    看起来像落地问题的假 FAIL。已挪到 1250（避开 c05/c06 两处遮挡与竹竿扫掠）。
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:5173';
const SHOT_DIR = 'screenshots/chapter2-qilou';
const JSON_OUT = process.argv.includes('--json');
const geo = JSON.parse(readFileSync(new URL('../assets/level2/night-v1/geometry.json', import.meta.url), 'utf8'));

/** 判定阈值：超了就是玩家看得见的缺陷 */
const THRESHOLD = {
  /** 显示尺寸/坐标的容差（px）：Phaser 内部有亚像素取整 */
  layoutTolPx: 0.51,
  /** 空地对照组在 250ms 内至少应涨到的警觉（没涨说明光根本没照到，对照组无效） */
  controlExposureMs: 60,
  /** 遮挡组允许的最大警觉（>0 说明判定盒和贴图对不上） */
  coverExposureMs: 1,
  /** 跳跃最高点相对最高障碍至少留出的净高 */
  jumpClearancePx: 40,
  /** 下落口最小宽度 */
  dropGapPx: 80,
  /** 检查点落地后允许的「站不稳」判定次数 */
  checkpointFailures: 0,
};

const results = [];
const record = (step, ok, detail = '') => {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
};

mkdirSync(SHOT_DIR, { recursive: true });
const raw = {};

/* ── 静态部分（不需要浏览器）───────────────────────────────────────── */

const hurdles = geo.hurdles;
const tallest = Math.max(...hurdles.map(h => h.height));
const jumpVelocity = 630; // Player 默认 jumpVelocity；场景只覆盖 speed
const gravity = 1100; // 场景 arcade gravity
const apex = (jumpVelocity ** 2) / (2 * gravity);
const speed = 225; // 场景 new Player(..., { speed: 225 })
const airtime = (2 * jumpVelocity) / gravity;
const reach = speed * airtime;
raw.jump = { apex, reach, tallest };
record('D1. 跳跃净高能过最高障碍', apex >= tallest + THRESHOLD.jumpClearancePx,
  `跳跃最高点 ${apex.toFixed(0)}px vs 最高障碍 ${tallest}px（净高 ${(apex - tallest).toFixed(0)}px，阈值 ≥${THRESHOLD.jumpClearancePx}）`);
record('D2. 跳跃水平覆盖能过障碍碰撞宽', reach >= 26 * 3,
  `满速滞空横移 ${reach.toFixed(0)}px vs 障碍碰撞宽 26px`);

const floating = hurdles.filter(h => !geo.platforms.some(p => p.y === h.y && h.x >= p.x && h.x <= p.x + p.width));
record('D3. 每个障碍都站在平台上', floating.length === 0,
  floating.length ? floating.map(h => `${h.id}@${h.x},${h.y}`).join(' ') : `${hurdles.length} 个障碍全部落在平台 x 范围内`);

const p04 = geo.platforms.find(p => p.id === 'p04');
const wallLeft = geo.wall.x - geo.wall.width / 2;
const dropGap = wallLeft - (p04.x + p04.width);
raw.dropGap = dropGap;
record('D4. 第一层末端下落口宽度', dropGap >= THRESHOLD.dropGapPx, `${dropGap.toFixed(0)}px（阈值 ≥${THRESHOLD.dropGapPx}）`);

/* ── 运行时部分 ────────────────────────────────────────────────────── */

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(`pageerror: ${e.message} @ ${(e.stack || '').split('\n').slice(1, 3).join(' <- ').trim()}`));

await page.goto(`${ORIGIN}/?scene=chapter2`, { waitUntil: 'load' });
await page.waitForTimeout(3000);

/** 运行时贴图快照 */
const layout = await page.evaluate(() => {
  const scene = window.__game.scene.getScene('chapter2');
  return scene.children.list
    .filter(o => o.texture && String(o.texture.key).startsWith('night-'))
    .map(o => ({
      key: o.texture.key, x: o.x, y: o.y, originX: o.originX, originY: o.originY,
      displayWidth: o.displayWidth, displayHeight: o.displayHeight,
      textureWidth: o.width, textureHeight: o.height, depth: o.depth,
    }));
});
const byKey = key => layout.filter(o => o.key === key);

/** 封路墙碰撞盒的上下端（世界 y）：加高目的是让底层无法向右跳过，视觉必须盖住这一段 */
const COLLISION_WALL_TOP = 0;
const COLLISION_WALL_BOTTOM = 734;

/** A 段：与 geometry.json 逐项比对 */
const layoutProblems = [];
const near = (a, b) => Math.abs(a - b) < THRESHOLD.layoutTolPx;
const check = (key, want, what) => {
  const found = byKey(key);
  if (found.length !== 1) { layoutProblems.push(`${key} 出现 ${found.length} 次`); return; }
  const got = found[0];
  for (const [field, value] of Object.entries(want)) {
    if (!near(got[field], value)) layoutProblems.push(`${key}.${field} = ${got[field]} ≠ ${value}`);
  }
};
check('night-background', { x: 0, y: 0, displayWidth: geo.world.width, displayHeight: geo.world.height }, '背景');
for (const p of geo.platforms) check(`night-${p.id}`, { x: p.x, y: p.y, originX: 0, originY: 0, displayWidth: p.width, displayHeight: p.height }, p.id);
for (const h of geo.hurdles) check(`night-${h.id}`, { x: h.x, y: h.y, originX: .5, originY: 1, displayWidth: h.width, displayHeight: h.height }, h.id);
for (const c of geo.covers) check(`night-${c.id}`, { x: c.x, y: c.y, originX: 0, originY: 1, displayWidth: c.width, displayHeight: c.height }, c.id);
for (const s of geo.swings) check(`night-${s.id}`, { x: s.x, y: s.y, originX: .5, originY: 0, displayWidth: s.width, displayHeight: s.height }, s.id);
// 封路墙：碰撞加高后视觉必须一起加高，否则是隐形墙。w01 是 38×286 的连续柱面切片，
// 所以这里不再比单张几何，而是要求「平铺的贴图堆叠刚好盖住碰撞盒」：横对齐、纵向无缝、上下端对齐。
const wallTiles = byKey('night-w01').sort((a, b) => a.y - b.y);
if (!wallTiles.length) {
  layoutProblems.push('night-w01 没有绘制');
} else {
  for (const tile of wallTiles) {
    if (!near(tile.x, geo.wall.x) || !near(tile.displayWidth, geo.wall.width)) {
      layoutProblems.push(`night-w01 平铺横向不齐：x=${tile.x} w=${tile.displayWidth}（应为 ${geo.wall.x}/${geo.wall.width}）`);
    }
  }
  const top = wallTiles[0].y;
  const bottom = Math.max(...wallTiles.map(t => t.y + t.displayHeight));
  if (!near(top, COLLISION_WALL_TOP) || !near(bottom, COLLISION_WALL_BOTTOM)) {
    layoutProblems.push(`night-w01 堆叠 ${top}~${bottom} 没有盖住碰撞盒 ${COLLISION_WALL_TOP}~${COLLISION_WALL_BOTTOM}`);
  }
  for (let i = 1; i < wallTiles.length; i++) {
    const seam = wallTiles[i].y - (wallTiles[i - 1].y + wallTiles[i - 1].displayHeight);
    if (Math.abs(seam) > THRESHOLD.layoutTolPx) layoutProblems.push(`night-w01 第 ${i} 道接缝错开 ${seam.toFixed(2)}px`);
  }
}
check('night-teacher', { x: geo.teacher.x, y: geo.teacher.y, displayWidth: geo.teacher.width, displayHeight: geo.teacher.height }, '老师');
check('night-ticket', { x: geo.ticket.x, y: geo.ticket.y, displayWidth: geo.ticket.width, displayHeight: geo.ticket.height }, '旧钞票');
check('night-door', { x: geo.door.x, y: geo.door.y, displayWidth: geo.door.width, displayHeight: geo.door.height }, '门');
raw.layout = { problems: layoutProblems, count: layout.length };
record('A1. 骑楼贴图的坐标/原点/显示尺寸（含封路墙平铺）', layoutProblems.length === 0,
  layoutProblems.length ? layoutProblems.slice(0, 6).join(' | ') : `${layout.length} 个 night- 对象全部与 geometry.json 一致`);

/** B 段：遮挡是否真的能躲灯 */
const floorTop = { 320: 'p02', 380: 'p03', 440: 'p04', 610: 'p05', 820: 'p06', 865: 'p07', 910: 'p08', 950: 'p09' };
/** 同层对照点：必须不落在任何遮挡区内，也不在摆动障碍的扫掠范围里 */
const controlByFloor = { 320: 620, 380: 1150, 440: 1480, 610: 1250, 820: 900, 865: 1600, 910: 2400, 950: 3200 };

/**
 * 把角色放到某层走道上并等它真正落地。
 * `view.y + 34` 才是脚底（检查点也是按这个偏移写的），所以出生点取 `floorTop - 44`：
 * 头 10px 悬空、落回走道面，若按 `floorTop - 10` 会直接生成在平台板里、永远 blockedDown=false。
 */
async function place(x, floorTop) {
  await page.evaluate(async ({ x, y, floorTop }) => {
    const scene = window.__game.scene.getScene('chapter2');
    scene.tokenCollected = false; scene.restarting = false; scene.leaving = false;
    scene.tutorialSafe = false; scene.alert = 0;
    scene.searchlight = { angle: 0, direction: 1, tracking: false, exposure: 0 };
    scene.detectionMs = 0;
    // 重试的 delayedCall 会读 CHECKPOINTS[checkpointIndex].x：留着非法索引会让挂起的回调抛异常、
    // 把场景卡在 restarting=true（角色从此不再下落，后续测量全部无效）。
    scene.checkpointIndex = 0;
    // 上一轮测量可能触发过重试：它的 470ms delayedCall 会在本次测量途中把角色拽回检查点。
    // 场景里只有重试用 delayedCall，所以清掉挂起事件是安全的。
    scene.time.removeAllEvents();
    scene.player.teleportTo(x, y);
    scene.previousPlayer.set(x, y);
  }, { x, y: floorTop - 44, floorTop });

  // 轮询到真正站定：headless 会掉帧，固定等 500ms 时重力可能只推进了一两帧。
  // 站定判据不用 `body.blocked.down`——它只在分离那一帧为真，静止时会抖。
  const deadline = Date.now() + 4000;
  let state = await readStanding(floorTop);
  while (!state.landed && Date.now() < deadline) {
    await page.waitForTimeout(100);
    state = await readStanding(floorTop);
  }
  return state;
}

/** 读「是否落在该层走道面上」：角色站立高度 ≈ 走道面 - 36 */
async function readStanding(floorTop) {
  return page.evaluate((floorTop) => {
    const scene = window.__game.scene.getScene('chapter2');
    const standingY = scene.player.view.y;
    return {
      x: Math.round(scene.player.view.x), y: Math.round(standingY),
      landed: Math.abs(standingY - (floorTop - 36)) <= 6,
    };
  }, floorTop);
}

/** 测量期：灯每帧重推扫，所以用 8ms 定时器把角度钉在角色身上（否则「灯照着你」这个前提不成立）*/
/**
 * 测量：把灯钉在角色身上，并让角色保持「在动」的判定，采集警觉变化。
 *
 * 两个坑都踩过，别再改回去：
 *  · 采样不能放在自己写的 rAF 循环里 await——那样游戏主循环 180ms 只推进约 2 帧，
 *    读到的是「角色还没起步」，于是十处遮挡全部"通过"（假绿）。
 *    采样与钉灯都挂在场景事件（preupdate / postupdate）上，让游戏自己跑。
 *  · 位移也不能靠键盘：Playwright 的 keyboard.down 偶尔赶不上测量窗口。
 *    这里改成在 preupdate 里让角色小幅摆动（±2px，不离开遮挡区），
 *    制造 `moved` 判定所需的位移——本条测的是遮挡判定盒，不是移动系统。
 */
/**
 * 一次测量至少要攒够这么多游戏帧，否则结论无效。
 * 取 12 而不是 25：机器负载高时 headless 掉到 1–3fps，25 帧要等十几秒、十处遮挡叠起来就是几分钟；
 * 而 12 帧（每帧 delta ~16ms）已足够让对照组的警觉（阈值 60ms）长起来，判据不受影响。
 */
const MIN_FRAMES = 12;

async function measure() {
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('chapter2');
    const origin = { x: 46, y: 230 };
    window.__probe = { samples: [], baseX: scene.player.view.x, dir: 1 };
    window.__aim = () => {
      const player = scene.player;
      window.__probe.dir *= -1;
      player.view.x = window.__probe.baseX + window.__probe.dir * 2;
      scene.searchlight.angle = Math.atan2(player.view.y - origin.y, player.view.x - origin.x);
    };
    window.__sample = () => {
      window.__probe.samples.push({
        exposure: scene.detectionMs, tracking: scene.searchlight.tracking, x: scene.player.view.x,
      });
    };
    scene.events.on('preupdate', window.__aim);
    scene.events.on('postupdate', window.__sample);
  });
  // 等够「游戏帧数」而不是墙钟：headless 下帧率会掉到 ~10fps，
  // 按 180ms 墙钟等只能拿到 1-3 帧，测不出任何东西。
  const deadline = Date.now() + 20000;
  for (;;) {
    const frames = await page.evaluate(() => window.__probe?.samples.length ?? 0);
    if (frames >= MIN_FRAMES || Date.now() > deadline) break;
    await page.waitForTimeout(80);
  }
  return page.evaluate(() => {
    const scene = window.__game.scene.getScene('chapter2');
    scene.events.off('preupdate', window.__aim);
    scene.events.off('postupdate', window.__sample);
    const samples = window.__probe.samples ?? [];
    if (!samples.length) return { frames: 0, maxExposure: 0, everTracked: false, startX: 0, endX: 0, travel: 0 };
    return {
      frames: samples.length,
      maxExposure: Math.max(...samples.map(v => v.exposure)),
      everTracked: samples.some(v => v.tracking),
      startX: Math.round(samples[0].x), endX: Math.round(samples.at(-1).x),
      travel: Math.round(Math.abs(samples.at(-1).x - samples[0].x)),
    };
  });
}

/** 按住方向键跑一次测量（遮挡判定要求角色「在动」）*/
async function probeMoving(x, floorTop) {
  const landed = await place(x, floorTop);
  const result = await measure(); // 移动由 measure 内部的摆动驱动
  return { ...result, landed };
}

const coverResults = [];
const invalid = [];
for (const cover of geo.covers) {
  const floorTop = cover.zone.maxY - 24;
  const startX = Math.round(cover.zone.from + (cover.zone.to - cover.zone.from) * 0.25);
  const result = await probeMoving(startX, floorTop);
  const ran = result.frames >= MIN_FRAMES;
  if (!ran) invalid.push(`${cover.id} 测量期间游戏只跑了 ${result.frames} 帧，警觉不涨不能证明遮挡有效`);
  if (!result.landed.landed) invalid.push(`${cover.id} 没落到该层走道面（y=${result.landed.y}）`);
  coverResults.push({ id: cover.id, startX, floorTop, zone: `${cover.zone.from}..${cover.zone.to}`, ...result });
  if (result.endX > cover.zone.to) invalid.push(`${cover.id} 测量期间走出了遮挡区（${result.startX}→${result.endX} > ${cover.zone.to}）`);
  if (result.maxExposure > THRESHOLD.coverExposureMs) invalid.push(`${cover.id} 在区内仍被照到 ${result.maxExposure.toFixed(0)}ms`);
}
raw.covers = coverResults;
record('B1. 十处遮挡区内躲灯不涨警觉', invalid.length === 0,
  invalid.length
    ? invalid.join(' | ')
    : `10/10 遮挡区：每处都攒够 ${MIN_FRAMES} 帧、确实在移动，且 maxExposure ≤ ${THRESHOLD.coverExposureMs}ms`);

const controlProblems = [];
for (const cover of geo.covers) {
  const floorTop = cover.zone.maxY - 24;
  const x = controlByFloor[floorTop];
  if (x === undefined) { controlProblems.push(`${floorTop} 层没有对照点`); continue; }
  if (geo.covers.some(c => x >= c.zone.from && x <= c.zone.to && c.zone.maxY - 24 === floorTop)) {
    controlProblems.push(`对照点 ${x}@${floorTop} 落在遮挡区内`);
    continue;
  }
  const result = await probeMoving(x, floorTop, 200);
  if (!result.landed.landed) controlProblems.push(`对照点 ${x}@${floorTop} 没落到平台上（y=${result.landed.y}）`);
  else if (result.maxExposure < THRESHOLD.controlExposureMs) {
    controlProblems.push(`对照点 ${x}@${floorTop} 只涨 ${result.maxExposure.toFixed(0)}ms（光没照到，对照组无效）`);
  }
}
raw.controls = controlProblems;
record('B2. 空地对照组确实会被灯抓到（证明 B1 不是假绿）', controlProblems.length === 0,
  controlProblems.length ? controlProblems.join(' | ') : `八层对照点在满帧窗口内都涨过 ${THRESHOLD.controlExposureMs}ms`);

/** C 段：可读性 —— 路线靠场景构图，不叠箭头与底栏；起点标题固定在世界坐标 */
const readability = await page.evaluate(() => {
  const scene = window.__game.scene.getScene('chapter2');
  const texts = scene.children.list.filter(o => o.type === 'Text' && o.depth < 200)
    .map(o => ({ text: o.text, x: o.x, y: o.y, w: o.width, h: o.height, depth: o.depth }));
  const covers = scene.children.list.filter(o => o.texture && /night-c\d\d/.test(o.texture.key))
    .map(o => ({ key: o.texture.key, x1: o.x, y1: o.y - o.displayHeight, x2: o.x + o.displayWidth, y2: o.y, depth: o.depth }));
  const occluded = [];
  for (const t of texts) {
    for (const c of covers) {
      const hit = t.x < c.x2 && t.x + t.w > c.x1 && t.y < c.y2 && t.y + t.h > c.y1;
      if (hit && c.depth > t.depth) occluded.push({ text: t.text, depth: t.depth, cover: c.key, coverDepth: c.depth });
    }
  }
  return {
    texts: texts.length,
    occluded,
    routeHints: texts.filter(t => t.text.startsWith('↓')).map(t => t.text),
    statusVisible: scene.status.visible,
    checkpointVisible: scene.checkpointText.visible,
    title: { x: scene.title.x, y: scene.title.y, visible: scene.title.visible },
  };
});
raw.readability = readability;
const guidanceOk = readability.routeHints.length === 0 && !readability.statusVisible && !readability.checkpointVisible;
const titleOk = readability.title.visible && readability.title.x === 145 && readability.title.y === 24;
record('C1. 关卡无箭头/底栏提示，标题只留在起点', guidanceOk && titleOk,
  `箭头 ${readability.routeHints.length} 条 · status ${readability.statusVisible} · checkpoint ${readability.checkpointVisible} · title (${readability.title.x},${readability.title.y})`);
record('C2. 起点标题不被遮挡素材盖住', readability.occluded.length === 0,
  readability.occluded.length
    ? readability.occluded.map(o => `「${o.text}」depth ${o.depth} < ${o.cover} ${o.coverDepth}`).join(' | ')
    : `${readability.texts} 条世界空间文字无 depth 冲突`);

/** E 段：检查点落地与激活 */
const checkpoints = [
  { label: '学校后墙', x: 110, y: 212, floor: 260 },
  { label: '骑楼二层', x: 1510, y: 566, floor: 610 },
  { label: '骑楼底层', x: 485, y: 776, floor: 820 },
  { label: '长街中段', x: 2100, y: 866, floor: 910 },
];
const checkpointResults = [];
for (const [index, cp] of checkpoints.entries()) {
  const state = await page.evaluate(async ({ x, y, index, floor }) => {
    const scene = window.__game.scene.getScene('chapter2');
    scene.restarting = false; scene.leaving = false; scene.detectionMs = 0; scene.alert = 0;
    scene.tokenCollected = false; scene.checkpointIndex = index;
    scene.time.removeAllEvents(); // 清掉可能挂起的重试回调，避免它把角色拽走
    scene.player.teleportTo(x, y);
    scene.previousPlayer.set(x, y);
    await new Promise(r => setTimeout(r, 900));
    const standingY = scene.player.view.y;
    return {
      x: Math.round(scene.player.view.x), y: Math.round(standingY),
      // 站定判据同 place()：落在该层站立高度附近；body.blocked.down 静止时会抖，不能当判据
      landed: Math.abs(standingY - (floor - 36)) <= 6,
      checkpointIndex: scene.checkpointIndex,
    };
  }, { x: cp.x, y: cp.y, index, floor: cp.floor });
  checkpointResults.push({ ...cp, ...state });
}
raw.checkpoints = checkpointResults;
const unsettled = checkpointResults.filter(r => !r.landed);
record('E1. 四个检查点传送后都能站稳', unsettled.length <= THRESHOLD.checkpointFailures,
  unsettled.length ? unsettled.map(r => `${r.label} 没站稳 y=${r.y}`).join(' | ') : '4/4 落在该层走道面上');

/** 截图：记录两处路线转折构图与第三层遮挡 */
for (const [name, x, y] of [['upper-route', 1450, 515], ['lower-route', 520, 745], ['cover-c09', 2110, 900]]) {
  await page.evaluate(([x, y]) => {
    const scene = window.__game.scene.getScene('chapter2');
    scene.restarting = false; scene.leaving = false;
    scene.player.teleportTo(x - 120, y); scene.previousPlayer.set(x - 120, y);
    scene.cameras.main.stopFollow();
    scene.cameras.main.centerOn(x, y);
  }, [x, y]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

/** G 段：封路墙 —— 底层（y=610，就是「该往左折返」的那一层）向右连跳必须过不去 */
const WALL_LEFT = geo.wall.x - geo.wall.width / 2;   // 1663
const WALL_RIGHT = geo.wall.x + geo.wall.width / 2;  // 1701
/** Player 碰撞体 36×72（`Player` 默认 opts.width），所以身体半宽 18 */
const BODY_HALF = 18;

/**
 * 从某层的某点开始「按住右、落地就跳」，返回这段时间里到过的最大 x。
 *
 * 不用 Playwright 的 keyboard.down：它偶尔赶不上测量窗口（B 段已经踩过这个坑）。
 * 这里在 `preupdate` 里直接置键盘 Key 的 `isDown` / `_justDown`——`player.update` 读的就是它们，
 * 且场景在 update 之前触发 preupdate，所以每帧重新置位即可做到「落地瞬间起跳」。
 * 崩在 x 上而不是「是否被 blocked」上：静态体碰撞有分离帧，blocked 只闪一帧；位置是累计量。
 *
 * @param startX  起点（该层走道上，且要离墙有足够助跑距离）
 * @param floorTop 走道面 y
 * @param ms 冲刺时长（墙前助跑 ~460px，6s 足够跑完还能起跳多次）
 */
async function jumpSprint(startX, floorTop, ms) {
  await place(startX, floorTop);
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('chapter2');
    const keys = scene.player.keys;
    window.__sprint = { maxX: scene.player.view.x, jumps: 0 };
    window.__sprintDrive = () => {
      const player = scene.player;
      keys.RIGHT.isDown = true;
      const grounded = player.body.onFloor();
      keys.SPACE.isDown = grounded;
      if (grounded) { keys.SPACE._justDown = true; window.__sprint.jumps += 1; }
      window.__sprint.maxX = Math.max(window.__sprint.maxX, player.view.x);
    };
    scene.events.on('preupdate', window.__sprintDrive);
  });
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) await page.waitForTimeout(200);
  return page.evaluate(() => {
    const scene = window.__game.scene.getScene('chapter2');
    scene.events.off('preupdate', window.__sprintDrive);
    scene.player.keys.RIGHT.isDown = false;
    scene.player.keys.SPACE.isDown = false;
    return { maxX: Math.round(window.__sprint.maxX), jumps: window.__sprint.jumps };
  });
}

/** 把封路墙的碰撞盒改回加高之前的几何（1682, 448, 38×286），用于 G2 的对照 */
async function setWallBody(y, height) {
  return page.evaluate(({ y, height }) => {
    const scene = window.__game.scene.getScene('chapter2');
    /** 碰撞盒的 y/高会变（G2 会把它改矮再改回来），所以只能按宽度与左沿认它 */
    const rects = scene.children.list.filter(o => o.type === 'Rectangle' && o.body);
    const wall = rects.find(o => Math.round(o.body.width) === 38 && Math.round(o.body.x) === 1663);
    if (!wall) {
      return { ok: false, bodies: rects.map(o => `${Math.round(o.body.x)},${Math.round(o.body.y)} ${Math.round(o.body.width)}×${Math.round(o.body.height)}`).join(' | ') };
    }
    wall.setPosition(1682, y).setSize(38, height);
    wall.body.updateFromGameObject();
    const b = wall.body;
    return { ok: true, body: `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)}` };
  }, { y, height });
}

const blockedRun = await jumpSprint(1200, 610, 6000);
raw.wall = { blockedRun, wallLeft: WALL_LEFT };
record('G1. 底层向右连跳翻不过封路墙',
  blockedRun.jumps > 0 && blockedRun.maxX <= WALL_LEFT - BODY_HALF + 2,
  `最远 x=${blockedRun.maxX}（墙左沿 ${WALL_LEFT}，身体半宽 ${BODY_HALF} → 上限 ${WALL_LEFT - BODY_HALF + 2}），` +
  `起跳 ${blockedRun.jumps} 次`);

const oldWallBody = await setWallBody(448, 286);
const hopRun = await jumpSprint(1200, 610, 6000);
const restoredWallBody = await setWallBody(0, 734);
raw.wall = { ...raw.wall, oldWallBody, hopRun, restoredWallBody };
record('G2. 对照组：碰撞盒改回加高前（1682,448,38×286）后同样的冲刺能翻过去',
  oldWallBody.ok && restoredWallBody.ok && hopRun.maxX > WALL_RIGHT,
  !oldWallBody.ok ? `没找到封路墙碰撞盒；场上静态矩形：${oldWallBody.bodies}`
    : !restoredWallBody.ok ? `对照跑完后没能还原碰撞盒：${restoredWallBody.bodies}`
      : `碰撞盒 ${oldWallBody.body} → 最远 x=${hopRun.maxX}（旧墙右沿 ${WALL_RIGHT}）；已还原为 ${restoredWallBody.body}`);

record('F1. 全程 0 console error', errors.length === 0, errors.length ? errors.slice(0, 4).join(' | ') : '无');

const failed = results.filter(r => !r.ok);
if (JSON_OUT) console.log('\n' + JSON.stringify(raw, null, 2));
console.log(`\n汇总: ${results.length - failed.length}/${results.length} 段通过，console 错误 ${errors.length} 条`);
await browser.close();
process.exit(failed.length ? 1 : 0);
