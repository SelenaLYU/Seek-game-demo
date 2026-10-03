import Phaser from 'phaser';
import { resolveImageUrl } from '../assets';
import boxClosed from '../../assets/environment/room-lockbox-closed-perspective-v1.png?url';
import boxOpen from '../../assets/environment/room-lockbox-open-empty-perspective-v1.png?url';
import battery from '../../assets/items/room-flashlight-battery-perspective-v1.png?url';
import lampOff from '../../assets/environment/room-flashlight-off.png?url';
import lampOn from '../../assets/environment/room-flashlight-on.png?url';

function installStyle(): void {
  if (document.getElementById('room-item-presentation-style')) return;
  const style = document.createElement('style');
  style.id = 'room-item-presentation-style';
  style.textContent = `
    .room-item-presentation { position:fixed; inset:0; z-index:2400; display:grid; place-items:center;
      background:rgba(13,19,24,.65); backdrop-filter:blur(6px); }
    .room-item-presentation__stage { position:relative; width:min(520px,88vw); height:min(390px,70vh);
      animation:room-item-enter .4s ease-out both; }
    .room-item-presentation.is-leaving { pointer-events:none; opacity:0; transition:opacity .22s; }
    .room-item-presentation.is-leaving .room-item-presentation__stage { transform:scale(.65); transition:transform .22s; }
    .room-item-presentation img { position:absolute; width:100%; height:100%; object-fit:contain; pointer-events:none; }
    .room-item-presentation__open { opacity:0; animation:room-box-open .7s .3s forwards; }
    .room-item-presentation__closed { animation:room-box-close .7s .3s forwards; }
    .room-item-presentation__battery { position:absolute; left:41%; top:48%; width:18%; height:22%;
      border:0; padding:0; background:transparent; cursor:pointer; opacity:0; animation:room-box-open .3s 1s forwards; }
    .room-item-presentation__battery img { inset:0; }
    .room-item-presentation__battery:hover { filter:brightness(1.15); }
    .room-item-presentation__close { position:absolute; top:20px; right:22px; border:1px solid #c8c4b3;
      border-radius:50%; width:38px; height:38px; color:#eee9d8; background:#28312e; font-size:24px; cursor:pointer; }
    .room-item-presentation.is-combining .room-item-presentation__stage { width:min(400px,80vw); }
    .room-item-presentation__lamp { left:25%; top:5%; width:50%!important; height:85%!important; }
    .room-item-presentation__cell { left:0; top:56%; width:23%!important; height:24%!important;
      animation:room-cell-insert 1.1s .15s ease-in-out forwards; }
    .room-item-presentation__lit { opacity:0; animation:room-box-open .45s 1.2s forwards;
      filter:drop-shadow(0 0 22px rgba(255,230,153,.6)); }
    .room-item-notice { position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:2500;
      max-width:80vw; margin:0; padding:16px 28px; border-radius:3px; background:rgba(240,234,219,.93);
      color:#55534e; font:20px/1.6 KaiTi,STKaiti,"Microsoft YaHei",serif; text-align:center; pointer-events:none;
      animation:room-notice-in .25s ease-out; }
    @keyframes room-item-enter { from { opacity:0; transform:scale(.6); } to { opacity:1; transform:scale(1); } }
    @keyframes room-box-open { to { opacity:1; } }
    @keyframes room-box-close { to { opacity:0; } }
    @keyframes room-cell-insert { 75% { transform:translate(145%,-20%) rotate(-15deg); opacity:1; } 100% { transform:translate(160%,-25%); opacity:0; } }
    @keyframes room-notice-in { from { opacity:0; } to { opacity:1; } }
  `;
  document.head.append(style);
}

const notices = new WeakMap<Phaser.Scene, () => void>();
export function showRoomItemNotice(scene: Phaser.Scene, message: string): void {
  installStyle();
  notices.get(scene)?.();
  const text = document.createElement('p');
  text.className = 'room-item-notice';
  text.setAttribute('role', 'status');
  text.textContent = message;
  document.body.append(text);
  const cleanup = () => {
    window.clearTimeout(timer);
    text.remove();
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    notices.delete(scene);
  };
  const timer = window.setTimeout(cleanup, 2300);
  notices.set(scene, cleanup);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
}

/** DOM close-ups stay centered even when the room camera crops a narrow viewport. */
export function showRoomItemPresentation(scene: Phaser.Scene, options: {
  mode: 'box' | 'combine';
  hasBattery?: boolean;
  onTakeBattery?: () => void;
  onCombined?: () => void;
  onClose: () => void;
}): void {
  installStyle();
  const root = document.createElement('div');
  root.className = `room-item-presentation ${options.mode === 'combine' ? 'is-combining' : ''}`;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', options.mode === 'box' ? '打开木盒' : '电池装入手电筒');
  const stage = document.createElement('div');
  stage.className = 'room-item-presentation__stage';
  root.append(stage);
  const addImage = (url: string, className: string) => {
    const img = document.createElement('img');
    img.src = resolveImageUrl(url);
    img.alt = '';
    img.className = className;
    stage.append(img);
  };
  const timers: number[] = [];
  let closed = false;
  const cleanup = () => {
    closed = true;
    timers.forEach(window.clearTimeout);
    root.remove();
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    root.classList.add('is-leaving');
    timers.push(window.setTimeout(() => { cleanup(); options.onClose(); }, 220));
  };
  if (options.mode === 'box') {
    addImage(boxClosed, 'room-item-presentation__closed');
    addImage(boxOpen, 'room-item-presentation__open');
    if (options.hasBattery) {
      const cell = document.createElement('button');
      cell.className = 'room-item-presentation__battery';
      cell.setAttribute('aria-label', '拾取电池');
      cell.disabled = true;
      const img = document.createElement('img');
      img.src = resolveImageUrl(battery);
      img.alt = '电池';
      cell.append(img);
      stage.append(cell);
      timers.push(window.setTimeout(() => { cell.disabled = false; }, 1000));
      cell.onclick = () => {
        if (closed || cell.disabled) return;
        cell.disabled = true;
        options.onTakeBattery?.();
        close();
      };
    }
    const button = document.createElement('button');
    button.className = 'room-item-presentation__close';
    button.textContent = '×';
    button.setAttribute('aria-label', '关闭木盒');
    button.onclick = close;
    root.append(button);
  } else {
    addImage(lampOff, 'room-item-presentation__lamp');
    addImage(battery, 'room-item-presentation__cell');
    addImage(lampOn, 'room-item-presentation__lamp room-item-presentation__lit');
    timers.push(window.setTimeout(() => {
      if (closed) return;
      options.onCombined?.();
      close();
    }, 1900));
  }
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  document.body.append(root);
}
