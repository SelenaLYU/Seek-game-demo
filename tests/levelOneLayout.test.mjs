/**
 * 第一关布局的几何回归测试（跳跃可达性 + 礁石碰撞盒与美术对齐）。
 *
 * 为什么需要它：layout 的四个数字（standCenter/top/scale）以前是靠手感调的，没有任何门槛，
 * 于是出现过「全速走出爬升礁右缘会摔下去」「爬升跳角净空只剩 5.5px」这类只有真跳一次才发现的坑。
 * 后来又发现更隐蔽的一类：碰撞盒的站立面（旧全局常量 547..1018 @248）跟贴图上真实平整的岩面
 * 对不上——左缘 547 落在斜坡上、右缘 1018 把平顶从中间切断，玩家会在看起来平的岩面上踩空。
 *
 * 断言口径（故意保守，只锁"已经验证过的事实"）：
 *   A. 跳跃可达性（沿用 tools/sim-jumps.mjs 的真实物理模型，平台的左右沿/顶面来自 LAYOUT）：
 *      1. 每一跳至少存在一种「合理输入」（轻按/中按/长按/满蓄力）能安全落地（不落海）；
 *      2. 爬升礁（浪前）必须能用轻按跳（hop:5）落上去 —— 防止角净空退化回"撞左壁掉海"；
 *      3. 从爬升礁"全速走落"必须稳稳落在浪前冲刺礁上（余量 ≥ 10px）—— 防止落差/宽度退化回"掸下去"；
 *      4. 单浪会把角色向岸边送至落点；冲刺礁不能直接二段跳绕过浪区。
 *   B. 站立面档案 × 贴图（读 PNG 真实像素，纯几何断言）：
 *      5. 每个 role 都登记了可站立面档案，档案段升序、不重叠、落在素材内容框内；
 *      6. 每一段档案的每一列，贴图实测顶面与 srcTop 的偏差 ≤ REEF_STAND_TOLERANCE
 *         （即"可站立面只覆盖真实平整的岩面"，且完全落在渲染出来的素材里）；
 *      7. 世界碰撞盒 = 档案 × scale 派生，且整体落在贴图的渲染矩形内；相邻碰撞盒不重叠；
 *      8. 非可走斜坡被排除：旧全局矩形 547..1018 @248 带内偏差 13px（> 容差）必须被拒斥，
 *         左缘 547 落在左坡上、右缘 1018 落在平顶中间，档案两端必须越过它们。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { readLayout, simulateJump, travelFor } from '../tools/sim-jumps.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCENE_PATH = path.join(ROOT, 'src/scenes/ForestScene.ts');
const REEF_ASSET = path.join(ROOT, 'assets/level1/level1-stepping-reef-v1.png');
const SOURCE = fs.readFileSync(SCENE_PATH, 'utf8');
const PLAYER_SOURCE = fs.readFileSync(path.join(ROOT, 'src/gameplay/Player.ts'), 'utf8');

// ---------------------------------------------------------------------------
// 从 ForestScene.ts 解析真源（测试不能 import 它：场景依赖 Phaser 与 ?url 资源）
// ---------------------------------------------------------------------------

const readBlock = (re, label) => {
  const m = SOURCE.match(re);
  assert.ok(m, `ForestScene.ts 里找不到 ${label}，测试无法核对真源`);
  return m[1];
};

/** `const NAME: T = [ { srcLeft: n, srcRight: n, srcTop: n }, … ];` → 档案段数组 */
const parseStandSteps = block => [...block.matchAll(
  /\{\s*srcLeft:\s*([\d.]+),\s*srcRight:\s*([\d.]+),\s*srcTop:\s*([\d.]+)\s*\}/g,
)].map(([, l, r, t]) => ({ srcLeft: Number(l), srcRight: Number(r), srcTop: Number(t) }));

const ART = Object.fromEntries(
  [...readBlock(/const REEF_ART = \{([\s\S]*?)\} as const;/, 'REEF_ART')
    .matchAll(/(\w+):\s*([\d.]+)/g)].map(([, k, v]) => [k, Number(v)]),
);

const STAND_TOL = Number(readBlock(/const REEF_STAND_TOLERANCE = ([\d.]+)/, 'REEF_STAND_TOLERANCE'));

