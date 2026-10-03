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
      .text(BASE_WIDTH / 2, BASE_HEIGHT / 2 + 20, '正式动画与配音待制作，这里不接入旧 Demo 的画面', {
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
      .text(BASE_WIDTH - 32, 26, '跳过动画', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#bdbdbd',
        backgroundColor: '#242424',
        padding: { x: 12, y: 7 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });

    // 占位动画没有真实时长，3 秒后自动进入第一关；有正式动画后改成播放结束再进。
    let leaving = false;
    const proceed = () => {
      if (leaving) return;
      leaving = true;
      this.scene.start('loading');
    };
    next.on('pointerup', proceed);
    this.input.keyboard?.once('keydown-SPACE', proceed);
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('menu'));
    const autoAdvance = this.time.delayedCall(3000, proceed);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      autoAdvance.remove(false);
      this.input.keyboard?.off('keydown-SPACE', proceed);
    });
  }
}
