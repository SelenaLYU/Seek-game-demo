import Phaser from 'phaser';
import { applyHDCamera } from '../systems/Resolution';
import { resolveImageUrl } from '../assets';
import { ChapterTwoRoomFlow } from '../gameplay/chapterTwoRoomFlow';
import { GOODS, FIXED, CLUES, CAP_POINTS, CAP_EDGES } from '../gameplay/bottleCapPuzzle';
import { createRoomInventoryUI, type RoomInventoryUIHandle } from '../ui/RoomInventoryUI';
import { createAssetReviewOverlay, type AssetReviewEntry } from '../ui/AssetReviewOverlay';

/** 小卖部背景母版 1920×1080，正好是灰盒 960×540 坐标空间的 2 倍，按 960×540 贴回即与灰盒对齐。 */
const STORE_BG_KEY = 'chapter2-store-bg';
const STORE_BG_PATH = 'assets/scenes/chapter2/chapter2-convenience-store-stocked-night-v3-style-corrected-1920x1080.png';

/**
 * 队友已交付的第二关美术件。母版尚未按 Phaser 锚点切图，
 * 所以这里只做「在游戏里逐张核对」，不作为运行时贴图接入。
 */
const TEAMMATE_ASSETS: readonly AssetReviewEntry[] = [
  { label: '小卖部场景背景', path: STORE_BG_PATH, note: '已确认；本页用 ?storeArt=1 贴进房间' },
  { label: '主线交互母版：作业／杂志／货架图', path: 'assets/level2/convenience-store/interactive/story-props-master-v1.png', note: '九个状态，待切图' },
  { label: '主线交互母版：九件谜题商品与瓶盖', path: 'assets/level2/convenience-store/interactive/puzzle-goods-caps-master-v1.png', note: '对应九格货架答案' },
  { label: '主线交互母版：门框刻度／抽屉／收藏／辣条', path: 'assets/level2/convenience-store/interactive/collection-and-snack-master-v1.png', note: '待切图' },
  { label: '可选观察：门框成长刻度', path: 'assets/level2/convenience-store/optional/growth-marks-observation-master-v3-wonky-chalk-handwriting.png', note: '5／7／12 岁三处近景' },
  { label: '可选观察：奖状／纸船／兔子橡皮／糖罐', path: 'assets/level2/convenience-store/optional/optional-observation-props-master-v1.png', note: '待切图' },
  { label: '可选观察：李雷藏货架四态', path: 'assets/level2/convenience-store/optional/lilei-shelf-hide-states-white-shirt-floral-shorts-v1.png', note: '白上衣花裤衩版本' },
  { label: '骑楼夜景：连续背景', path: 'assets/level2/night-v1/background-night.png', note: '关卡已接入（?scene=chapter2）' },
  { label: '骑楼夜景：平台段 p01', path: 'assets/level2/night-v1/p01.png', note: '共 9 段，坐标见 geometry.json' },
  { label: '骑楼夜景：固定障碍 h01', path: 'assets/level2/night-v1/h01.png', note: '2 倍导出，运行时缩放 0.5' },
  { label: '骑楼夜景：遮挡模块 c01', path: 'assets/level2/night-v1/c01.png', note: '2 倍导出，不加碰撞' },
  { label: '骑楼夜景：摆动物 s01', path: 'assets/level2/night-v1/s01.png', note: '晾衣架／竹竿' },
  { label: '骑楼夜景：封路墙 w01', path: 'assets/level2/night-v1/w01.png', note: '背景镂空，必须与平台同载' },
  { label: '骑楼夜景：值班老师', path: 'assets/level2/night-v1/teacher.png', note: '光锥仍由代码绘制' },
  { label: '骑楼夜景：旧钞票（原旧票根）', path: 'assets/level2/night-v1/old-banknote.png', note: 'ID 仍为 memory-token-2' },
  { label: '骑楼夜景：记忆房入口门', path: 'assets/level2/night-v1/door.png' },
  // 骑楼美术以夜骑楼为唯一真源（ruchengloria 648cadd，见 decisions/2026-10-05-qilou-art-night-only.md）。
  // 白昼骑楼图集与宽幅底图已于 2026-10-05 废弃并从仓库移除，不再在此列出。
];