/** 被 REEF_STANDS 引用的档案常量（目前只有一份实测平顶；加新档案时这里同步登记） */
const PROFILE_CONSTS = {
  REEF_STAND_FLAT_TOP: parseStandSteps(readBlock(
    /const REEF_STAND_FLAT_TOP: readonly ReefStandStep\[\] = \[([\s\S]*?)\];/,
    'REEF_STAND_FLAT_TOP',
  )),
};

/** 逐块可站立面档案：role → 档案段数组（ForestScene.ts: REEF_STANDS） */
const STAND_BY_ROLE = Object.fromEntries([...readBlock(
  /const REEF_STANDS: Record<ReefRole, readonly ReefStandStep\[\]> = \{([\s\S]*?)\n\};/,
  'REEF_STANDS',
).matchAll(/'([\w-]+)':\s*([A-Za-z_]\w*)/g)].map(([, role, name]) => {
  assert.ok(PROFILE_CONSTS[name], `REEF_STANDS['${role}'] 引用了测试不认识的档案常量 ${name}`);
  return [role, PROFILE_CONSTS[name]];
}));

/** 浪的源图几何（ForestScene.ts: WAVE）：碰撞条宽 = (ridgeRight − ridgeLeft) × scale */
const WAVE = Object.fromEntries(
  [...readBlock(/const WAVE = \{([\s\S]*?)\};/, 'WAVE')
    .matchAll(/(\w+):\s*([\d.]+)/g)].map(([, k, v]) => [k, Number(v)]),
);
const WAVE_HALF_WIDTH = ((WAVE.ridgeRight - WAVE.ridgeLeft) * WAVE.scale) / 2;

// ---------------------------------------------------------------------------
// 与 ForestScene.ts 的派生函数同式的纯几何（reefStandBoxes / reefSpriteOrigin）
// ---------------------------------------------------------------------------

const profileCenter = steps => (Math.min(...steps.map(s => s.srcLeft)) + Math.max(...steps.map(s => s.srcRight))) / 2;
const anchorTop = steps => Math.min(...steps.map(s => s.srcTop));

/** 礁石（readLayout 形状）→ 世界站立碰撞盒，公式必须与 reefStandBoxes 一致 */
function standBoxes(reef) {
  const steps = STAND_BY_ROLE[reef.role];
  assert.ok(steps?.length, `REEF_STANDS 缺少 role=${reef.role}`);
  const center = profileCenter(steps);
  const anchor = anchorTop(steps);
  return steps.map(s => ({
    ...s,
    x: reef.center + (s.srcLeft - center) * reef.scale,
    y: reef.top + (s.srcTop - anchor) * reef.scale,
    width: (s.srcRight - s.srcLeft) * reef.scale,
  }));
}

/** 贴图左上角的世界落位 */
function spriteOrigin(reef) {
  const steps = STAND_BY_ROLE[reef.role];
  return {
    x: reef.center - profileCenter(steps) * reef.scale,
    y: reef.top - anchorTop(steps) * reef.scale,
  };
}

/** 礁石在跳跃模拟器里的单矩形模型：左右沿取档案范围、顶面取声明的 top（= 最高的那一段） */
function reefPlatform(reef) {
  const steps = STAND_BY_ROLE[reef.role];
  const center = profileCenter(steps);
  const left = reef.center + (Math.min(...steps.map(s => s.srcLeft)) - center) * reef.scale;
  const right = reef.center + (Math.max(...steps.map(s => s.srcRight)) - center) * reef.scale;
  return { center: reef.center, top: reef.top, scale: reef.scale, label: reef.label, role: reef.role, left, right };
}

// ---------------------------------------------------------------------------
// 读 PNG 真实像素：逐列 alpha>128 的顶面 y（Node 自带 zlib，零依赖）
// ---------------------------------------------------------------------------

