import Phaser from 'phaser';
import chapterTwoVideoUrl from '../../assets/animation/chapter2.mp4?url';

const STYLE_ID = 'seek-chapter-two-memory-style';

/**
 * 第二段记忆结尾：第二记忆房里触碰光球后进入本场，播放正式动画
 * （柜台旁偷拆辣辣王子 → 第一次吃辣条 → 翻风景杂志问“海那边是什么样子” →
 * 被妈妈喊住 → 抓起辣条跑出画面），播完**自动**回记忆之岛，不需要玩家再点一次。
 *
 * 这里已经换成 `assets/animation/chapter2.mp4` 正式动画；此前的「分镜灰盒」占位
 * （色块人物 + 六句字幕 + 点击推进）已删除。
 * 出岛契约不变：仍然 `scene.start('island', { completedChapter: 2 })`，
 * 由 IslandScene 点亮第二栋建筑并解锁第三段记忆（见 CHAPTER_TWO_FLOW.md 第 7 条）。
 */
function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .seek-chapter-two-memory {
      position: fixed; inset: 0; z-index: 1180; background: #100f0d;
      display: flex; align-items: center; justify-content: center;
      font-family: Arial, "Microsoft YaHei", sans-serif;
    }
    .seek-chapter-two-memory__video { display: block; object-fit: contain; background: #100f0d; }
    .seek-chapter-two-memory__skip, .seek-chapter-two-memory__play {
      position: absolute; z-index: 3; padding: 9px 14px; cursor: pointer;
      border: 1px solid rgba(239, 224, 190, .38); border-radius: 4px;
      color: #fff2cf; background: rgba(39, 67, 57, .82); font-size: 14px; letter-spacing: .04em;
    }
    .seek-chapter-two-memory__skip { right: 22px; bottom: 22px; }
    .seek-chapter-two-memory__play { left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 11px 20px; font-size: 15px; }
    .seek-chapter-two-memory__skip:hover, .seek-chapter-two-memory__skip:focus-visible,
    .seek-chapter-two-memory__play:hover, .seek-chapter-two-memory__play:focus-visible { background: rgba(58, 96, 82, .94); outline: none; }
  `;
  document.head.append(style);
}

/** 第二段记忆动画：播完（或跳过）直接回记忆之岛并点亮第二栋建筑。 */
export default class ChapterTwoMemoryScene extends Phaser.Scene {
  constructor() { super('chapter2-memory'); }

  create(): void {
    installStyle();
    this.cameras.main.setBackgroundColor('#100f0d');

    const root = document.createElement('div');
    root.className = 'seek-chapter-two-memory';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '第二段记忆');
    root.innerHTML = `
      <video class="seek-chapter-two-memory__video" src="${chapterTwoVideoUrl}" playsinline preload="auto"></video>
      <button class="seek-chapter-two-memory__skip" type="button">Skip Animation →</button>
      <button class="seek-chapter-two-memory__play" type="button">播放动画</button>
    `;

    const video = root.querySelector<HTMLVideoElement>('.seek-chapter-two-memory__video')!;
    const skip = root.querySelector<HTMLButtonElement>('.seek-chapter-two-memory__skip')!;
    const play = root.querySelector<HTMLButtonElement>('.seek-chapter-two-memory__play')!;
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
      this.scene.start('island', { completedChapter: 2 });
    };

    const resume = () => {
      void video.play().then(() => { play.hidden = true; }).catch(() => { play.hidden = false; });
    };

    // 播完直接进岛：不再等玩家点「返回记忆之岛」。
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
