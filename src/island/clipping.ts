/**
 * 记忆之岛的「不许穿模」审计。
 *
 * 硬约束（用户 2026-10-05 明确要求）：这个 3D 场景里不能出现穿模。
 * 在这个场景里，穿模只有四种成因，全部是「两个占位/一个占位与地形」的几何关系，
 * 所以不需要渲染就能判定：
 *
 *   1. `floating`   —— 道具悬在地形上方（脚不沾地的漂浮感）；
 *   2. `sunken`     —— 道具陷进地形太深（石头/灌木只剩半截，之前的现场问题）；
 *   3. `overlap`    —— 两个道具的占地圆相交（树冠插在一起、石头套石头）；
 *   4. `building`   —— 压到建筑占地盒（会把门口和绕行空间堵掉）；
 *   5. `keep-clear` —— 落进必须留空的圆（门前触发圈、广场与桥头）。
 *
 * 摆放与复核共用这里同一套判定：散布时用 `canPlace` 逐个否决候选点，
 * 摆完后再用 `auditPlacements` 跑一遍并打日志——避免「摆的时候一套规则、
 * 检查的时候另一套」这种最常见的失效方式。判定是纯函数，所以能直接单测。
 */

/** 世界轴对齐的占地盒。x 已经是世界坐标（含 mapScaleX），与 `allowed()` 的口径一致。 */
export type Footprint = { minX: number; maxX: number; minZ: number; maxZ: number };

/** 必须保持净空的圆：门前触发圈、广场中心、桥头等。 */
export type KeepClearCircle = { x: number; z: number; radius: number; label: string };

/** 一件已经定好位置的物体（散布道具、建筑基座、桥墩……）。 */
export type Placement = {
  /** 报错定位用，例如 `palm#3`、`building:01`。 */
  id: string;
  x: number;
  z: number;
  /** 水平占地半径（世界单位）；用模型占地圆的半径，不用包围球。 */
  radius: number;
  /** 摆放后模型最低点的世界 y。 */
  baseY: number;
  /** 该位置的地形高度。 */
  groundY: number;
};

export type ClippingKind = 'floating' | 'sunken' | 'overlap' | 'building' | 'keep-clear';
export type ClippingIssue = { id: string; kind: ClippingKind; detail: string };

export type AuditContext = {
  /** 建筑占地盒（世界轴对齐）。 */
  footprints?: Footprint[];
  /** 必须留空的圆。 */
  keepClear?: KeepClearCircle[];
};

/**
 * 允许的最大陷入深度。石头、灌木、树干底部与起伏地形之间刻意保留一点重叠，
 * 否则坡地上会出现「贴着地面但看得出缝」的悬浮边；超过这个值就是穿模。
 */
export const MAX_SINK = 0.08;
/** 允许的最大悬浮量（等于地形采样误差的量级）。 */
export const MAX_FLOAT = 0.02;

/** 两个占地圆是否相交。 */
export function circlesOverlap(
  a: { x: number; z: number; radius: number },
  b: { x: number; z: number; radius: number },
): boolean {
  const dx = a.x - b.x, dz = a.z - b.z;
  const reach = a.radius + b.radius;
  return dx * dx + dz * dz < reach * reach;
}

/** 圆与轴对齐占地盒是否相交（圆心在盒内、或圆心到盒的最近点距离小于半径）。 */
export function circleIntersectsFootprint(
  circle: { x: number; z: number; radius: number },
  box: Footprint,
): boolean {
  const closestX = Math.min(Math.max(circle.x, box.minX), box.maxX);
  const closestZ = Math.min(Math.max(circle.z, box.minZ), box.maxZ);
  const dx = circle.x - closestX, dz = circle.z - closestZ;
  return dx * dx + dz * dz < circle.radius * circle.radius;
}

/** 检查一件物体自身的问题（与地形的关系、与建筑/净空圆的关系）。 */
export function auditPlacement(item: Placement, context: AuditContext = {}): ClippingIssue[] {
  const issues: ClippingIssue[] = [];
  const offset = item.baseY - item.groundY;
  if (offset > MAX_FLOAT) {
    issues.push({ id: item.id, kind: 'floating', detail: `离地 ${offset.toFixed(3)}（> ${MAX_FLOAT}）` });
  }
  if (offset < -MAX_SINK) {
    issues.push({ id: item.id, kind: 'sunken', detail: `陷入地形 ${(-offset).toFixed(3)}（> ${MAX_SINK}）` });
  }
  for (const box of context.footprints ?? []) {
    if (circleIntersectsFootprint(item, box)) {
      issues.push({ id: item.id, kind: 'building', detail: `压到建筑占地盒 x[${box.minX.toFixed(1)},${box.maxX.toFixed(1)}] z[${box.minZ.toFixed(1)},${box.maxZ.toFixed(1)}]` });
    }
  }
  for (const circle of context.keepClear ?? []) {
    if (circlesOverlap(item, circle)) {
      issues.push({ id: item.id, kind: 'keep-clear', detail: `压到「${circle.label}」净空圈` });
    }
  }
  return issues;
}

/** 全量复核：逐件自检 + 两两互穿。返回空数组才算通过。 */
export function auditPlacements(items: Placement[], context: AuditContext = {}): ClippingIssue[] {
  const issues: ClippingIssue[] = [];
  for (const item of items) issues.push(...auditPlacement(item, context));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (circlesOverlap(items[i], items[j])) {
        issues.push({ id: items[i].id, kind: 'overlap', detail: `与 ${items[j].id} 的占地圆相交` });
      }
    }
  }
  return issues;
}

/**
 * 摆放候选点是否可用。散布时对每个候选点调用一次；已接受的物体放 `placed` 里。
 * 与 `auditPlacements` 共用判定，所以「能被接受」等价于「过得了审计的单项检查」。
 */
export function canPlace(candidate: Placement, placed: Placement[], context: AuditContext = {}): boolean {
  if (auditPlacement(candidate, context).length) return false;
  return !placed.some(item => circlesOverlap(candidate, item));
}

/**
 * 确定性伪随机（mulberry32）。散布必须可复现：同一个种子每次跑出同一张岛，
 * 否则「昨天验收通过、今天又穿模」这种问题无法复现也无从回归。
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
