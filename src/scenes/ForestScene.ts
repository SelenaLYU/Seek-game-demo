import Phaser from 'phaser';
import { applyHDCamera, logicalWorldViewportWidth } from '../systems/Resolution';
import { Player } from '../gameplay/Player';
import { Terrain } from '../gameplay/Terrain';
import { Vine } from '../gameplay/Vine';
import { Effects } from '../gameplay/Effects';
import { Sfx } from '../systems/Sfx';
import { isBackgroundMusicEnabled, registerBackgroundMusic } from '../MusicSettings';
import type { ChapterOneRoomProgress } from '../gameplay/ChapterOneRoomProgress';
import { ChapterOneRoomSession } from '../gameplay/ChapterOneRoomSession';
import {
  canEnterChapterOneRoom,
  type ChapterOneRoomEvent,
} from '../gameplay/ChapterOneRoomRules';
import { createGameHud, screenSpaceOrigin, type GameHudHandle } from '../ui/GameHud';
import { resolveImageUrl } from '../assets';
import { loadAudioInBackground } from '../systems/DeferredAudio';

import level1BackgroundUrl from '../../scene/level1-watercolor-game-background-v1-1900x540.png?url';
import footstepUrl from '../../assets/audio/sfx-footstep.wav?url';
import jumpSfxUrl from '../../assets/audio/sfx-jump.wav?url';
import forestBgmUrl from '../../assets/audio/forest-bgm.mp3?url';

/** 本关正式素材的纹理 key 与运行时路径 */
const ART = {
  background: 'level1-background',
  reef: 'level1-stepping-reef',
  gull: 'level1-swing-seagull',
  wave: 'level1-jump-wave-crest',
  key: 'level1-golden-jasmine-key',
  door: 'level1-memory-room-stone-door',
} as const;

const LEVEL1_FILES: Array<[string, string]> = [
  [ART.reef, 'assets/level1/level1-stepping-reef-v1.png'],
  [ART.gull, 'assets/level1/level1-swing-seagull-v3-cute.png'],
  [ART.wave, 'assets/level1/level1-jump-wave-crest-v2.png'],
  [ART.key, 'assets/level1/level1-golden-jasmine-key-v1.png'],
  [ART.door, 'assets/level1/level1-memory-room-stone-door-v3.png'],
].map(([key, path]) => [key, resolveImageUrl(path)] as [string, string]);

/**
 * 礁石素材契约（`assets/level1/level1-stepping-reef-v1.png`，1774×887 RGBA）：
 * content* 是 alpha>128 的实测内容框。可站立面档案（REEF_STANDS）必须落在内容框里，
 * 素材一换尺寸/内容框就重测；tests/levelOneLayout.test.mjs 会拿真实的贴图像素校验这组数。
 */
const REEF_ART = {
  width: 1774,
  height: 887,
  contentLeft: 65,
  contentRight: 1710,
  contentTop: 235,
  contentBottom: 738,
} as const;

/** 浪尖（源图 1536×1024）：最高暖白泡沫脊在源图 x 829..1263、顶面 y=158 */
const WAVE = { scale: 0.18, ridgeLeft: 829, ridgeRight: 1263, ridgeTop: 158, bodyHeight: 60 };

/** 浪脊碰撞体宽（= 可站立面宽）；贴图原点同样是左上角，但取景中心不等于浪脊中心 */
const WAVE_BODY_WIDTH = (WAVE.ridgeRight - WAVE.ridgeLeft) * WAVE.scale;
const WAVE_IMAGE_OFFSET = {
  x: ((WAVE.ridgeLeft + WAVE.ridgeRight) / 2) * WAVE.scale - WAVE_BODY_WIDTH / 2,
  y: WAVE.ridgeTop * WAVE.scale,
};

/**
 * 滚浪判决：浪是「限时移动平台」——踩上浪脊就起滚，滚到尽头开始消散；
 * 消散时浪体不再承重，没跳走的玩家会踩空落水。
 */
const WAVE_RIDE = {
  /** 消散淡出时长 ms */
  dissolveMs: 900,
  /** 承重判定容差 px（脚底离浪脊顶面多近算站在浪上） */
  standTolerance: 6,
  /** 承重判定窗口 px：滚动浪面锁定高度后，只容忍物理碰撞的一帧误差 */
  rideWindow: 8,
  /** 消散后玩家掉到浪脊以下这么多像素仍没跳走 → 判定被卷走（要大于浪体厚 60，才算真掉出浪体） */
  sinkDepth: 64,
  /** 剩余滚动时间少于该值（秒）时提示「快散开了」 */
  warnSeconds: 0.9,
};

/**
 * 浪脊亮条（可选）：队友反馈像“进度条”，默认关闭；如需视觉辅助再打开。
 * 这里只保留几何常量，alpha=0 时不会渲染可见条。
 */
const RIDGE_BAR = { width: 78, height: 4, alpha: 0 };

/** 重生重入锁 ms：同一帧可能被多条死亡路径命中，防重复扣命 */
const RESPAWN_LOCK_MS = 800;

/** 摘到钥匙后石门解锁延迟 ms：先落地、再走回门口，不能在空中直接进门 */
const DOOR_UNLOCK_DELAY_MS = 700;
/** 门还锁着时的状态栏提示节流 ms */
const DOOR_HINT_THROTTLE_MS = 2200;

/** 海鸥（源图 1774×887）：抓取点=双脚之间，源图 ≈(730, 800) */
const GULL = { scale: 0.142, gripX: 730, gripY: 800 };

/** 石门（源图 1536×1024）：木门开口 x 512..1023、y 183..903；贴图内容底边 y=908 */
const DOOR = {
  scale: 0.314,
  openingLeft: 512,
  openingRight: 1023,
  openingTop: 183,
  openingBottom: 903,
  contentBottom: 908,
};

/** 金钥匙（源图 1536×1024） */
const KEY = { scale: 0.1, contentCenterX: 789, contentCenterY: 520 };

/** 海鸥抓点摆长 */
const GULL_SWING_LENGTH = 48;

const WORLD_WIDTH = 2870;
const WORLD_HEIGHT = 540;
const FALL_Y = 620;

/** 礁石在路线中的角色：路标、复活点一律按 role 查找，禁止按数组下标取（数组随布局增删） */
export type ReefRole =
  | 'warmup-low' // 初级低礁：热身起步
  | 'warmup-tall' // 耸立高礁：第一次大爬升
  | 'warmup-flat' // 低位平礁：俯冲回落
  | 'gull-launch' // 起跳高台：全线最高点，跃起抓海鸥
  | 'gull-landing' // 海心落脚礁：海鸥甩落后的落脚点
  | 'wave-climb' // 浪前爬升礁：+60 爬升，为浪区抬升难度
  | 'wave-sprint' // 浪前冲刺礁：助跑起跳上滚浪
  | 'wave-landing'; // 浪后落脚礁：接住浪上跳下来的角色

/**
 * 可站立面档案的一段（源图坐标，srcRight 为开区间）：
 * 源图 x ∈ [srcLeft, srcRight) 是一段平整岩面顶边，其顶面 y 记为 srcTop。
 * 档案只登记实测平整的岩面，两侧「看起来能站」的斜坡/落坎一律不登记。
 */
export type ReefStandStep = { srcLeft: number; srcRight: number; srcTop: number };

/** 站面平整度容差（源图 px）：档案段内每列实测顶面与 srcTop 的允许最大偏差；× scale 即世界误差 */
export const REEF_STAND_TOLERANCE = 8;

/** 礁石在关卡里的落位（LAYOUT.reefs 的声明形状；可站立面档案按 role 从 REEF_STANDS 取） */
export type ReefPlacement = {
  /** 可站立面档案（REEF_STANDS[role]）的水平中心在世界里的 x */
  standCenter: number;
  /** 档案最高一段（srcTop 最小）的顶面 y；其余段按 (srcTop − 最高 srcTop) × scale 落在它下面 */
  top: number;
  scale: number;
  /** 中文路标文案 */
  label: string;
  role: ReefRole;
};

/** 布局里真正使用的礁石 = 落位 + 该块的可站立面档案（LAYOUT 组装时挂上） */
export type ReefSpec = ReefPlacement & { stand: readonly ReefStandStep[] };

