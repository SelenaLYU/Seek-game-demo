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
      .text(0, 0, '← 返回菜单', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#d5d5d5',
        backgroundColor: '#242424',
        padding: { x: 12, y: 7 },
      })
      .setInteractive({ useHandCursor: true });
    back.on('pointerup', () => this.scene.start('menu'));

    const next = this.add
      // 全局音乐开关占用最右上角；跳过按钮固定在右下角，避免二者重叠。
      .text(0, 0, '跳过动画 →', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#fff4cf',
        backgroundColor: '#36594de8',
        padding: { x: 14, y: 9 },
      })
      .setOrigin(1, 1)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });

    // cover 模式会在窄窗口裁掉 960×540 画面的左右两侧。按钮必须依据相机真实可见区域
    // 定位，否则固定放在 x=936 时虽然存在，玩家却完全看不见。
    const placeCornerControls = () => {
      const camera = this.cameras.main;
      const visibleWidth = camera.width / Math.max(camera.zoomX, 1e-6);
      const visibleHeight = camera.height / Math.max(camera.zoomY, 1e-6);
      const left = BASE_WIDTH / 2 - visibleWidth / 2;
      const right = BASE_WIDTH / 2 + visibleWidth / 2;
      const top = BASE_HEIGHT / 2 - visibleHeight / 2;
      const bottom = BASE_HEIGHT / 2 + visibleHeight / 2;
      back.setPosition(left + 24, top + 22);
      next.setPosition(right - 24, bottom - 24);
    };
    placeCornerControls();
    this.time.delayedCall(0, placeCornerControls);
    this.scale.on(Phaser.Scale.Events.RESIZE, placeCornerControls);

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
      this.scale.off(Phaser.Scale.Events.RESIZE, placeCornerControls);
    });
  }
}
