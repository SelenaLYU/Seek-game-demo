import Phaser from 'phaser';
import { applyHDCamera } from '../systems/Resolution';

/** Click-through animatic placeholder; replace art without changing the room handoff. */
export default class ChapterTwoMemoryScene extends Phaser.Scene {
  constructor() { super('chapter2-memory'); }
  create(): void {
    applyHDCamera(this);
    const fit = () => this.cameras.main.setZoom(Math.min(this.scale.gameSize.width / 960, this.scale.gameSize.height / 540)).centerOn(480, 270);
    fit(); this.scale.on('resize', fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', fit));
    this.add.rectangle(480, 270, 960, 540, 0x414d45);
    this.add.text(40, 25, '第二段记忆 · 分镜灰盒', { fontSize: '22px', color: '#efe5cd' });
    this.add.rectangle(480, 325, 710, 98, 0x816b50);
    const children = this.add.container(0, 0);
    [365, 570].forEach((x, i) => {
      children.add(this.add.rectangle(x, 241, 65, 92, i ? 0x698c95 : 0xac7366));
      children.add(this.add.circle(x, 175, 31, 0xd6b58c));
      children.add(this.add.text(x, 310, i ? '李雷' : '韩梅梅', { fontSize: '16px', color: '#f2e6ce' }).setOrigin(.5));
    });
    const packet = this.add.rectangle(468, 255, 66, 82, 0xad5140);
    const packetText = this.add.text(468, 255, '辣辣\n王子', { fontSize: '17px', color: '#ffe2a7' }).setOrigin(.5);
    const magazine = this.add.rectangle(490, 307, 162, 64, 0x76a3a6).setVisible(false);
    const reaction = this.add.text(480, 116, '', { fontSize: '28px', color: '#ffe295' }).setOrigin(.5);
    const caption = this.add.text(480, 389, '', { fontSize: '20px', color: '#f1e8d4', align: 'center', lineSpacing: 9, wordWrap: { width: 820 } }).setOrigin(.5, 0);
    const next = this.add.text(480, 492, '下一幕', { fontSize: '17px', color: '#f2e6ce', backgroundColor: '#596f60', padding: { x: 25, y: 10 } }).setOrigin(.5).setInteractive({ useHandCursor: true });
    const count = this.add.text(873, 34, '', { fontSize: '14px', color: '#cfbea1' });
    const captions = [
      '两人凑在柜台旁，偷偷拆开一包辣辣王子。',
      '第一次吃这一款辣条。两人咬了一口，愣住，又互相看了一眼。',
      '好辣……但也太好吃了！两人扇着嘴，笑着又拿了一根。',
      '韩梅梅翻开风景杂志：“你过来看。”\n“你说，海那边是什么样子呢？”',
      '远处传来妈妈的声音：\n“韩梅梅！你怎么又在这里偷吃辣条！跟你说这些垃圾食品不能吃。”',
      '两人抓起辣条跑出画面。\n桌上的杂志还停在那片海。',
    ];
    let index = 0, leaving = false;
    const render = () => {
      caption.setText(captions[index]); count.setText(`${index + 1} / 6`);
      reaction.setText(index === 1 ? '……！' : index === 2 ? '好吃！  好辣！' : index === 4 ? '糟了！' : '');
      magazine.setVisible(index >= 3);
      if (index === 2) this.tweens.add({ targets: children, y: -8, yoyo: true, repeat: 2, duration: 140 });
      if (index === 5) {
        this.tweens.add({ targets: children, x: 800, duration: 850 });
        this.tweens.add({ targets: [packet, packetText], x: 1200, duration: 850 });
        next.setText('返回记忆之岛');
      }
    };
    const advance = () => {
      if (leaving) return;
      if (index < captions.length - 1) { index++; render(); }
      else { leaving = true; this.scene.start('island', { completedChapter: 2 }); }
    };
    next.on('pointerdown', advance);
    this.input.keyboard?.on('keydown-SPACE', advance);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown-SPACE', advance));
    render();
  }
}