export type WaveSpec = {
  id: 'W1';
  /** 浪脊中心 x（碰撞体左右各 39.06px） */
  ridgeCenter: number;
  /** 浪脊顶面 y */
  top: number;
  /** 待机上下浮动振幅（像素） */
  amplitude: number;
  periodMs: number;
  /** 起滚后每秒前移的像素 */
  rollSpeed: number;
  /** 累计前移多少像素即「滚到尽头」并开始消散 */
  rollDistance: number;
};

type LayoutSpec = {
  startBeach: { left: number; right: number; top: number };
  /** 礁石阵（standCenter 升序：复活点派生依赖该顺序） */
  reefs: readonly ReefSpec[];
  /** 单只海鸥横渡核心深海海峡的往返航线 */
  gull: { fromX: number; toX: number; fromY: number; toY: number; speed: number };
  /** 单朵长距离滚浪（向前滚 → 消散的限时平台） */
  waves: readonly WaveSpec[];
  key: { x: number; y: number };
  landing: { left: number; right: number; top: number };
  door: { openingCenterX: number };
};

/** 礁石阵：起步阶梯 → 海鸥起跳台 → 海心落脚礁 → 浪前准备段 → 浪后实体落脚面。
 *  浪后落脚礁刻意放到冲刺礁二段跳极限之外，让玩家先借滚浪向前，再跳上安全落点。 */
const REEFS: readonly ReefPlacement[] = [
  // 第一块下沉并左移：作为韩梅梅的直接出生平台。
  { standCenter: 420, top: 430, scale: 0.14, label: '初级低礁', role: 'warmup-low' },
  { standCenter: 620, top: 320, scale: 0.165, label: '耸立高礁', role: 'warmup-tall' },
  // 按反馈略抬高第三、第四块，让上升节奏更连贯。
  { standCenter: 830, top: 375, scale: 0.14, label: '低位平礁', role: 'warmup-flat' },
  { standCenter: 1040, top: 235, scale: 0.185, label: '▲ 起跳高台', role: 'gull-launch' },
  { standCenter: 1620, top: 360, scale: 0.17, label: '海心落脚礁', role: 'gull-landing' },
  // 浪前爬升与冲刺平台保留，确保起跳浪区有明确准备段。
  { standCenter: 1750, top: 300, scale: 0.15, label: '▲ 浪前爬升礁', role: 'wave-climb' },
  { standCenter: 1850, top: 405, scale: 0.24, label: '浪前冲刺礁', role: 'wave-sprint' },
  // 单浪之后补上实体落脚面：后景水彩礁石本身没有碰撞，不能让角色落到背景后继续坠海。
  { standCenter: 2590, top: 360, scale: 0.18, label: '浪后落脚礁', role: 'wave-landing' },
];

/**
 * 实测的平整可站立面档案（源图坐标，八块共用——阶段 1 只有这一张 1774×887 礁石素材）。
 *
 * 素材是一整块连续岩体，顶边是一条缓起伏的水彩岩脊。逐列取 alpha>128 的顶面 y，
 * 再用分段常量做 minimax 拟合（每段取 min/max 中值），得到两段实测偏差 ≤ 8 源 px 的平整岩面：
 *   · [616, 846) @243：左坡（547..615 顶面 245..261 的斜坡）走完之后的平整高原，段内实测偏差 ≤ 8px
 *   · [846, 1098) @260：同一块平顶的右半段，段内实测偏差 ≤ 8px
 * 旧常量 `547..1018 @248` 的两端都不是岩面特征点，带内实测偏差 13 源 px（× 0.24 = 3.1 世界 px）：
 *   · 左缘 547 落在左坡上：实测顶面 261，比档案面低 18px，玩家会悬在斜坡上方；
 *   · 右缘 1018 落在平顶中间：1018..1097 实测顶面 260..265，与 862..1097 是同一块平顶，
 *     从中间切断后玩家会在看起来平的岩面上踩空。
 *
 * 为什么宽度停在 482 源 px（旧 471 + 两侧各 5.5px）而不铺满整块平顶：
 *   · 素材顶面一直平到源图 ≈1230，但整关的跳跃间距是按「站立面宽 ≈ 471 源 px」反算的
 *     （见上面 REEFS 注释；爬升礁↔冲刺礁中心距只有 100px）；
 *   · 铺到 1230（615 源 px）会让爬升礁/冲刺礁的碰撞盒重叠，并把已验证过的落点全部平移，
 *     等于重做关卡几何——超出这次「让碰撞盒对齐岩面」的修复范围。
 * 剩余误差：档案右缘 1098 往右到 ≈1230（132 源 px）岩面还继续降 16 源 px
 * （= 18~32 世界 px，随 scale）才离开容差，那段仍然“看着能站”；要彻底消掉需要美术在平台右缘
 * 画一个明确落差，或直接裁掉贴图右段——这属于改素材，不在本次代码修复范围内。
 */
const REEF_STAND_FLAT_TOP: readonly ReefStandStep[] = [
  { srcLeft: 616, srcRight: 846, srcTop: 243 },
  { srcLeft: 846, srcRight: 1098, srcTop: 260 },
];

/** 可玩礁站面上的水彩日光碎点：只标实际碰撞顶边，不画矩形/箭头，和背景装饰礁拉开轻微层级 */
const REEF_SURFACE_GLINT = {
  inset: 3,
  color: 0xbbe36e,
  alpha: 0.72,
  coreColor: 0xf5ffd0,
  coreAlpha: 0.8,
};

/** 逐块可站立面档案：必须覆盖每个 role；八块目前数值相同，换图/换裁切时各块独立调整 */
const REEF_STANDS: Record<ReefRole, readonly ReefStandStep[]> = {
  'warmup-low': REEF_STAND_FLAT_TOP,
  'warmup-tall': REEF_STAND_FLAT_TOP,
  'warmup-flat': REEF_STAND_FLAT_TOP,
  'gull-launch': REEF_STAND_FLAT_TOP,
  'gull-landing': REEF_STAND_FLAT_TOP,
  'wave-climb': REEF_STAND_FLAT_TOP,
  'wave-sprint': REEF_STAND_FLAT_TOP,
  'wave-landing': REEF_STAND_FLAT_TOP,
};

/** 取某块礁石的可站立面档案（role 漏登记直接抛，避免静默退回旧常量） */
const reefStand = (role: ReefRole): readonly ReefStandStep[] => {
  const steps = REEF_STANDS[role];
  if (!steps || steps.length === 0) throw new Error(`REEF_STANDS 缺少 role=${role} 的可站立面档案`);
  return steps;
};

/** 档案的水平中心（源图 x）：贴图落位与碰撞盒都按它对齐 standCenter */
const standProfileCenter = (steps: readonly ReefStandStep[]) =>
  (Math.min(...steps.map(s => s.srcLeft)) + Math.max(...steps.map(s => s.srcRight))) / 2;

/** 档案的顶面基准（源图 y）：取 srcTop 最小（最高）的一段，映射到 LAYOUT 里声明的 top */
const standAnchorTop = (steps: readonly ReefStandStep[]) => Math.min(...steps.map(s => s.srcTop));

/** 世界坐标的站立碰撞盒（档案 × scale 的派生结果，addReef 只消费它） */
export type ReefStandBox = ReefStandStep & { x: number; y: number; width: number };

/**
 * per-reef 可站立面档案 → 世界碰撞盒：x/width = 档案 × scale，y = 声明 top + (srcTop − 基准 srcTop) × scale。
 * 每一段都严格对应贴图上一段实测平整的岩面，不再有模块级常量矩形。
 */
export const reefStandBoxes = (reef: ReefSpec): ReefStandBox[] => {
  const center = standProfileCenter(reef.stand);
  const anchorTop = standAnchorTop(reef.stand);
  return reef.stand.map(step => ({
    ...step,
    x: reef.standCenter + (step.srcLeft - center) * reef.scale,
    y: reef.top + (step.srcTop - anchorTop) * reef.scale,
    width: (step.srcRight - step.srcLeft) * reef.scale,
  }));
};

/** 贴图左上角在世界的落位：档案中心 → standCenter，基准顶面 → top（碰撞与美术共用同一组数） */
export const reefSpriteOrigin = (reef: ReefSpec): { x: number; y: number } => ({
  x: reef.standCenter - standProfileCenter(reef.stand) * reef.scale,
  y: reef.top - standAnchorTop(reef.stand) * reef.scale,
});

