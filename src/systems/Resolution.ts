import Phaser from 'phaser';

/**
 * 高清渲染（动态缓冲版）：
 *
 * 初始渲染缓冲根据浏览器 CSS 宽度 × DPR 取样，上限 3840 像素。
 * EXPAND 用等比缩放填满窗口，宽屏扩大可视范围，不拉伸角色和场景对象。
 *
 * 相机 zoom = 缓冲高 / 540（保持竖向逻辑视野 540）；
 * scrollFactor 0 的全屏层世界单位 = 缓冲像素（实测 1:1，zoom 不作用于它们），
 * 缓冲变化时必须按 gameSize 重缩放（森林雾/暗角/背景、各场景 hudLayer）。
 *
 * 场景 create() 调 applyHDCamera(this)；它在画布尺寸变化时自动重设
 * zoom/视口（跟随相机除外，不抢 centerOn）。缓冲的同步入口在 main.ts。
 */
export const BASE_WIDTH = 960;
export const BASE_HEIGHT = 540;
/** boot 时的初始倍率：仅用于 main.ts 的初始 width/height，运行期以 gameSize 为准 */
export const HD_SCALE = Math.min(window.devicePixelRatio || 1, 2);

/** 渲染缓冲宽度上限（≈4K），防止超大窗口开销失控 */
export const MAX_BUFFER_WIDTH = 3840;

/** 目标缓冲倍率：画布 CSS 宽 × 设备像素比，clamp 到 [1, 4]（保持 16:9） */
export function computeBufferScale(cssWidth: number): number {
  const dpr = window.devicePixelRatio || 1;
  return Phaser.Math.Clamp(Math.round(cssWidth * dpr), BASE_WIDTH, MAX_BUFFER_WIDTH) / BASE_WIDTH;
}

/** boot 前用窗口宽估算初始缓冲（#game 铺满视口，canvas CSS≈窗口宽）：
 * 让游戏从第一帧就是 1:1 设备像素，避免"先 1920 后校准"的首帧跳变 */
export function initialBufferSize(): { width: number; height: number } {
  const width = Math.round(BASE_WIDTH * computeBufferScale(window.innerWidth));
  return { width, height: Math.round((width * BASE_HEIGHT) / BASE_WIDTH) };
}

/** 当前渲染缓冲倍率（= 相机 zoom） */
export function bufferScaleOf(scene: Phaser.Scene): number {
  return scene.scale.gameSize.height / BASE_HEIGHT;
}

/** 相机保持逻辑高度 540 时的世界坐标视野宽度（不依赖 HD 渲染倍率）。 */
export function logicalWorldViewportWidth(scene: Phaser.Scene): number {
  const zoom = scene.scale.gameSize.height / BASE_HEIGHT;
  return Math.max(1, Math.round(scene.scale.gameSize.width / Math.max(zoom, 1)));
}

/** 全屏 sf0 层相对“1920×1080 参照缓冲”的重缩放系数 */
export function screenRefScaleOf(scene: Phaser.Scene): number {
  return scene.scale.gameSize.width / (BASE_WIDTH * 2);
}

export function applyHDCamera(scene: Phaser.Scene, mode: 'cover' | 'expand-horizontal' = 'cover'): void {
  const cam = scene.cameras.main;
  const apply = () => {
    const w = scene.scale.gameSize.width;
    const h = scene.scale.gameSize.height;
    const followsTarget = Boolean((cam as unknown as { _follow?: unknown })._follow);
    const heightZoom = h / BASE_HEIGHT;
    const widthZoom = w / BASE_WIDTH;
    cam.setZoom(mode === 'expand-horizontal' ? heightZoom : Math.max(heightZoom, widthZoom));
    if (cam.width !== w || cam.height !== h) {
      cam.setSize(w, h);
    }
    // 跟随相机（森林）由 follow 接管中心，这里只动 zoom/视口
    if (!(cam as unknown as { _follow?: unknown })._follow) {
      cam.centerOn(BASE_WIDTH / 2, BASE_HEIGHT / 2);
    }
  };
  apply();
  // 缓冲随窗口变化时保持相机同步；preload+create 双调用与场景复用都要去重，
  // SHUTDOWN 解绑防跨场景叠加（模块级字段挂在场景实例上）
  const holder = scene as unknown as { __hdResize?: () => void };
  if (holder.__hdResize) {
    scene.scale.off(Phaser.Scale.Events.RESIZE, holder.__hdResize);
  }
  holder.__hdResize = apply;
  scene.scale.on(Phaser.Scale.Events.RESIZE, holder.__hdResize);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (holder.__hdResize) {
      scene.scale.off(Phaser.Scale.Events.RESIZE, holder.__hdResize);
    }
    holder.__hdResize = undefined;
  });
}
