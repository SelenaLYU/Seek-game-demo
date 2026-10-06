/**
 * 记忆之岛的散布摆放：树、地被、Tripo 道具的候选点生成与落地。
 *
 * 硬约束（用户 2026-10-05）：这个 3D 场景不许出现穿模。
 * 这里**所有**落点都必须先过 `src/island/clipping.ts` 的 `canPlace`，被否决的点直接丢掉，
 * 不做任何「差不多挪一下」的补偿——历史上一堆穿模就是这么来的。摆完再跑一遍
 * `auditPlacements` 全量复核并打日志，所以「摆的时候一套规则、检查的时候另一套」不可能再发生。
 *
 * 坐标口径：**全程世界坐标**（x 未经 MAP_SCALE_X 缩放，worldX = xLocal * MAP_SCALE_X）。
 * 这不是随手选的：`clipping.ts` 的 `Footprint` 注释写明 x 已经是世界坐标，
 * 散布若改用岛本地坐标，判定与审计就对不上同一个尺度。
 * 只有地形高度函数吃岛本地坐标，所以这里用 `terrainHeightWorld()` 换算。
 */
import { MAP_SCALE_X, coastlineRadius, terrainHeight } from './terrain.ts';
import { auditPlacements, canPlace, seededRandom, type Placement } from './clipping.ts';

export type ScatterKind = 'tree' | 'groundCover' | 'prop';

export type ScatterItem = {
  id: string;
  kind: ScatterKind;
  /** 世界坐标（x 未经 MAP_SCALE_X 缩放）。 */
  x: number;
  z: number;
  /** 该点地形高度（世界 y）。 */
  groundY: number;
  /** 占地半径（世界单位），与 clipping 的 Placement.radius 同口径。 */
  radius: number;
  /** 渲染缩放（期望高度 / 模型原始高度）。 */
  scale: number;
  yaw: number;
};

/** 建筑占地盒、门前净空圈、道路折线——散布必须绕开的三样东西。 */
export type ScatterContext = {
  footprints: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  keepClear: { x: number; z: number; radius: number; label: string }[];
  /** 道路中心线（世界坐标）。 */
  walkwayPaths: [number, number][][];
};

export type ScatterRules = {
  count: number;
  /** 离岸至少这么远（世界单位），防止道具探出岛缘悬在水上。 */
  shoreMargin: number;
  /** 离道路至少这么远（世界单位）。 */
  pathMargin: number;
  /** 地形坡度上限，陡坡上道具底下会露缝。 */
  maxSlope: number;
  /** 散布最远半径（岛本地单位）。 */
  maxRadius: number;
};

export const DEFAULT_RULES: ScatterRules = {
  count: 40,
  shoreMargin: 3.2,
  pathMargin: 2.65,
  maxSlope: 0.42,
  maxRadius: 26,
};

/** 地形高度查询（世界坐标入口）。岛本地坐标下的高度函数见 terrain.ts。 */
export function terrainHeightWorld(worldX: number, z: number) {
  return terrainHeight(worldX / MAP_SCALE_X, z);
}

/** 世界坐标到道路折线的最近距离。 */
export function distanceToWalkway(worldX: number, z: number, path: [number, number][]) {
  let nearest = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((worldX - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    nearest = Math.min(nearest, Math.hypot(worldX - (ax + dx * t), z - (az + dz * t)));
  }
  return nearest;
}

/** 某点地形坡度（落差/水平距离）。坡度大 → 底部露缝 → 不摆。 */
export function terrainSlopeWorld(worldX: number, z: number) {
  const here = terrainHeightWorld(worldX, z);
  return Math.hypot(terrainHeightWorld(worldX + 0.3, z) - here, terrainHeightWorld(worldX, z + 0.3) - here) / 0.6;
}

/** 候选点自身合法性（岸线、坡度），不含与已摆物件的互穿。 */
function selfOk(worldX: number, z: number, radius: number, rules: ScatterRules) {
  const localX = worldX / MAP_SCALE_X, localZ = z;
  const angle = Math.atan2(localX, localZ);
  const distance = Math.hypot(localX, localZ);
  if (distance > rules.maxRadius) return false;
  // 岸线按「点」算，圆压到水里也是悬空，所以还要留出自己的半径；
  // shoreMargin 是世界单位，换算回岛本地再比
  if (distance + radius / MAP_SCALE_X > coastlineRadius(angle) - rules.shoreMargin / MAP_SCALE_X) return false;
  if (terrainSlopeWorld(worldX, z) > rules.maxSlope) return false;
  return true;
}

export type ScatterInput = {
  kind: ScatterKind;
  idPrefix: string;
  seed: number;
  count: number;
  /** 单件占地半径（世界单位）。 */
  radius: number;
  /** 期望高度（世界单位）；null 表示按 1:1 摆。 */
  targetHeight: number | null;
  /** 模型原始高度（世界单位），作 targetHeight 的除数。 */
  modelHeight: number;
  rules?: Partial<ScatterRules>;
  context: ScatterContext;
  /** 已定好的物体（建筑、桥、先前摆好的道具），新点必须与它们互不相交。 */
  placed?: Placement[];
  maxTries?: number;
};

/**
 * 按种子生成散布方案，返回落地物件（`id` 形如 `tree#3`）。纯函数：
 * 同 seed + 同 context 永远跑出同一张岛，穿模才能复现和回归。
 */
export function planScatter(input: ScatterInput): ScatterItem[] {
  const rules = { ...DEFAULT_RULES, ...input.rules };
  const random = seededRandom(input.seed);
  const placed: Placement[] = [...(input.placed ?? [])];
  const items: ScatterItem[] = [];
  const tries = input.maxTries ?? input.count * 24;
  for (let attempt = 0; attempt < tries && items.length < input.count; attempt++) {
    const angle = attempt * 2.399963 + random() * 0.9;
    const distance = 3.2 + random() * (rules.maxRadius - 3.2);
    const worldX = Math.sin(angle) * distance * MAP_SCALE_X;
    const z = Math.cos(angle) * distance;
    if (!selfOk(worldX, z, input.radius, rules)) continue;
    if (input.context.walkwayPaths.some(path => distanceToWalkway(worldX, z, path) < rules.pathMargin)) continue;
    const groundY = terrainHeightWorld(worldX, z);
    const candidate: Placement = clippingPlacement(input.idPrefix, items.length, worldX, z, groundY, input.radius);
    if (!canPlace(candidate, placed, input.context)) continue;
    placed.push(candidate);
    items.push({
      id: candidate.id,
      kind: input.kind,
      x: worldX,
      z,
      groundY,
      radius: input.radius,
      scale: input.targetHeight === null ? 1 : input.targetHeight / Math.max(input.modelHeight, 0.001),
      yaw: random() * Math.PI * 2,
    });
  }
  return items;
}

function clippingPlacement(id: string, index: number, x: number, z: number, groundY: number, radius: number): Placement {
  return { id: `${id}#${index}`, x, z, radius, baseY: groundY, groundY };
}

/**
 * 复核一批已落地物体；返回空数组才代表「不许穿模」这条过了。
 * 与摆放共用 clipping 的判定，所以「摆的时候能过、审的时候报出来」不可能发生。
 */
export function checkScatter(items: ScatterItem[], context: ScatterContext) {
  const placements: Placement[] = items.map(item => ({
    id: item.id, x: item.x, z: item.z, radius: item.radius, baseY: item.groundY, groundY: item.groundY,
  }));
  return auditPlacements(placements, { footprints: context.footprints, keepClear: context.keepClear });
}
