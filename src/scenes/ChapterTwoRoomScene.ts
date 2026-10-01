import Phaser from 'phaser';
import { applyHDCamera, BASE_HEIGHT, BASE_WIDTH } from '../systems/Resolution';

/** 第二段记忆房灰盒：收集三处记忆线索后触发记忆动画。 */
export default class ChapterTwoRoomScene extends Phaser.Scene {
  private found = new Set<number>();
  private status!: Phaser.GameObjects.Text;
  private orb?: Phaser.GameObjects.Arc;
  private leaving = false;

  constructor() { super('chapter2-room'); }

  create(data: { entryItem?: string } = {}): void {
    this.found.clear();
    this.orb = undefined;
    this.leaving = false;
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#1c2827');
    this.add.rectangle(0, 0, BASE_WIDTH, BASE_HEIGHT, 0x293836).setOrigin(0);
    this.add.rectangle(42, 68, 876, 410, 0x455450).setStrokeStyle(4, 0x79827a);
    this.add.rectangle(70, 96, 820, 350, 0x303d3a).setStrokeStyle(2, 0x9a927d, .5);
    this.add.text(34, 24, '第二段记忆房间 · 灰盒', {
      fontFamily: 'serif', fontSize: '24px', color: '#efe5c8', letterSpacing: 3,
    });
    this.add.text(926, 28, data.entryItem ? '记忆信物已带入' : '等待关卡信物', {
      fontFamily: 'sans-serif', fontSize: '12px', color: data.entryItem ? '#d9c47e' : '#8b9691',
    }).setOrigin(1, 0);

    const clues = [
      { x: 235, y: 250, label: '记忆线索 A', color: 0x789c91 },
      { x: 480, y: 190, label: '记忆线索 B', color: 0xa98e77 },
      { x: 725, y: 275, label: '记忆线索 C', color: 0x8985a2 },
    ];
    clues.forEach((clue, index) => {
      const card = this.add.rectangle(clue.x, clue.y, 150, 116, clue.color, .72)
        .setStrokeStyle(2, 0xe8dfc4, .62).setInteractive({ useHandCursor: true });
      const label = this.add.text(clue.x, clue.y, clue.label, {
        fontFamily: 'sans-serif', fontSize: '15px', color: '#f5efdc', align: 'center',
      }).setOrigin(.5);
      card.on('pointerdown', () => {
        if (this.found.has(index)) return;
        this.found.add(index);
        card.disableInteractive();
        this.tweens.add({ targets: [card, label], alpha: .28, scale: .94, duration: 300 });
        this.status.setText(`记忆线索 ${this.found.size} / 3`);
        if (this.found.size === 3) this.revealMemoryOrb();
      });
    });

    this.status = this.add.text(BASE_WIDTH / 2, 493, '点击房间里的三处记忆线索（正式谜题待接入）', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#f0e8d0',
      backgroundColor: 'rgba(13,23,21,.8)', padding: { x: 12, y: 8 },
    }).setOrigin(.5);
  }

  private revealMemoryOrb(): void {
    this.status.setText('记忆已经汇合。触碰光球，进入第二段记忆动画。');
    this.orb = this.add.circle(BASE_WIDTH / 2, 325, 32, 0xe6c779, .9)
      .setStrokeStyle(5, 0xffedb1, .5).setInteractive({ useHandCursor: true }).setDepth(10);
    this.add.text(BASE_WIDTH / 2, 377, '进入记忆', {
      fontFamily: 'serif', fontSize: '17px', color: '#efe2b8',
    }).setOrigin(.5);
    this.tweens.add({ targets: this.orb, scale: 1.18, alpha: .62, duration: 950, yoyo: true, repeat: -1 });
    this.orb.on('pointerdown', () => {
      if (this.leaving) return;
      this.leaving = true;
      this.cameras.main.fadeOut(500, 10, 18, 17);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('chapter2-memory'));
    });
  }
}
