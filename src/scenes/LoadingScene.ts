import Phaser from 'phaser';
import { applyHDCamera, BASE_HEIGHT, BASE_WIDTH } from '../systems/Resolution';

/** 开场动画与森林之间的加载页占位。以后可接真实资源加载进度。 */
export default class LoadingScene extends Phaser.Scene {
  constructor() {
    super('loading');
  }

  create(): void {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#111111');

    this.add
      .text(BASE_WIDTH / 2, BASE_HEIGHT / 2 - 45, '正在进入场景', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#d8d8d8',
      })
      .setOrigin(0.5);

    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2 + 4, 320, 8, 0x333333);
    const fill = this.add
      .rectangle(BASE_WIDTH / 2 - 160, BASE_HEIGHT / 2 + 4, 320, 8, 0xb8b8b8)
      .setOrigin(0, 0.5)
      .setScale(0, 1);

    this.tweens.add({
      targets: fill,
      scaleX: 1,
      duration: 1300,
      ease: 'Sine.easeInOut',
    });
    this.time.delayedCall(1500, () => this.scene.start('forest'));
  }
}
