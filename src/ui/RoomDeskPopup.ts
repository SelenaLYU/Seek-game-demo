import Phaser from 'phaser';
import emptyDeskUrl from '../../assets/environment/room-desk-decorated-empty-slots-v1.png?url';
import propsDeskUrl from '../../assets/environment/room-desk-with-shadow-boat-props-v1.png?url';

export interface RoomDeskPopupHandle {
  element: HTMLDivElement;
  close: () => void;
}

interface RoomDeskPopupOptions {
  puzzleAvailable: boolean;
  onEnterPuzzle: () => void;
  onClose: () => void;
}

const WIDTH = 960;
const HEIGHT = 540;
const STYLE_ID = 'seek-room-desk-popup-style';
const activePopups = new WeakMap<Phaser.Scene, RoomDeskPopupHandle>();

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .seek-room-desk-popup {
      position: fixed; width: ${WIDTH}px; height: ${HEIGHT}px; z-index: 1200;
      overflow: hidden; transform-origin: top left; color: #e8dfcc;
      font-family: Arial, "Microsoft YaHei", sans-serif; user-select: none;
    }
    .seek-room-desk-popup__shade {
      position: absolute; inset: 0; background: rgba(7, 12, 18, .82);
      backdrop-filter: blur(7px); -webkit-backdrop-filter: blur(7px);
    }
    .seek-room-desk-popup__title {
      position: absolute; z-index: 2; top: 20px; left: 50%; transform: translateX(-50%);
      margin: 0; padding: 8px 18px; border: 1px solid rgba(225, 207, 166, .3);
      border-radius: 18px; background: rgba(17, 24, 31, .86); color: #f0e5c7;
      font: 15px/1.2 "Microsoft YaHei", sans-serif; letter-spacing: .08em;
    }
    .seek-room-desk-popup__close {
      position: absolute; z-index: 3; right: 22px; top: 18px; width: 38px; height: 38px;
      border: 1px solid rgba(225, 207, 166, .28); border-radius: 50%;
      color: #f0e5c7; background: rgba(17, 24, 31, .88); font-size: 23px; cursor: pointer;
    }
    .seek-room-desk-popup__desk {
      position: absolute; left: 50%; top: 48%; width: 620px; height: 420px;
      transform: translate(-50%, -50%); object-fit: contain; cursor: pointer;
      filter: drop-shadow(0 16px 24px rgba(0, 0, 0, .45));
      transition: filter 180ms ease;
    }
    .seek-room-desk-popup__desk:hover { filter: drop-shadow(0 18px 28px rgba(0, 0, 0, .56)) brightness(1.03); }
    .seek-room-desk-popup__hint {
      position: absolute; left: 50%; bottom: 63px; transform: translateX(-50%);
      width: 560px; margin: 0; color: rgba(232, 223, 204, .84); text-align: center;
      font: 13px/1.5 "Microsoft YaHei", sans-serif;
    }
    .seek-room-desk-popup__action {
      position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%);
      min-width: 210px; padding: 10px 20px; border: 1px solid rgba(225, 207, 166, .35);
      border-radius: 4px; color: #f4e8c8; background: rgba(47, 61, 62, .96);
      font: 14px "Microsoft YaHei", sans-serif; cursor: pointer;
    }
    .seek-room-desk-popup__action:disabled { opacity: .56; cursor: default; }
  `;
  document.head.append(style);
}

export function showRoomDeskPopup(scene: Phaser.Scene, options: RoomDeskPopupOptions): RoomDeskPopupHandle {
  activePopups.get(scene)?.close();
  installStyle();

  const root = document.createElement('div');
  root.className = 'seek-room-desk-popup';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '书桌');

  const shade = document.createElement('div');
  shade.className = 'seek-room-desk-popup__shade';
  const title = document.createElement('h2');
  title.className = 'seek-room-desk-popup__title';
  title.textContent = '书桌';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'seek-room-desk-popup__close';
  closeButton.setAttribute('aria-label', '关闭书桌');
  closeButton.textContent = '×';
  const desk = document.createElement('img');
  desk.className = 'seek-room-desk-popup__desk';
  desk.src = emptyDeskUrl;
  desk.alt = '书桌上的书本和三个空出的摆放位置';
  const hint = document.createElement('p');
  hint.className = 'seek-room-desk-popup__hint';
  hint.textContent = '点击桌面，看看光影小船的工具。';
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'seek-room-desk-popup__action';
  action.textContent = '查看桌面物件';

  root.append(shade, title, closeButton, desk, hint, action);

  let propsVisible = false;
  let closed = false;
  const showProps = () => {
    propsVisible = true;
    desk.src = propsDeskUrl;
    desk.alt = '书桌上摆着船形笔袋、细尺和三角尺';
    hint.textContent = options.puzzleAvailable
      ? '船形笔袋、细尺和三角尺——点击下方按钮开始组合光影小船。'
      : '工具还不能使用。先完成照片拼图、找到电池并点亮手电筒。';
    action.textContent = options.puzzleAvailable ? '开始光影小船' : '手电筒尚未点亮';
    action.disabled = !options.puzzleAvailable;
  };
  const position = () => {
    const bounds = scene.game.canvas.getBoundingClientRect();
    root.style.left = `${bounds.left}px`;
    root.style.top = `${bounds.top}px`;
    root.style.transform = `scale(${bounds.width / WIDTH}, ${bounds.height / HEIGHT})`;
  };
  position();

  const wasPaused = scene.scene.isPaused();
  if (!wasPaused) scene.scene.pause();
  const close = (resume = true) => {
    if (closed) return;
    closed = true;
    scene.scale.off(Phaser.Scale.Events.RESIZE, position);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    root.remove();
    activePopups.delete(scene);
    if (resume && !wasPaused && scene.scene.isPaused()) scene.scene.resume();
    options.onClose();
  };
  const onShutdown = () => close(false);
  scene.scale.on(Phaser.Scale.Events.RESIZE, position);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
  shade.addEventListener('click', () => close());
  closeButton.addEventListener('click', () => close());
  desk.addEventListener('click', showProps);
  action.addEventListener('click', () => {
    if (!propsVisible) return showProps();
    if (options.puzzleAvailable) options.onEnterPuzzle();
  });
  document.body.append(root);

  const handle = { element: root, close: () => close() };
  activePopups.set(scene, handle);
  return handle;
}