/** `?storeArt=1` 把美术背景贴进房间；`?artPreview=1` 沿用关卡里的美术检查开关。 */
const isStoreArtMode = () => {
  const query = new URLSearchParams(location.search);
  return query.get('storeArt') === '1' || query.get('artPreview') === '1';
};

export default class ChapterTwoRoomScene extends Phaser.Scene {
  private flow = new ChapterTwoRoomFlow();
  private room!: Phaser.GameObjects.Container;
  /** 美术模式下灰盒图形单独成组，便于整体调透明度做贴合检查。 */
  private greybox?: Phaser.GameObjects.Container;
  private modal?: Phaser.GameObjects.Container;
  private snackShown = false;
  private inventory?: RoomInventoryUIHandle;
  private onClose?: () => void;
  private selectedCell = -1;
  private artMode = false;
  private ghostAlpha = 0.3;
  private artPanel?: HTMLElement;
  private reviewDispose?: () => void;
  constructor() { super('chapter2-room'); }
  preload(): void {
    this.artMode = isStoreArtMode();
    // 只有调试模式才拉这张 3MB 的背景，正常流程的加载量不变
    if (this.artMode && !this.textures.exists(STORE_BG_KEY)) this.load.image(STORE_BG_KEY, resolveImageUrl(STORE_BG_PATH));
  }
  create(): void {
    this.artMode = isStoreArtMode();
    this.flow = new ChapterTwoRoomFlow(); this.modal = undefined; this.snackShown = false; this.onClose = undefined; this.selectedCell = -1;
    this.inventory?.destroy();
    this.inventory = createRoomInventoryUI(this, { onItemSelected: item => {
      if (item?.id === 'shelf-map' && !this.modal) this.showMap();
    } });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.inventory?.destroy(); this.inventory = undefined; });
    applyHDCamera(this);
    const fit = () => this.cameras.main.setZoom(Math.min(this.scale.gameSize.width / 960, this.scale.gameSize.height / 540)).centerOn(480, 270);
    fit(); this.scale.on('resize', fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', fit));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.artPanel?.remove(); this.artPanel = undefined;
      this.reviewDispose?.(); this.reviewDispose = undefined;
    });
    this.drawRoom();
    this.setupArtTools();
  }
  /**
   * 调试入口：`?storeArt=1` 贴美术背景并保留可调透明度的灰盒叠加层，
   * 用来核对交互热点和判定框是否落在画出来的物件上；`?assetReview=1` 打开素材总览。
   */
  private setupArtTools(): void {
    if (new URLSearchParams(location.search).get('assetReview') === '1' && !this.reviewDispose) {
      this.reviewDispose = createAssetReviewOverlay(TEAMMATE_ASSETS);
    }
    if (!this.artMode || this.artPanel) return;
    const panel = document.createElement('div');
    panel.id = 'chapter2-room-art-preview';
    panel.style.cssText = 'position:fixed;z-index:10000;left:12px;bottom:12px;display:flex;gap:6px;align-items:center;padding:8px;background:#162536e8;color:#d9e6e7;font:12px sans-serif;border-radius:8px;';
    const title = document.createElement('span');
    title.textContent = '小卖部美术叠加：';
    panel.append(title);
    for (const [text, alpha] of [['贴合检查', 0.3], ['只看美术', 0], ['只看灰盒', 1]] as const) {
      const button = document.createElement('button');
      button.textContent = text;
      button.onclick = () => { this.ghostAlpha = alpha; this.greybox?.setAlpha(alpha); };
      panel.append(button);
    }
    this.artPanel = panel;
    document.body.append(panel);
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
    this.greybox = undefined;
    const root = this.room;
    const backdrop = this.box(this.room, 480, 270, 960, 540, 0x302e29);
    if (this.artMode && this.textures.exists(STORE_BG_KEY)) {
      // 背景画在根容器、灰盒图形收进 greybox：两者独立，才能单独调灰盒透明度看贴合
      this.room.add(this.add.image(480, 270, STORE_BG_KEY).setDisplaySize(960, 540));
      backdrop.setVisible(false);
      this.greybox = this.add.container(0, 0).setAlpha(this.ghostAlpha);
      this.room.add(this.greybox);
      this.room = this.greybox;
    }
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
    this.text(this.room, 720, 22, this.artMode ? '入口视角 · 美术叠加' : '入口视角 · 灰盒', 12);
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
      if (interactive) {
        const hit = this.add.rectangle(x + dx / 2, y + dy / 2, w + Math.abs(dx), h + Math.abs(dy), 0xffffff, 0).setInteractive({ useHandCursor: true });
        this.room.add(hit); hit.on('pointerdown', () => { if (!this.modal) this.shelf(); });
      }
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
    this.room = root;
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
      this.box(p, 480, 270, 754, 414, 0x243a30).setAlpha(.9).setInteractive();
      this.text(p, 480, 270, '✓', 112, '#cce9ad').setOrigin(.5);
      this.time.delayedCall(900, () => { if (this.modal === p) this.close(); });
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
    for (let i = 0; i < 9; i++) {
      const x = 220 + i % 3 * 65, y = 182 + Math.floor(i / 3) * 60;
      this.box(map, x, y, 59, 52, 0x8b8065);
      this.text(map, x, y, FIXED.includes(i) ? GOODS[i].name + '\n固定' : '？', 12).setOrigin(.5);
    }
    this.text(map, 425, 150, CLUES.map(s => '· ' + s).join('\n'), 15).setWordWrapWidth(360);
    this.text(map, 175, 366, this.flow.hasMap ? '平面图已在物品栏里。关闭后点击房间里的货架。' : '杂志的夹页里，藏着一张货架平面图。', 16);
    if (collect && !this.flow.hasMap) this.button(map, 480, 423, '收进物品栏', () => {
      this.flow.discoverMap();
      this.inventory?.addItem({ id: 'shelf-map', glyph: '图', label: '货架图' });
      this.inventory?.setExpanded(true);
      this.showMap();
    }, 210);
  }
  private shelf(message = ''): void {
    this.flow.enterShelf();
    if (!['shelf', 'collection', 'snack'].includes(this.flow.stage)) {
      this.observe('小卖部的货架', '先看看门框和桌上的东西吧。'); return;
    }
    if (this.flow.stage !== 'shelf') { this.collection(); return; }
    const puzzle = this.flow.puzzle;
    if (puzzle.phase === 'trace') { this.traceCaps(); return; }
    const p = this.panel('整理货架');
    this.text(p, 145, 131, '点击两件商品交换位置，结合平面图的线索摆好货架。', 14);
    puzzle.shelf.forEach((id, index) => {
      const x = 205 + index % 3 * 98, y = 198 + Math.floor(index / 3) * 80;
      const tile = this.box(p, x, y, 90, 70, GOODS[id].color);
      if (this.selectedCell === index) tile.setStrokeStyle(4, 0xffe099);
      this.text(p, x, y, GOODS[id].name, 13, '#252e26').setOrigin(.5);
      if (FIXED.includes(index)) this.text(p, x + 32, y - 28, '●', 10, '#514b3b');
      tile.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (FIXED.includes(index)) { this.selectedCell = -1; this.shelf('中间这件不能换位置。'); return; }
        if (this.selectedCell < 0) this.selectedCell = index;
        else { puzzle.swap(this.selectedCell, index); this.selectedCell = -1; }
        this.shelf();
      });
    });
    this.text(p, 505, 162, '平面图上的记号\n\n' + CLUES.join('\n'), 14).setWordWrapWidth(300);
    this.text(p, 145, 397, message || '只有一件固定，其余八件都可以交换。', 13, '#f2d79d');
    this.button(p, 653, 435, '检查货架', () => {
      this.selectedCell = -1;
      if (puzzle.checkShelf()) this.traceCaps();
      else this.shelf('还有线索没有对上，再检查商品之间的位置。');
    }, 220);
  }
  /*
    const puzzle = this.flow.puzzle;
    const p = this.panel('货架摆好了 · 在瓶盖上画出这条线');
    this.text(p, 144, 134, '照着左边的路线，从起点按住鼠标或手指，一笔画到终点后松开。', 14);
    const ref = (i: number) => [202 + i % 3 * 72, 210 + Math.floor(i / 3) * 65];
    const cap = (i: number) => [540 + i % 3 * 112, 204 + Math.floor(i / 3) * 83];
    const guide = this.add.graphics().lineStyle(4, 0xf8e2aa); p.add(guide);
    puzzle.shelf.forEach((id, i) => {
      const [rx, ry] = ref(i);
      this.box(p, rx, ry, 64, 57, GOODS[id].color);
      this.text(p, rx, ry - 15, GOODS[id].name, 9, '#293326').setOrigin(.5);
      const [cx, cy] = cap(i);
      p.add(this.add.circle(cx, cy, 32, GOODS[id].color).setStrokeStyle(3, 0xcfbf97));
      this.text(p, cx, cy - 16, GOODS[id].mark, 12, '#293326').setOrigin(.5);
    });
    // Draw reference after the cards so it remains fully visible.
    p.bringToTop(guide);
    ROUTE.forEach((id, n) => {
      const [x, y] = ref(id), next = ROUTE[n + 1];
      if (next !== undefined) {
        const [nx, ny] = ref(next); guide.lineBetween(x, y, nx, ny);
        this.text(p, (x + nx) / 2, (y + ny) / 2, nx > x ? '→' : nx < x ? '←' : '↓', 18, '#1f3027').setOrigin(.5);
      }
    });
    for (const [id, label] of [[ROUTE[0], '起'], [ROUTE[ROUTE.length - 1], '终']] as const) {
      const [x, y] = cap(id); this.text(p, x, y + 13, label, 14, '#1d3826').setOrigin(.5);
    }
    this.text(p, 190, 369, '货架上的路线', 15);
    const hint = this.text(p, 145, 408, '瓶盖已按货架摆好，不用再翻面或记商品顺序。', 14, '#f2d79d');
    const ink = this.add.graphics().lineStyle(6, 0xd94b4b); p.add(ink);
    let previous: { x: number; y: number } | undefined;
    let activeId = -1, finished = false;
    const world = (pointer: Phaser.Input.Pointer) => {
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      return { x: (point.x - 540) / 112, y: (point.y - 204) / 83 };
    };
    const sample = (pointer: Phaser.Input.Pointer) => {
      if (!puzzle.drawing || pointer.id !== activeId || !previous) return;
      const now = world(pointer), from = previous;
      const steps = Math.max(1, Math.ceil(Math.hypot(now.x - from.x, now.y - from.y) / .06));
      for (let j = 1; j <= steps; j++) {
        if (!puzzle.tracePoint(from.x + (now.x - from.x) * j / steps, from.y + (now.y - from.y) * j / steps)) {
          ink.clear(); previous = undefined; hint.setText('偏离路线了。从「起」重新画一笔就好。'); return;
        }
      }
      ink.lineStyle(6, 0xfff5d3).lineBetween(540 + from.x * 112, 204 + from.y * 83, 540 + now.x * 112, 204 + now.y * 83);
      previous = now;
    };
    const down = (pointer: Phaser.Input.Pointer) => {
      if (finished || this.modal !== p || puzzle.drawing) return;
      const point = world(pointer);
      if (point.x < -.4 || point.x > 2.4 || point.y < -.4 || point.y > 2.4) return;
      ink.clear();
      if (!puzzle.beginTrace(point.x, point.y)) { hint.setText('从标有「起」的瓶盖开始，按住画线。'); return; }
      previous = point; activeId = pointer.id; hint.setText('沿路线画下去，到「终」后松开。');
    };
    const up = (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== activeId || finished || !puzzle.drawing) return;
      sample(pointer);
      if (puzzle.endTrace()) {
        finished = true; this.flow.finishShelf(); hint.setText('画好了！收藏抽屉打开了。');
        this.time.delayedCall(650, () => { if (this.modal === p) { this.close(); this.collection(); } });
      } else { ink.clear(); hint.setText('需要一笔画到终点，中途松开可以重新来。'); }
      previous = undefined; activeId = -1;
    };
    this.input.on('pointerdown', down); this.input.on('pointermove', sample);
    this.input.on('pointerup', up); this.input.on('pointerupoutside', up);
    p.once('destroy', () => {
      puzzle.cancelTrace(); this.input.off('pointerdown', down); this.input.off('pointermove', sample);
      this.input.off('pointerup', up); this.input.off('pointerupoutside', up);
    });
  }
  */
  private traceCaps(): void {
    const puzzle = this.flow.puzzle;
    const p = this.panel('货架摆好了 · 瓶盖一笔挑战');
    this.text(p, 144, 134, '每条连线只能走一次。自己选起点和岔路，不能抬手，也不能重复走同一条线。', 14);
    this.text(p, 190, 176, '瓶盖已经按货架摆好，现在只看连线。', 15);
    const nodes = CAP_POINTS.map(([x, y], i) => { const c = this.add.circle(x, y, 28, GOODS[puzzle.shelf[i]].color).setStrokeStyle(3, 0xcfbf97); p.add(c); this.text(p, x, y, GOODS[puzzle.shelf[i]].mark, 11, '#293326').setOrigin(.5); return { x, y }; });
    const network = this.add.graphics().lineStyle(3, 0x9eaa8d); p.add(network); CAP_EDGES.forEach(([a,b]) => network.lineBetween(nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y));
    const ink = this.add.graphics().lineStyle(8, 0xff0000); p.add(ink);
    const hint = this.text(p, 145, 438, '点住任意瓶盖开始，沿着相邻瓶盖走。', 14, '#f2d79d');
    let activeId = -1, finished = false, previous: { x: number; y: number } | undefined;
    const nearest = (pointer: Phaser.Input.Pointer) => { const q = this.cameras.main.getWorldPoint(pointer.x, pointer.y); let best = -1, dist = 35; nodes.forEach((n, i) => { const d = Phaser.Math.Distance.Between(q.x, q.y, n.x, n.y); if (d < dist) { best = i; dist = d; } }); return best; };
    const pointerPoint = (pointer: Phaser.Input.Pointer) => { const q = this.cameras.main.getWorldPoint(pointer.x, pointer.y); return { x: q.x, y: q.y }; };
    const down = (pointer: Phaser.Input.Pointer) => { if (finished || this.modal !== p || puzzle.drawing) return; const node = nearest(pointer); if (node < 0 || !puzzle.beginTrace(node)) { hint.setText('从任意瓶盖开始，想好下一条连接。'); return; } activeId = pointer.id; previous = pointerPoint(pointer); ink.clear(); hint.setText('继续走相邻瓶盖；每条线只能经过一次。'); };
    const move = (pointer: Phaser.Input.Pointer) => { if (pointer.id !== activeId || !puzzle.drawing || !previous) return; const now = pointerPoint(pointer); ink.lineBetween(previous.x, previous.y, now.x, now.y); previous = now; const node = nearest(pointer), last = puzzle.path.at(-1); if (node >= 0 && node !== last && puzzle.visit(node)) hint.setText(`已走 ${puzzle.used.size}/${CAP_EDGES.length} 条连接`); };
    const up = (pointer: Phaser.Input.Pointer) => { if (pointer.id !== activeId || finished || !puzzle.drawing) return; if (puzzle.endTrace()) { finished = true; this.flow.finishShelf(); hint.setText('路线完成了！收藏抽屉打开了。'); this.time.delayedCall(650, () => { if (this.modal === p) { this.close(); this.collection(); } }); } else { ink.clear(); hint.setText('还没走完所有连线，从任意瓶盖重新尝试。'); } activeId = -1; previous = undefined; };
    this.input.on('pointerdown', down); this.input.on('pointermove', move); this.input.on('pointerup', up); this.input.on('pointerupoutside', up);
    p.once('destroy', () => { puzzle.cancelTrace(); this.input.off('pointerdown', down); this.input.off('pointermove', move); this.input.off('pointerup', up); this.input.off('pointerupoutside', up); });
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
    // 掉落补间要跑 950ms，期间包装上已经写着「点击进入回忆」。这里统一绑点击，
    // 否则这近一秒里点它没有任何反应，玩家只会读成“点不中”，得再点一次。
    packet.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (this.modal || !this.flow.takeSnack()) return;
      // 取走后掐掉补间，避免它结束后再 drawRoom() 又生成一包；重进房间本就从头开始。
      this.snackShown = false;
      this.tweens.killTweensOf(snack);
      this.scene.start('chapter2-memory');
    });
    if (fall) this.tweens.add({ targets: snack, y: 463, duration: 950, ease: 'Bounce.easeOut', onComplete: () => this.drawRoom() });
  }
}
