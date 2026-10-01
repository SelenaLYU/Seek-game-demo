import Phaser from 'phaser';

/**
 * 视差层对齐工具。
 *
 * ## 为什么需要它
 *
 * Phaser 的 `scrollFactor` 不是「相对世界的偏移倍率」，而是「参与相机滚动的倍率」：
 *
 * ```
 * rendered = obj.x + camera.scrollX * (1 - scrollFactorX)
 * ```
 *
 * 而 `camera.scrollX` 在「世界尺寸 ≠ 相机可视尺寸」时**并不等于世界原点**——
 * `setBounds` 会把它居中钳制到：
 *
 * ```
 * scrollX = worldView.x - (camera.width - camera.width / zoom) / 2
 * ```
 *
 * 本作世界 1900×540，相机可视区恰好 960×540（一整屏高），于是 `scrollY` 恒为
 * `-(1494 - 540) / 2 ≈ -477`。此时若给背景设 `scrollFactor = 0.2`，背景会整体被
 * 抬升 `(1 - 0.2) × 477 ≈ 382` 世界像素：底部只画到 `y ≈ 158`，屏幕上表现为
 * 「背景只剩顶部一条亮带，下面全是相机底色」——这就是 2026-10-01 用户截图里的黑带。
 *
 * ## 用法
 *
 * 声明「我希望这个图层落在哪个世界坐标」，函数反算出 sprite 该设的 `x / y`，
 * 使图层在 `worldView` 原点时精确落在该位置；之后的位移交给 `scrollFactor`。
 *
 * 必须在 `applyHDCamera()` 之后调用（依赖已确定的 zoom）。
 * `worldX / worldY` 用的是图层自身 origin 对应的点（origin 0,1 即左下角）。
 */
export function placeParallax(
  scene: Phaser.Scene,
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite,
  worldX: number,
  worldY: number,
  factorX: number,
  factorY: number,
): void {
  const cam = scene.cameras.main;
  const viewW = cam.width / cam.zoomX;
  const viewH = cam.height / cam.zoomY;
  // worldView 位于世界原点时，相机自身的滚动量（居中相机为负值）
  const s0x = -(cam.width - viewW) / 2;
  const s0y = -(cam.height - viewH) / 2;
  obj.setScrollFactor(factorX, factorY);
  obj.setPosition(worldX + s0x * (factorX - 1), worldY + s0y * (factorY - 1));
}
