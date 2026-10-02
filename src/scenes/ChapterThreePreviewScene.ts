import Phaser from 'phaser';
import { applyHDCamera } from '../systems/Resolution';

/** 第三关预告：只展示站位和氛围，正式玩法尚未接入。 */
export default class ChapterThreePreviewScene extends Phaser.Scene {
  constructor() { super('chapter3-preview'); }

  create(): void {
    applyHDCamera(this);
    this.add.rectangle(480, 270, 960, 540, 0x24363a);
    this.add.text(40, 28, '第三关预告 · 站位动画', { fontSize: '22px', color: '#efe5cd' });
    this.add.text(480, 78, '未完待续', { fontSize: '30px', color: '#f1d39a' }).setOrigin(.5);
    const street = this.add.rectangle(480, 365, 760, 135, 0x6f7468);
    const child = this.add.container(420, 350);
    child.add(this.add.circle(0, -55, 23, 0xe0c19d));
    child.add(this.add.rectangle(0, -10, 42, 75, 0x71908a));
    const friend = this.add.container(570, 350);
    friend.add(this.add.circle(0, -55, 23, 0xd4b38e));
    friend.add(this.add.rectangle(0, -10, 42, 75, 0xb07b68));
    this.add.text(480, 470, '新的街区仍在前方，下一段记忆即将展开。', { fontSize: '18px', color: '#f1e8d4' }).setOrigin(.5);
    this.tweens.add({ targets: [child, friend], x: '+=18', yoyo: true, repeat: -1, duration: 800, ease: 'Sine.inOut' });
    const finish = () => this.scene.start('island');
    const skip = this.add.text(868, 34, '跳过预告', { fontSize: '14px', color: '#efe5cd', backgroundColor: '#596f60', padding: { x: 12, y: 8 } }).setOrigin(.5).setInteractive({ useHandCursor: true });
    skip.on('pointerdown', finish);
    this.time.delayedCall(3000, finish);
  }
}
