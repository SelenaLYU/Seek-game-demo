import Phaser from 'phaser';
import { applyHDCamera, BASE_HEIGHT, BASE_WIDTH } from '../systems/Resolution';

/** 第二段记忆动画接口灰盒；正式视频到货后只替换本场景。 */
export default class ChapterTwoMemoryScene extends Phaser.Scene {
  constructor() { super('chapter2-memory'); }

  create(): void {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#111918');
    this.add.rectangle(0, 0, BASE_WIDTH, BASE_HEIGHT, 0x111918).setOrigin(0);
    const glow = this.add.circle(BASE_WIDTH / 2, BASE_HEIGHT / 2 - 25, 115, 0xd7c27a, .08);
    const title = this.add.text(BASE_WIDTH / 2, BASE_HEIGHT / 2 - 45, '第二段记忆动画', {
      fontFamily: 'serif', fontSize: '30px', color: '#f2e8ce', letterSpacing: 5,
    }).setOrigin(.5).setAlpha(0);
    const note = this.add.text(BASE_WIDTH / 2, BASE_HEIGHT / 2 + 5, '动画内容与素材待接入', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#9eaaa5', letterSpacing: 2,
    }).setOrigin(.5).setAlpha(0);
    const continueText = this.add.text(BASE_WIDTH / 2, BASE_HEIGHT / 2 + 92, '继续返回记忆之岛', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#f0e2bb',
      backgroundColor: '#294b43', padding: { x: 18, y: 11 },
    }).setOrigin(.5).setAlpha(0).setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: glow, scale: 1.3, alpha: .16, duration: 1800, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: [title, note], alpha: 1, y: '-=7', duration: 900, ease: 'Sine.easeOut' });
    this.time.delayedCall(1100, () => this.tweens.add({ targets: continueText, alpha: 1, duration: 450 }));
    let leaving = false;
    const finish = () => {
      if (leaving) return;
      leaving = true;
      this.cameras.main.fadeOut(500, 9, 16, 15);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('island', { completedChapter: 2 });
      });
    };
    continueText.on('pointerdown', finish);
    this.input.keyboard?.once('keydown-SPACE', finish);
  }
}
