import Phaser from 'phaser';
import { applyHDCamera, BASE_HEIGHT, BASE_WIDTH } from '../systems/Resolution';

/** 完整流程的临时结尾占位。正式结尾到货后再替换，不沿用 Recall 的结尾画风。 */
export default class EndingScene extends Phaser.Scene {
  constructor() {
    super('ending');
  }

  create(): void {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#111111');

    this.add
      .text(BASE_WIDTH / 2, BASE_HEIGHT / 2 - 18, '流程体验结束', {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#f0f0f0',
      })
      .setOrigin(0.5);

    const restart = this.add
      .text(BASE_WIDTH / 2, BASE_HEIGHT / 2 + 28, '返回首页', {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: '#bdbdbd',
        backgroundColor: '#292929',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    restart.on('pointerup', () => this.scene.start('menu'));
  }
}
