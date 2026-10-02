import Phaser from 'phaser';
import endingVideoUrl from '../../assets/animation/ending.mp4?url';
import endingVoiceUrl from '../../assets/audio/ending-voice.wav?url';
import { applyHDCamera, BASE_HEIGHT, BASE_WIDTH } from '../systems/Resolution';

const VOICE_KEY = 'chapter-one-ending-voice';

/** 第一关结尾动画；播放完毕后把本关完成状态交给记忆之岛。 */
export default class EndingScene extends Phaser.Scene {
  constructor() {
    super('ending');
  }

  preload(): void {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#101817');
    if (!this.cache.audio.exists(VOICE_KEY)) this.load.audio(VOICE_KEY, endingVoiceUrl);
  }

  create(data: { completedChapter?: number } = {}): void {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#101817');
    const completedChapter = data.completedChapter === 1 || data.completedChapter === 2 ? data.completedChapter : undefined;
    let leaving = false;
    let disposed = false;
    let audioStarted = false;
    const voice = this.cache.audio.exists(VOICE_KEY)
      ? this.sound.add(VOICE_KEY, { loop: false, volume: 1 })
      : undefined;

    const loading = this.add.container(0, 0, [
      this.add.rectangle(0, 0, BASE_WIDTH, BASE_HEIGHT, 0x101817).setOrigin(0),
      this.add.text(BASE_WIDTH / 2, BASE_HEIGHT / 2 - 12, '正在打开第一段记忆…', {
        fontFamily: 'serif', fontSize: '25px', color: '#efe8d2', letterSpacing: 4,
      }).setOrigin(0.5),
      this.add.text(BASE_WIDTH / 2, BASE_HEIGHT / 2 + 32, '记忆之房的碎片正在重新连结', {
        fontFamily: 'sans-serif', fontSize: '13px', color: '#a8b7b1', letterSpacing: 2,
      }).setOrigin(0.5),
    ]).setDepth(10);

    const media = document.createElement('video');
    media.playsInline = true;
    media.muted = true;
    media.defaultMuted = true;
    media.preload = 'auto';
    media.style.cssText = 'position:fixed;z-index:2147481000;pointer-events:none;object-fit:contain;background:#101817;display:block;opacity:0;';

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = '跳过动画';
    skip.setAttribute('aria-label', '跳过第一关结尾动画');
    skip.style.cssText = 'position:fixed;z-index:2147482500;color:rgba(247,237,207,.78);background:rgba(14,32,24,.34);border:1px solid rgba(247,237,207,.32);border-radius:20px;padding:8px 14px;font:12px Arial,"Microsoft YaHei",sans-serif;letter-spacing:.12em;backdrop-filter:blur(5px);cursor:pointer;';

    const continueButton = document.createElement('button');
    continueButton.type = 'button';
    continueButton.textContent = '继续前往记忆之岛';
    continueButton.hidden = true;
    continueButton.style.cssText = 'position:fixed;z-index:2147482500;left:50%;top:55%;transform:translate(-50%,-50%);color:#f7edcf;background:#294d45;border:1px solid rgba(247,237,207,.35);border-radius:24px;padding:13px 24px;font:16px Arial,"Microsoft YaHei",sans-serif;cursor:pointer;';

    const positionMedia = () => {
      const bounds = this.game.canvas.getBoundingClientRect();
      Object.assign(media.style, {
        left: `${bounds.left}px`, top: `${bounds.top}px`,
        width: `${bounds.width}px`, height: `${bounds.height}px`,
      });
      skip.style.left = `${bounds.right - 22}px`;
      skip.style.top = `${bounds.top + 22}px`;
      skip.style.transform = 'translateX(-100%)';
    };
    const syncVoice = () => {
      if (!voice || disposed || leaving || media.paused || media.ended || this.sound.locked) return;
      const seek = Math.min(media.currentTime, Math.max(0, voice.duration - 0.05));
      if (voice.isPlaying) voice.setSeek(seek);
      else {
        voice.play({ seek });
        audioStarted = true;
      }
    };
    const stopMedia = () => {
      voice?.stop();
      media.pause();
      media.removeAttribute('src');
      media.load();
      media.remove();
    };
    const enterIsland = () => {
      if (leaving || disposed) return;
      leaving = true;
      stopMedia();
      skip.remove();
      continueButton.remove();
      this.scene.start('island', completedChapter ? { completedChapter } : {});
    };
    const showFailure = () => {
      if (leaving || disposed) return;
      stopMedia();
      skip.hidden = true;
      loading.setVisible(true);
      const title = loading.list[1] as Phaser.GameObjects.Text;
      const subtitle = loading.list[2] as Phaser.GameObjects.Text;
      title.setText('结尾动画暂时无法播放');
      subtitle.setText('你仍然可以继续进入记忆之岛');
      continueButton.hidden = false;
    };
    const onPlaying = () => {
      loading.setVisible(false);
      media.style.opacity = '1';
      syncVoice();
    };
    const onPause = () => { if (voice?.isPlaying) voice.pause(); };
    const onSeeked = () => {
      if (voice && audioStarted) voice.setSeek(Math.min(media.currentTime, Math.max(0, voice.duration - 0.05)));
      syncVoice();
    };
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      stopMedia();
      skip.remove();
      continueButton.remove();
      this.sound.off(Phaser.Sound.Events.UNLOCKED, syncVoice);
      this.scale.off(Phaser.Scale.Events.RESIZE, positionMedia);
      voice?.destroy();
    };

    media.addEventListener('playing', onPlaying);
    media.addEventListener('ended', enterIsland);
    media.addEventListener('error', showFailure);
    media.addEventListener('pause', onPause);
    media.addEventListener('waiting', onPause);
    media.addEventListener('seeking', onPause);
    media.addEventListener('seeked', onSeeked);
    skip.addEventListener('click', enterIsland);
    continueButton.addEventListener('click', enterIsland);
    this.sound.on(Phaser.Sound.Events.UNLOCKED, syncVoice);
    this.scale.on(Phaser.Scale.Events.RESIZE, positionMedia);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    document.body.append(media, skip, continueButton);
    positionMedia();
    media.src = endingVideoUrl;
    void media.play().catch(showFailure);
  }
}
