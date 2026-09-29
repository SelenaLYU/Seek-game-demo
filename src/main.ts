import Phaser from 'phaser';
import MenuScene from './scenes/MenuScene';
import IntroScene from './scenes/IntroScene';
import LoadingScene from './scenes/LoadingScene';
import ForestScene from './scenes/ForestScene';
import RoomScene from './scenes/RoomScene';
import EndingScene from './scenes/EndingScene';
import { preloadMenuRoomMusic, playMenuRoomMusic } from './MenuRoomMusic';
import {
  BASE_HEIGHT,
  BASE_WIDTH,
  computeBufferScale,
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
    this.scene.start('menu');
  }
}

const initialBuffer = initialBufferSize();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: initialBuffer.width,
  height: initialBuffer.height,
  backgroundColor: '#111111',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
  },
  render: { antialias: true, powerPreference: 'high-performance' },
  input: { activePointers: 3 },
  scene: [BootScene, MenuScene, IntroScene, LoadingScene, ForestScene, RoomScene, EndingScene],
});

const syncRenderBuffer = () => {
  const cssWidth =
    game.canvas?.getBoundingClientRect().width ||
    game.scale.canvasBounds.width ||
    game.scale.parentSize.width;
  const width = Math.round(BASE_WIDTH * computeBufferScale(cssWidth));
  const height = Math.round((width * BASE_HEIGHT) / BASE_WIDTH);
  if (game.scale.gameSize.width !== width) {
    game.scale.setGameSize(width, height);
  }
};

let syncBufferTimer: number | undefined;
const queueSyncBuffer = () => {
  window.clearTimeout(syncBufferTimer);
  syncBufferTimer = window.setTimeout(syncRenderBuffer, 150);
};

game.events.once(Phaser.Core.Events.READY, syncRenderBuffer);
game.scale.on(Phaser.Scale.Events.RESIZE, queueSyncBuffer);
window.addEventListener('resize', queueSyncBuffer);

const watchDpr = () => {
  const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  const onChange = () => {
    query.removeEventListener('change', onChange);
    queueSyncBuffer();
    watchDpr();
  };
  query.addEventListener('change', onChange);
};
watchDpr();

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__game = game;
}
