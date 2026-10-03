import Phaser from 'phaser';
import musicUrl from '../assets/audio/menu-room-bgm.mp3?url';
import { loadAudioInBackground } from './systems/DeferredAudio';
import {
  isBackgroundMusicEnabled,
  registerBackgroundMusic,
  setBackgroundMusicEnabled,
} from './MusicSettings';

const MUSIC_KEY = 'music-menu-room';

export { isBackgroundMusicEnabled, setBackgroundMusicEnabled };

/**
 * 由当前场景持有音乐；离开场景时停止并清理，避免重玩后叠加。
 *
 * 加载走后台（见 systems/DeferredAudio）：`menu-room-bgm` 有 5.3MB，
 * 原来在 BootScene.preload 里串着——玩家要先把这 5.3MB 下完才看得到主菜单。
 * 现在主菜单立即出来，音乐在下载完成后自己响起。
 */
export function playMenuRoomMusic(scene: Phaser.Scene): void {
  loadAudioInBackground(scene, MUSIC_KEY, musicUrl, () => {
    const music = scene.sound.add(MUSIC_KEY, { loop: true, volume: 0.35 });
    const unregisterMusic = registerBackgroundMusic(music);
    let active = true;

    const start = () => {
      if (active && isBackgroundMusicEnabled() && !scene.sound.locked && !music.isPlaying) {
        music.play();
      }
    };

    const cleanup = () => {
      if (!active) return;
      active = false;
      scene.sound.off(Phaser.Sound.Events.UNLOCKED, start);
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      scene.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
      unregisterMusic();
      music.destroy();
    };

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    scene.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

    if (scene.sound.locked) {
      // 浏览器首次访问需要用户点击后才允许播放有声内容。
      scene.sound.once(Phaser.Sound.Events.UNLOCKED, start);
    } else {
      start();
    }
  });
}
