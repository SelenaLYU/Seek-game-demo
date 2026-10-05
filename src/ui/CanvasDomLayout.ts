import Phaser from 'phaser';

export type CanvasDomHorizontalAnchor = 'left' | 'center' | 'right';

/**
 * Keeps a 960×540 DOM overlay at its original aspect ratio while Phaser expands
 * the canvas on wide screens.  Corner HUDs can stay attached to their edge;
 * modal overlays remain centred in the visible canvas.
 */
export function fitCanvasDomOverlay(
  scene: Phaser.Scene,
  root: HTMLElement,
  width = 960,
  height = 540,
  horizontalAnchor: CanvasDomHorizontalAnchor = 'center',
): void {
  const bounds = scene.game.canvas.getBoundingClientRect();
  const scale = Math.min(bounds.width / width, bounds.height / height);
  const renderedWidth = width * scale;
  const renderedHeight = height * scale;
  const left = horizontalAnchor === 'left'
    ? bounds.left
    : horizontalAnchor === 'right'
      ? bounds.right - renderedWidth
      : bounds.left + (bounds.width - renderedWidth) / 2;

  root.style.left = `${left}px`;
  root.style.top = `${bounds.top + (bounds.height - renderedHeight) / 2}px`;
  root.style.transform = `scale(${scale})`;

  // The interactive content keeps its 16:9 design area, while dim/blur layers
  // must still cover every visible pixel of an expanded widescreen canvas.
  const overhangLeft = Math.max(0, (left - bounds.left) / scale);
  const overhangRight = Math.max(0, (bounds.right - left - renderedWidth) / scale);
  const renderedTop = bounds.top + (bounds.height - renderedHeight) / 2;
  const overhangTop = Math.max(0, (renderedTop - bounds.top) / scale);
  const overhangBottom = Math.max(0, (bounds.bottom - renderedTop - renderedHeight) / scale);
  const backdrops = root.querySelectorAll<HTMLElement>('[data-canvas-backdrop]');
  if (backdrops.length > 0) root.style.overflow = 'visible';
  for (const backdrop of backdrops) {
    backdrop.style.left = `${-overhangLeft}px`;
    backdrop.style.right = `${-overhangRight}px`;
    backdrop.style.top = `${-overhangTop}px`;
    backdrop.style.bottom = `${-overhangBottom}px`;
  }
}
