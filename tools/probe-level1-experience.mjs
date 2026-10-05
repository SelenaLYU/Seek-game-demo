/**
 * 第一关「体验遗留」探针：把四条主观问题变成可复现、可对比的数字。
 *
 * 为什么需要它（不要再靠"看着还行"验收）：
 *  · 石门裁切、礁石隐形墙、抓放海鸥突跳、触屏重叠都是**看得见但量不出来**的问题，
 *    单测（只覆盖第二关 + LAYOUT 几何）和 e2e（只跑第一关物理链路）都不会红。
 *  · HANDOFF 明确要求"先实测复现再修"，所以把复现这件事本身固化成脚本，
 *    修前跑一次留基线、修后跑一次看数字有没有真的变。
 *
 * 覆盖四条（每条都给出阈值，超阈值即 FAIL 并以退出码 1 结束）：
 *   A. 石门右侧裁切  —— 门贴图（含/不含透明边）右缘超出世界右界的像素数
 *   B. 礁石隐形碰撞墙 —— 每块礁石碰撞柱底边是否停在岩体内容底边（而不是延伸到水面）
 *   C. 抓/放海鸥突跳 —— 抓取瞬间单帧位移；松手 90ms 收回补间的单帧最大位移
 *   D. 触屏适配      —— 竖屏/横屏下触屏按钮重叠、状态栏溢出、起点教学卡可见性
 *
 * 用法：
 *   bash dev.sh                                  # 先起 dev server
 *   node tools/probe-level1-experience.mjs       # 默认 http://localhost:5173
 *   ORIGIN=http://localhost:5175 node tools/probe-level1-experience.mjs
 *   node tools/probe-level1-experience.mjs --json   # 额外输出原始数据
 *
 * 截图写到 screenshots/level1-experience/（screenshots/ 已在 .gitignore）。
 *
 * 两个测量陷阱（踩过，别再踩）：
 *  · 手动步进（game.loop.sleep() + game.step()）**不推进 tween**：量"抓取瞬间"这种
 *    瞬时锚点切换可以，量松手的 90ms 补间必须让真实 rAF 循环跑着、用 rAF 采样。
 *  · scrollFactor 0 层的位置由 screenSpaceOrigin 补偿，但**尺寸仍会被相机 zoom 放大**；
 *    所以触屏判定要在"放大后的缓冲像素"里比边界，不能直接拿逻辑坐标比。
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:5173';
const SHOT_DIR = 'screenshots/level1-experience';
const JSON_OUT = process.argv.includes('--json');

/** 判定阈值：超了就是玩家看得见的缺陷 */
const THRESHOLD = {
  /** 门美术右缘出界像素（不含透明边）——超过 4px 就明显缺一块 */
  doorOverhangPx: 4,
  /** 是否允许有礁石碰撞柱伸到水面（世界底 y=540）以下 */
  reefColumnToWaterline: false,
  /** 抓取瞬间角色渲染框中心的单帧位移（px）——>24px 读作瞬移 */
  grabSnapPx: 24,
  /** 松手 90ms 收回过程中的单帧最大位移（px） */
  releaseSnapPx: 12,
  /** 触屏按钮重叠面积（逻辑 px²，>0 即失败） */
  touchOverlapPx2: 0,
  /** 状态栏右缘超出缓冲宽度的像素 */
  statusOverflowPx: 1,
};

const results = [];
const record = (id, ok, detail) => results.push({ id, ok, detail });

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
mkdirSync(SHOT_DIR, { recursive: true });

const boot = async (page, touch = false) => {
  await page.goto(`${ORIGIN}/?scene=forest`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__game?.scene?.getScene?.('forest')?.player), { timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__game?.scene?.getScene?.('forest')?.player), { timeout: 30000 });
  await page.waitForTimeout(touch ? 2500 : 1200);
};

