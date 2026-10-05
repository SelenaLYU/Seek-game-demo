import Phaser from 'phaser';
import { fitCanvasDomOverlay } from '../ui/CanvasDomLayout';
import { resolveImageUrl } from '../assets';
import { CHAPTER_ONE_MEMORY_TEXT } from '../story/ChapterOneStory';
import level1BackgroundUrl from '../../scene/level1-watercolor-game-background-v1-1900x540.png?url';
import familyPhotoUrl from '../../assets/story/chapter1-family-photo-seaside.png?url';

const WIDTH = 960;
const HEIGHT = 540;
const STYLE_ID = 'seek-chapter-one-ending-style';

/**
 * 第一章回忆结尾：海边 → 送贝壳 → 泼水嬉戏 → 定格成家庭照片 → 收进相册。
 *
 * 这里不再播放 `assets/animation/` 下那段 27.8MB 的旧结尾动画：经核验它是旧 Demo 的
 * 「老人 + 庭院 + 粤语亲笔信」内容，人物、场景和画风都与韩梅梅这条故事线冲突
 * （证据与清理结论见 STORY_MIGRATION.md）。正式动画到位前，本场用同风格分镜占位：
 * 海边大图缓慢推近 + 三句剧情字幕 + 照片「显影」定格，情绪落点仍然是那张家庭照片。
 *
 * 字幕文案直接取 `CHAPTER_ONE_MEMORY_TEXT`（故事真源），不在这里另写一份台词。
 * 正式动画到货后只替换本场景，不影响章节进度、相册登记和回岛流程。
 */
