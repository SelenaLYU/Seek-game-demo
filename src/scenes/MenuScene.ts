import Phaser from 'phaser';
import { applyHDCamera, BASE_HEIGHT, BASE_WIDTH } from '../systems/Resolution';

/** 新项目首页占位：只保留流程入口，不沿用 Recall 的图片或 UI 画风。 */
export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#151515');

    this.add
      .text(BASE_WIDTH / 2, 185, 'SEEK', {
        fontFamily: 'sans-serif',
        fontSize: '48px',
        color: '#f2f2f2',
        letterSpacing: 8,
      })
      .setOrigin(0.5);

    this.add
      .text(BASE_WIDTH / 2, 242, '新首页视觉占位', {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: '#8e8e8e',
      })
      .setOrigin(0.5);

    const start = this.add
      .text(BASE_WIDTH / 2, 330, '开始游戏', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#eeeeee',
        backgroundColor: '#303030',
        padding: { x: 34, y: 13 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const begin = () => this.scene.start('intro');
    start.on('pointerup', begin);
    this.input.keyboard?.once('keydown-ENTER', begin);
    this.add.text(BASE_WIDTH / 2, 407, '查看记忆之岛 · 原型', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#b9cfc8',
      backgroundColor: '#252e2b', padding: { x: 22, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.start('island'));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ENTER', begin);
    });
  }
}