/** 单朵滚浪：从冲刺礁前方开始，长距离向岸边推送后消散 */
const WAVES: readonly WaveSpec[] = [
  { id: 'W1', ridgeCenter: 2000, top: 392, amplitude: 12, periodMs: 3200, rollSpeed: 56, rollDistance: 360 },
];

/**
 * 完整高低起伏跑酷关卡路线（世界 2870×540）：
 * 阶段 1：从第一块低礁（420）起步 → 错落礁石阶梯（低 430 → 高崖 320 → 平礁 375 → 起跳台 235）
 * 阶段 2：自高台跳起抓唯一一只飞鸥（1100~1460）→ 翱翔掠过深洋 → 甩向海心落脚礁（1620）
 * 阶段 3：浪前爬升礁（1750）→ 浪前冲刺礁（1850）→ 单朵滚浪（2000）→ 浪后落脚礁（2590）→ 右岸大陆（2660）
 * 阶段 4：右岸大陆（2660..2870）→ 跳起摘取门楣上的金钥匙（2680, 196）→ 落地走回石门进入记忆之房！
 */
export const LAYOUT: LayoutSpec = {
  startBeach: { left: 0, right: 280, top: 440 },
  reefs: REEFS.map(placement => ({ ...placement, stand: reefStand(placement.role) })),
  gull: { fromX: 1100, toX: 1460, fromY: 145, toY: 165, speed: 95 },
  waves: WAVES,
  key: { x: 2680, y: 196 },
  landing: { left: 2660, right: 2870, top: 440 },
  door: { openingCenterX: 2680 },
};

/** 第一块低礁是实际出生平台：韩梅梅从图中这块礁石上开始，而不是左侧沙滩。 */
const START_REEF = LAYOUT.reefs.find(reef => reef.role === 'warmup-low');
if (!START_REEF) throw new Error('LAYOUT 缺少起始低礁 warmup-low');
const START_POINT = { x: START_REEF.standCenter, y: START_REEF.top - 45 };

/** 复活点：standCenter 为触发用的站立中心 x（角色 x + 40 内即命中） */
type RespawnPoint = { standCenter: number; x: number; y: number };

/**
 * 落水后的安全复活点（由 LAYOUT 派生并按 standCenter 升序）：
 * 起始低礁 → 其他礁石（顶面上方 40px）；越靠右的落点越近，复活不倒退。
 */
const RESPAWN_POINTS: readonly RespawnPoint[] = [
  { standCenter: START_POINT.x, x: START_POINT.x, y: START_POINT.y },
  ...LAYOUT.reefs
    .filter(r => r.role !== START_REEF.role)
    .map(r => ({ standCenter: r.standCenter, x: r.standCenter, y: r.top - 40 })),
].sort((a, b) => a.standCenter - b.standCenter);
// 注：右岸大陆不作为复活点，避免复活时直接落入石门交互区；浪后落脚礁是浪区唯一的安全复活面。

/** 海鸥引导标签的触发范围（由海鸥航线派生） */
const GULL_PROMPT_RANGE = { left: LAYOUT.gull.fromX - 150, right: LAYOUT.gull.toX + 90 };

/** 浪区提示标签的触发范围（由浪峰位置派生） */
const WAVE_PROMPT_RANGE = {
  left: Math.min(...LAYOUT.waves.map(w => w.ridgeCenter)) - 100,
  right: Math.max(...LAYOUT.waves.map(w => w.ridgeCenter)) + 120,
};

/** 起点教学卡片淡出时机：从起始低礁向前移动 80px 后 */
const TUTORIAL_FADE_X = START_POINT.x + 80;

/** 按 role 查礁石：布局增删礁石时路标仍能对上 */
const reefByRole = (role: ReefRole): ReefSpec => {
  const reef = LAYOUT.reefs.find(r => r.role === role);
  if (!reef) throw new Error(`LAYOUT.reefs 缺少 role=${role} 的礁石`);
  return reef;
};

/** 滚浪四态：待机浮动 → 被踩上起滚 → 滚到尽头消散 → 散尽 */
type WaveState = 'idle' | 'rolling' | 'dissolving' | 'gone';

interface WaveEntity {
  id: WaveSpec['id'];
  /** 浪脊贴图（原点左上角，按 WAVE_IMAGE_OFFSET 对齐到碰撞体） */
  image: Phaser.GameObjects.Image;
  /** 承重碰撞体（不可见矩形，origin(0,0) 的左上角 = 浪脊顶面左缘） */
  body: Phaser.GameObjects.Rectangle;
  /** 浪脊亮条 */
  ridgeBar: Phaser.GameObjects.Rectangle;
  /** 待机基准位（idle 正弦浮动的中心） */
  baseX: number;
  baseY: number;
  /** 起滚时锁定的浪面高度，避免托举角色时浪体上下浮动导致落地判定抖动 */
  rollY: number;
  amplitude: number;
  periodMs: number;
  rollSpeed: number;
  rollDistance: number;
  state: WaveState;
  /** 起滚时刻（levelClockMs） */
  rollStartedAt: number;
  /** 已前移像素 */
  rolled: number;
  /** 本帧横向位移（checkWaveRide 据此把玩家托着一起走） */
  carryX: number;
  /** 开始消散的时刻（levelClockMs） */
  dissolveStartedAt: number;
}

export default class ForestScene extends Phaser.Scene {
  private player!: Player;
  private terrain!: Terrain;
  private sfx!: Sfx;
  private keyCollected = false;
  private enteredRoom = false;
  private progressSession!: ChapterOneRoomSession;
  private statusText!: Phaser.GameObjects.Text;
  private progressStorageUnavailable = false;
  private checkpoint = { x: START_POINT.x, y: START_POINT.y };
  private gameHud!: GameHudHandle;

  // —— 关卡时钟与限时机关 ——
  /**
   * 关卡时钟：只在没开弹窗时按 delta 累加。
   * 浪的滚动/消散、石门解锁延迟全按它算——用 this.time.now 的话，暂停弹窗期间
   * 物理已停、时间却在走，关掉弹窗会看到浪瞬移/门直接解锁。
   */
  private levelClockMs = 0;
  /** 重生重入锁：此刻之前不再扣命（防同帧多路死亡重复扣） */
  private respawnLockUntil = 0;
  /** 石门解锁时刻（摘到钥匙时写入 levelClockMs + DOOR_UNLOCK_DELAY_MS） */
  private doorOpenAt = 0;
  /** 门锁提示的下次可提示时刻（节流） */
  private doorHintAt = 0;

  // —— scrollFactor 0 层的屏幕补偿（与 GameHud 同一套算法，否则 dpr>1 下会错位到屏幕外） ——
  private viewportWidth = 960;
  private touchControls: Array<{ button: Phaser.GameObjects.Text; baseX: number; baseY: number }> = [];

  // —— 场景内操作与交互引导 ——
  private startTutorialBadge?: Phaser.GameObjects.Container;
  private tutorialFading = false;
  private gullPrompt!: Phaser.GameObjects.Text;
  private gullGrabRing!: Phaser.GameObjects.Arc;
  private crestPrompt!: Phaser.GameObjects.Text;
  private helpModal?: Phaser.GameObjects.Container;

  // —— 单只海鸥 ——
  private gullVine!: Vine;
  private gullImage!: Phaser.GameObjects.Image;
  private gullFeetX: number = LAYOUT.gull.fromX;
  private gullFeetY: number = LAYOUT.gull.fromY;
  private gullFacing: -1 | 1 = 1;

  // —— 浪尖阵列 ——
  private waves: WaveEntity[] = [];

  private door?: Phaser.GameObjects.Image;
  private get progress(): ChapterOneRoomProgress {
    return this.progressSession.state;
  }

