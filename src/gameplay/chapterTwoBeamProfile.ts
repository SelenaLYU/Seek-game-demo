/**
 * 手电筒光束贴图的衰减曲线（纯函数，不依赖 Phaser，可在 node 里单测）。
 *
 * 拆出来的原因：`chapterTwoFlashlight.ts` 要 `import Phaser` 才能建贴图，node 侧跑不了；
 * 但「截面怎么衰减、命中锥边缘保留多少亮度」是这条光束唯一需要锁住的数学，必须能测。
 *
 * 两次实机反馈推着走到了现在这个形状：
 *  1. 2026-10-05 第一轮「像一个形状贴上去的」→ 放弃 Graphics 多边形，改贴图；
 *  2. 第二轮「光范围太大」→ 贴图截面只跟 v 有关，灯口处就已是全宽光带（矩形），
 *     整屏被加色抬成一层雾；
 *  3. 第三轮「光边缘不对，不符合物理规律」→ 只按 `v / coneHalfWidth(u)` 归一化还不够：
 *     灯口附近为了防除零给了宽度下限，等宽条 + 只有十几像素宽的柔边，读起来是硬边矩形。
 *
 * 现在用**双瓣高斯**做截面（真实手电的光场就是这个形状：中心热斑 + 外圈溢光），
 * 处处指数衰减、没有任何硬截断；命中锥边界（`isInBeam()` 的边界）刚好落在
 * `EDGE_RELATIVE` 这一档亮度上，所以「看到光 = 被照到」仍然逐点成立。
 */

/**
 * 贴图高度相对命中锥的比例。高斯尾巴在 `v = ±1`（贴图最外沿）必须已经衰减到看不见，
 * 否则贴图边缘会留下一条硬边。
 */
export const BEAM_PADDING = 2.4;
/**
 * 命中锥边缘（`u / BEAM_PADDING`）保留的相对亮度 = 1 处的衰减值。
 * 太低读不出「光到哪儿为止」（公平性：不能在看不见光的边界被抓），
 * 太高又退回硬边多边形。
 */
export const EDGE_RELATIVE = 0.3;
/**
 * 锥尾保留的相对亮度。打在整屏幕大的光带上时，这个值直接决定「雾不雾」。
 */
export const FAR_RELATIVE = 0.06;

/** 双瓣高斯：中心热斑（窄、占 72%）+ 外圈溢光（宽、占 28%） */
const HOT_SHARE = 0.72;
const SPILL_SHARE = 1 - HOT_SHARE;
/** 让两瓣在 t=1 处合计正好等于 EDGE_RELATIVE */
const HOT_FALLOFF = Math.log(HOT_SHARE / 0.18); // t=1 处热斑贡献 0.18
const SPILL_FALLOFF = Math.log(SPILL_SHARE / (EDGE_RELATIVE - 0.18)); // 外溢贡献 0.12
/** 灯口处的最小半宽：镜片本身有尺寸，光束不会从零宽张开 */
const LENS_FLOOR = 0.045;

/**
 * 命中锥在贴图坐标里的半宽：`u=0` 灯口 → `u=1` 锥尾。
 * 与 `LIGHT_HALF_ANGLE` 完全一致：贴图高度按 `tan(half) * 2 * BEAM_PADDING` 生成、
 * 拉伸到 `LIGHT_LENGTH`，所以这里的锥面边界就是 `isInBeam()` 的边界。
 */
export function coneHalfWidth(u: number): number {
  return Math.max(u, LENS_FLOOR) / BEAM_PADDING;
}

/** 截面亮度：`t` = 0 中轴、1 命中锥边界、>1 外溢区；处处光滑单调，没有阶梯 */
export function crossSectionAt(t: number): number {
  const squared = t * t;
  return HOT_SHARE * Math.exp(-HOT_FALLOFF * squared) + SPILL_SHARE * Math.exp(-SPILL_FALLOFF * squared);
}

/**
 * 光束贴图上的不透明度。
 *
 * @param u 0 = 灯口，1 = 锥尾
 * @param v -1..1；0 = 中轴；±coneHalfWidth(u) = 命中锥边界；再往外是外溢
 */
export function beamAlphaAt(u: number, v: number): number {
  const t = Math.abs(v) / coneHalfWidth(u);
  // 长度：中段快速衰减 + 灯口热区；远端只留 FAR_RELATIVE，避免整屏被抬亮
  const along = FAR_RELATIVE + (1 - FAR_RELATIVE) * (1 - u) ** 1.6 + 0.2 * (1 - u) ** 7;
  return Math.min(1, crossSectionAt(t) * along);
}
