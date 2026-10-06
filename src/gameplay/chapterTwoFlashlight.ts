import Phaser from 'phaser';
import { LIGHT_HALF_ANGLE, LIGHT_LENGTH } from './chapterTwoRules';
import { BEAM_PADDING, beamAlphaAt } from './chapterTwoBeamProfile';

/**
 * 手电筒光束的绘制层。
 *
 * 为什么不再用 Graphics 画多边形（2026-10-05 实机两轮反馈：「像一个形状贴上去的」「效果不够」）：
 * 多边形无论是三角形还是叠层楔子，**截面亮度是常数、边缘是硬直线**，在暗夜场景里只会读成
 * 一张半透明贴纸。参考实现走的是另一条路：
 *   · Godot Shaders《God Rays 2D》：用一张渐变贴图 + 旋转/斜切 UV + 加色混合；
 *   · `westonwright/volumetric-lighting-2d-urp`、`GryffDavid/MultipleCrepuscularLights`：同样靠贴图渐变；
 *   · GPU Gems 3 第 13 章 / `Erkaman/glsl-godrays`：真正的体积光散射，需要遮挡图 + 径向模糊，
 *     代价是额外渲染目标与相机，本项目美术体量下收益不划算（在 PR/HANDOFF 里记为可选升级路径）。
 *   · Phaser 4.2 的 Cone Light 是引擎原生解，但本项目在 Phaser 3.90，且它要求 Light2D + 法线贴图。
 *
 * 所以这里：程序化生成一张**软光束贴图**（截面余弦衰减 + 长度衰减 + 轻微颗粒），
 * 用 `BlendModes.ADD` 贴着灯口旋转绘制，再补灯口辉光、空气中的尘埃和轻微抖动（手持手电的真实感）。
 *
 * 公平性约束不变：贴图里**命中锥的边界**（`LIGHT_HALF_ANGLE`）落在 `1 / BEAM_PADDING` 处，
 * 外圈留白只是把边界柔化，不会出现「看到光却没被照到」或反向的情况。
 */

const BEAM_TEXTURE = 'chapter2-flashlight-beam';
const GLOW_TEXTURE = 'chapter2-flashlight-glow';

/** 贴图宽度（沿光束方向）；实际显示宽度是 LIGHT_LENGTH，所以会横向拉伸 */
const TEXTURE_WIDTH = 1024;

/** 生成光束与灯口辉光贴图（各一次；已存在则跳过） */
export function createFlashlightTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(BEAM_TEXTURE)) {
    // 贴图高度 = 命中锥在锥尾的宽度 × 柔边留白
    const height = Math.max(16, Math.round(TEXTURE_WIDTH * Math.tan(LIGHT_HALF_ANGLE) * 2 * BEAM_PADDING));
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_WIDTH;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(TEXTURE_WIDTH, height);
    for (let y = 0; y < height; y++) {
      const v = ((y + 0.5) / height) * 2 - 1;
      for (let x = 0; x < TEXTURE_WIDTH; x++) {
        const u = (x + 0.5) / TEXTURE_WIDTH;
        // 颗粒：把"矢量图形感"打散；横向拉伸后变成沿光束方向的条纹（真实光束里的不均匀感）
        const grain = 0.93 + 0.14 * Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1);
        const alpha = beamAlphaAt(u, v) * grain;
        const offset = (y * TEXTURE_WIDTH + x) * 4;
        image.data[offset] = 255;
        image.data[offset + 1] = 250;
        image.data[offset + 2] = 236;
        image.data[offset + 3] = Math.max(0, Math.min(255, Math.round(alpha * 255)));
      }
    }
    context.putImageData(image, 0, 0);
    scene.textures.addCanvas(BEAM_TEXTURE, canvas);
  }

  if (!scene.textures.exists(GLOW_TEXTURE)) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,248,230,0.95)');
    gradient.addColorStop(0.18, 'rgba(255,240,205,0.52)');
    gradient.addColorStop(0.45, 'rgba(255,232,190,0.18)');
    gradient.addColorStop(1, 'rgba(255,226,180,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    scene.textures.addCanvas(GLOW_TEXTURE, canvas);
  }
}

/**
 * 一维值噪声：无固定周期的手持抖动。
 * 两个不同频率的正弦叠加仍然是**周期性**的（会听出/看出规律的节拍，实机反馈
 * 「光摆动的频率是一样的」）。真实的手持光源是慢漂移 + 高频微抖，频谱连续、不重复。
 */
