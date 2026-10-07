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
export const MAP_SCALE_X = 1.24;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const ease = (value: number) => value * value * (3 - 2 * value);

/**
 * 海岸线半径（岛本地坐标）。地形、沙滩、树、可行走边界共用同一条。
 * 它的最小值要能让现有街区与六处入口都落在干地上。
 */
export const coastlineRadius = (angle: number) => {
  const lobe = (center: number, width: number) => {
    const delta = Math.atan2(Math.sin(angle - center), Math.cos(angle - center));
    return Math.exp(-0.5 * (delta / width) ** 2);
  };
  // 两翼包住中央入海湾；前方贝壳屋海滩宽，后方高地稍窄。
  return 29.4 + 1.7 * Math.sin(3 * angle + 0.4)
    + 0.7 * Math.cos(7 * angle - 0.8)
    + 4.2 * lobe(-0.72, 0.35) + 3.0 * lobe(0.75, 0.38)
    - 6.3 * lobe(0.12, 0.22) + 2.2 * lobe(2.7, 0.45);
};

export const streamPaths: [number, number][][] = [
  [[5, -25], [3, -18], [5, -12], [2, -6], [-1, 0], [1, 7], [-2, 13], [1, 19], [3, 27]],
  [[-7, -14], [-5, -10], [-7, -5], [-5, 0], [-1, 0]],
];

/** 山头（抬升地形）。散布要避开山体的陡坡。 */
export const hilltops = [
  { x: -15, z: 19, radius: 12, height: 1.4 },
  { x: -15, z: -10, radius: 12, height: 6.2 },
  { x: -1, z: -5, radius: 10, height: 7.6 },
  { x: 14, z: 0, radius: 12, height: 6.0 },
  { x: 8, z: 19, radius: 11, height: 3.3 },
  { x: 14, z: -19, radius: 13, height: 11.5 },
] as const;

export function baseTerrainHeight(x: number, z: number) {
  const radius = Math.hypot(x, z);
  const angle = Math.atan2(x, z);
  const edgeDistance = Math.max(0, coastlineRadius(angle) - 0.45 - radius);
  const edgeFade = ease(clamp01(edgeDistance / 2.8));
  let height = 0.35 + 0.7 * (1 - ease(clamp01(radius / 29)));
  for (const hill of hilltops) {
    const dx = (x - hill.x) * 0.92;
    const dz = (z - hill.z) * 1.08;
    const distance = Math.hypot(dx, dz)
      + 0.35 * Math.sin(x * 0.67 + z * 0.31) * Math.sin(z * 0.54);
    const terrace = ease(clamp01((hill.radius - distance) / (hill.radius * 0.23)));
    const hillHeight = 0.35 + hill.height * terrace;
    const blend = Math.max(0.8 - Math.abs(height - hillHeight), 0);
    height = Math.max(height, hillHeight) + blend * blend / 3.2;
  }
  const broadRoll = (Math.sin(x * 0.24 + z * 0.12) + Math.cos(z * 0.22 - x * 0.11)) * 0.11;
  // 前岸缓降为沙滩，后岸保留高低不同的岩壁，避免水平圆盘外缘。
  const back = ease(clamp01((8 - z) / 32));
  const rim = 0.12 + back * (1.6 + 0.55 * Math.sin(angle * 3 + 0.5));
  return Math.max(0, rim * (1 - edgeFade) + (height + broadRoll) * edgeFade);
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
  const height = baseTerrainHeight(x, z);
  const channel = Math.max(...streamPaths.map(path => {
    const distance = distanceToPath(x, z, path);
    const width = 1.05 + 0.85 * ease(clamp01((z + 8) / 30));
    return 1 - ease(clamp01((distance - width) / 1.7));
  }));
  const riverbed = -0.65 + 4.2 * ease(clamp01((-z - 2) / 24));
  return height + (Math.min(height, riverbed) - height) * channel;
}
