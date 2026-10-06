import { installRoomEnglish } from './RoomEnglish';
import Phaser from 'phaser';
import { resolveImageUrl } from '../assets';
import paperUrl from '../../assets/ui/room-letter-paper.jpg?url';

export const ROOM_PAPER_KEY = 'room-letter-paper';
export const ROOM_INK_FONT = '"KaiTi", "STKaiti", "楷体", Georgia, serif';
let cleanPaperUrl = paperUrl;

/** 只将与图像外缘相连的白底透明化，保留纸张内部的浅色纹理。 */
function preparePaper(scene: Phaser.Scene): void {
  const key = 'room-letter-paper-transparent';
  if (!scene.textures.exists(key)) {
    const source = scene.textures.get(ROOM_PAPER_KEY).getSourceImage() as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = pixels;
    const seen = new Uint8Array(canvas.width * canvas.height);
    const queue: number[] = [];
    const visit = (i: number) => {
      if (i < 0 || i >= seen.length || seen[i]) return;
      seen[i] = 1;
      const p = i * 4;
      if (Math.min(data[p], data[p + 1], data[p + 2]) < 235 || Math.max(data[p], data[p + 1], data[p + 2]) - Math.min(data[p], data[p + 1], data[p + 2]) > 16) return;
      data[p + 3] = 0; queue.push(i);
    };
    for (let x = 0; x < canvas.width; x++) { visit(x); visit((canvas.height - 1) * canvas.width + x); }
    for (let y = 0; y < canvas.height; y++) { visit(y * canvas.width); visit(y * canvas.width + canvas.width - 1); }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      if (i % canvas.width > 0) visit(i - 1);
      if (i % canvas.width < canvas.width - 1) visit(i + 1);
      visit(i - canvas.width); visit(i + canvas.width);
    }
    ctx.putImageData(pixels, 0, 0);
    cleanPaperUrl = canvas.toDataURL('image/png');
    scene.textures.addCanvas(key, canvas);
  }
}

export function preloadRoomPaper(scene: Phaser.Scene): void {
  // 信纸同样走 WebP 管线：PNG/JPG 真源保留，运行时优先同名 webp（2.4MB → 0.2MB 量级）。
  if (!scene.textures.exists(ROOM_PAPER_KEY)) scene.load.image(ROOM_PAPER_KEY, resolveImageUrl(paperUrl));
}

/** 只在两个记忆房间启用，离开时恢复其他场景。 */
export function enableRoomPaper(scene: Phaser.Scene): void {
  preparePaper(scene);
  installRoomEnglish(scene);
  document.body.classList.add('room-paper-theme');
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => document.body.classList.remove('room-paper-theme'));
  if (document.getElementById('room-paper-theme')) return;
  const style = document.createElement('style');
  style.id = 'room-paper-theme';
  const panels = [
    '.recall-room-text__panel', '.recall-radio__panel', '.recall-clock__panel',
    '.seek-room-desk-popup__title',

    '.room-item-notice',

  ].map(selector => 'body.room-paper-theme ' + selector.replace('.recall-room-text__panel', '.recall-room-text:not(.keep-original-ui) .recall-room-text__panel')).join(',');
  style.textContent = `
    body.room-paper-theme :is([class^="recall-room-text"],[class^="recall-radio"],[class^="recall-clock"],[class^="seek-room-desk"],.room-item-notice) {
      font-family: ${ROOM_INK_FONT} !important;
    }
    ${panels} {
      border: 16px solid transparent !important;
      border-image: url("${cleanPaperUrl}") 42 fill / 16px / 0 stretch !important;
      background: transparent !important;
      border-radius: 0 !important;
      box-shadow: 0 6px 16px #261b1426 !important;
      backdrop-filter: none !important;
      color: #503b29 !important;
      -webkit-text-stroke: 0 !important;
      text-shadow: none !important;
    }
    body.room-paper-theme :is(.recall-room-text:not(.keep-original-ui) .recall-room-text__panel,.recall-radio__panel,.recall-clock__panel,.seek-room-desk-popup__desk) :is(h1,h2,h3,p,span,strong,small,label,div) {
      color: #503b29 !important;
      -webkit-text-stroke: 0 !important;
      text-shadow: none !important;
      font-family: ${ROOM_INK_FONT} !important;
      font-weight: 600;
    }
    body.room-paper-theme :is(.recall-room-text:not(.keep-original-ui) .recall-room-text__panel,.recall-radio__panel,.recall-clock__panel) button[class*="close"] {
      color: #503b29 !important; background: transparent !important; border: 0 !important;
    }
  `;
  document.head.append(style);
}

export function addRoomPaper(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, width: number, height: number): void {
  parent.add(scene.add.nineslice(x, y, 'room-letter-paper-transparent', undefined, width, height, 20, 20, 20, 20));
}



