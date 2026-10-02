import Phaser from 'phaser';
import { applyHDCamera, BASE_HEIGHT, BASE_WIDTH } from '../systems/Resolution';

/** 开场动画接口占位。新动画到货后只替换本场景，不影响后续流程。 */
export default class IntroScene extends Phaser.Scene {
  constructor() {
    super('intro');
  }

  create(): void {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#050505');

    this.add
      .rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, 760, 420, 0x0d0d0d)
      .setStrokeStyle(1, 0x454545);
    this.add
      .text(BASE_WIDTH / 2, BASE_HEIGHT / 2 - 22, '开场动画占位', {
        fontFamily: 'sans-serif',
        fontSize: '26px',
        color: '#d5d5d5',
      })
      .setOrigin(0.5);
    this.add
      .text(BASE_WIDTH / 2, BASE_HEIGHT / 2 + 20, '之后把新的动画文件接入这里', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#777777',
      })
      .setOrigin(0.5);

    const back = this.add
      .text(32, 26, '← 返回菜单', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#d5d5d5',
        backgroundColor: '#242424',
        padding: { x: 12, y: 7 },
      })
      .setInteractive({ useHandCursor: true });
    back.on('pointerup', () => this.scene.start('menu'));

    const next = this.add
      .text(BASE_WIDTH - 32, 26, '下一步：开始第一关海边 →', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#fff3d2',
        backgroundColor: '#204336',
        padding: { x: 14, y: 7 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });

    const proceed = () => this.scene.start('loading');
    next.on('pointerup', proceed);
    this.input.keyboard?.once('keydown-SPACE', proceed);
    this.input.keyboard?.once('keydown-ENTER', proceed);
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('menu'));
  }
}