  constructor() {
    super({
      key: 'forest',
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 1100 }, debug: false },
      },
    });
  }

  preload(): void {
    // 年年三套正式序列帧（Run / Jump / Grab）由 Player 统一下发
    Player.preload(this);
    // 只预载两个**立刻就要用**的短音效（共 ~240KB）。
    // 背景音乐 3.9MB 挪到 create 之后后台加载（见 systems/DeferredAudio）：
    // 否则“进第一关”要先把整首曲子下完，而音乐晚 1 秒响完全不影响玩法。
    const audio: Array<[string, string]> = [
      ['sfx-footstep', footstepUrl],
      ['sfx-jump', jumpSfxUrl],
    ];
    for (const [key, url] of audio) {
      if (!this.cache.audio.exists(key)) this.load.audio(key, url);
    }
    if (!this.textures.exists(ART.background)) {
      this.load.image(ART.background, resolveImageUrl(level1BackgroundUrl));
    }
    for (const [key, url] of LEVEL1_FILES) {
      if (!this.textures.exists(key)) this.load.image(key, url);
    }
  }

  create(): void {
    this.progressSession = ChapterOneRoomSession.restore();
    this.keyCollected = this.progress.forestKeyCollected;
    this.progressStorageUnavailable = false;
    this.enteredRoom = false;
    this.checkpoint = { x: START_POINT.x, y: START_POINT.y };
    this.levelClockMs = 0;
    this.respawnLockUntil = 0;
    this.doorOpenAt = 0;
    this.doorHintAt = 0;
    this.touchControls = [];
    applyHDCamera(this, 'expand-horizontal');
    const camera = this.cameras.main;
    const updateViewport = () => {
      this.viewportWidth = logicalWorldViewportWidth(this);
      const zoom = this.scale.gameSize.height / WORLD_HEIGHT;
      camera.setZoom(zoom);
      camera.setSize(this.scale.gameSize.width, this.scale.gameSize.height);
      camera.setDeadzone(Math.min(180, this.viewportWidth * 0.22), 100);
      this.applyScreenSpaceOffset();
    };
    this.viewportWidth = logicalWorldViewportWidth(this);
    updateViewport();
    this.scale.on(Phaser.Scale.Events.RESIZE, updateViewport);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, updateViewport));
    this.sfx = new Sfx(this);
    this.cameras.main.setBackgroundColor('#12506b');

    // 正式水彩大背景（1900宽）：第一段正常，第二段镜像平铺衔接，无缝延展至 2870 的海天视界
    this.add
      .image(0, 0, ART.background)
      .setOrigin(0, 0)
      .setDisplaySize(1900, WORLD_HEIGHT)
      .setDepth(-20);
    this.add
      .image(1900, 0, ART.background)
      .setOrigin(0, 0)
      .setDisplaySize(1900, WORLD_HEIGHT)
      .setFlipX(true)
      .setDepth(-20);

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT + 360);
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // 顶部操作栏
    this.createNavHeader();

    // 地面碰撞与错落高低起伏的礁石群
    this.terrain = new Terrain(this, false);
    for (const span of [LAYOUT.startBeach, LAYOUT.landing]) {
      this.terrain.addPlatform({
        x: span.left,
        y: span.top,
        width: span.right - span.left,
        height: WORLD_HEIGHT - span.top,
        kind: 'ground',
      });
    }

    this.assertReefArtMatchesProfile();
    for (const reef of LAYOUT.reefs) {
      this.addReef(reef);
    }

    // 角色创建（尺寸放大 1.25×，更清晰显眼）
    this.player = new Player(this, {
      x: START_POINT.x,
      y: START_POINT.y,
      sfx: this.sfx,
      // 真实海边场景：角色空中不应在背景上投“贴图阴影”
      showGroundShadow: false,
    });
    this.physics.add.collider(this.player.view, this.terrain.solids);

    this.createWaves();
    this.createGull();

    this.createKey();
    // 石门常显（锁着等钥匙）：不再等拾取钥匙才显形
    this.showDoor();
    if (this.keyCollected) this.markKeyCollected(false);

    this.statusText = this.add
      .text(18, 500, this.keyCollected ? '钥匙已到手 · 落地走近右侧石门进入记忆之房' : '移动 [A/D]   跳跃 [空格]   触碰海鸥自动抓牢   按 [H] 查看操作指南', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#dedede',
        backgroundColor: '#171717cc',
        padding: { x: 10, y: 7 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    camera.startFollow(this.player.view, true, 0.1, 0.1);
    camera.setDeadzone(Math.min(180, this.viewportWidth * 0.22), 100);

    // 背景音乐后台加载：场景已经能玩了，曲子 3.9MB 下完再自己响起。
    loadAudioInBackground(this, 'forest-bgm', forestBgmUrl, () => {
      if (this.sound.isPlaying('forest-bgm')) return;
      const music = this.sound.add('forest-bgm', { loop: true, volume: 0.3 });
      const unregisterMusic = registerBackgroundMusic(music);
      const startMusic = () => {
        if (isBackgroundMusicEnabled() && !this.sound.locked && !music.isPlaying) music.play();
      };
      const cleanupMusic = () => {
        this.sound.off(Phaser.Sound.Events.UNLOCKED, startMusic);
        unregisterMusic();
        music.destroy();
      };
      music.once(Phaser.Sound.Events.DESTROY, unregisterMusic);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupMusic);
      if (this.sound.locked) this.sound.once(Phaser.Sound.Events.UNLOCKED, startMusic);
      else startMusic();
    });

    this.createInWorldGuidance();
    this.createTouchControls();
    this.applyScreenSpaceOffset();
  }

  /**
   * scrollFactor 0 层的屏幕补偿：相机 zoom 也会作用于它们，不补的话
   * dpr>1 / 非 16:9 缓冲下整层会跑到屏幕外（HUD 已由 GameHud 自己补，见 screenSpaceOrigin）。
   */
  private applyScreenSpaceOffset(): void {
    const off = screenSpaceOrigin(this);
    this.statusText?.setPosition(18 + off.x, 500 + off.y);
    for (const control of this.touchControls) {
      control.button.setPosition(control.baseX + off.x, control.baseY + off.y);
    }
    this.helpModal?.setPosition(off.x, off.y);
  }

  private createNavHeader(): void {
    this.gameHud = createGameHud({
      scene: this,
      title: '第一章 · 海边的记忆',
      stageKey: 'forest',
      minimal: true,
      initialScore: this.progress.score,
      initialLives: this.progress.lives,
      initialObjective: this.keyCollected
        ? '带着金钥匙落地，走进右侧石门'
        : '越过海面滚浪区，跳起摘取右侧门楣上的金钥匙',
      onRestart: () => this.restartLevel(),
      onHelp: () => this.toggleHelpModal(),
      onHome: () => this.scene.start('menu'),
    });

    this.input.keyboard?.on('keydown-H', () => this.toggleHelpModal());
    this.input.keyboard?.on('keydown-ESC', () => this.gameHud.showPauseModal());

  }

  update(_time: number, delta: number): void {
    // 弹窗（暂停 / 通关 / H 帮助）期间冻结物理与关卡节奏：否则暂停时角色会继续下落、
    // 有时限的滚浪会在弹窗背后继续滚，玩家看完弹窗回来已经落水扣命。
    // 注意：H 帮助弹窗是场景自己管的，没注册进 GameHud 的 activeModal，必须一起判。
    if (this.gameHud.isModalOpen() || this.helpModal) {
      if (!this.physics.world.isPaused) this.physics.world.pause();
      return;
    }
    if (this.physics.world.isPaused) this.physics.world.resume();
    this.levelClockMs += delta;

    this.updateGull(delta);
    this.updateWaves();

    // 检查海鸥自动抓取：跳跃中只要触碰海鸥双脚即刻抓牢
    if (this.player.attached) {
      this.gullVine.setNear(false);
    } else {
      this.gullVine.idleUpdate(delta);
      const handY = this.player.view.y - 34;
      const nearGull =
        Phaser.Math.Distance.Between(this.player.view.x, handY, this.gullVine.handX, this.gullVine.handY) < 95;
      this.gullVine.setNear(nearGull && this.gullVine.available);
      if (nearGull && this.gullVine.available && this.player.tryGrabVine(this.gullVine)) {
        this.setStatus('抓住海鸥了！按空格甩出，飞向海心落脚礁。');
      }
    }

    this.player.update(delta);
    this.syncGullVisual();
    // 限时滚浪：必须在 player.update 之后 —— 先把角色停在浪上，再判托举/落水
    this.checkWaveRide();
    this.checkWaveHazard();

    const body = this.player.view.body as Phaser.Physics.Arcade.Body;
    const x = this.player.view.x;
    const grounded = body.blocked.down || body.touching.down;
    this.gullPrompt.setVisible(false);
    this.crestPrompt.setVisible(false);

    // 走出起点后平滑淡出教学卡片
    if (!this.tutorialFading && x > TUTORIAL_FADE_X && this.startTutorialBadge) {
      this.tutorialFading = true;
      this.tweens.add({
        targets: this.startTutorialBadge,
        alpha: 0,
        duration: 400,
        onComplete: () => {
          this.startTutorialBadge?.destroy();
          this.startTutorialBadge = undefined;
          this.statusText.setVisible(false);
        },
      });
    }

    // 更新安全检查点（由 LAYOUT 派生的站位序列递进）：
    // 站在滚浪上会把安全点拉回浪前礁石（浪不可复活），这种情况不刷状态栏，免得盖掉死亡提示
    if (grounded) {
      const nextCheckpoint = RESPAWN_POINTS.filter(p => p.standCenter <= x + 40).pop();
      if (nextCheckpoint && nextCheckpoint.x !== this.checkpoint.x) {
        const advancing = nextCheckpoint.x > this.checkpoint.x;
        this.checkpoint = { x: nextCheckpoint.x, y: nextCheckpoint.y };
        if (advancing) {
          this.sfx.checkpoint();
          this.setStatus('安全抵达新的礁石，继续向前探索。');
        }
      }
    }

    // 进度条与积分生命更新（终点取石门开口中心）
    const prog = Phaser.Math.Clamp(
      ((x - START_POINT.x) / (LAYOUT.door.openingCenterX - START_POINT.x)) * 100,
      0,
      100,
    );
    this.gameHud.setProgressPercent(prog, `海岸探索 ${Math.round(prog)}%`);

    // 浪滚走了就往左后方复位：否则主路线被永久切断（不能跳过去就卡死）
    this.resetWavesLeftBehind();

    // 落水重生
    if (this.player.view.y > FALL_Y && !this.enteredRoom) {
      this.respawnFromFall('fall');
    }
  }

  /**
   * 掉进海里/被浪卷走：扣命 + 回最近安全点 + 浪全量复位。
   * 物理死亡与浪散死亡共用这一条路径，带 800ms 重入锁防同帧重复扣命。
   */
  private respawnFromFall(reason: 'fall' | 'wave'): void {
    if (this.levelClockMs < this.respawnLockUntil) return;
    this.respawnLockUntil = this.levelClockMs + RESPAWN_LOCK_MS;
    const nextLives = this.progress.lives - 1;
    const respawnLives = nextLives <= 0 ? 3 : nextLives;
    this.applyProgressEvent({ type: 'lives-changed', lives: respawnLives });
    this.saveProgress();
    this.gameHud.setLives(respawnLives);
    this.resetWaves();
    this.player.teleportTo(this.checkpoint.x, this.checkpoint.y);
    this.sfx.fall();
    this.cameras.main.flash(180, 245, 238, 215, false);
    if (nextLives <= 0) {
      this.setStatus('生命耗尽 —— 重新补满 3 颗心，回到最近的礁石再试一次！');
    } else if (reason === 'wave') {
      this.setStatus(`浪散了，被卷进海里！回到最近的礁石，剩余生命: ${respawnLives}/3`);
    } else {
      this.setStatus(`差一点！回到最近的礁石，剩余生命: ${respawnLives}/3`);
    }
  }

  /** 重开关卡（HUD 与通关弹窗共用）：不扣命，只把浪与角色复位 */
  private restartLevel(): void {
    this.respawnLockUntil = 0;
    // 通关弹窗里进过关（enteredRoom=true 会让门 overlap 首行 return、落水重生也被挡）——重开必须清掉，否则关卡锁死
    this.enteredRoom = false;
    this.resetWaves();
    this.player.teleportTo(START_POINT.x, START_POINT.y);
    this.checkpoint = { x: START_POINT.x, y: START_POINT.y };
    this.setStatus('已回到关卡起点。');
  }

  /**
   * 一块礁石：贴图按档案中心/基准顶面落位，碰撞盒逐段由 per-reef 档案 × scale 派生（reefStandBoxes）。
   * 实心碰撞柱只延伸到贴图实际岩体底边，不延伸到水面；否则岩石下面会多出不可见墙，
   * 玩家跳跃时撞墙、离开岩面时又像浮空/被卡住。
   */
  private addReef(reef: ReefSpec): void {
    const origin = reefSpriteOrigin(reef);
    const boxes = reefStandBoxes(reef);
    this.add
      .image(origin.x, origin.y, ART.reef)
      .setOrigin(0, 0)
      .setScale(reef.scale)
      .setDepth(-8);

    // 只沿真实站面画不规则的薄荷色湿苔斑：背景中同材质的装饰礁没有这层，
    // 玩家能读出“这里可落脚”，同时避免矩形碰撞框、描边或固定 UI。
    const glints = this.add.graphics().setDepth(-7);
    boxes.forEach((box, boxIndex) => {
      const left = box.x + REEF_SURFACE_GLINT.inset;
      const right = box.x + box.width - REEF_SURFACE_GLINT.inset;
      const y = box.y + Math.max(2, reef.scale * REEF_STAND_TOLERANCE + 1);
      const span = right - left;
      // 不规则的湿苔色斑只铺在碰撞站面：用有机斑点区别底图装饰礁，避免描边/条带的 UI 语法。
      const patchCount = Math.max(2, Math.round(span / 18));
      const cell = span / patchCount;
      for (let patchIndex = 0; patchIndex < patchCount; patchIndex += 1) {
        const centerX = left + cell * (patchIndex + 0.5);
        const centerY = y + 4.5 + ((patchIndex + boxIndex) % 2) * 0.9;
        const halfWidth = Math.min(6.5, cell * 0.42);
        const seed = (patchIndex * 3 + boxIndex) % 3;
        const patch = [
          { x: centerX - halfWidth, y: centerY + 0.4 },
          { x: centerX - halfWidth * 0.52, y: centerY - 1.8 - seed * 0.35 },
          { x: centerX + halfWidth * 0.05, y: centerY - 0.4 },
          { x: centerX + halfWidth, y: centerY + 0.2 + seed * 0.2 },
          { x: centerX + halfWidth * 0.62, y: centerY + 4.2 },
          { x: centerX - halfWidth * 0.18, y: centerY + 5.3 },
          { x: centerX - halfWidth * 0.78, y: centerY + 3.8 },
        ];
        glints.fillStyle(REEF_SURFACE_GLINT.color, REEF_SURFACE_GLINT.alpha);
        glints.fillPoints(patch, true);
        glints.fillStyle(REEF_SURFACE_GLINT.coreColor, REEF_SURFACE_GLINT.coreAlpha);
        glints.fillPoints(patch.slice(1, 5).map(point => ({
          x: centerX + (point.x - centerX) * 0.46,
          y: centerY + (point.y - centerY) * 0.42,
        })), true);
      }
    });

    const visibleBottom = origin.y + REEF_ART.contentBottom * reef.scale;
    for (const box of boxes) {
      this.terrain.addPlatform({
        x: box.x,
        y: box.y,
        width: box.width,
        height: Math.max(1, visibleBottom - box.y),
        kind: 'float',
      });
    }
  }

  /**
   * 素材与档案是两处数：素材一换（尺寸或内容框变了）档案就必须重测。
   * 这里挡住「贴图换了、档案没换」的静默错位；同样的断言在 tests/levelOneLayout.test.mjs 里用真实像素跑。
   */
  private assertReefArtMatchesProfile(): void {
    const source = this.textures.get(ART.reef).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    if (source.width !== REEF_ART.width || source.height !== REEF_ART.height) {
      throw new Error(
        `礁石素材尺寸变了：档案按 ${REEF_ART.width}×${REEF_ART.height} 实测，实际 ${source.width}×${source.height}——请重测 REEF_ART 与 REEF_STANDS 后再进关卡`,
      );
    }
  }

  /**
   * 滚浪（限时移动平台）：idle 上下浮动 → 被踩上（collider）→ rolling 前移托人 → dissolving 消散 → gone。
   * 所有位置都从同一处写（setWavePosition），不再用 setData 存第二份真相。
   */
  private createWaves(): void {
    this.waves = LAYOUT.waves.map(spec => {
      const bodyLeft = spec.ridgeCenter - WAVE_BODY_WIDTH / 2;
      const image = this.add
        .image(bodyLeft - WAVE_IMAGE_OFFSET.x, spec.top - WAVE_IMAGE_OFFSET.y, ART.wave)
        .setOrigin(0, 0)
        .setScale(WAVE.scale)
        .setDepth(-7);

      const body = this.add
        .rectangle(bodyLeft, spec.top, WAVE_BODY_WIDTH, WAVE.bodyHeight, 0xffffff)
        .setOrigin(0, 0)
        .setVisible(false);
      this.physics.add.existing(body, false);
      const arcadeBody = body.body as Phaser.Physics.Arcade.Body;
      arcadeBody.setAllowGravity(false);
      arcadeBody.setImmovable(true);

      const ridgeBar = this.add
        .rectangle(spec.ridgeCenter, spec.top - RIDGE_BAR.height / 2, RIDGE_BAR.width, RIDGE_BAR.height, 0x8fd6ea, RIDGE_BAR.alpha)
        .setOrigin(0.5, 0.5)
        .setDepth(-6)
        .setBlendMode(Phaser.BlendModes.ADD);

      const wave: WaveEntity = {
        id: spec.id,
        image,
        body,
        ridgeBar,
        baseX: bodyLeft,
        baseY: spec.top,
        rollY: spec.top,
        amplitude: spec.amplitude,
        periodMs: spec.periodMs,
        rollSpeed: spec.rollSpeed,
        rollDistance: spec.rollDistance,
        state: 'idle',
        rollStartedAt: 0,
        rolled: 0,
        carryX: 0,
        dissolveStartedAt: 0,
      };
      this.physics.add.collider(this.player.view, body, () => this.onWaveContact(wave));
      return wave;
    });
  }

  /** 写一处位置：碰撞体（承重）、浪脊贴图、浪脊亮条一起走 */
  private setWavePosition(wave: WaveEntity, x: number, y: number): void {
    wave.carryX = x - wave.body.x;
    wave.body.setPosition(x, y);
    wave.image.setPosition(x - WAVE_IMAGE_OFFSET.x, y - WAVE_IMAGE_OFFSET.y);
    wave.ridgeBar.setPosition(x + wave.body.width / 2, y - RIDGE_BAR.height / 2);
  }

  /** 踩上浪脊 → 起滚（从下方/侧面撞到不算） */
  private onWaveContact(wave: WaveEntity): void {
    if (wave.state !== 'idle') return;
    const pBody = this.player.view.body as Phaser.Physics.Arcade.Body;
    if (pBody.velocity.y < 0) return;
    if (!pBody.blocked.down && !pBody.touching.down && !this.isPlayerStandingOn(wave)) return;
    wave.state = 'rolling';
    // 待机时浪面会上下浮动；一旦承载角色就锁住当前高度，防止物理落地状态和角色动画抖动。
    wave.rollY = wave.body.y;
    wave.rollStartedAt = this.levelClockMs;
    wave.rolled = 0;
    this.sfx.bounce();
    Effects.dust(this, wave.body.x + wave.body.width / 2, wave.body.y, 6, 22);
    this.setStatus('踩上滚浪！趁它散开之前跳到浪后落脚礁。');
  }

  private updateWaves(): void {
    const now = this.levelClockMs;
    for (const wave of this.waves) {
      if (wave.state === 'idle') {
        const bob = Math.sin((now / wave.periodMs) * Math.PI * 2) * wave.amplitude;
        this.setWavePosition(wave, wave.baseX, wave.baseY + bob);
      } else if (wave.state === 'rolling') {
        // 前移量由关卡时钟算（弹窗期间时钟不走）——不再每帧写 scale，免得吞掉消散 tween。
        // y 使用接触时锁定的 rollY，不再带入 idle bob；角色和碰撞面保持同一高度，避免看似浮空/跳帧。
        wave.rolled = Math.min(wave.rollDistance, ((now - wave.rollStartedAt) / 1000) * wave.rollSpeed);
        this.setWavePosition(wave, wave.baseX + wave.rolled, wave.rollY);
        if (wave.rolled >= wave.rollDistance) this.startWaveDissolve(wave);
      } else if (wave.state === 'dissolving') {
        const progress = Phaser.Math.Clamp((now - wave.dissolveStartedAt) / WAVE_RIDE.dissolveMs, 0, 1);
        wave.image.setAlpha(1 - progress);
        wave.ridgeBar.setAlpha(RIDGE_BAR.alpha * (1 - progress));
        if (progress >= 1) this.finishWaveDissolve(wave);
      }
    }
  }

  /** 浪滚到尽头：立刻不再承重（没跳走的就踩空），并淡出消掉 */
  private startWaveDissolve(wave: WaveEntity): void {
    wave.state = 'dissolving';
    wave.dissolveStartedAt = this.levelClockMs;
    (wave.body.body as Phaser.Physics.Arcade.Body).enable = false;
    const centerX = wave.body.x + wave.body.width / 2;
    Effects.dust(this, centerX, wave.body.y, 14, 52);
    Effects.ring(this, centerX, wave.body.y, 0xcbe9f5);
    this.setStatus('浪滚到尽头散开了！没跳走的会被卷进海里。');
  }

  private finishWaveDissolve(wave: WaveEntity): void {
    wave.state = 'gone';
    wave.image.setVisible(false);
    wave.ridgeBar.setVisible(false);
  }

  /** 复位所有浪（重生/重开关卡共用）：tween、透明度、碰撞体启用、状态一起回 idle */
  private resetWaves(): void {
    for (const wave of this.waves) this.resetWave(wave);
  }

  private resetWave(wave: WaveEntity): void {
    this.tweens.killTweensOf(wave.image);
    this.tweens.killTweensOf(wave.ridgeBar);
    wave.state = 'idle';
    wave.rolled = 0;
    wave.rollY = wave.baseY;
    wave.rollStartedAt = 0;
    wave.dissolveStartedAt = 0;
    wave.image.setVisible(true).setAlpha(1).setScale(WAVE.scale);
    wave.ridgeBar.setVisible(true).setAlpha(RIDGE_BAR.alpha);
    (wave.body.body as Phaser.Physics.Arcade.Body).enable = true;
    this.setWavePosition(wave, wave.baseX, wave.baseY);
    wave.carryX = 0;
  }

  /** 浪散尽且玩家已回到它左后方 → 复位，避免必须过浪的路线被永久切断 */
  private resetWavesLeftBehind(): void {
    for (const wave of this.waves) {
      if (wave.state !== 'gone') continue;
      if (this.player.view.x < wave.baseX - 20) this.resetWave(wave);
    }
  }

  /** 角色是否站在浪脊上（脚底贴着顶面 + 水平有交集） */
  /** 角色是否正踩在这朵浪上（判定要宽一点：浪会上下浮动，脚底差几像素不应导致跟丢） */
  private isPlayerStandingOn(wave: WaveEntity): boolean {
    const pBody = this.player.view.body as Phaser.Physics.Arcade.Body;
    if (!pBody.enable || pBody.velocity.y < 0) return false;
    const overX = pBody.right > wave.body.x - WAVE_RIDE.standTolerance
      && pBody.x < wave.body.x + wave.body.width + WAVE_RIDE.standTolerance;
    // 站在浪面附近即可：脚底低于浪顶不超过 standTolerance 太多（浮沉/分离滞后都会有几像素），
    // 也不允许已经深深沉进浪体（那是从旁边掉下去的情况，交给 hazard）
    const dy = pBody.bottom - wave.body.y;
    return overX && dy <= WAVE_RIDE.rideWindow && dy >= -WAVE_RIDE.rideWindow;
  }

  /** 滚浪托举：浪前移多少，站在浪上的角色就跟着前移多少 */
  private checkWaveRide(): void {
    for (const wave of this.waves) {
      if (wave.state !== 'rolling' || wave.carryX <= 0) continue;
      if (!this.isPlayerStandingOn(wave)) continue;
      this.player.view.x += wave.carryX;
    }
  }

  /** 浪散时还挂在上面：没跳走就落水（跳走 vy<0 / 跑出浪体范围都不算） */
  private checkWaveHazard(): void {
    if (this.enteredRoom) return;
    const pBody = this.player.view.body as Phaser.Physics.Arcade.Body;
    if (!pBody.enable || pBody.velocity.y <= 0) return;
    for (const wave of this.waves) {
      if (wave.state !== 'dissolving') continue;
      const overX = pBody.right > wave.body.x - WAVE_RIDE.standTolerance
        && pBody.x < wave.body.x + wave.body.width + WAVE_RIDE.standTolerance;
      if (!overX) continue;
      // 刚踩空的那几帧还算「站在浪上」，等真掉下去再判，玩家才有跳走/看清消散的机会
      if (pBody.bottom < wave.body.y + WAVE_RIDE.sinkDepth) continue;
      this.respawnFromFall('wave');
      return;
    }
  }

  /** 当前活动浪：正在滚/正在散的优先，否则取离角色最近的一朵 */
  private activeWaveNear(x: number): WaveEntity | undefined {
    const moving = this.waves.find(w => w.state === 'rolling' || w.state === 'dissolving');
    if (moving) return moving;
    return this.waves
      .filter(w => w.state !== 'gone')
      .sort((a, b) => Math.abs(a.body.x + a.body.width / 2 - x) - Math.abs(b.body.x + b.body.width / 2 - x))[0];
  }

  private createGull(): void {
    this.gullFeetX = LAYOUT.gull.fromX;
    this.gullFeetY = LAYOUT.gull.fromY;
    this.gullImage = this.add
      .image(this.gullFeetX, this.gullFeetY, ART.gull)
      .setOrigin(GULL.gripX / 1774, GULL.gripY / 887)
      .setScale(GULL.scale)
      .setDepth(-5);

    this.gullVine = new Vine(this, this.gullFeetX, this.gullFeetY - GULL_SWING_LENGTH, {
      length: GULL_SWING_LENGTH,
      minLength: GULL_SWING_LENGTH,
      maxLength: GULL_SWING_LENGTH,
      stiffness: 520,
      placeholder: false,
    });

    this.gullGrabRing = this.add
      .circle(this.gullFeetX, this.gullFeetY, 20, 0xffebaa, 0.45)
      .setStrokeStyle(2, 0xfff6d4, 0.9)
      .setDepth(-4);
    this.tweens.add({
      targets: this.gullGrabRing,
      scale: { from: 0.85, to: 1.3 },
      alpha: { from: 0.85, to: 0.2 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private updateGull(delta: number): void {
    const span = Math.abs(LAYOUT.gull.toX - LAYOUT.gull.fromX);
    const periodMs = ((span * 2) / LAYOUT.gull.speed) * 1000;
    const cycle = (this.time.now % periodMs) / periodMs;
    const p = cycle < 0.5 ? cycle * 2 : 2 - cycle * 2;
    const feetX = Phaser.Math.Linear(LAYOUT.gull.fromX, LAYOUT.gull.toX, p);
    const feetY = Phaser.Math.Linear(LAYOUT.gull.fromY, LAYOUT.gull.toY, p);
    this.gullFacing = cycle < 0.5 ? 1 : -1;
    this.gullVine.driftVx = delta > 0 ? ((feetX - this.gullFeetX) / delta) * 1000 : 0;
    this.gullFeetX = feetX;
    this.gullFeetY = feetY;
    this.gullVine.setAnchor(feetX, feetY - GULL_SWING_LENGTH);
  }

  private syncGullVisual(): void {
    this.gullImage.setPosition(this.gullVine.handX, this.gullVine.handY);
    this.gullImage.setRotation(this.gullVine.angle * 0.35);
    this.gullImage.setScale(this.gullFacing * GULL.scale, GULL.scale);
    if (this.gullGrabRing) {
      this.gullGrabRing.setPosition(this.gullVine.handX, this.gullVine.handY);
      this.gullGrabRing.setVisible(!this.player.attached);
    }
  }

  private createKey(): void {
    // 已拿到钥匙（旧存档/重进场景）就不再生成：否则会留下一把摘不掉的钥匙贴图
    if (this.keyCollected) return;
    const keyImage = this.add
      .image(LAYOUT.key.x, LAYOUT.key.y, ART.key)
      .setScale(KEY.scale)
      .setDepth(-1);
    this.tweens.add({
      targets: keyImage,
      y: keyImage.y - 12,
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    const keyZone = this.add.zone(LAYOUT.key.x, LAYOUT.key.y, 80, 86);
    this.physics.add.existing(keyZone, true);
    this.physics.add.overlap(this.player.view, keyZone, () => {
      if (this.keyCollected || !this.player) return;
      this.applyProgressEvent({ type: 'forest-key-collected' });
      this.keyCollected = this.progress.forestKeyCollected;
      this.saveProgress();
      keyImage.destroy();
      keyZone.destroy();
      this.sfx.key();
      Effects.sparkBurst(this, LAYOUT.key.x, LAYOUT.key.y);
      this.markKeyCollected(true);
      this.gameHud.setScore(this.progress.score);
      // 门已经常显，只需解锁：必须等玩家落地后自己走回门口才能进
      this.doorOpenAt = this.levelClockMs + DOOR_UNLOCK_DELAY_MS;
      this.pulseDoor();
    });
  }

  private markKeyCollected(announce: boolean): void {
    // 不额外显示钥匙方向/状态牌：门楣上只保留可拾取的实体钥匙。
    this.gameHud?.setObjective('带着金钥匙落地，走进右侧石门');
    if (announce) this.setStatus('摘到了门楣上的金钥匙！落地后就能从门口进入记忆之房。');
  }

  /** 摘到钥匙的反馈：门已存在，只闪烁提示解锁（不额外显示钥匙提示牌） */
  private pulseDoor(): void {
    if (!this.door) return;
    Effects.ring(this, this.door.x, this.door.y, 0xffe6a3);
    this.tweens.killTweensOf(this.door);
    this.tweens.add({
      targets: this.door,
      alpha: { from: 0.45, to: 1 },
      duration: 220,
      yoyo: true,
      repeat: 2,
      ease: 'Quad.easeOut',
      // yoyo+repeat 的收尾都在「起始值」上，必须显式把门恢复成不透明
      onComplete: () => this.door?.setAlpha(1),
    });
  }

  /** 石门：一开始就立在那里、锁着；摘到门楣钥匙 + 落地才推得开 */
  private showDoor(): void {
    if (this.door) return;
    const imageLeft = LAYOUT.door.openingCenterX - ((DOOR.openingLeft + DOOR.openingRight) / 2) * DOOR.scale;
    const imageTop = LAYOUT.landing.top - DOOR.contentBottom * DOOR.scale;
    this.door = this.add
      .image(imageLeft + (1536 / 2) * DOOR.scale, imageTop + (1024 / 2) * DOOR.scale, ART.door)
      .setScale(DOOR.scale)
      .setDepth(-6);
    const openingWidth = (DOOR.openingRight - DOOR.openingLeft) * DOOR.scale;
    const openingHeight = (DOOR.openingBottom - DOOR.openingTop) * DOOR.scale;
    const openingCenterX = imageLeft + ((DOOR.openingLeft + DOOR.openingRight) / 2) * DOOR.scale;
    const openingCenterY = imageTop + ((DOOR.openingTop + DOOR.openingBottom) / 2) * DOOR.scale;
    const doorZone = this.add.zone(openingCenterX, openingCenterY, openingWidth, openingHeight);
    this.physics.add.existing(doorZone, true);
    this.physics.add.overlap(this.player.view, doorZone, () => {
      if (this.enteredRoom) return;
      // 门锁：还没摘钥匙 → 节流提示「先去摘门楣钥匙」
      if (!this.keyCollected) {
        if (this.levelClockMs >= this.doorHintAt) {
          this.doorHintAt = this.levelClockMs + DOOR_HINT_THROTTLE_MS;
          this.setStatus('石门还差一点力气推开…（先去门楣上摘金钥匙）');
        }
        return;
      }
      // 刚摘到钥匙还挂在门楣高度、身体与门区重叠：等落地后才算数（不刷状态，保留拾取提示）
      if (this.levelClockMs < this.doorOpenAt) return;
      const pBody = this.player.view.body as Phaser.Physics.Arcade.Body;
      // 必须落地才能进门；空中摘到钥匙后直接穿门会跳过回到岸上的收束动作。
      if (!pBody.blocked.down && !pBody.touching.down) return;
      if (!canEnterChapterOneRoom(this.progress)) return;
      this.enteredRoom = true;
      this.applyProgressEvent({ type: 'forest-door-entered' });
      this.saveProgress();
      this.setStatus('石门开启，发现记忆之房！');
      this.sfx.door();
      this.player.freeze();
      this.cameras.main.fade(260, 19, 31, 27);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('room'));
    });
  }

  private createInWorldGuidance(): void {
    // 起点操作教学卡片
    this.startTutorialBadge = this.add.container(230, 270).setDepth(15).setVisible(false);
    const badgeBg = this.add
      .rectangle(0, 0, 310, 68, 0x112822, 0.88)
      .setStrokeStyle(1.5, 0xe2ce9b, 0.65);
    const line1 = this.add
      .text(0, -13, '移动 [ A / D ] 或 [ ← / → ]', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#fff3d5',
      })
      .setOrigin(0.5);
    const line2 = this.add
      .text(0, 13, '从这块礁石出发 · 轻按/长按跳跃 · 空中二段跳', {
        fontFamily: 'sans-serif',
        fontSize: '10px',
        color: '#bed4c5',
      })
      .setOrigin(0.5);
    this.startTutorialBadge.add([badgeBg, line1, line2]);
    this.tweens.add({
      targets: this.startTutorialBadge,
      y: 264,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 海鸥抓取动态引导标签
    this.gullPrompt = this.add
      .text(LAYOUT.gull.fromX, LAYOUT.gull.fromY + 36, '跳起触碰即可抓紧海鸥', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#fff3cd',
        backgroundColor: '#16332bf0',
        padding: { x: 8, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);

    // 滚浪提示：文案与位置每帧跟随当前活动浪（见 update 里的三态切换）
    this.crestPrompt = this.add
      .text(0, 0, '∿ 滚浪 · 踩上浪脊，浪会托着你前滚', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#eef8ff',
        backgroundColor: '#1b3b4bf2',
        padding: { x: 7, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);

    // 起跳高台路标
    const launchReef = reefByRole('gull-launch');
    const reefSign = this.add.container(launchReef.standCenter, launchReef.top - 24).setDepth(10);
    const signBox = this.add
      .rectangle(0, 0, 190, 26, 0x14342bf2)
      .setStrokeStyle(1.2, 0xe2ce9b, 0.7);
    const signText = this.add
      .text(0, 0, '▲ 起跳高台 · 跳向海鸥自动抓牢', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#fff5d2',
      })
      .setOrigin(0.5);
    reefSign.add([signBox, signText]);
    reefSign.setVisible(false);
    this.tweens.add({
      targets: reefSign,
      y: launchReef.top - 30,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 海心礁石路标：跳向 +75 的爬升礁需从礁石后半段起跳（礁石左缘起跳会撞上爬升礁侧壁）
    const landingReef = reefByRole('gull-landing');
    const reefBSign = this.add.container(landingReef.standCenter, landingReef.top - 24).setDepth(10);
    const signBBox = this.add
      .rectangle(0, 0, 178, 26, 0x2d2b17f0)
      .setStrokeStyle(1.2, 0xf0d88e, 0.65);
    const signBText = this.add
      .text(0, 0, '▼ 海心落脚礁 · 从后半段起跳爬升', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#fffae5',
      })
      .setOrigin(0.5);
    reefBSign.add([signBBox, signBText]);
    reefBSign.setVisible(false);

    // 浪前冲刺礁路标：从爬升礁上落下来时要提前松手，否则全速会飞过这块窄礁
    const sprintReef = reefByRole('wave-sprint');
    const sprintSign = this.add.container(sprintReef.standCenter, sprintReef.top - 24).setDepth(10);
    const sprintSignBox = this.add
      .rectangle(0, 0, 186, 26, 0x17333cf0)
      .setStrokeStyle(1.2, 0x9fd0e6, 0.6);
    const sprintSignText = this.add
      .text(0, 0, '▼ 浪前冲刺礁 · 落下来时记得松手', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#e8f6ff',
      })
      .setOrigin(0.5);
    sprintSign.add([sprintSignBox, sprintSignText]);
    sprintSign.setVisible(false);

  }

  private toggleHelpModal(): void {
    if (this.helpModal) {
      this.helpModal.destroy();
      this.helpModal = undefined;
      return;
    }
    const vpW = this.viewportWidth;
    // 容器整体带上补偿量：遮罩（铺满屏幕）与面板一起回到屏幕坐标系
    const off = screenSpaceOrigin(this);
    const modal = this.add.container(off.x, off.y).setScrollFactor(0).setDepth(300);
    this.helpModal = modal;

    const mask = this.add
      .rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 0x07110e, 0.78)
      .setOrigin(0)
      .setInteractive();
    mask.on('pointerdown', () => this.toggleHelpModal());
    modal.add(mask);

    const cx = vpW / 2;
    const cy = 270;
    const panel = this.add.container(cx, cy);
    const panelBg = this.add
      .rectangle(0, 0, 520, 360, 0x142b24, 0.96)
      .setStrokeStyle(2, 0xe4d19e, 0.85);

    const title = this.add
      .text(0, -145, '— 第一章 · 海边跑酷操作指南 —', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#fff3d2',
      })
      .setOrigin(0.5);

    const content = [
      '🏃 基础移动：按 [ A / D ] 或 [ ← / → ] 左右平稳移动',
      '🦘 跳跃身法：按 [ 空格 / W / ↑ ] 轻按小跳，长按大跳；空中再按二段跳',
      '🕊️ 核心技巧 · 飞鸥摆荡：',
      '    1. 跨越阶梯礁石，登上巍峨的【起跳高台】；',
      '    2. 跳向迎面飞来的海鸥，触碰双脚即可【自动抓牢】！',
      '    3. 抓牢后海鸥载你向右飞，按 [ A / D ] 蓄力前后荡秋千；',
      '    4. 按 [ 空格 / ↑ ] 即可借力潇洒跳上海心礁石！',
      '🌊 限时滚浪：跳上浪脊，浪会托着你往前滚；浪滚到尽头会散掉，\n     没在散掉前跳走就会被卷进海里！',
      '🔑 终极目标：跳上右岸，跳起摘下石门门楣上的金钥匙，\n     落地后走近石门，推开它进入记忆之房！',
    ].join('\n\n');

    const desc = this.add
      .text(0, 0, content, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#dbe8de',
        lineSpacing: 2,
      })
      .setOrigin(0.5);

    const closeBtn = this.add
      .text(0, 142, '【 知道了，开始冒险 】', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#fff4d6',
        backgroundColor: '#274b3f',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setBackgroundColor('#386d5c'));
    closeBtn.on('pointerout', () => closeBtn.setBackgroundColor('#274b3f'));
    closeBtn.on('pointerdown', () => this.toggleHelpModal());

    panel.add([panelBg, title, desc, closeBtn]);
    modal.add(panel);
  }

  private createTouchControls(): void {
    if (!window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints === 0) return;
    const makeButton = (x: number, label: string, onDown: () => void, onUp: () => void) => {
      const button = this.add
        .text(x, 460, label, {
          fontFamily: 'sans-serif',
          fontSize: '26px',
          color: '#dddddd',
          backgroundColor: '#303030',
          padding: { x: 18, y: 12 },
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(120)
        .setInteractive();
      button.on('pointerdown', onDown);
      button.on('pointerup', onUp);
      button.on('pointerout', onUp);
      this.touchControls.push({ button, baseX: x, baseY: 460 });
      return button;
    };
    makeButton(74, '◀', () => this.player.setTouchMove(-1), () => this.player.setTouchMove(0));
    makeButton(154, '▶', () => this.player.setTouchMove(1), () => this.player.setTouchMove(0));
    makeButton(Math.min(this.viewportWidth - 75, WORLD_WIDTH - 20), '↑', () => this.player.pressTouchJump(true), () => this.player.pressTouchJump(false));
  }

  private saveProgress(): void {
    if (this.progressSession.save()) {
      this.progressStorageUnavailable = false;
      // 统一在保存成功后刷新 HUD，避免每帧重复写 UI 文本/宽度。
      this.gameHud?.setScore(this.progress.score);
      this.gameHud?.setLives(this.progress.lives);
    } else {
      this.progressStorageUnavailable = true;
      this.setStatus('进度写入失败，关闭页面后可能丢失。');
    }
  }

  private setStatus(message: string): void {
    const text = this.progressStorageUnavailable && !message.includes('关闭页面后可能丢失')
      ? `${message} · 进度仅在本次游玩中保留`
      : message;
    this.statusText.setText(text);
  }

  private applyProgressEvent(event: ChapterOneRoomEvent): void {
    this.progressSession.dispatch(event);
  }
}
