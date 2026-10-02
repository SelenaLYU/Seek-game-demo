import Phaser from 'phaser';
import { applyHDCamera } from '../systems/Resolution';
import { ChapterTwoRoomFlow } from '../gameplay/chapterTwoRoomFlow';
import { createRoomInventoryUI, type RoomInventoryUIHandle } from '../ui/RoomInventoryUI';

export default class ChapterTwoRoomScene extends Phaser.Scene {
  private flow = new ChapterTwoRoomFlow();
  private room!: Phaser.GameObjects.Container;
  private modal?: Phaser.GameObjects.Container;
  private snackShown = false;
  private inventory?: RoomInventoryUIHandle;
  private onClose?: () => void;
  constructor() { super('chapter2-room'); }
  create(): void {
    this.flow = new ChapterTwoRoomFlow(); this.modal = undefined; this.snackShown = false; this.onClose = undefined;
    this.inventory?.destroy();
    this.inventory = createRoomInventoryUI(this, { onItemSelected: item => {
      if (item?.id === 'shelf-map' && !this.modal) this.showMap();
    } });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.inventory?.destroy(); this.inventory = undefined; });
    applyHDCamera(this);
    const fit = () => this.cameras.main.setZoom(Math.min(this.scale.gameSize.width / 960, this.scale.gameSize.height / 540)).centerOn(480, 270);
    fit(); this.scale.on('resize', fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', fit));
    this.drawRoom();
  }
  private text(p: Phaser.GameObjects.Container, x: number, y: number, s: string, size = 16, color = '#ede4ce') {
    const t = this.add.text(x, y, s, { fontFamily: 'sans-serif', fontSize: `${size}px`, color, lineSpacing: 7, wordWrap: { width: 660 } });
    p.add(t); return t;
  }
  private box(p: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, color: number) {
    const r = this.add.rectangle(x, y, w, h, color).setStrokeStyle(2, 0xb8a681, .6); p.add(r); return r;
  }
  private button(p: Phaser.GameObjects.Container, x: number, y: number, s: string, action: () => void, w = 160) {
    const r = this.box(p, x, y, w, 36, 0x526a62).setInteractive({ useHandCursor: true });
    this.text(p, x, y, s, 14).setOrigin(.5);
    r.on('pointerover', () => r.setFillStyle(0x6d8273));
    r.on('pointerout', () => r.setFillStyle(0x526a62)); r.on('pointerdown', action);
  }
  private spot(x: number, y: number, w: number, h: number, s: string, action: () => void, color = 0x706650) {
    const r = this.box(this.room, x, y, w, h, color).setInteractive({ useHandCursor: true });
    this.text(this.room, x, y, s, 15).setOrigin(.5);
    r.on('pointerdown', () => { if (!this.modal) action(); });
    r.on('pointerover', () => r.setStrokeStyle(3, 0xf0d9a0));
    r.on('pointerout', () => r.setStrokeStyle(2, 0xb8a681, .6));
  }
  private drawRoom(): void {
    this.room?.destroy(true); this.room = this.add.container(0, 0);
    this.box(this.room, 480, 270, 960, 540, 0x302e29);
    const polygon = (points: number[], color: number) => {
      const shape = this.add.polygon(0, 0, points, color).setOrigin(0).setStrokeStyle(2, 0x574e3e);
      this.room.add(shape);
    };
    // Eye at the entrance: three rows recede into the shop; only the left jamb is visible.
    polygon([0, 0, 235, 80, 750, 80, 960, 0], 0xa79a7a);
    polygon([0, 0, 235, 80, 235, 310, 0, 510], 0x8b8065);
    polygon([750, 80, 960, 0, 960, 510, 750, 310], 0x766f59);
    polygon([0, 510, 235, 310, 750, 310, 960, 510, 960, 540, 0, 540], 0x74614c);
    this.box(this.room, 492, 195, 515, 230, 0xb5a787);
    const floor = this.add.graphics().lineStyle(1, 0xc1a77e, .32); this.room.add(floor);
    [80, 265, 450, 650, 850].forEach(x => floor.lineBetween(490 + (x - 490) * .5, 310, x, 540));
    [347, 397, 464, 532].forEach(y => floor.lineBetween(0, y, 960, y));
    this.text(this.room, 78, 21, '家里的小卖部', 22);
    this.text(this.room, 720, 22, '入口视角 · 灰盒', 12);
    // Award is behind the owner's desk, high enough to remain visible.
    this.spot(358, 116, 92, 60, '三好学生\n韩梅梅', () => this.observe('三好学生', '奖状上的名字是韩梅梅。\n她学习很好，也会有不想写作业的时候。'), 0xc7ad72);
    // Left wall row: refrigerator with a long side plane pointing into the shop.
    polygon([219, 155, 308, 119, 308, 306, 219, 397], 0x667a73);
    polygon([113, 155, 219, 155, 308, 119, 235, 119], 0xbac3af);
    this.box(this.room, 166, 276, 106, 242, 0xa6b1a0);
    this.box(this.room, 166, 272, 86, 206, 0x4f746f);
    [220, 281, 342].forEach(y => {
      this.box(this.room, 166, y + 21, 81, 3, 0xb8bfab);
      [144, 165, 186].forEach(x => {
        this.box(this.room, x, y, 12, 28, 0xbbad78);
        this.box(this.room, x, y - 18, 6, 10, 0xcdd0b1);
      });
    });
    this.box(this.room, 198, 278, 4, 31, 0xe3d4b4);
    this.text(this.room, 143, 163, '冰  箱', 13);
    const fridge = this.add.rectangle(167, 276, 108, 242, 0xffffff, 0).setInteractive({ useHandCursor: true });
    this.room.add(fridge); fridge.on('pointerdown', () => { if (!this.modal) this.observe('冰箱', '冰箱嗡嗡地响着，玻璃上凝着小小的水珠。'); });
    // Middle and right shelving rows: near end faces plus receding stocked sides.
    const shelfRow = (x: number, y: number, w: number, h: number, dx: number, dy: number, interactive: boolean) => {
      const left = x - w / 2, right = x + w / 2, top = y - h / 2, bottom = y + h / 2;
      const edge = dx > 0 ? right : left;
      polygon([edge, top, edge + dx, top + dy, edge + dx, bottom + dy, edge, bottom], 0x66543c);
      polygon([left, top, right, top, right + dx, top + dy, left + dx, top + dy], 0x9b835d);
      for (let row = 0; row < 3; row++) {
        const yy = top + 50 + row * (h - 45) / 3;
        polygon([edge, yy, edge + dx, yy + dy, edge + dx, yy + dy + 5, edge, yy + 7], 0xb39867);
        for (let col = 1; col <= 3; col++) {
          const t = col / 4;
          this.box(this.room, edge + dx * t, yy + dy * t - 18, 16, 29, [0xa99b74, 0x9b7965, 0x819886][row]);
        }
      }
      this.box(this.room, x, y, w, h, 0x6f593c);
      this.box(this.room, x, y - 5, w - 13, h - 20, 0x494739);
      ['汽水', '饼干', '糖果'].forEach((name, row) => {
        const yy = top + 49 + row * (h - 34) / 3;
        for (let col = 0; col < 3; col++) {
          const xx = left + 23 + col * (w - 46) / 2;
          this.box(this.room, xx, yy - 9, 21, 31, [0x8c9b79, 0xb69b6c, 0xad8074][col]);
        }
        this.box(this.room, x, yy + 13, w - 4, 6, 0xaa8c5c);
        this.text(this.room, x, yy + 17, name, 9).setOrigin(.5, 0);
      });
      const hit = this.add.rectangle(x + dx / 2, y + dy / 2, w + Math.abs(dx), h + Math.abs(dy), 0xffffff, 0).setInteractive({ useHandCursor: true });
      this.room.add(hit); hit.on('pointerdown', () => { if (!this.modal) {
        if (interactive) this.shelf(); else this.observe('靠墙的货架', '零食一排排挤在架子上，熟悉的包装还在原来的地方。');
      } });
    };
    shelfRow(823, 260, 110, 204, -112, -53, false);
    const friend = this.add.ellipse(616, 323, 27, 37, 0x927667).setInteractive({ useHandCursor: true });
    this.room.add(friend); friend.on('pointerdown', () => { if (!this.modal) this.observe('货架后的小伙伴', '一个小伙伴从货架后探出头来。\n【人物身份与台词待确认】'); });
    shelfRow(437, 281, 133, 224, 100, -72, true);
    this.spot(437, 406, 131, 26, '收藏抽屉', () => {
      if (['collection', 'snack', 'memory'].includes(this.flow.stage)) this.collection();
      else this.observe('收藏抽屉', '抽屉暂时拉不开，里面传来弹珠轻轻滚动的声音。');
    }, 0x94764e);
    this.text(this.room, 406, 432, '瓶盖货架', 12);
    // Owner's seat immediately to the right of the entrance, behind the foreground desk.
    this.box(this.room, 872, 339, 57, 74, 0x69533d);
    this.box(this.room, 872, 384, 66, 14, 0x9b7952);
    this.box(this.room, 849, 414, 9, 58, 0x69533d); this.box(this.room, 896, 414, 9, 58, 0x69533d);
    this.box(this.room, 629, 452, 17, 89, 0x665039); this.box(this.room, 918, 453, 17, 89, 0x665039);
    polygon([656, 351, 864, 351, 949, 432, 598, 432], 0xb39468);
    polygon([598, 432, 949, 432, 949, 458, 598, 458], 0x806340);
    this.spot(700, 381, 118, 62, ['growth', 'growth-done'].includes(this.flow.stage) ? '作业本' : '数学作业', () => this.homework(), 0xc5b99b);
    if (!['growth', 'growth-done', 'homework', 'homework-done'].includes(this.flow.stage))
      this.spot(807, 387, 84, 46, '风景杂志', () => this.magazine(), 0x799799);
    this.spot(743, 418, 40, 19, '折纸', () => this.observe('作业旁的纸手工', '作业还没写完，手边已经多了一件纸手工。\n【具体形状待确认】'), 0xd4c7a6);
    this.spot(797, 422, 36, 17, '橡皮', () => this.observe('兔子橡皮', '题还没写完，橡皮已经变成兔子了。'), 0xbaabb0);
    this.spot(885, 401, 36, 47, '糖罐', () => this.observe('旧糖罐', '玻璃罐边，还粘着一小片没撕干净的糖纸。'), 0xa99570);
    this.text(this.room, 658, 469, '老板的桌子', 12);
    // Foreground jamb only, not a second doorway inside the room.
    this.box(this.room, 29, 259, 58, 518, 0x92704b);
    this.box(this.room, 56, 259, 7, 518, 0x614831);
    [359, 290, 210].forEach((yy, i) => {
      this.box(this.room, 36, yy, 29, 3, 0xf0dbb2);
      this.text(this.room, 8, yy - 21, String([5, 7, 12][i]) + '岁', 12);
    });
    const doorHit = this.add.rectangle(30, 260, 60, 430, 0xffffff, 0).setInteractive({ useHandCursor: true });
    this.room.add(doorHit); doorHit.on('pointerdown', () => { if (!this.modal) this.growth(); });
    const hints: Record<string, string> = { growth: '门框上，还留着小时候的刻度。', 'growth-done': '看完刻度，关闭回到房间。', homework: '桌上的作业摊开了。', 'homework-done': '作业完成了，关闭回到房间。', magazine: '作业下面，露出一本风景杂志。', map: '货架图收好了，去看看那座货架。', shelf: '可以拿出货架图，对照眼前的货架。', collection: '抽屉开了，里面都是两人的小收藏。', snack: '一包辣辣王子掉下来了。', memory: '进入回忆……' };
    this.text(this.room, 80, 511, hints[this.flow.stage], 14);
    this.button(this.room, 116, 473, '重玩', () => { if (!this.modal) this.scene.restart(); }, 63);
    if (this.snackShown) this.addSnack(false);
  }
  private panel(title: string, onClose?: () => void) {
    this.modal?.destroy(true); const p = this.add.container(0, 0).setDepth(50); this.modal = p;
    this.onClose = onClose;
    if (this.inventory) this.inventory.element.style.visibility = 'hidden';
    this.box(p, 480, 270, 960, 540, 0x18221f).setAlpha(.68).setInteractive();
    this.box(p, 480, 270, 754, 414, 0x454f44); this.text(p, 137, 86, title, 24);
    this.button(p, 804, 95, '关闭', () => this.close(), 70); return p;
  }
  private close(): void {
    this.modal?.destroy(true); this.modal = undefined;
    const done = this.onClose; this.onClose = undefined; done?.();
    if (this.inventory) this.inventory.element.style.visibility = '';
    this.drawRoom();
  }
  private observe(title: string, body: string): void { this.text(this.panel(title), 147, 190, body, 19); }
  private growth(): void {
    const p = this.panel('门框上的刻度', () => this.flow.closeGrowth());
    this.box(p, 264, 285, 72, 302, 0x80694b);
    this.text(p, 143, 435, '从最矮的刻痕看起。看完后，关闭回到房间。', 15, '#d9c499');
    const memories = ['妈妈扶着尺子，韩梅梅偷偷踮起了脚。', '李雷也在门框上留下一道刻痕。两人开始比谁长得高。', '两个人已经长高了一大截，小时候的刻痕还在下面。'];
    [5, 7, 12].forEach((age, i) => {
      const y = [371, 278, 181][i];
      this.box(p, 278, y, 39, 3, 0xefd9b2);
      const note = this.text(p, 365, y - 18, memories[i], 17).setWordWrapWidth(390).setVisible(this.flow.ages.has(age));
      this.text(p, 193, y - 11, `${age}岁`, 17, '#ecd4a7');
      const mark = this.add.rectangle(246, y, 129, 49, 0xffffff, 0).setInteractive({ useHandCursor: true });
      p.add(mark);
      mark.on('pointerdown', () => { this.flow.observeAge(age); note.setVisible(true); });
    });
  }
  private homework(): void {
    if (['growth', 'growth-done'].includes(this.flow.stage)) return;
    if (this.flow.stage !== 'homework') { this.observe('完成的作业', '鸡23只，兔12只。\n35个头，94只脚。作业已经完成。'); return; }
    const p = this.panel('数学作业 · 鸡兔同笼', () => this.flow.closeHomework());
    this.text(p, 148, 145, '笼子里有鸡和兔，共有35个头、94只脚。\n鸡和兔各有多少只？', 20);
    const values = [0, 0]; let selected = 0; const fields: Phaser.GameObjects.Text[] = [];
    ['鸡', '兔'].forEach((name, i) => {
      this.button(p, 302 + i * 347, 257, `${name}的数量（点击选中）`, () => { selected = i; refresh(); }, 235);
      fields.push(this.text(p, 302 + i * 347, 294, '0', 23).setOrigin(.5));
    });
    const refresh = () => fields.forEach((t, i) => t.setText(`${selected === i ? '▶ ' : ''}${values[i]} 只`).setColor(selected === i ? '#ffe09e' : '#ede4ce')); refresh();
    for (let n = 0; n < 10; n++) this.button(p, 182 + n * 65, 344, String(n), () => { values[selected] = (values[selected] * 10 + n) % 100; refresh(); }, 51);
    const result = this.text(p, 148, 385, '先选鸡或兔，再点数字填写。', 14);
    this.button(p, 235, 437, '清空选中项', () => { values[selected] = 0; refresh(); });
    this.button(p, 470, 437, '看看草稿提示', () => result.setText('假设35只全是鸡，有70只脚。每换成一只兔，多2只脚。'), 180);
    this.button(p, 705, 437, '交作业', () => {
      if (this.flow.stage === 'homework-done') return;
      if (!this.flow.answer(values[0], values[1])) { result.setText('再算算：头数相加是35，脚数相加要是94。'); return; }
      result.setText('答对了！作业完成。点击右上角关闭，回到桌边。').setColor('#ffe09e');
    });
  }
  private magazine(): void {
    if (['growth', 'growth-done', 'homework', 'homework-done'].includes(this.flow.stage)) return;
    const p = this.panel('海的另一边'); this.box(p, 480, 230, 610, 162, 0x6d939a); this.box(p, 480, 270, 610, 80, 0x4b737b);
    this.text(p, 190, 174, '风景杂志跨页 · 正式美术待接入', 16);
    this.text(p, 190, 324, '页边的字：海的另外一边是什么样子呢？', 20);
    this.button(p, 480, 412, '翻到夹页 · 查看货架图', () => {
      this.showMap(true);
    }, 300);
  }
  private showMap(collect = false): void {
    const map = this.panel('小卖部货架平面图');
    for (let i = 0; i < 9; i++) this.box(map, 290 + i % 3 * 72, 175 + Math.floor(i / 3) * 65, 64, 57, 0x8b8065);
    this.text(map, 525, 187, '九格货架\n两个人留下的记号', 19);
    this.text(map, 175, 366, this.flow.hasMap ? '平面图已在物品栏里。关闭后点击房间里的货架。' : '杂志的夹页里，藏着一张货架平面图。', 16);
    if (collect && !this.flow.hasMap) this.button(map, 480, 423, '收进物品栏', () => {
      this.flow.discoverMap();
      this.inventory?.addItem({ id: 'shelf-map', glyph: '图', label: '货架图' });
      this.inventory?.setExpanded(true);
      this.showMap();
    }, 210);
  }
  private shelf(): void {
    this.flow.enterShelf();
    if (!['shelf', 'collection', 'snack'].includes(this.flow.stage)) { this.observe('小卖部的货架', '汽水、饼干和糖罐挤在一起。\n先看看门框和桌上的东西吧。'); return; }
    if (this.flow.stage !== 'shelf') { this.collection(); return; }
    const names = ['整理实体货架', '根据货架排列瓶盖', '翻转瓶盖盘', '按路线拉动商品'];
    const descriptions = ['根据格子大小、罐底印和图上的提示，还原商品位置。', '让瓶盖正面的图案，与货架上的商品位置对应。', '扣上盖子翻转，背面的刻线连成一条路线。', '回到实体货架，依次拉动路线经过的商品，拉绳带开抽屉。'];
    const step = this.flow.shelfStep; const p = this.panel(`瓶盖流程占位 · ${step + 1}/4`);
    this.text(p, 151, 151, '本页仅演示衔接，不是正式瓶盖谜题。', 16, '#efcf8c');
    this.text(p, 151, 211, names[step], 25); this.text(p, 151, 263, descriptions[step], 18);
    this.button(p, 665, 335, '查看物品：货架图', () => {
      this.showMap();
      this.button(this.modal!, 480, 425, '返回货架', () => this.shelf(), 180);
    }, 235);
    this.button(p, 480, 406, `测试：完成「${names[step]}」`, () => {
      this.flow.advanceShelfPreview(); this.close(); this.drawRoom();
      if (this.flow.stage === 'collection') this.collection(); else this.shelf();
    }, 370);
  }
  private collection(): void {
    const p = this.panel('五年来，两个人的小收藏');
    ['旧蜻蜓玩具', '玻璃弹珠', '折皱的卡片', '吃一半的零食', '更多旧瓶盖'].forEach((name, i) => {
      this.box(p, 205 + i * 137, 236, 119, 91, [0x7b8665, 0x6f8c91, 0x9c805a][i % 3]); this.text(p, 205 + i * 137, 235, name, 12).setOrigin(.5);
    });
    this.text(p, 155, 321, '有些已经玩旧了，有些是最近才放进来的。\n原来这个小抽屉，已经陪了他们五年。', 19);
    this.button(p, 480, 423, '收好这些回忆', () => {
      const first = this.flow.stage === 'collection'; this.flow.viewCollection(); this.close(); this.drawRoom();
      if (first) { this.snackShown = true; this.addSnack(true); }
    }, 220);
  }
  private addSnack(fall: boolean): void {
    const snack = this.add.container(515, fall ? 240 : 463); this.room.add(snack);
    const packet = this.box(snack, 0, 0, 88, 58, 0x9e4d3d);
    this.text(snack, 0, 0, '辣辣王子\n点击进入回忆', 12).setOrigin(.5);
    if (fall) this.tweens.add({ targets: snack, y: 463, duration: 950, ease: 'Bounce.easeOut', onComplete: () => this.drawRoom() });
    else packet.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (!this.modal && this.flow.takeSnack()) this.scene.start('chapter2-memory');
    });
  }
}