function topProfileByColumn(pngPath, alphaThreshold = 128) {
  const buf = fs.readFileSync(pngPath);
  assert.equal(buf.readUInt32BE(0), 0x89504e47, `${pngPath} 不是 PNG`);
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  assert.equal(interlace, 0, '只支持非隔行 PNG');
  assert.equal(bitDepth, 8, '只支持 8bit PNG');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  assert.ok(channels, `不支持的 PNG colorType=${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else assert.equal(filter, 0, `未知 PNG filter=${filter}`);
      cur[i] = v & 0xff;
    }
  }

  const alphaAt = (x, y) => {
    const i = (y * width + x) * channels;
    if (colorType === 6) return pixels[i + 3];
    if (colorType === 4) return pixels[i + 1];
    return 255;
  };
  const tops = new Array(width).fill(null);
  const bottoms = new Array(width).fill(null);
  let minY = Infinity, maxY = -1, minX = Infinity, maxX = -1;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) if (alphaAt(x, y) > alphaThreshold) { tops[x] = y; break; }
    for (let y = height - 1; y >= 0; y--) if (alphaAt(x, y) > alphaThreshold) { bottoms[x] = y; break; }
    if (tops[x] !== null) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (tops[x] < minY) minY = tops[x];
      if (bottoms[x] > maxY) maxY = bottoms[x];
    }
  }
  return { width, height, tops, bottoms, content: { left: minX, right: maxX, top: minY, bottom: maxY } };
}

const art = topProfileByColumn(REEF_ASSET);
const layout = readLayout();
const REASONABLE = ['hop:5', 'hop:12', 'hop:20', 'full'];

/**
 * 深海海峡（起跳高台 → 海心落脚礁，缝约 496px）是**故意**不能用普通跳过去的：
 * 设计路线是跳起抓海鸥荡过去，二段跳是兜底（不是常规输入）。所以这一跳单独用二段跳口径断言。
 */
const GULL_CROSSING = ['full-double:20', 'full-double:45'];

/** 按 x 排好整条平台链：沙滩 → 礁石 → 浪 → … → 右岸 */
function buildChain(L) {
  const wavePlatform = p => ({ ...p, label: `浪 ${p.id}`, left: p.center - WAVE_HALF_WIDTH, right: p.center + WAVE_HALF_WIDTH, role: 'wave', waveId: p.id });
  return [
    { center: (L.startBeach.left + L.startBeach.right) / 2, top: L.startBeach.top, scale: 0, label: '沙滩起点', left: L.startBeach.left, right: L.startBeach.right, role: 'start-beach' },
    ...L.reefs.map(reefPlatform),
    ...L.waves.map(wavePlatform),
    { center: (L.landing.left + L.landing.right) / 2, top: L.landing.top, scale: 0, label: '右岸大陆', left: L.landing.left, right: L.landing.right, role: 'landing' },
  ].sort((a, b) => a.left - b.left);
}

// ---------------------------------------------------------------------------
// B. 站立面档案 × 贴图
// ---------------------------------------------------------------------------

test('礁石素材与声明的契约一致（尺寸 + 内容框）', () => {
  assert.equal(art.width, ART.width, '贴图宽与 REEF_ART.width 不一致');
  assert.equal(art.height, ART.height, '贴图高与 REEF_ART.height 不一致');
  for (const key of ['left', 'right', 'top', 'bottom']) {
    assert.equal(art.content[key], ART[`content${key[0].toUpperCase()}${key.slice(1)}`], `alpha>128 内容框 ${key} 与 REEF_ART 声明不一致——素材换了就要重测档案`);
  }
});

test('每个 role 都登记了可站立面档案，档案段合法且落在素材内容框内', () => {
  const roles = layout.reefs.map(r => r.role);
  assert.equal(new Set(roles).size, roles.length, 'LAYOUT.reefs 里 role 不能重复');
  for (const role of roles) assert.ok(STAND_BY_ROLE[role]?.length, `REEF_STANDS 缺少 role=${role}`);
  for (const [role, steps] of Object.entries(STAND_BY_ROLE)) {
    assert.ok(roles.includes(role), `REEF_STANDS 登记了布局里不存在的 role=${role}`);
    let prevRight = -Infinity;
    for (const step of steps) {
      assert.ok(step.srcRight > step.srcLeft, `${role} 档案段宽度必须 > 0`);
      assert.ok(step.srcLeft >= prevRight, `${role} 档案段必须按 srcLeft 升序且不重叠`);
      assert.ok(step.srcLeft >= ART.contentLeft && step.srcRight <= ART.contentRight, `${role} 档案 x 越出素材内容框`);
      assert.ok(step.srcTop >= ART.contentTop && step.srcTop <= ART.contentBottom, `${role} 档案 srcTop 越出素材内容框`);
      prevRight = step.srcRight;
    }
  }
});

test('每段可站立档案都只覆盖贴图上真实平整的岩面顶边', () => {
  const rows = [];
  for (const reef of layout.reefs) {
    for (const step of STAND_BY_ROLE[reef.role]) {
      let maxDev = 0, devAt = -1;
      for (let x = step.srcLeft; x < step.srcRight; x++) {
        const top = art.tops[x];
        assert.ok(top !== null, `${reef.role} 档案列 x=${x} 在贴图上是空的——档案拍到素材外面了`);
        const dev = Math.abs(top - step.srcTop);
        if (dev > maxDev) { maxDev = dev; devAt = x; }
      }
      rows.push(`${reef.role} [${step.srcLeft},${step.srcRight})@${step.srcTop}: 实测最大偏差 ${maxDev}px @x=${devAt}`);
      assert.ok(
        maxDev <= STAND_TOL,
        `${reef.role} 档案段 [${step.srcLeft},${step.srcRight})@${step.srcTop} 与实测顶面差 ${maxDev}px @x=${devAt}，超过容差 ${STAND_TOL}px——玩家会悬空或埋进岩石`,
      );
      // 段内必须是"一整段连续岩面"（没有透明断口）
      for (let x = step.srcLeft; x < step.srcRight; x++) assert.ok(art.tops[x] !== null);
    }
  }
  console.log('  站立档案 vs 贴图实测顶面：\n   ' + rows.join('\n   '));
});

test('世界碰撞盒 = 档案 × scale 派生，且整体落在贴图渲染矩形内、相邻盒不重叠', () => {
  const boxes = layout.reefs.flatMap(reef => standBoxes(reef).map(box => ({ ...box, role: reef.role, scale: reef.scale })));
  for (const reef of layout.reefs) {
    const origin = spriteOrigin(reef);
    const rendered = {
      left: origin.x,
      top: origin.y,
      right: origin.x + ART.width * reef.scale,
      bottom: origin.y + ART.height * reef.scale,
    };
    const own = standBoxes(reef);
    for (const box of own) {
      assert.ok(Math.abs(box.width - (box.srcRight - box.srcLeft) * reef.scale) < 1e-9, `${reef.role} 碰撞盒宽必须 = 档案宽 × scale`);
      assert.ok(box.x >= rendered.left - 1e-6 && box.x + box.width <= rendered.right + 1e-6, `${reef.role} 碰撞盒横向越出贴图`);
      assert.ok(box.y >= rendered.top - 1e-6 && box.y <= rendered.bottom + 1e-6, `${reef.role} 碰撞盒纵向越出贴图`);
    }
    // 声明的 top 必须是最高的那一段（复活点/路标都挂在它上面）
    assert.ok(Math.abs(Math.min(...own.map(box => box.y)) - reef.top) < 1e-9, `${reef.role} 的 top 必须等于最高一段档案的顶面`);
  }
  // 相邻礁石的碰撞盒不能叠在一起（挑在高处的会吃掉下一块的可站面）
  const sorted = [...boxes].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    if (sorted[i].x < prev.x + prev.width - 1e-6) {
      assert.ok(
        Math.abs(sorted[i].y - prev.y) <= 8,
        `${prev.role} 与 ${sorted[i].role} 的碰撞盒重叠却落差 ${Math.round(Math.abs(sorted[i].y - prev.y))}px`,
      );
    }
  }
});

test('档案拒斥「看着能站」的斜坡与落坎：旧全局矩形 547..1018 @248 不合格', () => {
  const LEGACY = { left: 547, right: 1018, top: 248 };
  const steps = STAND_BY_ROLE[layout.reefs[0].role];
  const first = steps[0];
  const last = steps.at(-1);

  // 1) 旧矩形带内实测偏差 13px > 容差：它既盖住了左坡，又没盖住右侧真正的平顶
  let legacyDev = 0;
  for (let x = LEGACY.left; x < LEGACY.right; x++) legacyDev = Math.max(legacyDev, Math.abs(art.tops[x] - LEGACY.top));
  assert.ok(legacyDev > STAND_TOL, `旧全局矩形 547..1018 @248 的实测偏差 ${legacyDev}px 应当超过容差 ${STAND_TOL}px（这正是要修的坑）`);

  // 2) 旧矩形两端都落在「看着能站」的位置：档案必须越过这两端（否则退回旧常量）
  assert.ok(first.srcLeft > LEGACY.left, `档案左缘 ${first.srcLeft} 必须越过旧左缘 547 —— 那段是斜坡（实测顶面 261，比档案面低 ${art.tops[LEGACY.left] - first.srcTop}px）`);
  assert.ok(last.srcRight > LEGACY.right, `档案右缘 ${last.srcRight} 必须越过旧右缘 1018 —— 旧右缘切在平顶中间，右边还有 ${last.srcRight - LEGACY.right}px 平顶不可走`);
  assert.ok(
    Math.abs(art.tops[LEGACY.left] - first.srcTop) > STAND_TOL,
    `旧左缘 547 实测顶面 ${art.tops[LEGACY.left]} 应当明显低于档案段顶面 ${first.srcTop}（落在斜坡上）`,
  );

  // 3) 左坡 547..档案左缘 里多数列都不在容差内 → 是非可走斜坡，档案把它排除是刻意的
  const offProfile = [];
  for (let x = LEGACY.left; x < first.srcLeft; x++) {
    if (Math.abs(art.tops[x] - first.srcTop) > STAND_TOL) offProfile.push(x);
  }
  assert.ok(
    offProfile.length >= (first.srcLeft - LEGACY.left) * 0.5,
    `左坡 [547,${first.srcLeft}) 里只有 ${offProfile.length} 列超出容差，斜坡特征不足`,
  );

  // 4) 右缘 1018 落在平顶中间：1018..档案右缘 这一整段贴图都是平的 → 旧矩形把平顶切断，玩家会在平处踩空
  let midDev = 0;
  for (let x = LEGACY.right; x < last.srcRight; x++) midDev = Math.max(midDev, Math.abs(art.tops[x] - last.srcTop));
  assert.ok(
    midDev <= STAND_TOL,
    `旧右缘 1018 到档案右缘 ${last.srcRight} 之间实测偏差 ${midDev}px，应当是一整段平顶（说明旧矩形把它切断了）`,
  );

  // 5) 档案右缘再往右最多几步就离开容差，不能算可走面（避免把继续递减的岩面当成平台）
  let breakAt = null;
  for (let x = last.srcRight; x < last.srcRight + 40; x++) {
    if (Math.abs(art.tops[x] - last.srcTop) > STAND_TOL) { breakAt = x - last.srcRight; break; }
  }
  assert.ok(breakAt !== null && breakAt <= 16, `档案右缘 ${last.srcRight} 之外 ${breakAt ?? '>40'}px 内应当离开容差`);
});

test('addReef 只消费 per-reef 档案派生（禁止再回到全局常量矩形）', () => {
  assert.ok(!/const REEF = \{/.test(SOURCE), '旧的全局 REEF 站立矩形必须删掉');
  assert.ok(!/REEF\.stand(Left|Right|Top)/.test(SOURCE), 'addReef 不能引用全局 REEF.stand* 常量');
  assert.match(SOURCE, /reefStandBoxes\(reef\)/, 'addReef 必须逐段消费 reefStandBoxes(reef)');
  assert.match(SOURCE, /reefSpriteOrigin\(reef\)/, '贴图落位必须由同一份档案派生');
  // 世界盒/贴图落位必须真的由「档案 × scale」算出来（上面测试 4 用同一组公式复算，这里钉住公式本身）
  assert.match(SOURCE, /x:\s*reef\.standCenter \+ \(step\.srcLeft - center\) \* reef\.scale/, '碰撞盒 x 必须 = standCenter + (srcLeft − 档案中心) × scale');
  assert.match(SOURCE, /y:\s*reef\.top \+ \(step\.srcTop - anchorTop\) \* reef\.scale/, '碰撞盒 y 必须 = top + (srcTop − 基准 srcTop) × scale');
  assert.match(SOURCE, /width:\s*\(step\.srcRight - step\.srcLeft\) \* reef\.scale/, '碰撞盒宽必须 = 档案段宽 × scale');
  assert.match(SOURCE, /const visibleBottom = origin\.y \+ REEF_ART\.contentBottom \* reef\.scale/, '碰撞柱底必须从真实素材内容框推导，不能延伸到水面');
  assert.match(SOURCE, /height:\s*Math\.max\(1, visibleBottom - box\.y\)/, '碰撞柱高度必须止于岩石贴图可见底边');
  assert.doesNotMatch(SOURCE, /height:\s*WORLD_HEIGHT - box\.y/, '禁止把礁石碰撞柱延长到水面制造隐形墙');
  assert.match(SOURCE, /x:\s*reef\.standCenter - standProfileCenter\(reef\.stand\) \* reef\.scale/, '贴图 x 必须 = standCenter − 档案中心 × scale');
  assert.match(SOURCE, /y:\s*reef\.top - standAnchorTop\(reef\.stand\) \* reef\.scale/, '贴图 y 必须 = top − 基准 srcTop × scale');
});

// ---------------------------------------------------------------------------
// A. 跳跃可达性（几何模型照抄 Player.ts + arcade 配置，见 tools/sim-jumps.mjs）
// ---------------------------------------------------------------------------

const chain = buildChain(layout);
const targetsAfter = i => chain.slice(i + 1).map(p => ({ top: p.top, left: p.left, right: p.right, label: p.label }));
const jump = (i, strategy) => {
  const platform = chain[i];
  const movingOffset = platform.role === 'wave'
    ? layout.waves.find(w => w.id === platform.waveId)?.rollDistance ?? 0
    : 0;
  return simulateJump(
    {
      center: platform.center + movingOffset,
      top: platform.top,
      scale: platform.scale,
      left: platform.left + movingOffset,
      right: platform.right + movingOffset,
    },
    targetsAfter(i),
    strategy,
  );
};

test('出生点直接在第一块低礁上，韩梅梅不从沙滩起步', () => {
  const firstReef = layout.reefs.find(r => r.role === 'warmup-low');
  assert.ok(firstReef, '布局缺少第一块低礁');
  assert.match(SOURCE, /const START_REEF = LAYOUT\.reefs\.find\(reef => reef\.role === 'warmup-low'\)/,
    '出生点必须由第一块低礁真源派生，避免坐标漂移');
  assert.match(SOURCE, /const START_POINT = \{ x: START_REEF\.standCenter, y: START_REEF\.top - 45 \}/,
    '出生点应对齐礁石站立中心，并悬在顶面上方供物理落地');
  assert.match(SOURCE, /从这块礁石出发/, '起点提示要与“出生在礁石上”一致');
});

test('每一跳都存在"合理输入"能安全落地（不落海）', () => {
  const rows = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const hopName = `${chain[i].label}→${chain[i + 1].label}`;
    const isGullCrossing = chain[i].role === 'gull-launch' && chain[i + 1].role === 'gull-landing';
    const strategies = isGullCrossing ? GULL_CROSSING : REASONABLE;
    const safe = strategies.filter(s => jump(i, s).landed);
    rows.push(`${hopName}: ${safe.join('/') || '无'}${isGullCrossing ? '（海鸥海峡，门槛用二段跳）' : ''}`);
    assert.ok(safe.length > 0, `${hopName} 没有任何合理输入能安全落地：${rows.at(-1)}`);
  }
  console.log('  可落地的合理输入：\n   ' + rows.join('\n   '));
});

test('爬升礁必须能用轻按跳落上去（角净空回归）', () => {
  const idx = chain.findIndex(p => p.role === 'wave-climb');
  assert.ok(idx > 0, '布局里找不到浪前爬升礁');
  const r = jump(idx - 1, 'hop:5');
  assert.ok(r.landed, `从 ${chain[idx - 1].label} 轻按跳应当能落到浪前爬升礁，实测：${r.landed ? r.on.label : r.clip}`);
  assert.equal(r.on.label, chain[idx].label, `轻按跳应当正好落在浪前爬升礁，实测落在 ${r.on.label}`);
});

test('从爬升礁全速走落要稳稳落到冲刺礁（余量 ≥ 10px）', () => {
  const idx = chain.findIndex(p => p.role === 'wave-climb');
  const r = jump(idx, 'walkoff');
  assert.ok(r.landed, `从浪前爬升礁走落不应掉海，实测：${r.landed ? r.on.label : r.clip}`);
  assert.equal(r.on.label, chain[idx + 1].label, `走落应当落在 ${chain[idx + 1].label}，实测落在 ${r.on.label}`);
  assert.ok(r.margin >= 10, `落在冲刺礁上的余量只有 ${Math.round(r.margin)}px（要求 ≥10px），宽度/落差退化会导致玩家被掸下去`);
});

test('第一关只显示实体钥匙：不额外绘制寻钥匙光柱、提示牌或海面矩形覆盖', () => {
  assert.doesNotMatch(SOURCE, /targetBeacon|keyBeacon|private doorHint\b/, '不应有独立的钥匙导航标记或门上提示牌');
  assert.doesNotMatch(SOURCE, /SEA_SURFACE|createSeaSurface/, '不应绘制额外的海面蓝色矩形覆盖');
  assert.match(SOURCE, /\.image\(LAYOUT\.key\.x, LAYOUT\.key\.y, ART\.key\)/, '实体金钥匙仍应正常显示');
});

test('浪开局即以较快速度向门循环，不等待玩家触发', () => {
  const waves = chain.filter(p => p.role === 'wave');
  assert.equal(waves.length, 1, `应当只有 1 朵浪，实测 ${waves.length}`);
  assert.equal(Math.round(waves[0].center), layout.waves[0].center);
  assert.ok(layout.waves[0].rollSpeed > 56, '滚浪速度应比原版更快');
  assert.ok(layout.waves[0].rollDistance >= 240, '单浪前移距离应足以将角色送入岸侧区域');
  assert.match(SOURCE, /state:\s*'rolling',[\s\S]*?rollStartedAt:\s*this\.levelClockMs/, '创建浪时必须直接开始滚动');
  assert.match(SOURCE, /wave\.completedCycles\s*\+=\s*1;\s*this\.resetWave\(wave\)/, '每轮消散后必须立即从起点启动下一轮');
  assert.doesNotMatch(SOURCE, /private resetWavesLeftBehind/, '循环浪不应依赖玩家回到左侧才复位');
  const landingReef = chain.find(p => p.role === 'wave-landing');
  assert.ok(landingReef, '单浪消散后必须有实体礁石承接角色，不能只依赖背景画面');
});

test('第一关适度削弱跳高和顶点滞空，其他章节保留默认跳跃手感', () => {
  assert.match(SOURCE, /jumpVelocity:\s*-580/);
  assert.match(SOURCE, /apexGravityExtra:\s*-450/);
  assert.match(SOURCE, /apexVelocityWindow:\s*-150/);
  assert.match(SOURCE, /airJumpMultiplier:\s*0\.88/);
  assert.match(PLAYER_SOURCE, /jumpVelocity:\s*-630/);
  assert.match(PLAYER_SOURCE, /apexGravityExtra:\s*-700/);
  assert.match(PLAYER_SOURCE, /airJumpMultiplier:\s*0\.92/);
});

test('钥匙缩小；拾取后无门闪烁/粒子/延迟，仍须持钥落地进门', () => {
  assert.match(SOURCE, /const KEY = \{ scale: 0\.08/);
  assert.doesNotMatch(SOURCE, /DOOR_UNLOCK_DELAY_MS|pulseDoor\(/);
  assert.doesNotMatch(SOURCE, /Effects\.sparkBurst\(this, LAYOUT\.key\.x/, '门楣不再播放会读作门闪烁的拾取粒子');
  assert.match(SOURCE, /if \(!this\.keyCollected\)[\s\S]*?return;[\s\S]*?pBody\.blocked\.down/);
});

/** 二段跳最晚触发的水平行程（比"顶点触发"的口径远得多，才是真正要封的上限） */
function doubleJumpReach(dy) {
  let best = 0;
  for (let n = 6; n <= 80; n += 2) best = Math.max(best, travelFor(dy, `full-double:${n}`));
  return best;
}

test('浪区不可绕过：冲刺礁不能二段跳直达浪后落脚礁', () => {
  const idx = chain.findIndex(p => p.role === 'wave-sprint');
  assert.ok(idx > 0, '布局里找不到浪前冲刺礁');
  const takeoffX = chain[idx].right - 18;
  for (let j = idx + 1; j < chain.length; j++) {
    const target = chain[j];
    const drop = target.top - chain[idx].top; // 正=目标更低
    const reach = doubleJumpReach(drop) + 18; // +18：身体半径（落在边缘也算够到）
    const dist = target.left - takeoffX;
    if (target.role === 'wave') {
      assert.ok(dist <= reach, `${target.label} 应当踩得到（距离 ${Math.round(dist)}px，二段跳射程 ${Math.round(reach)}px）`);
      continue;
    }
    assert.ok(
      dist > reach,
      `${target.label} 离冲刺礁只有 ${Math.round(dist)}px，二段跳（射程 ${Math.round(reach)}px）能直接绕过滚浪——浪区失去强制力`,
    );
  }
  const landing = chain.find(p => p.role === 'wave-landing');
  console.log(`  浪区强制力：冲刺礁起跳点 x=${Math.round(takeoffX)} · 浪后落脚礁左缘 ${Math.round(landing.left)} · 距离 ${Math.round(landing.left - takeoffX)}px`);
});
