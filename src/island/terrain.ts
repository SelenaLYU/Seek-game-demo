/**
 * 记忆之岛地形函数的单一真源。
 *
 * `MemoryIsland.ts` 里散布、碰撞、相机、地形着色都要算「某点的地形高度」。
 * 如果各自抄一份算式，探针和渲染迟早漂移——探针量的是脚本里的地形，
 * 不是玩家看到的地形，这类「审计通过但岛上一眼就看见穿模」最难查。
 * 所以全部抽到这里，场景与测试 import 同一份。
 *
 * 坐标是**岛本地坐标**：x 未经 `MAP_SCALE_X` 放大，z 与场景一致。
 * 世界坐标 worldX = x * MAP_SCALE_X；散布/碰撞的 x 是世界坐标。
 */
export const MAP_SCALE_X = 1.34;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const ease = (value: number) => value * value * (3 - 2 * value);

/**
 * 海岸线半径（岛本地坐标）。地形、沙滩、树、可行走边界共用同一条。
 * 它的最小值要能让现有街区与六处入口都落在干地上。
 */
export const coastlineRadius = (angle: number) => 29.7
  + 3.1 * Math.sin(2 * angle + 0.35)
  + 1.9 * Math.cos(3 * angle - 0.9)
  + 1.05 * Math.sin(5 * angle + 1.4)
  + 6.0 * Math.exp(-Math.pow(Math.atan2(Math.sin(angle + Math.PI / 4), Math.cos(angle + Math.PI / 4)), 2) / (2 * 0.27 * 0.27));

export const streamPaths: [number, number][][] = [
  [[-27, 4], [-20, 5], [-14, 5], [-8, 6], [-3, 9], [3, 13], [12, 18], [25, 20]],
  [[-12, -25], [-7, -18], [-2, -11], [3, -5], [8, 1], [15, 5], [25, 7]],
];

/** 山头（抬升地形）。散布要避开山体的陡坡。 */
export const hilltops = [
  { x: -15, z: 19, radius: 12, height: 3.0 },
  { x: -15, z: -10, radius: 11, height: 3.7 },
  { x: -1, z: -5, radius: 12, height: 2.7 },
  { x: 14, z: 0, radius: 12, height: 4.0 },
  { x: 8, z: 19, radius: 11, height: 3.1 },
  { x: 14, z: -19, radius: 12, height: 4.8 },
] as const;

export function baseTerrainHeight(x: number, z: number) {
  const radius = Math.hypot(x, z);
  const angle = Math.atan2(x, z);
  const edgeDistance = Math.max(0, coastlineRadius(angle) - 0.45 - radius);
  const edgeFade = ease(clamp01(edgeDistance / 3.6));
  let height = 0.35 + 0.7 * (1 - ease(clamp01(radius / 29)));
  for (const hill of hilltops) {
    const dx = (x - hill.x) * 0.92;
    const dz = (z - hill.z) * 1.08;
    const distance = Math.hypot(dx, dz);
    const terrace = ease(clamp01((hill.radius - distance) / (hill.radius * 0.42)));
    const hillHeight = 0.35 + hill.height * terrace;
    const blend = Math.max(0.8 - Math.abs(height - hillHeight), 0);
    height = Math.max(height, hillHeight) + blend * blend / 3.2;
  }
  const broadRoll = (Math.sin(x * 0.24 + z * 0.12) + Math.cos(z * 0.22 - x * 0.11)) * 0.11;
  // 抬一道石质外缘，让岛保持分层的轮廓， shoreline 也干净
  return Math.max(0, 1.15 * (1 - edgeFade) + (height + broadRoll) * edgeFade);
}

/** 到折线路径的最近距离（岛本地坐标），用于「离溪/离路」判定。 */
export function distanceToPath(x: number, z: number, points: [number, number][]) {
  let nearest = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const dx = bx - ax, dz = bz - az;
    const t = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
    nearest = Math.min(nearest, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return nearest;
}

/** 最终地形高度（含溪流下切、边缘抬升）。散布与碰撞都用这一个。 */
export function terrainHeight(x: number, z: number) {
  const channelDepth = Math.max(...streamPaths.map(path => {
    const distance = distanceToPath(x, z, path);
    return 0.52 * (1 - ease(clamp01((distance - 0.6) / 1.65)));
  }));
  return Math.max(0, baseTerrainHeight(x, z) - channelDepth);
}