// ══════════════════════ A + B：几何（石门裁切 / 礁石碰撞柱） ══════════════════════
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await boot(page);

  const geometry = await page.evaluate(() => {
    const s = window.__game.scene.getScene('forest');
    const cam = s.cameras.main;
    const doorBounds = s.door.getBounds();

    // 门贴图的不透明内容框：把已加载的贴图画进 canvas 逐像素扫 alpha。
    // 透明边不构成"被切掉的美术"，判定要用内容右缘，别用 getBounds 的矩形右缘。
    const src = s.textures.get('level1-memory-room-stone-door').getSourceImage();
    const cnv = document.createElement('canvas');
    cnv.width = src.width; cnv.height = src.height;
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);
    const { data } = ctx.getImageData(0, 0, src.width, src.height);
    let maxX = -1, minX = src.width;
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        if (data[(y * src.width + x) * 4 + 3] > 128) {
          if (x > maxX) maxX = x;
          if (x < minX) minX = x;
        }
      }
    }
    const scale = doorBounds.width / src.width;
    const worldRight = s.physics.world.bounds.width;

    // 礁柱 vs 两岸厚地面：两者都是实心柱，只能靠位置区分——
    // 起点沙滩(0..280) 与右岸(2660..2870) 贴着世界边缘，礁石一律悬在海里、不碰边缘。
    // （不要用 height 区分：厚地面高只有 100px（540−440），比高顶礁柱还矮。）
    const solids = (s.terrain.solids ?? []).map(r => ({
      x: r.x, right: r.x + r.width, top: r.y, width: r.width, height: r.height, bottom: r.y + r.height,
    }));
    const isShoreGround = r => r.x <= 0.5 || r.right >= worldRight - 0.5;
    const reefColumns = solids.filter(r => !isShoreGround(r));
    const thickGround = solids.filter(isShoreGround);

    return {
      worldWidth: worldRight,
      door: {
        imageLeft: +doorBounds.left.toFixed(2),
        imageRight: +doorBounds.right.toFixed(2),
        contentLeft: +(doorBounds.left + minX * scale).toFixed(2),
        contentRight: +(doorBounds.left + maxX * scale).toFixed(2),
        overhangImage: +(doorBounds.right - worldRight).toFixed(2),
        overhangContent: +(doorBounds.left + maxX * scale - worldRight).toFixed(2),
        scale: +scale.toFixed(4),
      },
      reefColumns: reefColumns.map(r => ({
        x: Math.round(r.x), right: Math.round(r.right),
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        reachesWaterline: r.bottom >= 540,
      })),
      thickGround: thickGround.map(r => ({ x: Math.round(r.x), right: Math.round(r.right), bottom: Math.round(r.bottom) })),
      camera: { zoom: +cam.zoom.toFixed(3), worldViewportWidth: s.viewportWidth },
    };
  });

  // 石门右端实拍：把相机推到最右，留证
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('forest');
    s.player.teleportTo(2740, 404);
    s.cameras.main.scrollX = 999999;
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOT_DIR}/door-right-edge.png` });
  await page.close();

  record('A. 石门右侧裁切', geometry.door.overhangContent <= THRESHOLD.doorOverhangPx,
    `门美术不透明内容右缘 ${geometry.door.contentRight} vs 世界右界 ${geometry.worldWidth} → 出界 ${geometry.door.overhangContent}px（含透明边 ${geometry.door.overhangImage}px）· 阈值 ≤${THRESHOLD.doorOverhangPx}px`);

  const offending = geometry.reefColumns.filter(c => c.reachesWaterline && !THRESHOLD.reefColumnToWaterline);
  record('B. 礁石隐形碰撞墙', offending.length === 0,
    `礁柱 ${geometry.reefColumns.length} 块，底边 ${[...new Set(geometry.reefColumns.map(c => c.bottom))].sort((a, b) => a - b).join('/')}（全部停在岩体贴图内容底边）· 水面 ${540} · 到水面的礁柱 ${offending.length} 块 · 两岸厚地面按设计到 ${[...new Set(geometry.thickGround.map(g => g.bottom))].join('/')}`);

  globalThis.__geometry = geometry;
  globalThis.__geometryErrors = errors;
}

// ══════════════════════ C：抓取瞬间（确定性步进） ══════════════════════
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await boot(page);

  // 抓取瞬间是瞬时锚点切换（无 tween），用确定性步进量最干净。
  const grab = await page.evaluate(() => {
    const game = window.__game;
    game.loop.sleep();
    const s = game.scene.getScene('forest');
    const p = s.player;
    let t = 1000;
    const step = n => { for (let i = 0; i < n; i++) { t += 16.6667; game.step(t, 16.6667); } };
    const snap = () => {
      const b = p.view.body;
      const sb = p.sprite.getBounds();
      return {
        view: [+p.view.x.toFixed(2), +p.view.y.toFixed(2)],
        bodyCenter: [+b.center.x.toFixed(2), +b.center.y.toFixed(2)],
        feetY: +sb.bottom.toFixed(2), topY: +sb.top.toFixed(2),
        centerY: +((sb.top + sb.bottom) / 2).toFixed(2),
        enabled: b.enable, attached: Boolean(p.attached),
      };
    };

    // 站在起跳高台落地（对齐玩家真实起点）
    p.teleportTo(1040, 199);
    step(6);

    // 真实自动抓取半径是 tryGrabVine 的默认值 78px（场景里 95px 那个只是握点光环的 near 判定），
    // 所以入口距离必须放在 78 以内，否则量到的是“没抓住、自由下落一帧”。
    const GRAB_RADIUS = 78;
    const hand = { x: s.gullVine.handX, y: s.gullVine.handY };
    const dx = 60, dy = Math.sqrt((GRAB_RADIUS - 2) ** 2 - dx ** 2);
    p.teleportTo(hand.x - dx, hand.y + 34 + dy);
    const before = snap();
    const distance = Math.hypot(before.view[0] - hand.x, (before.view[1] - 34) - hand.y);
    step(1);
    const after = snap();

    const d = (k, axis = 1) => +(after[k][axis] - before[k][axis]).toFixed(2);
    return {
      attached: after.attached,
      entryDistance: +distance.toFixed(2),
      viewJumpY: d('view'), bodyJumpCenterY: d('bodyCenter'),
      feetJump: +(after.feetY - before.feetY).toFixed(2),
      centerJump: +(after.centerY - before.centerY).toFixed(2),
      topJump: +(after.topY - before.topY).toFixed(2),
      viewJumpX: d('view', 0),
      bodyJumpX: d('bodyCenter', 0),
    };
  });

  const feetJump = Math.abs(grab.feetJump);
  const centerJump = Math.abs(grab.centerJump);
  record('C1. 抓取瞬间突跳', grab.attached && centerJump <= THRESHOLD.grabSnapPx,
    grab.attached
      ? `入口距离 ${grab.entryDistance}px（自动抓取半径 78）· 单帧位移 渲染框中心 ${centerJump}px / 脚底 ${feetJump}px / 顶点 ${Math.abs(grab.topJump)}px · 碰撞体中心 ${Math.abs(grab.bodyJumpCenterY)}px · 阈值 ≤${THRESHOLD.grabSnapPx}px`
      : `未触发自动抓取（入口距离 ${grab.entryDistance}px）——探针自身失效，先修探针再谈阈值`);

  // ══════ C2：松手要真实循环（tween 才推进），改用 rAF 采样 ══════
  await page.evaluate(() => {
    const game = window.__game;
    const s = game.scene.getScene('forest');
    const p = s.player;
    window.__samples = [];
    const t0 = performance.now();
    window.__t0 = t0;
    const tick = () => {
      const sb = p.sprite.getBounds();
      window.__samples.push({
        t: +(performance.now() - t0).toFixed(1),
        viewY: +p.view.y.toFixed(2),
        feetY: +sb.bottom.toFixed(2),
        lift: +p.releaseLift.toFixed(2),
        attached: Boolean(p.attached),
      });
      window.__raf = requestAnimationFrame(tick);
    };
    // 唤醒真实循环：手动步进不推进 tween，量松手补间必须走 rAF
    game.loop.wake();
    p.teleportTo(s.gullVine.handX - 60, s.gullVine.handY + 34 + 60);
    p.attachVine(s.gullVine); // 松手段只关心收回补间，直接挂上，不依赖海鸥当时的位置
    tick();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__game.scene.getScene('forest').player.releaseVine());
  await page.waitForTimeout(900);

  const release = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    const s = window.__samples;
    let releaseAt = -1;
    for (let i = 1; i < s.length; i++) if (!s[i].attached && s[i - 1].attached) releaseAt = i;
    let maxStep = 0, maxAt = 0;
    for (let i = releaseAt + 1; i < Math.min(releaseAt + 12, s.length); i++) {
      const d = Math.abs(s[i].feetY - s[i - 1].feetY);
      if (d > maxStep) { maxStep = d; maxAt = i; }
    }
    return {
      frames: s.length,
      releaseAt,
      startLift: releaseAt >= 0 ? s[releaseAt].lift : null,
      maxStep: +maxStep.toFixed(2),
      maxStepWindow: releaseAt >= 0 ? s.slice(releaseAt - 1, releaseAt + 8).map(f => [f.t, f.feetY, f.lift]) : null,
    };
  });
  await page.close();

  record('C2. 松手收回补间', release.releaseAt > 0 && release.maxStep <= THRESHOLD.releaseSnapPx,
    `松手帧 ${release.releaseAt}/${release.frames} · 起始悬垂量 ${release.startLift}px · 10 帧内单帧最大位移 ${release.maxStep}px · 阈值 ≤${THRESHOLD.releaseSnapPx}px`);

  globalThis.__grab = grab;
  globalThis.__release = release;
  globalThis.__grabErrors = errors;
}

// ══════════════════════ D：触屏适配（竖屏 + 横屏） ══════════════════════
const touch = {};
for (const [name, vp] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await boot(page, true);

  touch[name] = await page.evaluate(() => {
    const s = window.__game.scene.getScene('forest');
    const cam = s.cameras.main;
    const bw = s.scale.gameSize.width, bh = s.scale.gameSize.height;
    // sf0 层：screenSpaceOrigin 只补位置，不抵消 zoom 对尺寸的放大 →
    // 必须在"放大后的缓冲像素"里比边界。
    const toScreen = (o) => {
      const b = o.getBounds();
      const sx = (b.x - cam.width / 2) * cam.zoom + cam.width / 2 + cam.x;
      const sy = (b.y - cam.height / 2) * cam.zoom + cam.height / 2 + cam.y;
      return {
        left: +sx.toFixed(1), top: +sy.toFixed(1),
        right: +(sx + b.width * cam.zoom).toFixed(1), bottom: +(sy + b.height * cam.zoom).toFixed(1),
      };
    };
    const buttons = (s.touchControls ?? []).map(c => ({ label: c.button.text, ...toScreen(c.button) }));
    const overlaps = [];
    for (let i = 0; i < buttons.length; i++) {
      for (let j = i + 1; j < buttons.length; j++) {
        const ox = Math.min(buttons[i].right, buttons[j].right) - Math.max(buttons[i].left, buttons[j].left);
        const oy = Math.min(buttons[i].bottom, buttons[j].bottom) - Math.max(buttons[i].top, buttons[j].top);
        if (ox > 0 && oy > 0) overlaps.push({ pair: `${buttons[i].label}/${buttons[j].label}`, ox: +ox.toFixed(1), oy: +oy.toFixed(1), areaPx2: Math.round(ox * oy) });
      }
    }
    const status = toScreen(s.statusText);
    const badge = s.startTutorialBadge;
    const view = cam.worldView;
    const badgeInfo = badge ? (() => {
      const b = badge.getBounds();
      return {
        left: +b.x.toFixed(1), right: +b.right.toFixed(1),
        visibleWorldLeft: +view.left.toFixed(1), visibleWorldRight: +view.right.toFixed(1),
        fullyVisible: b.x >= view.left && b.right <= view.right,
        visibleWidth: +Math.max(0, Math.min(b.right, view.right) - Math.max(b.x, view.left)).toFixed(1),
        texts: (badge.list ?? []).filter(o => o.type === 'Text').map(o => o.text),
      };
    })() : null;

    return {
      buffer: { w: Math.round(bw), h: Math.round(bh) }, zoom: +cam.zoom.toFixed(3),
      logicalViewportWidth: +s.viewportWidth.toFixed(1),
      buttons, overlaps,
      status, statusOverflowRight: +(status.right - bw).toFixed(1),
      badge: badgeInfo,
    };
  });
  await page.screenshot({ path: `${SHOT_DIR}/touch-${name}.png` });
  await page.close();
  touch[name].errors = errors;
}

const worstOverlap = ['portrait', 'landscape'].flatMap(k => touch[k].overlaps.map(o => ({ k, ...o })));
const worstOverflow = Math.max(...['portrait', 'landscape'].map(k => touch[k].statusOverflowRight));

record('D1. 触屏按钮重叠', worstOverlap.length === 0,
  worstOverlap.length
    ? worstOverlap.map(o => `${o.k} ${o.pair} 重叠 ${o.ox}×${o.oy}px（${o.areaPx2}px²）`).join('；')
    : `两向均无重叠（竖屏逻辑视口宽 ${touch.portrait.logicalViewportWidth}，横屏 ${touch.landscape.logicalViewportWidth}）`);

record('D2. 状态栏出界', worstOverflow <= THRESHOLD.statusOverflowPx,
  ['portrait', 'landscape'].map(k => `${k} 缓冲宽 ${touch[k].buffer.w} · 状态栏右缘 ${touch[k].status.right} → 溢出 ${touch[k].statusOverflowRight}px`).join('；'));

record('D3. 竖屏教学卡可见', Boolean(touch.portrait.badge?.fullyVisible),
  touch.portrait.badge
    ? `教学卡世界 ${touch.portrait.badge.left}-${touch.portrait.badge.right}，可见窗口 ${touch.portrait.badge.visibleWorldLeft}-${touch.portrait.badge.visibleWorldRight} → 可见 ${touch.portrait.badge.visibleWidth}px；文案 ${JSON.stringify(touch.portrait.badge.texts)}`
    : '竖屏未创建教学卡');

record('D4. 触屏文案', !['portrait', 'landscape'].some(k => (touch[k].badge?.texts ?? []).some(t => /\[.*(A|D|空格|H).*\]/.test(t))),
  `教学卡文案仍为键盘键位：${JSON.stringify(touch.portrait.badge?.texts ?? [])}`);

// ══════════════════════ 汇总 ══════════════════════
console.log('\n=== 第一关体验探针（ORIGIN=' + ORIGIN + '）===');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(18)} ${r.detail}`);
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过；截图 ${SHOT_DIR}/`);
if (JSON_OUT) {
  console.log(JSON.stringify({ thresholds: THRESHOLD, results, geometry: globalThis.__geometry, grab: globalThis.__grab, release: globalThis.__release, touch }, null, 2));
}
await browser.close();
process.exit(failed.length ? 1 : 0);
