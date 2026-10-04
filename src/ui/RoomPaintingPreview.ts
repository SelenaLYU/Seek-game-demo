import Phaser from 'phaser';
import { fitCanvasDomOverlay } from './CanvasDomLayout';

export interface RoomPaintingPreviewHandle {
  element: HTMLDivElement;
  close: () => void;
}

const WIDTH = 960;
const HEIGHT = 540;
const STYLE_ID = 'seek-room-painting-preview-style';

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .seek-room-painting-preview {
      position: fixed; width: 960px; height: 540px; z-index: 1160;
      transform-origin: top left; display: grid; place-items: center;
      font-family: Arial, "Microsoft YaHei", sans-serif;
    }
    .seek-room-painting-preview * { box-sizing: border-box; }
    .seek-room-painting-preview__backdrop {
      position: absolute; inset: 0; background: rgba(5, 9, 8, .86);
      backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
    }
    .seek-room-painting-preview__picture {
      position: relative;
      width: 620px; height: 440px; padding: 10px;
      border: 8px solid #4a3824; border-radius: 3px;
      background: #d6c59b; box-shadow: 0 18px 48px rgba(0,0,0,.62), inset 0 0 0 1px rgba(255,240,202,.35);
    }
    .seek-room-painting-preview__picture img {
      display: block; width: 100%; height: 100%; object-fit: cover;
    }
    .seek-room-painting-preview__close {
      position: absolute; right: 28px; top: 24px; width: 38px; height: 38px;
      display: grid; place-items: center; padding: 0; cursor: pointer;
      border: 1px solid rgba(239,220,174,.38); border-radius: 50%;
      color: #f3e6c4; background: rgba(19,29,24,.82); font-size: 22px;
    }
  `;
  document.head.append(style);
}

export function showRoomPaintingPreview(
  scene: Phaser.Scene,
  imageUrl: string,
  onClose: () => void,
): RoomPaintingPreviewHandle {
  installStyle();
  const root = document.createElement('div');
  root.className = 'seek-room-painting-preview';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '墙上的海景画');
  root.innerHTML = `
    <div class="seek-room-painting-preview__backdrop" data-canvas-backdrop></div>
    <div class="seek-room-painting-preview__picture">
      <img src="${imageUrl}" alt="墙上的海景画">
    </div>
    <button class="seek-room-painting-preview__close" type="button" aria-label="关闭">×</button>
  `;

  let closed = false;
  const position = () => {
    fitCanvasDomOverlay(scene, root, WIDTH, HEIGHT);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    scene.scale.off(Phaser.Scale.Events.RESIZE, position);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, shutdown);
    root.remove();
    onClose();
  };
  const shutdown = () => {
    if (closed) return;
    closed = true;
    scene.scale.off(Phaser.Scale.Events.RESIZE, position);
    root.remove();
  };

  root.querySelector<HTMLButtonElement>('.seek-room-painting-preview__close')!.addEventListener('click', close);
  root.querySelector<HTMLElement>('.seek-room-painting-preview__backdrop')!.addEventListener('pointerdown', close);
  document.body.append(root);
  position();
  scene.scale.on(Phaser.Scale.Events.RESIZE, position);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, shutdown);
  return { element: root, close };
}
