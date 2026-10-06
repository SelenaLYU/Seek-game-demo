import Phaser from 'phaser';
import chapterOneVideoUrl from '../../assets/animation/chapter1.mp4?url';

const STYLE_ID = 'seek-chapter-one-ending-style';

/**
 * 第一章回忆结尾：房间里的贝壳被触碰后进入本场，播放正式动画
 * （海边 → 送贝壳 → 泼水嬉戏 → 定格成家庭照片），播完**自动**回记忆之岛，不需要玩家再点一次。
 *
 * 这里已经换成 `assets/animation/chapter1.mp4` 正式动画；此前"正式动画到位前"的同风格
 * 分镜占位（海边大图推近 + 逐句字幕 + 照片显影定格）已删除。
 * 那段字幕的文案真源仍保留在 `src/story/ChapterOneStory.ts`，相册第一格仍用同一张正式
 * 家庭照片（见 AlbumUI），所以删掉分镜不会丢内容。
 *
 * 章节进度不在这里写：本场景只把 `completedChapter` 传给 IslandScene，由它调
 * `completeChapter()` 落盘（见 src/island/Progress.ts）。动画播完直接进岛，
 * 「已收录」的反馈由岛上 `N / 6 段记忆已点亮` 承担，不再单独停一屏。
 */
function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .seek-ending {
      position: fixed; inset: 0; z-index: 1180; background: #100f0d;
      display: flex; align-items: center; justify-content: center;
      font-family: Arial, "Microsoft YaHei", sans-serif;
    }
    .seek-ending__video { display: block; object-fit: contain; background: #100f0d; }
    .seek-ending__skip, .seek-ending__play {
      position: absolute; z-index: 3; padding: 9px 14px; cursor: pointer;
      border: 1px solid rgba(239, 224, 190, .38); border-radius: 4px;
      color: #fff2cf; background: rgba(39, 67, 57, .82); font-size: 14px; letter-spacing: .04em;
    }
    .seek-ending__skip { right: 22px; bottom: 22px; }
    .seek-ending__play { left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 11px 20px; font-size: 15px; }
    .seek-ending__skip:hover, .seek-ending__skip:focus-visible,
    .seek-ending__play:hover, .seek-ending__play:focus-visible { background: rgba(58, 96, 82, .94); outline: none; }
  `;
  document.head.append(style);
}

/** 第一章结尾动画：播完（或跳过）直接回记忆之岛。 */
export default class EndingScene extends Phaser.Scene {
  constructor() { super('ending'); }

  create(data: { completedChapter?: number } = {}): void {
    installStyle();
    this.cameras.main.setBackgroundColor('#100f0d');
    const completedChapter = data.completedChapter === 2 ? 2 : 1;

    const root = document.createElement('div');
    root.className = 'seek-ending';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '第一章回忆');
    root.innerHTML = `
      <video class="seek-ending__video" src="${chapterOneVideoUrl}" playsinline preload="auto"></video>
      <button class="seek-ending__skip" type="button">跳过 →</button>
      <button class="seek-ending__play" type="button">播放动画</button>
    `;

    const video = root.querySelector<HTMLVideoElement>('.seek-ending__video')!;
    const skip = root.querySelector<HTMLButtonElement>('.seek-ending__skip')!;
    const play = root.querySelector<HTMLButtonElement>('.seek-ending__play')!;
    play.hidden = true;
    let leaving = false;

    // 与开场动画同一套做法：按完整视口等比例适配，按钮浮在画面上、不占视频空间。
    const sizeVideo = () => {
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const scale = Math.max(.01, Math.min(innerWidth / width, innerHeight / height));
      video.style.width = `${width * scale}px`;
      video.style.height = `${height * scale}px`;
    };
    video.addEventListener('loadedmetadata', sizeVideo);
    window.addEventListener('resize', sizeVideo);
    sizeVideo();

    const enterIsland = () => {
      if (leaving) return;
      leaving = true;
      root.remove();
      this.scene.start('island', { completedChapter });
    };

    const resume = () => {
      void video.play().then(() => { play.hidden = true; }).catch(() => { play.hidden = false; });
    };

    // 播完直接进岛：不再等玩家点「回到记忆之岛」。
    video.addEventListener('ended', enterIsland);
    skip.addEventListener('click', enterIsland);
    play.addEventListener('click', resume);
    this.input.keyboard?.once('keydown-SPACE', enterIsland);
    this.input.keyboard?.once('keydown-ESC', enterIsland);

    document.body.append(root);
    resume();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', sizeVideo);
      video.pause();
      video.removeAttribute('src');
      video.load();
      root.remove();
    });
  }
}
