import Phaser from 'phaser';
import MenuScene from './scenes/MenuScene';
import IntroScene from './scenes/IntroScene';
import LoadingScene from './scenes/LoadingScene';
import ForestScene from './scenes/ForestScene';
import RoomScene from './scenes/RoomScene';
import EndingScene from './scenes/EndingScene';
import IslandScene from './scenes/IslandScene';
import ChapterTwoChallengeScene from './scenes/ChapterTwoChallengeScene';
import ChapterTwoRoomScene from './scenes/ChapterTwoRoomScene';
import ChapterTwoMemoryScene from './scenes/ChapterTwoMemoryScene';
import { preloadMenuRoomMusic, playMenuRoomMusic } from './MenuRoomMusic';
import { createMusicToggleUI } from './ui/MusicToggleUI';
import {
  initialBufferSize,
} from './systems/Resolution';

/**
 * 启动场景只做共享资源预载与房间音乐登记。
 * 完整流程由中性占位场景串起，不带入 Recall 的首页、森林和动画画风。
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    preloadMenuRoomMusic(this);
  }

  create(): void {
    const room = this.scene.get('room');
    room.events.off(Phaser.Scenes.Events.CREATE, playMenuRoomMusic);
    room.events.on(Phaser.Scenes.Events.CREATE, playMenuRoomMusic);
    // 调试入口：?scene=room / ?scene=forest 直接进对应场景，跳过首页/开场/加载占位链
    const targetScene = new URLSearchParams(window.location.search).get('scene');
    const debugScenes = new Set(['room', 'forest', 'island', 'chapter2', 'chapter2-room', 'chapter2-memory']);
    this.scene.start(targetScene && debugScenes.has(targetScene) ? targetScene : 'menu');
  }
}

const initialBuffer = initialBufferSize();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: initialBuffer.width,
  height: initialBuffer.height,
  backgroundColor: '#111111',
  // EXPAND 保持比例填满父容器；超出 16:9 的部分交由场景按更宽视野展示。
  scale: {
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: false,
  },
  render: { antialias: true, powerPreference: 'high-performance' },
  input: { activePointers: 3 },
  scene: [
    BootScene, MenuScene, IntroScene, LoadingScene, ForestScene, RoomScene,
    IslandScene, ChapterTwoChallengeScene, ChapterTwoRoomScene,
    ChapterTwoMemoryScene, EndingScene,
  ],
});

createMusicToggleUI(game);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__game = game;
}
