#!/usr/bin/env node
/**
 * 第一关跳跃可达性仿真器（用来改 LAYOUT 前先算一遍，别靠体感）
 *
 * 模型严格照抄 src/gameplay/Player.ts + ForestScene 的 arcade 配置：
 *   世界重力 1100 / 起跳 -630 / 二段跳 ×0.92 / 顶点半重力 -700（按住跳且 -180<vy<0）/
 *   下落加重 +560（vy>120）/ 松键截断 ×0.45 / 上限速 250 / 碰撞体 36×72 /
 *   地面加速 2600、空中 1900、地面减速 3000、空中 1400、急转 ×1.8
 * 物理步长取 Phaser Arcade 默认的 1/60（固定步），另外用 1/120 复核灵敏度。
 *
 * 用法：
 *   node tools/sim-jumps.mjs              # 逐段核对当前 LAYOUT，输出余量与隐患
 *   node tools/sim-jumps.mjs --json       # 同上，机器可读
 *   node tools/sim-jumps.mjs --pair 1620,360,1750,285   # 单段细算（from中心x,top,to中心x,top）
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WORLD_GRAVITY = 1100;
const SPEED = 250;
const JUMP_V = -630;
const ACCEL_GROUND = 2600;
const ACCEL_AIR = 1900;
const DECEL_GROUND = 3000;
const DECEL_AIR = 1400;
const TURN_BOOST = 1.8;
const MAX_FALL = 1000;
const AIR_JUMP_MULT = 0.92;
const APEX_EXTRA = -700;
const APEX_WINDOW = -180;
const FALL_EXTRA = 560;
const FALL_EXTRA_MIN_VY = 120;
const HOP_RELEASE_MULT = 0.45;
const BODY_W = 36;
const BODY_H = 72;
const REEF_SPAN = 471; // 站立面宽（源图 px），乘 scale 得实际跨度

const DT = 1 / 60;
const SLOTS_PER_SIDE = BODY_W / 2;

/** 从 ForestScene.ts 里读 LAYOUT（真源），避免手抄坐标 */
export function readLayout(root = process.cwd()) {
  const src = fs.readFileSync(path.join(root, 'src/scenes/ForestScene.ts'), 'utf8');
  const num = (re, s = src) => {
    const m = s.match(re);
    if (!m) throw new Error(`解析不到：${re}`);
    return Number(m[1]);
  };
  const reefs = [...src.matchAll(
    /\{\s*standCenter:\s*([\d.]+),\s*top:\s*([\d.]+),\s*scale:\s*([\d.]+),\s*label:\s*'([^']+)',\s*role:\s*'([^']+)'\s*\}/g,
  )].map(m => ({
    center: Number(m[1]), top: Number(m[2]), scale: Number(m[3]), label: m[4], role: m[5],
  }));
  const waves = [...src.matchAll(
    /\{\s*id:\s*'(W\d)',\s*ridgeCenter:\s*([\d.]+),\s*top:\s*([\d.]+),[\s\S]*?rollSpeed:\s*([\d.]+),\s*rollDistance:\s*([\d.]+)/g,
  )].map(m => ({ id: m[1], center: Number(m[2]), top: Number(m[3]), rollSpeed: Number(m[4]), rollDistance: Number(m[5]), scale: 0.18 }));
  const landing = src.match(/landing:\s*\{\s*left:\s*([\d.]+),\s*right:\s*([\d.]+),\s*top:\s*([\d.]+)\s*\}/);
  const beach = src.match(/startBeach:\s*\{\s*left:\s*([\d.]+),\s*right:\s*([\d.]+),\s*top:\s*([\d.]+)\s*\}/);
  const key = src.match(/key:\s*\{\s*x:\s*([\d.]+),\s*y:\s*([\d.]+)\s*\}/);
  const door = num(/door:\s*\{\s*openingCenterX:\s*([\d.]+)/);
  const worldWidth = num(/const WORLD_WIDTH = ([\d.]+)/);
  return {
    reefs, waves,
    startBeach: beach ? { left: +beach[1], right: +beach[2], top: +beach[3] } : { left: 0, right: 280, top: 440 },
    landing: landing ? { left: +landing[1], right: +landing[2], top: +landing[3] } : null,
    key: key ? { x: +key[1], y: +key[2] } : null,
    door, worldWidth,
  };
}

const spanOf = p => (p.scale * REEF_SPAN) / 2;
const leftOf = p => p.center - spanOf(p);
const rightOf = p => p.center + spanOf(p);

/**
 * 模拟一次"从 A 平台出发去 B 平台"的跳跃。
 * strategy:
 *   walkoff          不跳，全速走出边缘
 *   hop:<n>          按跳 n 帧后松跳跃键，方向键一直按住
 *   hop-brake:<n>    按跳 n 帧后松跳跃键 + 松开方向键（空中减速）
 *   full             一直按住跳跃 + 方向
 *   full-double:<n>  按住跳跃，离地后第 n 帧再按一次二段跳
 * 返回 { landed, x, margin, clip, apex }
 */
export function simulateJump(from, toOrTargets, strategy = 'full', dt = DT, startVx = SPEED) {
  const targets = Array.isArray(toOrTargets) ? toOrTargets : [toOrTargets];
  const hitOf = (cx, feet, prevFeet, vy) => {
    for (const t of targets) {
      const left = t.left ?? leftOf(t);
      const right = t.right ?? rightOf(t);
      const over = cx + SLOTS_PER_SIDE > left && cx - SLOTS_PER_SIDE < right;
      if (over && vy > 0 && feet >= t.top && prevFeet <= t.top + 1e-6) return t;
    }
    return null;
  };
  const startX = from.center + spanOf(from) - SLOTS_PER_SIDE; // 站在 A 右缘（碰撞体右沿贴边）
  const feetAtStart = from.top;
  let cx = startX;
  let feet = feetAtStart;
  let vy = 0;
  let vx = startVx; // 真实玩法：跑到边缘时已经是满速，不是从 0 起步
  let airJumps = 1;
  let apex = feet;
  let frames = 0;
  let jumped = false;
  let doubleAt = null;
  const [kind, arg] = String(strategy).split(':');
  const holdFrames = arg ? Number(arg) : 0;
  const maxFrames = 600;

  while (frames < maxFrames) {
    frames++;
    const onGround = feet >= from.top - 0.01 && vy >= 0 && cx <= rightOf(from);
    if (onGround) airJumps = 1;

    // —— 跳跃（walkoff 策略永不按跳，用于"从边缘走下去"的下落段）——
    if (kind !== 'walkoff' && !jumped && onGround) { vy = JUMP_V; jumped = true; }
    if (kind === 'full-double' && jumped && doubleAt === null && frames >= Number(arg) && airJumps > 0 && !onGround) {
      vy = JUMP_V * AIR_JUMP_MULT; airJumps -= 1; doubleAt = frames;
    }

    // —— 松键判定 ——
    const holdingJump = !(kind.startsWith('hop') && frames > holdFrames);
    // brake 类策略：到第 n 帧松开方向键（空中减速），full-brake 默认第 8 帧
    const brakeAt = kind.endsWith('-brake') || kind.includes('-brake:') ? (arg ? Number(arg) : 8) : null;
    const holdingDir = brakeAt === null || frames <= brakeAt;
    if (kind.startsWith('hop') && frames === holdFrames + 1 && vy < 0) vy *= HOP_RELEASE_MULT;

    // —— 重力（含顶点半重力 / 下落加重）——
    let g = WORLD_GRAVITY;
    if (!onGround) {
      if (holdingJump && vy < 0 && vy > APEX_WINDOW) g += APEX_EXTRA;
      else if (vy > FALL_EXTRA_MIN_VY) g += FALL_EXTRA;
    }
    vy = Math.min(MAX_FALL, vy + g * dt);
    feet += vy * dt;

    // —— 水平 ——
    const dir = holdingDir ? 1 : 0;
    if (dir !== 0) {
      const turning = dir * vx < 0 && Math.abs(vx) > 120;
      vx += dir * (onGround ? ACCEL_GROUND : ACCEL_AIR) * (turning ? TURN_BOOST : 1) * dt;
      vx = Math.max(-SPEED, Math.min(SPEED, vx));
    } else {
      const decel = (onGround ? DECEL_GROUND : DECEL_AIR) * dt;
      vx = Math.abs(vx) <= decel ? 0 : vx - Math.sign(vx) * decel;
    }
    cx += vx * dt;

    apex = Math.min(apex, feet);
    const prevFeet = feet - vy * dt;
    const hit = hitOf(cx, feet, prevFeet, vy);
    if (hit) {
      const right = hit.right ?? rightOf(hit);
      return { landed: true, on: hit, x: cx, margin: right - cx, apex: from.top - apex, frames, strategy };
    }
    // 撞到某块平台的左壁（在它顶面之下、横向相交）→ 掉海
    for (const t of targets) {
      const left = t.left ?? leftOf(t);
      const right = t.right ?? rightOf(t);
      const over = cx + SLOTS_PER_SIDE > left && cx - SLOTS_PER_SIDE < right;
      if (over && feet > t.top + 2 && from.top < t.top) {
        return { landed: false, clip: '撞左壁', x: cx, apex: from.top - apex, frames, strategy };
      }
    }
    if (feet > 900) break;
  }
  return { landed: false, clip: '掉海', x: cx, apex: from.top - apex, frames, strategy };
}


/** 弹道表：满蓄力跳从起跳点算起，落到「比起点低 dy」的高度（游戏坐标：y 越大越低）时水平走了多远。
 *  dy>0 = 目标更低（往下跳），dy<0 = 目标更高（往上爬）。排布礁石位置用它当基准。 */
export function travelFor(dy, strategy = 'full', dt = DT) {
  const from = { center: 0, top: 0, scale: 0 };          // scale 0 → 起跳点即原点
  const wide = { center: 6000, top: dy, scale: 100 };    // 超宽目标，只读落点
  const r = simulateJump(from, wide, strategy, dt, 0);
  return r.landed ? r.x : NaN;
}

const STRATEGIES = [
  'walkoff', 'full', 'full-brake:6', 'full-brake:12', 'full-brake:20', 'full-brake:30', 'full-brake:45', 'full-brake:60',
  'hop:2', 'hop:5', 'hop:10', 'hop:15', 'hop:20', 'hop-brake:5', 'hop-brake:15',
  'full-double:20', 'full-double:45',
];

export function checkLayout(layout) {
  const chain = [
    { center: (layout.startBeach.left + layout.startBeach.right) / 2, top: layout.startBeach.top, scale: 1, label: '沙滩起点', left: layout.startBeach.left, right: layout.startBeach.right },
    ...layout.reefs.map(r => ({ ...r, kind: 'reef' })),
    ...layout.waves.map(w => ({ center: w.center, top: w.top, scale: w.scale, label: `浪 ${w.id}`, kind: 'wave' })),
    { center: (layout.landing.left + layout.landing.right) / 2, top: layout.landing.top, scale: 1, label: '右岸大陆', kind: 'landing', left: layout.landing.left, right: layout.landing.right },
  ].sort((a, b) => (a.left ?? a.center - spanOf(a)) - (b.left ?? b.center - spanOf(b)));

  const asTarget = p => ({ top: p.top, left: p.left ?? leftOf(p), right: p.right ?? rightOf(p), label: p.label });
  const rows = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i];
    const from = { center: a.center, top: a.top, scale: a.scale, left: a.left, right: a.right, label: a.label };
    // 目标 = 前方所有平台：越过近的那块落到更远的安全平台不算失误，掉海才算
    const targets = chain.slice(i + 1).map(asTarget);
    const per = {};
    for (const s of STRATEGIES) {
      const r = simulateJump(from, targets, s);
      per[s] = r.landed ? r.on.label : '掉海';
    }
    const deaths = Object.entries(per).filter(([, v]) => v === '掉海').map(([k]) => k);
    const safe = Object.entries(per).filter(([, v]) => v !== '掉海');
    const nextLabel = chain[i + 1].label;
    // 只落回"紧邻下一块"才算这一跳达成设计意图
    const landsOnNext = safe.some(([, v]) => v === nextLabel);
    rows.push({
      from: a.label, to: nextLabel,
      gap: Math.round(((chain[i + 1].left ?? leftOf(chain[i + 1])) - (a.right ?? rightOf(a))) * 10) / 10,
      dh: Math.round((chain[i + 1].top - a.top) * 10) / 10,
      landsOnNext,
      deadInputs: deaths.length,
      deadStrategies: deaths.join(','),
      outcomes: safe.map(([k, v]) => `${k}→${v}`).join(' '),
    });
  }
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const layout = readLayout();
  if (args[0] === '--ballistic') {
    console.log('落差 dy（负=往上爬，正=往下跳）\t满蓄力水平行程 px\t短按(hop:12)行程');
    for (const dy of [-145, -120, -95, -75, -50, -25, 0, 25, 50, 75, 95, 125]) {
      console.log(`${String(dy).padStart(5)}\t\t\t\t${Math.round(travelFor(dy))}\t\t\t${Math.round(travelFor(dy, 'hop:12'))}`);
    }
    process.exit(0);
  }
  if (args[0] === '--pair') {
    const [fc, ft, tc, tt] = args[1].split(',').map(Number);
    const a = { center: fc, top: ft, scale: 0.15, label: 'A' };
    const b = { center: tc, top: tt, scale: 0.15, label: 'B' };
    for (const s of STRATEGIES) console.log(s.padEnd(16), JSON.stringify(simulateJump(a, b, s)));
    process.exit(0);
  }
  const rows = checkLayout(layout);
  if (args.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
  console.log('段\t\t缝\t落差\t能落到下一块\t会掉海的输入\t各策略落点');
  for (const r of rows) {
    const warn = r.deadInputs > 0 ? ` ⚠️${r.deadInputs}种` : '';
    console.log(`${r.from}→${r.to}\t${r.gap}\t${r.dh}\t${r.landsOnNext ? '是' : '否'}${warn}\t${r.outcomes}`);
  }
}
