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
import ChapterThreePreviewScene from './scenes/ChapterThreePreviewScene';
import { playMenuRoomMusic } from './MenuRoomMusic';
import { createMusicToggleUI } from './ui/MusicToggleUI';
import { resolveImageUrl } from './assets';
import level1BackgroundUrl from '../scene/level1-watercolor-game-background-v1-1900x540.png?url';
import roomBackgroundUrl from '../scene/level1-memory-room-night-empty-v2-1920x1080.png?url';
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
    // 这里只预热第一关两张大背景（各 ~190KB 的 webp）：菜单打开前就绪，避免进关卡时才解码。
    // 背景音乐（5.3MB + 3.9MB）不在关键路径上，由 MenuRoomMusic / ForestScene 后台加载。
    if (!this.textures.exists('level1-background')) {
      this.load.image('level1-background', resolveImageUrl(level1BackgroundUrl));
    }
    if (!this.textures.exists('room-bg')) {
      this.load.image('room-bg', resolveImageUrl(roomBackgroundUrl));
    }
  }

  create(): void {
    const room = this.scene.get('room');
    room.events.off(Phaser.Scenes.Events.CREATE, playMenuRoomMusic);
    room.events.on(Phaser.Scenes.Events.CREATE, playMenuRoomMusic);
    // 调试入口：?scene=room / ?scene=forest 直接进对应场景，跳过首页/开场/加载占位链
    const targetScene = new URLSearchParams(window.location.search).get('scene');
    const debugScenes = new Set(['room', 'forest', 'island', 'chapter2', 'chapter2-room', 'chapter2-memory', 'chapter3-preview']);
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
  // 本机 Chromium 的 XHR+blob 对 ~24MB 响应直接网络错误（arraybuffer/fetch 正常），
  // 而 Phaser 图片默认走 XHR+blob——第二关背景因此一直加载失败渲染成绿棋盘。
  // 切到 HTMLImageElement 路径绕开该 bug。
  loader: { imageLoadType: 'HTMLImageElement' },
  input: { activePointers: 3 },
  scene: [
    BootScene, MenuScene, IntroScene, LoadingScene, ForestScene, RoomScene,
    IslandScene, ChapterTwoChallengeScene, ChapterTwoRoomScene,
    ChapterTwoMemoryScene, ChapterThreePreviewScene, EndingScene,
  ],
});

createMusicToggleUI(game);

/**
 * 挂到 window 上：验收工具（tools/test-e2e.mjs、tools/probe-load-perf.mjs）与线上问题排查
 * 都需要在**生产构建**里驱动场景，而生产默认不暴露。Phaser 实例本身不含敏感信息，
 * 换来的是“能对线上包跑同一套探针”，所以这里不再限制 DEV。
 */
(window as unknown as Record<string, unknown>).__game = game;