function valueNoise(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const a = hash(i), b = hash(i + 1);
  const smooth = f * f * (3 - 2 * f);
  return a + (b - a) * smooth;
}

/** 空气里的尘埃：沿光束缓慢漂移的小亮点，是"光在空气里"最直接的线索 */
type Mote = { along: number; across: number; speed: number; size: number; phase: number; twinkle: number };
const MOTE_COUNT = 18;

export class Flashlight {
  private readonly beam: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly motes: Phaser.GameObjects.Graphics;
  private readonly specs: Mote[] = [];
  private visible = true;

  constructor(scene: Phaser.Scene, depth: number) {
    createFlashlightTextures(scene);
    // 光束本体：原点在灯口，沿 +x 指出去，运行时按角度旋转；加色混合才会"照亮"里面的画面
    this.beam = scene.add.image(0, 0, BEAM_TEXTURE)
      .setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
    this.beam.setDisplaySize(LIGHT_LENGTH, LIGHT_LENGTH * Math.tan(LIGHT_HALF_ANGLE) * 2 * BEAM_PADDING);
    this.glow = scene.add.image(0, 0, GLOW_TEXTURE)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(depth + 1).setDisplaySize(72, 72);
    this.motes = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(depth + 1);
    // 确定性分布（不用 Math.random，便于复现截图）
    for (let i = 0; i < MOTE_COUNT; i++) {
      const r1 = ((i * 2654435761) % 1000) / 1000;
      const r2 = ((i * 40503) % 997) / 997;
      const r3 = ((i * 69069 + 7) % 991) / 991;
      const r4 = ((i * 22695477 + 17) % 983) / 983;
      // twinkle：颗粒各自的闪烁频率（0.0015–0.009），避免所有尘埃同一个节拍
      this.specs.push({ along: r1, across: r2 * 2 - 1, speed: 0.4 + r3 * 0.9, size: 0.8 + r3 * 1.6, phase: r1 * 6.283, twinkle: 0.0015 + r4 * 0.0075 });
    }
  }

  /** 让探针/截图在没有光束干扰的情况下测量（光束是加色层，会改变像素亮度） */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.beam.setVisible(visible);
    this.glow.setVisible(visible);
    this.motes.setVisible(visible);
  }

  render(origin: { x: number; y: number }, angle: number, tracking: boolean, timeMs: number): void {
    if (!this.visible) return;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tint = tracking ? 0xffb768 : 0xf6e2a8;
    // 手持抖动：慢漂移（0.0016）+ 高频微抖（0.0071）两段值噪声，频谱连续、不重复
    const flicker = 1 + 0.10 * (valueNoise(timeMs * 0.0016) - 0.5) + 0.06 * (valueNoise(timeMs * 0.0071 + 11.7) - 0.5);
    // 手腕的微摆：只作用于画面（判定仍用 searchlight.angle），幅度 ±0.005 rad ≈ ±0.29°
    const sway = 0.01 * (valueNoise(timeMs * 0.0011 + 5.3) - 0.5);
    this.beam
      .setPosition(origin.x, origin.y)
      .setRotation(angle + sway)
      .setTint(tint)
      .setAlpha((tracking ? 0.62 : 0.46) * flicker);
    this.glow
      .setPosition(origin.x + cos * 6, origin.y + sin * 6)
      .setTint(tint)
      .setAlpha((tracking ? 0.72 : 0.56) * flicker)
      .setDisplaySize(tracking ? 84 : 72, tracking ? 84 : 72);

    const half = Math.tan(LIGHT_HALF_ANGLE);
    this.motes.clear();
    for (const mote of this.specs) {
      const along = (mote.along + (timeMs * mote.speed) / 26000) % 1;
      const distance = along * LIGHT_LENGTH;
      const lateral = mote.across * distance * half * 0.82;
      const x = origin.x + cos * distance - sin * lateral;
      const y = origin.y + sin * distance + cos * lateral;
      // 两端淡、中段亮；越靠近灯口颗粒越大（近大远小）
      const fade = Math.sin(Math.PI * Math.min(1, Math.max(0, along))) * (1 - along * 0.55);
      const shimmer = 0.55 + 0.45 * valueNoise(timeMs * mote.twinkle + mote.phase);
      this.motes.fillStyle(0xfff5df, 0.13 * fade * shimmer * flicker);
      this.motes.fillCircle(x, y, mote.size * (1 - along * 0.5) * 1.15);
    }
  }
}