const BEATS = CHAPTER_ONE_MEMORY_TEXT.split('。').map(line => line.trim()).filter(Boolean);
/** 每句字幕停顿时长（淡入 420 + 停留 + 淡出 420）。 */
const BEAT_MS = 3400;
const BEAT_LEAD_IN_MS = 900;
const PHOTO_REVEAL_MS = BEATS.length * BEAT_MS + BEAT_LEAD_IN_MS;
const OUTRO_MS = PHOTO_REVEAL_MS + 2100;
/** 定格照片停够时长后自动回岛，避免陌生玩家不知道要点哪里。 */
const AUTO_ADVANCE_MS = OUTRO_MS + 6000;

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .seek-ending {
      position: fixed; width: ${WIDTH}px; height: ${HEIGHT}px; z-index: 1180;
      transform-origin: top left; overflow: hidden; background: #050505;
      font-family: Arial, "Microsoft YaHei", sans-serif;
    }
    .seek-ending__backdrop { position: absolute; inset: 0; background: #050505; }
    .seek-ending__beach {
      position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
      transform: scale(1.06); animation: seek-ending-drift 22s ease-out forwards;
    }
    @keyframes seek-ending-drift { to { transform: scale(1); } }
    .seek-ending__wash {
      position: absolute; inset: 0; pointer-events: none;
      background:
        radial-gradient(120% 90% at 50% 35%, rgba(255, 226, 176, .12), transparent 62%),
        linear-gradient(to bottom, rgba(12, 30, 40, .5), rgba(9, 20, 27, .1) 34%, rgba(8, 16, 22, .78));
      transition: opacity 1.2s ease;
    }
    .seek-ending__beats { position: absolute; left: 0; right: 0; bottom: 92px; text-align: center; pointer-events: none; }
    .seek-ending__beat {
      position: absolute; left: 50%; bottom: 0; transform: translateX(-50%);
      margin: 0; width: min(720px, 84%); font-size: 21px; line-height: 1.7; letter-spacing: .06em;
      color: #fdf3dd; text-shadow: 0 2px 12px rgba(6, 18, 24, .92), 0 1px 3px rgba(6, 18, 24, .9);
      opacity: 0; transition: opacity .42s ease;
    }
    .seek-ending__beat.is-on { opacity: 1; }
    .seek-ending__photo-stage {
      position: absolute; inset: 0; display: flex; justify-content: center; align-items: flex-start;
      padding-top: 30px;
      opacity: 0; transition: opacity 1s ease; pointer-events: none;
    }
    .seek-ending__photo-stage.is-on { opacity: 1; }
    .seek-ending__photo-frame {
      position: relative; margin: 0; padding: 11px 11px 40px;
      background: linear-gradient(150deg, #f3e7cd, #e2d2b1);
      border-radius: 3px; box-shadow: 0 26px 60px rgba(0, 0, 0, .62);
      transform: scale(1.11) rotate(-1.4deg);
      transition: transform 1.5s cubic-bezier(.22, .68, .3, 1);
    }
    .seek-ending__photo-stage.is-on .seek-ending__photo-frame { transform: scale(1) rotate(-1.1deg); }
    .seek-ending__photo {
      display: block; width: 496px; height: 293px; object-fit: cover;
      filter: brightness(1.55) saturate(.55) contrast(.72);
      transition: filter 2.4s ease-out;
    }
    .seek-ending__photo-stage.is-on .seek-ending__photo { filter: none; }
    .seek-ending__caption {
      position: absolute; left: 0; right: 0; bottom: 11px; text-align: center;
      font-size: 13px; letter-spacing: .22em; color: #7d6a4c;
    }
    .seek-ending__outro {
      position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%);
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      opacity: 0; transition: opacity .6s ease; pointer-events: none;
    }
    .seek-ending__outro.is-on { opacity: 1; pointer-events: auto; }
    .seek-ending__album { font-size: 13px; letter-spacing: .18em; color: #f6e9cb; text-shadow: 0 1px 8px rgba(0, 0, 0, .8); }
    .seek-ending__enter {
      padding: 11px 22px; cursor: pointer; border: 1px solid rgba(247, 233, 203, .5);
      border-radius: 4px; color: #2b3f36; background: rgba(247, 243, 226, .92); font-size: 15px;
    }
    .seek-ending__enter:hover, .seek-ending__enter:focus-visible { background: #fffdf4; outline: none; }
    .seek-ending__skip {
      position: absolute; right: 22px; bottom: 22px; z-index: 3;
      padding: 9px 14px; cursor: pointer; border: 1px solid rgba(239, 224, 190, .38);
      border-radius: 4px; color: #fff2cf; background: rgba(39, 67, 57, .82);
      font-size: 14px; letter-spacing: .04em;
    }
    .seek-ending__skip:hover, .seek-ending__skip:focus-visible { background: rgba(58, 96, 82, .94); outline: none; }
  `;
  document.head.append(style);
}

/** 第一章结尾分镜占位；播完或跳过后直接回到记忆之岛。 */
export default class EndingScene extends Phaser.Scene {
  constructor() { super('ending'); }

  create(data: { completedChapter?: number } = {}): void {
    installStyle();
    this.cameras.main.setBackgroundColor('#050505');
    const completedChapter = data.completedChapter === 2 ? 2 : 1;
    const beach = resolveImageUrl(level1BackgroundUrl);
    const photo = resolveImageUrl(familyPhotoUrl);

    const root = document.createElement('div');
    root.className = 'seek-ending';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '第一章回忆');
    root.innerHTML = `
      <div class="seek-ending__backdrop" data-canvas-backdrop></div>
      <img class="seek-ending__beach" src="${beach}" alt="" aria-hidden="true">
      <div class="seek-ending__wash"></div>
      <div class="seek-ending__beats" aria-live="polite">
        ${BEATS.map(line => `<p class="seek-ending__beat">${line}。</p>`).join('')}
      </div>
      <div class="seek-ending__photo-stage">
        <figure class="seek-ending__photo-frame">
          <img class="seek-ending__photo" src="${photo}" alt="童年在海边拍下的家庭照片">
          <figcaption class="seek-ending__caption">童年 · 海边 · 一枚贝壳</figcaption>
        </figure>
      </div>
      <div class="seek-ending__outro">
        <span class="seek-ending__album">相册 · 第 ${completedChapter} 张照片已收录</span>
        <button class="seek-ending__enter" type="button">回到记忆之岛 →</button>
      </div>
      <button class="seek-ending__skip" type="button">跳过 →</button>
    `;

    const beats = [...root.querySelectorAll<HTMLElement>('.seek-ending__beat')];
    const wash = root.querySelector<HTMLElement>('.seek-ending__wash')!;
    const photoStage = root.querySelector<HTMLElement>('.seek-ending__photo-stage')!;
    const outro = root.querySelector<HTMLElement>('.seek-ending__outro')!;
    const enter = root.querySelector<HTMLButtonElement>('.seek-ending__enter')!;
    const skip = root.querySelector<HTMLButtonElement>('.seek-ending__skip')!;
    let leaving = false;
    const timers: number[] = [];

    const position = () => fitCanvasDomOverlay(this, root, WIDTH, HEIGHT);
    const stage = (action: () => void, delay: number) => {
      timers.push(window.setTimeout(action, delay));
    };

    const enterIsland = () => {
      if (leaving) return;
      leaving = true;
      timers.forEach(clearTimeout);
      root.remove();
      this.scene.start('island', { completedChapter });
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      timers.forEach(clearTimeout);
      this.scale.off(Phaser.Scale.Events.RESIZE, position);
      root.remove();
    });

    enter.addEventListener('click', enterIsland);
    skip.addEventListener('click', enterIsland);
    this.input.keyboard?.once('keydown-SPACE', enterIsland);
    this.input.keyboard?.once('keydown-ESC', enterIsland);

    document.body.append(root);
    position();
    this.scale.on(Phaser.Scale.Events.RESIZE, position);

    // 分镜时间线：字幕逐句淡入淡出 → 照片显影定格 → 显示相册与回岛按钮。
    beats.forEach((beat, index) => {
      const start = BEAT_LEAD_IN_MS + index * BEAT_MS;
      stage(() => beat.classList.add('is-on'), start);
      stage(() => beat.classList.remove('is-on'), start + BEAT_MS - 420);
    });
    stage(() => {
      beats.forEach(beat => beat.classList.remove('is-on'));
      wash.style.opacity = '.55';
      photoStage.classList.add('is-on');
    }, PHOTO_REVEAL_MS);
    stage(() => {
      wash.style.opacity = '1';
      photoStage.classList.add('is-on');
    }, OUTRO_MS - 1200);
    stage(() => {
      wash.style.opacity = '.25';
      outro.classList.add('is-on');
    }, OUTRO_MS);
    stage(enterIsland, AUTO_ADVANCE_MS);
  }
}
