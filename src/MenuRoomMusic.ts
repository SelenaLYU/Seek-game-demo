import Phaser from 'phaser';
import mainThemeUrl from '../assets/audio/seek-main-theme.m4a?url';
import roomPuzzleUrl from '../assets/audio/seek-room-puzzle.m4a?url';
import qilouRunUrl from '../assets/audio/seek-qilou-run.m4a?url';
import storePuzzleUrl from '../assets/audio/seek-store-puzzle.m4a?url';
import {
  isBackgroundMusicEnabled,
  setBackgroundMusicEnabled as saveBackgroundMusicEnabled,
} from './MusicSettings';

export { isBackgroundMusicEnabled };

const activeHtmlMusic = new Set<HTMLAudioElement>();
const temporarilyPaused = new Set<HTMLAudioElement>();
const sceneMusic = new WeakMap<Phaser.Scene, HTMLAudioElement>();

/** Keep the existing preference API while also controlling native audio. */
export function setBackgroundMusicEnabled(enabled: boolean): void {
  saveBackgroundMusicEnabled(enabled);
  activeHtmlMusic.forEach(audio => {
    if (enabled && !temporarilyPaused.has(audio)) audio.play().catch(() => undefined);
    else audio.pause();
  });
}

/**
 * 由当前场景持有音乐；离开场景时停止并清理，避免重玩后叠加。
 *
 * 加载走后台（见 systems/DeferredAudio）：`menu-room-bgm` 有 5.3MB，
 * 原来在 BootScene.preload 里串着——玩家要先把这 5.3MB 下完才看得到主菜单。
 * 现在主菜单立即出来，音乐在下载完成后自己响起。
 */
function playSceneMusic(scene: Phaser.Scene, key: string, url: string, volume: number): void {
  if (sceneMusic.has(scene)) return;
  const audio = new Audio(url);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = volume;
  audio.dataset.seekMusic = key; audio.hidden = true; document.body.append(audio);
  sceneMusic.set(scene, audio);
  activeHtmlMusic.add(audio);
  let active = true;
  const prompt = document.createElement('button');
  prompt.textContent = '♫ 点击开启音乐';
  // 贴屏幕右上角最外沿，并压低字号/对比度，尽量不抢画面；hover 时再亮起来提示可点。
  prompt.style.cssText = 'position:fixed;right:4px;top:4px;z-index:4000;padding:4px 8px;border:1px solid #d9c8a540;border-radius:4px;background:#302b2499;color:#e6d9bd;font:11px Georgia,"Microsoft YaHei",serif;letter-spacing:.3px;opacity:.72;transition:opacity .18s,border-color .18s,color .18s;cursor:pointer';
  prompt.addEventListener('pointerenter', () => {
    prompt.style.opacity = '1'; prompt.style.color = '#f6e9cc'; prompt.style.borderColor = '#d9c8a5aa';
  });
  prompt.addEventListener('pointerleave', () => {
    prompt.style.opacity = '.72'; prompt.style.color = '#e6d9bd'; prompt.style.borderColor = '#d9c8a540';
  });
  const start = () => {
    if (!active || !isBackgroundMusicEnabled() || temporarilyPaused.has(audio)) return;
    audio.play().then(() => prompt.remove()).catch(error => {
      if (!active || !isBackgroundMusicEnabled()) return;
      // 首页封面右上角本身已经画了音乐开关，提示按钮叠上去会糊成两个，
      // 因此首页不挂提示（封面上那颗按钮点一下同样能解锁播放）。
      if (error.name === 'NotAllowedError') {
        if (scene.scene.key !== 'menu') document.body.append(prompt);
      } else console.warn('音乐播放失败', key, error);
    });
  };
  prompt.addEventListener('click', start);
  audio.addEventListener('playing', () => prompt.remove());
  const cleanup = () => {
    if (!active) return;
    active = false;
    prompt.remove();
    document.removeEventListener('keydown', start, true);
    document.removeEventListener('pointerdown', start, true);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    scene.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
    activeHtmlMusic.delete(audio); temporarilyPaused.delete(audio);
    sceneMusic.delete(scene);
    audio.pause();
    audio.remove(); audio.removeAttribute('src');
    audio.load();
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  scene.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  document.addEventListener('pointerdown', start, true);
  document.addEventListener('keydown', start, true);
  start();
}

export function setSceneMusicTemporarilyPaused(scene: Phaser.Scene, paused: boolean): void {
  const audio = sceneMusic.get(scene);
  if (!audio) return;
  if (paused) { temporarilyPaused.add(audio); audio.pause(); }
  else { temporarilyPaused.delete(audio); if (isBackgroundMusicEnabled()) audio.play().catch(() => undefined); }
}

/** 游戏主旋律：首页与记忆小岛共用。 */
export const playMainTheme = (scene: Phaser.Scene): void =>
  playSceneMusic(scene, 'music-main-theme', mainThemeUrl, 0.35);

/** 第一关记忆之房解谜音乐。 */
export const playRoomPuzzleMusic = (scene: Phaser.Scene): void =>
  playSceneMusic(scene, 'music-room-puzzle', roomPuzzleUrl, 0.32);

/** 第二关骑楼跑酷音乐。 */
export const playQilouRunMusic = (scene: Phaser.Scene): void =>
  playSceneMusic(scene, 'music-qilou-run', qilouRunUrl, 0.34);

/** 第二章小卖部解谜音乐。 */
export const playStorePuzzleMusic = (scene: Phaser.Scene): void =>
  playSceneMusic(scene, 'music-store-puzzle', storePuzzleUrl, 0.34);

