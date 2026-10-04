import Phaser from 'phaser';
import endingVideoUrl from '../../assets/animation/ending.mp4?url';
import { fitCanvasDomOverlay } from '../ui/CanvasDomLayout';

const WIDTH = 960;
const HEIGHT = 540;
const STYLE_ID = 'seek-chapter-one-ending-style';

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .seek-chapter-one-ending {
      position: fixed; width: 960px; height: 540px; z-index: 1180;
      transform-origin: top left; overflow: hidden; background: #050505;
      font-family: Arial, "Microsoft YaHei", sans-serif;
    }
    .seek-chapter-one-ending__video {
      display: block; width: 100%; height: 100%; object-fit: contain; background: #050505;
    }
    .seek-chapter-one-ending__skip {
      position: absolute; right: 24px; bottom: 24px; z-index: 2;
      padding: 9px 14px; cursor: pointer; border: 1px solid rgba(239,224,190,.38);
      border-radius: 4px; color: #fff2cf; background: rgba(39,67,57,.82);
      font-size: 14px; letter-spacing: .04em;
    }
    .seek-chapter-one-ending__play {
      display: none; position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
      padding: 12px 20px; cursor: pointer; border: 1px solid rgba(239,224,190,.45);
      border-radius: 4px; color: #fff2cf; background: rgba(28,45,38,.9); font-size: 16px;
    }
    .seek-chapter-one-ending.needs-play .seek-chapter-one-ending__play { display: block; }
  `;
  document.head.append(style);
}

/** 第一章结尾动画；自然播放结束或点击右下角跳过后直接回到记忆之岛。 */
export default class EndingScene extends Phaser.Scene {
  constructor() { super('ending'); }

  create(data: { completedChapter?: number } = {}): void {
    installStyle();
    this.cameras.main.setBackgroundColor('#050505');
    const completedChapter = data.completedChapter === 2 ? 2 : 1;
    const root = document.createElement('div');
    root.className = 'seek-chapter-one-ending';
    root.innerHTML = `
      <video class="seek-chapter-one-ending__video" src="${endingVideoUrl}" preload="auto" playsinline muted autoplay></video>
      <button class="seek-chapter-one-ending__play" type="button">播放动画</button>
      <button class="seek-chapter-one-ending__skip" type="button">跳过动画 →</button>
    `;
    const video = root.querySelector<HTMLVideoElement>('.seek-chapter-one-ending__video')!;
    const play = root.querySelector<HTMLButtonElement>('.seek-chapter-one-ending__play')!;
    const skip = root.querySelector<HTMLButtonElement>('.seek-chapter-one-ending__skip')!;
    let leaving = false;

    const position = () => {
      fitCanvasDomOverlay(this, root, WIDTH, HEIGHT);
    };
    const enterIsland = () => {
      if (leaving) return;
      leaving = true;
      video.pause();
      root.remove();
      this.scene.start('island', { completedChapter });
    };
    const tryPlay = () => {
      root.classList.remove('needs-play');
      void video.play().catch(() => root.classList.add('needs-play'));
    };
    const cleanup = () => {
      video.pause();
      this.scale.off(Phaser.Scale.Events.RESIZE, position);
      root.remove();
    };

    video.addEventListener('ended', enterIsland, { once: true });
    video.addEventListener('error', () => root.classList.add('needs-play'), { once: true });
    play.addEventListener('click', tryPlay);
    skip.addEventListener('click', enterIsland);
    this.input.keyboard?.once('keydown-SPACE', enterIsland);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    document.body.append(root);
    position();
    this.scale.on(Phaser.Scale.Events.RESIZE, position);
    tryPlay();
  }
}
