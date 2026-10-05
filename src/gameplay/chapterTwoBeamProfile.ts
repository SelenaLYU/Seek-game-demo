/**
 * 手电筒光束贴图的衰减曲线（纯函数，不依赖 Phaser，可在 node 里单测）。
 *
 * 拆出来的原因：`chapterTwoFlashlight.ts` 要 `import Phaser` 才能建贴图，node 侧跑不了；
 * 但「截面怎么衰减、命中锥边缘保留多少亮度」是这条光束唯一需要锁住的数学，必须能测。
 *
 * 2026-10-05 第二轮实机反馈「光范围太大」的真正原因不是亮度，而是**形状**：
 * 上一版把一张矩形渐变贴图整条拉伸到 4200px，截面衰减只跟 `v` 有关、跟 `u` 无关，
 * 于是灯口处就已经是全宽（875px）的光带——整屏被均匀抬亮，看起来是一层雾而不是一束光。
 * 现在截面按 `v / coneHalfWidth(u)` 归一化：命中锥从灯口张开，贴图里天然是个楔形，
 * 近端只有一条细亮线，越远越宽；命中锥边界正好落在 `u / BEAM_PADDING`。
 */

/** 光照锥外缘之外的柔边留白；命中锥边界在贴图坐标里位于 `u / BEAM_PADDING` */
export const BEAM_PADDING = 1.35;
/**
 * 命中锥边缘保留的相对亮度。
 * 太低读不出「光到哪儿为止」（公平性：不能在看不见光的边界被抓），
 * 太高又退回硬边多边形。0.3 = 中轴亮 3 倍多，边界仍是柔和的一条。
 */
export const EDGE_RELATIVE = 0.3;
/**
 * 锥尾保留的相对亮度。
 * 上一版 0.16：锥尾仍有 16% 亮度 × 加色混合，打在整屏幕大的光带上是「洗白」的主因。
 * 0.06 留在「看得到光的方向、但不再是雾」的位置；中场亮度改由下面更缓的长度指数补。
 */
export const FAR_RELATIVE = 0.06;

/**
 * 命中锥在贴图坐标里的半宽：`u=0` 灯口 → `u=1` 锥尾。
 * 与 `LIGHT_HALF_ANGLE` 完全一致：贴图高度按 `tan(half) * 2 * BEAM_PADDING` 生成、
 * 拉伸到 `LIGHT_LENGTH`，所以这里的楔形边界就是 `isInBeam()` 的边界，不会出现
 * 「看到光却没被照到」（或反过来）。
 */
export function coneHalfWidth(u: number): number {
  // 灯口处留一点点底宽，避免归一化除以 0 出现一像素亮线；
  // 0.045 * LIGHT_LENGTH * tan(half) ≈ 12px，正好是镜片大小。
  return Math.max(u, 0.045) / BEAM_PADDING;
}

/**
 * 光束贴图上的不透明度。
 *
 * @param u 0 = 灯口，1 = 锥尾
 * @param v -1..1；0 = 中轴；±coneHalfWidth(u) = 命中锥边界；再往外是柔边
 */
export function beamAlphaAt(u: number, v: number): number {
  const half = coneHalfWidth(u);
  const across = Math.abs(v);
  const t = across / half; // 0 = 中轴，1 = 命中锥边界，BEAM_PADDING = 柔边最外
  const core = Math.max(0, 1 - Math.min(1, t)) ** 0.9;
  const skirt = t <= 1 ? 1 : Math.max(0, 1 - (t - 1) / (BEAM_PADDING - 1));
  const cross = skirt * (EDGE_RELATIVE + (1 - EDGE_RELATIVE) * core);
  const along = FAR_RELATIVE + (1 - FAR_RELATIVE) * (1 - u) ** 1.6 + 0.2 * (1 - u) ** 7;
  return Math.min(1, cross * along);
}
