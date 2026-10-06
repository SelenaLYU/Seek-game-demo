import { english, installRoomEnglish } from '../ui/RoomEnglish';
import Phaser from 'phaser';
import { applyHDCamera } from '../systems/Resolution';
import { resolveImageUrl } from '../assets';
import { ChapterTwoRoomFlow } from '../gameplay/chapterTwoRoomFlow';
import { FIXED, CLUES, CAP_POINTS, CAP_EDGES } from '../gameplay/bottleCapPuzzle';
import { createRoomInventoryUI, type RoomInventoryUIHandle } from '../ui/RoomInventoryUI';
import { createAssetReviewOverlay, type AssetReviewEntry } from '../ui/AssetReviewOverlay';
import { showOtherRoomText } from '../ui/RoomInteractionCopy';
import { showRoomItemNotice } from '../ui/RoomItemPresentation';

const ART = {
  background: ['chapter2-store-bg-v5', 'assets/scenes/chapter2/chapter2-store-background-v5.png'],
  cabinet: ['chapter2-store-cabinet-v1', 'assets/level2/convenience-store/interactive/shelf-front-v1.jpg'],
  story: ['chapter2-store-story', 'assets/level2/convenience-store/interactive/story-props-master-v1.png'],
  goods: ['chapter2-store-goods-v2', 'assets/level2/convenience-store/interactive/puzzle-goods-caps-master-v2.jpg'],
  collection: ['chapter2-store-collection-v3', 'assets/level2/convenience-store/interactive/collection-and-snack-master-v3.png'],
  growth: ['chapter2-store-growth-v6', 'assets/level2/convenience-store/optional/growth-marks-observation-master-v6.png'],
  optional: ['chapter2-store-optional-v2', 'assets/level2/convenience-store/optional/optional-observation-props-master-v2.jpg'],
  lilei: ['chapter2-store-lilei', 'assets/level2/convenience-store/optional/lilei-shelf-hide-states-white-shirt-floral-shorts-v1.png'],
} as const;

type ArtKey = keyof typeof ART;
type FrameDef = readonly [name: string, x: number, y: number, width: number, height: number];

const STORY_FRAMES: readonly FrameDef[] = [
  ['homework-closed', 20, 15, 470, 350], ['homework-open', 480, 15, 530, 350], ['homework-solved', 1010, 15, 510, 350],
  ['magazine-closed', 20, 360, 470, 330], ['magazine-under-book', 525, 360, 470, 325], ['magazine-open', 985, 370, 535, 315],
  ['magazine-map', 0, 682, 550, 342], ['map-folded', 570, 720, 350, 290], ['map-open', 985, 690, 535, 310],
];

const COLLECTION_FRAMES: readonly FrameDef[] = [
  ['growth-post', 91, 0, 142, 393], ['drawer-closed', 295, 110, 361, 278],
  ['drawer-open', 679, 110, 365, 278], ['drawer-filled', 1062, 108, 357, 281],
  ['toy-dragonfly', 38, 400, 325, 338], ['marbles', 370, 468, 357, 244],
  ['cards-boats', 726, 463, 378, 274], ['old-snacks-caps', 1106, 408, 342, 315],
  ['snack-sealed', 57, 746, 238, 315], ['snack-open', 370, 718, 314, 346],
  ['snack-flat', 694, 810, 403, 227], ['map-inventory', 1147, 750, 293, 304],
];

const GROWTH_FRAMES: readonly FrameDef[] = [
  ['growth-full', 164, 0, 224, 1536], ['growth-door', 164, 0, 224, 1536],
  ['growth-12', 500, 90, 475, 475], ['growth-7', 503, 610, 475, 440],
  ['growth-5', 503, 1090, 480, 340],
];

const OPTIONAL_FRAMES: readonly FrameDef[] = [
  ['award-paper', 225, 45, 630, 445], ['award-framed', 970, 40, 595, 455],
  ['paper-boat', 80, 575, 490, 260], ['rabbit-eraser', 620, 610, 280, 240],
  ['candy-jar', 938, 500, 280, 355], ['rabbit-wrapper', 1340, 620, 305, 230],
];

const LILEI_FRAMES: readonly FrameDef[] = [
  ['lilei-back', 90, 0, 660, 465], ['lilei-peek', 785, 0, 665, 465],
  ['lilei-shush', 90, 480, 670, 540], ['lilei-turn', 780, 475, 690, 545],
  // 房间远景只需要从货架末端露出的竖向一小截：白衣下摆、蓝花裤子和一点腿。
  ['lilei-shelf-slice', 220, 160, 150, 260],
];

const GOODS_FRAMES: readonly FrameDef[] = [
  ['good-0', 33, 46, 80, 107], ['cap-0', 40, 156, 63, 61],
  ['good-1', 170, 20, 55, 134], ['cap-1', 165, 157, 63, 61],
  ['good-2', 294, 26, 58, 128], ['cap-2', 291, 157, 63, 61],
  ['good-3', 6, 228, 122, 99], ['cap-3', 41, 327, 62, 60],
  ['good-4', 136, 228, 118, 99], ['cap-4', 165, 327, 63, 60],
  ['good-5', 266, 228, 117, 99], ['cap-5', 290, 327, 64, 60],
  ['good-6', 15, 390, 117, 100], ['cap-6', 40, 495, 63, 63],
  ['good-7', 142, 408, 110, 81], ['cap-7', 165, 495, 63, 63],
  ['good-8', 270, 391, 110, 101], ['cap-8', 290, 495, 64, 63],
];

const TEAMMATE_ASSETS: readonly AssetReviewEntry[] = Object.values(ART).map(([_, path]) => ({
  label: path.split('/').at(-1) ?? path,
  path,
  note: '已接入第二关记忆之房',
}));

const queryFlag = (name: string) => new URLSearchParams(location.search).get(name) === '1';

export default class ChapterTwoRoomScene extends Phaser.Scene {
  private flow = new ChapterTwoRoomFlow();
  private room!: Phaser.GameObjects.Container;
  private modal?: Phaser.GameObjects.Container;
  private inventory?: RoomInventoryUIHandle;
  private onClose?: () => void;
  private selectedCell = -1;
  private snackShown = false;
  private debugHotspots = false;
  private reviewDispose?: () => void;

  constructor() { super('chapter2-room'); }

  preload(): void {
    for (const [key, path] of Object.values(ART)) {
      if (!this.textures.exists(key)) this.load.image(key, resolveImageUrl(path));
    }
  }

  create(): void {
    // DOM 观察面板由公共翻译器处理；画布文字在 text() 中使用独立的小号英文行。
    installRoomEnglish(this, false);
    this.flow = new ChapterTwoRoomFlow();
    this.modal = undefined;
    this.selectedCell = -1;
    this.snackShown = false;
    this.debugHotspots = queryFlag('storeArt');
    this.registerFrames();
    this.inventory?.destroy();
    this.inventory = createRoomInventoryUI(this, {
      onItemSelected: item => {
        if (item?.id === 'shelf-map' && !this.modal) this.showMap();
      },
    });
    applyHDCamera(this);
    const fit = () => this.cameras.main
      .setZoom(Math.min(this.scale.gameSize.width / 960, this.scale.gameSize.height / 540))
      .centerOn(480, 270);
    fit();
    this.scale.on('resize', fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', fit);
      this.inventory?.destroy();
      this.inventory = undefined;
      this.reviewDispose?.();
      this.reviewDispose = undefined;
    });
    this.drawRoom();
    if (queryFlag('assetReview')) this.reviewDispose = createAssetReviewOverlay(TEAMMATE_ASSETS);
  }

  private registerFrames(): void {
    this.prepareWhiteSheet('goods');
    this.prepareWhiteSheet('optional');
    this.prepareWhiteSheet('cabinet');
    const groups: readonly [ArtKey, readonly FrameDef[]][] = [
      ['story', STORY_FRAMES], ['goods', GOODS_FRAMES], ['collection', COLLECTION_FRAMES],
      ['growth', GROWTH_FRAMES], ['optional', OPTIONAL_FRAMES], ['lilei', LILEI_FRAMES],
      ['cabinet', [['shelf-front', 49, 37, 290, 516]]],
    ];
    for (const [art, frames] of groups) {
      const texture = this.textures.get(ART[art][0]);
      for (const [name, x, y, width, height] of frames) {
        if (!texture.has(name)) texture.add(name, 0, x, y, width, height);
      }
    }
  }

  /** JPEG masters have white gutters: remove only white connected to the sheet edge.
   * White paper and milk-carton details enclosed by the artwork remain intact. */
  private prepareWhiteSheet(art: 'goods' | 'optional' | 'cabinet'): void {
    const key = ART[art][0];
    const texture = this.textures.get(key);
    if (texture.has({ goods: 'good-0', optional: 'award-paper', cabinet: 'shelf-front' }[art])) return;
    const source = texture.getSourceImage() as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = source.width; canvas.height = source.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = pixels;
    const seen = new Uint8Array(canvas.width * canvas.height);
    const queue = new Int32Array(seen.length);
    let head = 0, tail = 0;
    const enqueue = (index: number) => {
      if (seen[index]) return;
      seen[index] = 1;
      const p = index * 4;
      if (Math.min(data[p], data[p + 1], data[p + 2]) < 238) return;
      queue[tail++] = index;
    };
    for (let x = 0; x < canvas.width; x++) {
      enqueue(x); enqueue((canvas.height - 1) * canvas.width + x);
    }
    for (let y = 0; y < canvas.height; y++) {
      enqueue(y * canvas.width); enqueue((y + 1) * canvas.width - 1);
    }
    while (head < tail) {
      const index = queue[head++], x = index % canvas.width;
      data[index * 4 + 3] = 0;
      if (x > 0) enqueue(index - 1);
      if (x + 1 < canvas.width) enqueue(index + 1);
      if (index >= canvas.width) enqueue(index - canvas.width);
      if (index + canvas.width < seen.length) enqueue(index + canvas.width);
    }
    // De-matte pale JPEG edge pixels against the removed white gutter.
    const originalAlpha = new Uint8Array(seen.length);
    for (let i = 0; i < seen.length; i++) originalAlpha[i] = data[i * 4 + 3];
    for (let i = 0; i < seen.length; i++) {
      if (!originalAlpha[i]) continue;
      const x = i % canvas.width;
      const edge = (x > 0 && !originalAlpha[i - 1])
        || (x + 1 < canvas.width && !originalAlpha[i + 1])
        || (i >= canvas.width && !originalAlpha[i - canvas.width])
        || (i + canvas.width < seen.length && !originalAlpha[i + canvas.width]);
      if (!edge) continue;
      const p = i * 4, minimum = Math.min(data[p], data[p + 1], data[p + 2]);
      const maximum = Math.max(data[p], data[p + 1], data[p + 2]);
      if (minimum < 160 || maximum - minimum > 40) continue;
      const alpha = Math.min(1, (255 - minimum) / 95);
      data[p + 3] = Math.round(alpha * 255);
      for (let c = 0; c < 3; c++) data[p + c] = Math.max(0, (data[p + c] - 255 * (1 - alpha)) / alpha);
    }
    context.putImageData(pixels, 0, 0);
    this.textures.remove(key);
    this.textures.addCanvas(key, canvas);
  }

  private roomCabinetTexture(): string {
    const key = 'chapter2-store-cabinet-fitted-v1';
    if (this.textures.exists(key)) return key;
    const texture = this.textures.get(ART.cabinet[0]);
    const frame = texture.get('shelf-front');
    const canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 480;
    const context = canvas.getContext('2d')!;
    const source = texture.getSourceImage() as HTMLCanvasElement;
    // Match the existing front face and its three contact planes without moving the goods.
    const sourceRows = [0, 116, 232, 347, 516];
    const targetRows = [0, 126, 250, 346, 480];
    for (let row = 0; row < sourceRows.length - 1; row++) {
      context.drawImage(source, frame.cutX, frame.cutY + sourceRows[row], frame.cutWidth,
        sourceRows[row + 1] - sourceRows[row], 0, targetRows[row], canvas.width,
        targetRows[row + 1] - targetRows[row]);
    }
    this.textures.addCanvas(key, canvas);
    return key;
  }

  private roomGrowthTexture(): string {
    const key = 'chapter2-store-growth-room-v6';
    if (this.textures.exists(key)) return key;
    const texture = this.textures.get(ART.growth[0]);
    const frame = texture.get('growth-door');
    const canvas = document.createElement('canvas');
    canvas.width = frame.cutWidth;
    canvas.height = frame.cutHeight;
    const context = canvas.getContext('2d')!;
    context.filter = 'saturate(.68) sepia(.14) brightness(.92)';
    context.drawImage(
      texture.getSourceImage() as HTMLImageElement,
      frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
      0, 0, canvas.width, canvas.height,
    );
    this.textures.addCanvas(key, canvas);
    return key;
  }

  private text(
    parent: Phaser.GameObjects.Container,
    x: number,
    y: number,
    value: string,
    size = 16,
    color = '#f4ead2',
    width = 660,
    withEnglish = true,
  ): Phaser.GameObjects.Text {
    const compactSize = Math.max(9, Math.round(size * .82));
    const object = this.add.text(x, y, value, {
      fontFamily: '"Microsoft YaHei", sans-serif', fontSize: `${compactSize}px`, color,
      lineSpacing: 3, wordWrap: { width },
    }).setResolution(Math.max(2, window.devicePixelRatio || 1));
    parent.add(object);
    const englishText = this.add.text(x, y, '', {
      fontFamily: 'Georgia, serif',
      fontSize: `${Math.max(7, Math.round(size * .5))}px`,
      color: '#cdbfa8',
      lineSpacing: 1,
      wordWrap: { width },
    }).setAlpha(.9).setResolution(Math.max(2, window.devicePixelRatio || 1));
    parent.add(englishText);

    const anchor = { x, y };
    const originalSetOrigin = object.setOrigin.bind(object);
    const originalSetPosition = object.setPosition.bind(object);
    const originalSetText = object.setText.bind(object);
    const syncLayout = () => {
      const gap = englishText.text ? 3 : 0;
      const totalHeight = object.height + gap + englishText.height;
      const top = anchor.y - totalHeight * object.originY;
      originalSetPosition(anchor.x, top + object.height * object.originY);
      englishText
        .setOrigin(object.originX, object.originY)
        .setPosition(anchor.x, top + object.height + gap + englishText.height * object.originY);
    };
    object.setOrigin = ((originX?: number, originY?: number) => {
      originalSetOrigin(originX, originY);
      syncLayout();
      return object;
    }) as typeof object.setOrigin;
    object.setPosition = ((nextX?: number, nextY?: number) => {
      anchor.x = nextX ?? anchor.x;
      anchor.y = nextY ?? anchor.y;
      syncLayout();
      return object;
    }) as typeof object.setPosition;
    object.setText = ((next: string | string[]) => {
      const chinese = Array.isArray(next) ? next.join('\n') : next;
      originalSetText(chinese);
      englishText.setText(withEnglish ? english(chinese) : '');
      syncLayout();
      return object;
    }) as typeof object.setText;
    object.setText(value);
    return object;
  }

  /** 中文在左、英文在右的两栏对照：两列从同一行开始，英文不再挤进下一段中文之间。
   * 左栏带 `·` 列表记号时右栏同步补上，保持两侧排版一致。 */
  private textPair(
    parent: Phaser.GameObjects.Container,
    leftX: number,
    rightX: number,
    y: number,
    value: string,
    size: number,
    color: string,
    leftWidth: number,
    rightWidth: number,
    englishSize = Math.max(9, Math.round(size * .8)),
    englishColor = '#d8c9b0',
  ): void {
    this.text(parent, leftX, y, value, size, color, leftWidth, false);
    const translated = english(value);
    if (!translated) return;
    const bulleted = value.split('\n').every(line => line.trim().startsWith('·'));
    const right = bulleted ? translated.split('\n').map(line => `· ${line}`).join('\n') : translated;
    this.text(parent, rightX, y, right, englishSize, englishColor, rightWidth, false);
  }

  private box(
    parent: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    alpha = 1,
  ): Phaser.GameObjects.Rectangle {
    const object = this.add.rectangle(x, y, width, height, color, alpha).setStrokeStyle(1, 0xcbb98e, .45);
    parent.add(object);
    return object;
  }

  private art(
    parent: Phaser.GameObjects.Container,
    art: ArtKey,
    frame: string | undefined,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.Image {
    const image = this.add.image(x, y, ART[art][0], frame).setDisplaySize(width, height);
    if (parent === this.room && art !== 'background') image.setTint(0xe0d8c7);
    parent.add(image);
    return image;
  }

  private artFit(
    parent: Phaser.GameObjects.Container,
    art: ArtKey,
    frameName: string,
    x: number,
    y: number,
    maxWidth: number,
    maxHeight: number,
  ): Phaser.GameObjects.Image {
    const frame = this.textures.get(ART[art][0]).get(frameName);
    const scale = Math.min(maxWidth / frame.width, maxHeight / frame.height);
    return this.art(parent, art, frameName, x, y, frame.width * scale, frame.height * scale);
  }

  /** Align the visible, rotated pixels with the shelf, rather than the PNG's transparent margin. */
  private restOnSurface(image: Phaser.GameObjects.Image, surfaceY: number): void {
    const frame = image.frame;
    const canvas = document.createElement('canvas');
    canvas.width = frame.cutWidth;
    canvas.height = frame.cutHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image.texture.getSourceImage() as HTMLImageElement,
      frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let bottom = -Infinity;
    const sin = Math.sin(image.rotation), cos = Math.cos(image.rotation);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] < 128) continue;
        bottom = Math.max(bottom, (x - canvas.width / 2) * image.scaleX * sin
          + (y + 1 - canvas.height / 2) * image.scaleY * cos);
      }
    }
    if (Number.isFinite(bottom)) image.y = surfaceY - bottom;
  }

  /** 把母版中的一个运行时 frame 转成独立图片，供第一关同款 DOM 观察 UI 使用。 */
  private frameDataUrl(art: ArtKey, frameName: string, largestOnly = false): string {
    const texture = this.textures.get(ART[art][0]);
    const frame = texture.get(frameName);
    const source = texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const canvas = document.createElement('canvas');
    canvas.width = frame.cutWidth;
    canvas.height = frame.cutHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(
      source,
      frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
      0, 0, frame.cutWidth, frame.cutHeight,
    );
    // 个别母版里的相邻道具边缘挤进了矩形裁切区。观察近景只保留最大连通物件，
    // 这样兔子弹窗不会把旁边纸船的一小角一起带出来。
    if (largestOnly) {
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const seen = new Uint8Array(canvas.width * canvas.height);
      let largest: number[] = [];
      for (let start = 0; start < seen.length; start += 1) {
        if (seen[start] || image.data[start * 4 + 3] < 16) continue;
        const component: number[] = [];
        const queue = [start];
        seen[start] = 1;
        for (let head = 0; head < queue.length; head += 1) {
          const index = queue[head];
          component.push(index);
          const x = index % canvas.width;
          const y = Math.floor(index / canvas.width);
          const neighbours = [
            x > 0 ? index - 1 : -1,
            x + 1 < canvas.width ? index + 1 : -1,
            y > 0 ? index - canvas.width : -1,
            y + 1 < canvas.height ? index + canvas.width : -1,
          ];
          for (const next of neighbours) {
            if (next < 0 || seen[next] || image.data[next * 4 + 3] < 16) continue;
            seen[next] = 1;
            queue.push(next);
          }
        }
        if (component.length > largest.length) largest = component;
      }
      const keep = new Uint8Array(canvas.width * canvas.height);
      for (const index of largest) keep[index] = 1;
      for (let index = 0; index < keep.length; index += 1) {
        if (!keep[index]) image.data[index * 4 + 3] = 0;
      }
      context.putImageData(image, 0, 0);
    }
    return canvas.toDataURL('image/png');
  }

  private button(
    parent: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    action: () => void,
    width = 170,
    height = 40,
    labelSize = 15,
  ): Phaser.GameObjects.Rectangle {
    const object = this.box(parent, x, y, width, height, 0x3f3a35, .62)
      .setStrokeStyle(1, 0xd2b687, .58).setInteractive({ useHandCursor: true });
    this.text(parent, x, y, label, labelSize, '#f5ead4', width - 16).setOrigin(.5);
    object.on('pointerover', () => object.setFillStyle(0x62594f, .82).setStrokeStyle(1, 0xf1d4a1, .9));
    object.on('pointerout', () => object.setFillStyle(0x3f3a35, .62).setStrokeStyle(1, 0xd2b687, .58));
    object.on('pointerdown', action);
    return object;
  }

  private hotspot(x: number, y: number, width: number, height: number, label: string, action: () => void): void {
    const hit = this.add.rectangle(x, y, width, height, 0xf6dc93, this.debugHotspots ? .2 : .001)
      .setStrokeStyle(this.debugHotspots ? 2 : 0, 0xffdc7c, .9)
      .setInteractive({ useHandCursor: true });
    this.room.add(hit);
    if (this.debugHotspots) this.text(this.room, x, y, label, 11, '#fff0b6', width - 6).setOrigin(.5);
    hit.on('pointerdown', () => { if (!this.modal) action(); });
  }

  private clickableArt(
    art: ArtKey,
    frame: string,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    action: () => void,
  ): Phaser.GameObjects.Image {
    const image = this.art(this.room, art, frame, x, y, width, height).setInteractive({ useHandCursor: true });
    image.on('pointerover', () => image.setTint(0xf1e5ce));
    image.on('pointerout', () => image.setTint(0xe0d8c7));
    image.on('pointerdown', () => { if (!this.modal) action(); });
    if (this.debugHotspots) {
      const outline = this.add.rectangle(x, y, width, height, 0xffffff, 0).setStrokeStyle(2, 0xffdc7c, .9);
      this.room.add(outline);
      this.text(this.room, x, y - height / 2 - 12, label, 10, '#fff0b6').setOrigin(.5);
    }
    return image;
  }

  private drawRoom(): void {
    this.room?.destroy(true);
    this.room = this.add.container(0, 0);
    this.art(this.room, 'background', undefined, 480, 270, 960, 540);
    this.room.add(this.add.image(439, 263, this.roomCabinetTexture())
      .setDisplaySize(120, 240).setTint(0xbcb6a7));
    // 房间里只贴门框本身能容纳的窄幅部分；近景仍使用完整的成长刻度素材。
    this.clickableArt('growth', 'growth-door', 73, 218, 29, 360, '成长刻度', () => this.growth())
      .setTexture(this.roomGrowthTexture()).setDisplaySize(29, 360).clearTint();

    this.clickableArt('optional', 'award-paper', 374, 91, 85, 61, '三好学生奖状', () => {
      this.observe('三好学生', '韩梅梅虽然学习很好，但是也是真的很皮，妈妈拿她也没有什么办法。', 'optional', 'award-paper');
    });

    this.hotspot(489, 286, 250, 305, '谜题货架', () => this.shelf());
    // 李雷藏在第一排货架最里面，只从货架右侧露出一条竖向的半个屁股。
    this.art(this.room, 'lilei', 'lilei-shelf-slice', 598, 252, 28, 60).setFlipX(true);
    this.hotspot(592, 252, 34, 64, '货架后的小伙伴', () => {
      this.observe('货架后的小伙伴', '李雷撅个屁股偷偷在这个后面找什么好吃的呢。', 'lilei', 'lilei-peek');
    });

    // 货架解开前，九件谜题商品杂乱地散在三个空层；解开后按三行三列摆齐。
    const shelfSolved = this.flow.puzzle.phase !== 'shelf';
    const jitter = [-3, 2, -2, 2, -2, 1, -2, 3, -2];
    this.flow.puzzle.shelf.forEach((id, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const dx = shelfSolved ? 0 : jitter[index];
      const image = this.artFit(this.room, 'goods', `good-${id}`, 406 + column * 32 + dx, 0, 28, 39);
      image.setAngle(shelfSolved ? 0 : [-9, 7, -5, 8, 0, -7, 4, -8, 6][index]);
      this.restOnSurface(image, [212, 276, 322][row]);
    });

    // The new cabinet already contains its drawer; only add its interaction area.
    this.hotspot(438, 344, 102, 30, '收藏抽屉', () => {
      if (['collection', 'snack', 'memory'].includes(this.flow.stage)) this.collection();
      else showRoomItemNotice(this, '现在它打不开，能听到里面有一些弹珠的声音。');
    });

    const homeworkFrame = ['homework-done', 'magazine', 'map', 'shelf', 'collection', 'snack', 'memory'].includes(this.flow.stage)
      ? 'homework-solved' : 'homework-closed';
    this.clickableArt('story', homeworkFrame, 662, 325, 100, 55, '数学作业', () => this.homework());

    if (!['growth', 'growth-done', 'homework', 'homework-done'].includes(this.flow.stage)) {
      this.clickableArt('story', 'magazine-closed', 662, 322, 96, 55, '风景杂志', () => this.magazine());
    }

    this.clickableArt('optional', 'paper-boat', 744, 323, 48, 34, '纸船', () => {
      this.observe('作业旁的纸船', '除了写作业，所有的一切都很好玩。', 'optional', 'paper-boat');
    });
    this.clickableArt('optional', 'rabbit-eraser', 821, 329, 25, 29, '兔子橡皮', () => {
      this.observe('兔子橡皮', '题还没写完，橡皮已经被刻成了一只兔子。', 'optional', 'rabbit-eraser');
    });
    this.clickableArt('optional', 'candy-jar', 794, 294, 43, 57, '旧糖罐', () => {
      this.observe('旧糖罐', '这个玻璃糖罐是梅梅偷偷攒下的私房糖，连妈妈都不给。', 'optional', 'candy-jar');
    });

    if (this.snackShown) this.addSnack(false);
  }

  private panel(
    title: string,
    onClose?: () => void,
    copySide = false,
    compactSide = false,
    roomySide = false,
  ): Phaser.GameObjects.Container {
    this.modal?.destroy(true);
    const panel = this.add.container(0, 0).setDepth(50);
    this.modal = panel;
    this.onClose = onClose;
    if (this.inventory) this.inventory.element.style.visibility = 'hidden';
    const blurKey = 'chapter2-store-inspect-blur-v5';
    if (!this.textures.exists(blurKey)) {
      const canvas = document.createElement('canvas');
      canvas.width = 960; canvas.height = 540;
      const context = canvas.getContext('2d')!;
      context.filter = 'blur(8px) brightness(.79) saturate(.84)';
      context.drawImage(this.textures.get(ART.background[0]).getSourceImage() as HTMLImageElement, -16, -9, 992, 558);
      this.textures.addCanvas(blurKey, canvas);
    }
    const camera = this.cameras.main;
    const width = camera.width / camera.zoom, height = camera.height / camera.zoom;
    panel.add(this.add.image(480, 270, blurKey).setDisplaySize(width, height).setInteractive());
    if (copySide) this.box(panel, compactSide ? 710 : roomySide ? 690 : 700, compactSide ? 292 : 280,
      compactSide ? 420 : roomySide ? 500 : 450, compactSide ? 370 : roomySide ? 450 : 430, 0x27221f, .68)
      .setStrokeStyle(1, 0xc7aa7d, .18);
    const heading = this.text(panel, copySide ? (compactSide ? 710 : roomySide ? 690 : 700) : 92,
      copySide ? (compactSide ? 132 : 105) : 62, title, copySide ? (roomySide ? 25 : 21) : 20,
      '#f5ead4', copySide ? (compactSide ? 370 : 400) : 700);
    if (copySide) heading.setOrigin(.5);
    const close = this.text(panel, 910, 43, '×', 25, '#f2e5cb').setOrigin(.5).setInteractive({ useHandCursor: true });
    close.on('pointerover', () => close.setColor('#ffffff'));
    close.on('pointerout', () => close.setColor('#eadbb7'));
    close.on('pointerdown', () => this.close());
    return panel;
  }

  private close(): void {
    this.modal?.destroy(true);
    this.modal = undefined;
    const done = this.onClose;
    this.onClose = undefined;
    done?.();
    if (this.inventory) this.inventory.element.style.visibility = '';
    this.drawRoom();
  }

  private observe(title: string, body: string, art?: ArtKey, frame?: string): void {
    const overlay = showOtherRoomText(this, {
      title,
      imageUrl: art && frame ? this.frameDataUrl(art, frame, frame === 'rabbit-eraser') : undefined,
      imageAlt: title,
      entries: [{ text: body }],
    });
    const object = overlay.element.querySelector<HTMLElement>('.recall-room-text__object');
    if (object) Object.assign(object.style, { left: '200px', width: '330px' });
    if (art === 'lilei') {
      if (object) Object.assign(object.style, { left: '230px', width: '340px' });
      const copyPanel = overlay.element.querySelector<HTMLElement>('.recall-room-text__panel');
      if (copyPanel) copyPanel.style.left = '570px';
    }
  }

  private growth(): void {
    const overlay = showOtherRoomText(this, {
      title: '', imageUrl: this.frameDataUrl('growth', 'growth-full'),
      imageAlt: '门框上的刻度', entries: [{ text: '' }],
    });
    const root = overlay.element;
    root.setAttribute('aria-label', '查看成长记忆');
    const strip = root.querySelector<HTMLElement>('.recall-room-text__object')!;
    strip.style.cssText = 'position:absolute;left:138px;top:57px;width:98px;height:426px;pointer-events:auto';
    const copyPanel = root.querySelector<HTMLElement>('.recall-room-text__panel')!;
    const close = root.querySelector<HTMLButtonElement>('.recall-room-text__close')!;
    root.append(close);
    close.style.cssText = 'top:40px;right:56px;border:0;background:transparent;box-shadow:none;border-radius:0';
    copyPanel.querySelector('.recall-room-text__title')?.remove();
    Object.assign(copyPanel.style, {
      display: 'none', top: '156px', minHeight: '218px', height: '218px',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
    });
    const note = copyPanel.querySelector<HTMLElement>('.recall-room-text__copy')!;
    note.style.width = '100%';
    const detailImage = document.createElement('img');
    detailImage.style.cssText = 'position:absolute;left:320px;top:137px;width:250px;height:258px;object-fit:contain;display:none';
    root.append(detailImage);
    const hint = document.createElement('div');
    hint.textContent = '点击刻度，查看留下的记忆';
    hint.style.cssText = 'position:absolute;left:310px;top:465px;color:rgba(244,234,210,.52);font-size:15px;letter-spacing:1px;pointer-events:none';
    root.append(hint);
    const details = [
      { age: 5, frame: 'growth-5', top: 62, height: 13, body: '妈妈扶着尺子，韩梅梅偷偷踮起了脚。' },
      { age: 7, frame: 'growth-7', top: 46, height: 16, body: '李雷也留下了一道刻痕。两个人开始比谁长得快。' },
      { age: 12, frame: 'growth-12', top: 26, height: 20, body: '五年过去，他们已经比小时候高了一大截。' },
    ];
    for (const detail of details) {
      const hit = document.createElement('button');
      hit.type = 'button';
      hit.setAttribute('aria-label', `查看${detail.age}岁的刻度`);
      hit.style.cssText = `position:absolute;left:0;top:${detail.top}%;width:100%;height:${detail.height}%;border:0;padding:0;background:transparent;cursor:pointer`;
      hit.addEventListener('click', () => {
        this.flow.observeAge(detail.age);
        detailImage.src = this.frameDataUrl('growth', detail.frame);
        detailImage.alt = `${detail.age}岁的刻度`;
        detailImage.style.display = 'block';
        note.textContent = detail.body;
        copyPanel.style.display = 'flex';
        for (const other of strip.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === hit));
        if (this.flow.stage === 'snack' && this.flow.growthComplete && !this.snackShown) {
          window.setTimeout(() => {
            overlay.close();
            this.snackShown = true;
            this.addSnack(true);
          }, 500);
        }
      });
      strip.append(hit);
    }
  }

  private homework(): void {
    if (this.flow.stage !== 'homework') {
      this.observe('完成的作业', '鸡23只，兔12只。\n35个头，94只脚。作业已经完成。', 'story', 'homework-solved');
      return;
    }
    const panel = this.panel('数学作业 · 鸡兔同笼', () => this.flow.closeHomework(), true, false, true);
    const homework = this.artFit(panel, 'story', 'homework-open', 270, 286, 410, 300);
    this.text(panel, 470, 140, '笼子里有鸡和兔，共有35个头、94只脚。\n鸡和兔各有多少只？', 19, '#f5ead4', 435);
    const values = [0, 0];
    let selected = 0;
    const fields: Phaser.GameObjects.Text[] = [];
    const dots: Phaser.GameObjects.Arc[] = [];
    const underlines: Phaser.GameObjects.Rectangle[] = [];
    ['鸡', '兔'].forEach((name, index) => {
      const x = 590 + index * 205;
      const hit = this.add.rectangle(x, 270, 160, 80, 0xffffff, .001).setInteractive({ useHandCursor: true });
      panel.add(hit);
      hit.on('pointerdown', () => { selected = index; refresh(); });
      const dot = this.add.circle(x - 53, 246, 5, 0xd5b47e, 1);
      panel.add(dot); dots.push(dot);
      this.text(panel, x - 36, 246, name, 15, '#f5ead4', 70).setOrigin(0, .5);
      fields.push(this.text(panel, x - 10, 292, '0', 25, '#fff1d8', 90).setOrigin(.5));
      this.text(panel, x + 34, 298, '只', 13, '#f0e3ca', 42).setOrigin(.5);
      const underline = this.add.rectangle(x, 320, 145, 2, 0xbba079, .4);
      panel.add(underline); underlines.push(underline);
    });
    const refresh = () => fields.forEach((field, index) => {
      field.setText(String(values[index])).setColor(selected === index ? '#fff1d8' : '#ddd2c0');
      dots[index].setFillStyle(selected === index ? 0xe2be82 : 0x8a8177, selected === index ? 1 : .45);
      underlines[index].setFillStyle(selected === index ? 0xd7b57e : 0x8a8177, selected === index ? .9 : .4);
    });
    refresh();
    // 数字键盘整体下移并收窄：题干与作答区之间留出空隙，键盘不再顶到最上排。
    for (let number = 0; number < 10; number++) {
      this.button(panel, 578 + number % 5 * 56, 354 + Math.floor(number / 5) * 46, String(number), () => {
        values[selected] = (values[selected] * 10 + number) % 100;
        refresh();
      }, 48, 42, 14);
    }
    const result = this.text(panel, 500, 430, '', 12, '#d8bd91', 390);
    this.button(panel, 610, 466, '清空选中项', () => { values[selected] = 0; refresh(); }, 145);
    this.button(panel, 795, 466, '交作业', () => {
      if (!this.flow.answer(values[0], values[1])) {
        result.setText('再算算：头数相加是35，脚数相加要是94。');
        return;
      }
      homework.setFrame('homework-solved');
      this.box(panel, 480, 270, 842, 450, 0x201d1b, .76).setInteractive();
      this.text(panel, 480, 270, '✓', 118, '#87d38f').setOrigin(.5);
      this.time.delayedCall(900, () => { if (this.modal === panel) this.close(); });
    }, 112);
  }

  private magazine(): void {
    if (['growth', 'growth-done', 'homework', 'homework-done'].includes(this.flow.stage)) return;
    if (this.flow.hasMap) { this.showMap(); return; }
    const panel = this.panel('');
    this.artFit(panel, 'story', 'magazine-open', 270, 285, 410, 330);
    this.box(panel, 700, 285, 420, 175, 0x27221f, .68).setStrokeStyle(1, 0xc7aa7d, .18);
    this.text(panel, 710, 266, '海的另外一边是什么样子呢？', 19, '#f5ead4', 350).setOrigin(.5);
    this.text(panel, 710, 309, '这句话写在杂志的页边。', 13, '#cdbb9e', 350).setOrigin(.5);
    const next = this.text(panel, 464, 404, '›', 38, '#eee2c8', 40)
      .setAlpha(.52).setOrigin(.5).setInteractive({ useHandCursor: true });
    next.on('pointerover', () => next.setAlpha(.9));
    next.on('pointerout', () => next.setAlpha(.52));
    next.on('pointerdown', () => this.showMap(true));
  }

  private showMap(collect = false): void {
    const panel = this.panel('', undefined, true, true);
    this.artFit(panel, 'story', 'map-open', 270, 285, 410, 325);
    const clueText = CLUES.map(line => `· ${line}`).join('\n');
    const mapNote = this.flow.hasMap
      ? '平面图已放进物品栏。关闭后点击中间货架。'
      : '杂志夹页里藏着一张手画的货架平面图。';
    this.text(panel, 520, 130, '小卖部货架平面图', 17, '#f5ead4', 180, false).setOrigin(0, .5);
    this.text(panel, 712, 130, english('小卖部货架平面图'), 15, '#d8c9b0', 195, false).setOrigin(0, .5);
    this.text(panel, 520, 170, '图上的记号', 14, '#e4c99b', 180, false);
    this.text(panel, 712, 170, english('图上的记号'), 12, '#cdbfa8', 195, false);
    this.text(panel, 520, 202, clueText, 11, '#f0e4ce', 175, false);
    this.text(panel, 712, 202, english(clueText), 10, '#d8c9b0', 195, false);
    this.text(panel, 520, 382, mapNote, 11, '#d8bd91', 175, false);
    this.text(panel, 712, 382, english(mapNote), 10, '#cdbfa8', 195, false);
    if (collect && !this.flow.hasMap) {
      this.button(panel, 710, 438, '收进物品栏', () => {
        this.flow.discoverMap();
        this.inventory?.addItem({
          id: 'shelf-map', glyph: '图', label: '货架图', imageUrl: this.frameDataUrl('story', 'map-open'),
        });
        this.inventory?.setExpanded(true);
        this.close();
      }, 220);
    }
  }

  private shelf(message = ''): void {
    this.flow.enterShelf();
    if (!['shelf', 'collection', 'snack', 'memory'].includes(this.flow.stage)) {
      showRoomItemNotice(this, this.flow.stage === 'homework'
        ? '先把桌上的作业完成吧。'
        : '翻翻杂志，找到货架的平面图吧。');
      return;
    }
    if (this.flow.stage !== 'shelf') { this.collection(); return; }
    const puzzle = this.flow.puzzle;
    if (puzzle.phase === 'trace') { this.traceCaps(); return; }
    const panel = this.panel('整理货架', undefined, true);
    this.art(panel, 'cabinet', 'shelf-front', 250, 286, 330, 470).setTint(0xe0d8c7);
    // 中文左栏 / 英文右栏，两栏逐段对齐。
    // 底板是 475..925（见 panel()），两栏各留 30px 内边距，文字不贴框。
    const copyLeft = 505;
    const copyRight = 693;
    const copyLeftWidth = 176;
    const copyRightWidth = 202;
    this.textPair(panel, copyLeft, copyRight, 130, '根据平面图交换商品的位置。\n中间的干脆面不能移动。',
      15, '#f5ead4', copyLeftWidth, copyRightWidth);
    puzzle.shelf.forEach((id, index) => {
      const x = 170 + index % 3 * 80;
      const surfaceY = [170, 279, 387][Math.floor(index / 3)];
      const tile = this.box(panel, x, surfaceY - 32, 70, 72, 0xffe099, this.selectedCell === index ? .12 : 0)
        .setStrokeStyle(this.selectedCell === index ? 2 : 0, 0xffe099, .85);
      const item = this.artFit(panel, 'goods', `good-${id}`, x, 0, 60, 70).setTint(0xeee2ce);
      this.restOnSurface(item, surfaceY);
      if (FIXED.includes(index)) this.text(panel, x + 26, surfaceY - 62, '●', 8, '#ffe09e').setOrigin(.5);
      tile.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (FIXED.includes(index)) {
          this.selectedCell = -1;
          this.shelf('中间的干脆面是固定参照，不能移动。');
          return;
        }
        if (this.selectedCell < 0) this.selectedCell = index;
        else {
          puzzle.swap(this.selectedCell, index);
          this.selectedCell = -1;
        }
        this.shelf();
      });
    });
    this.textPair(panel, copyLeft, copyRight, 200, '摆放线索', 17, '#e4c99b', copyLeftWidth, copyRightWidth);
    this.textPair(panel, copyLeft, copyRight, 236, CLUES.map(line => `· ${line}`).join('\n'),
      13, '#f0e4ce', copyLeftWidth, copyRightWidth);
    this.textPair(panel, copyLeft, copyRight, 410, message || '先选一件，再选择另一件交换位置。',
      13, '#d8bd91', copyLeftWidth, copyRightWidth);
    this.button(panel, 710, 462, '检查货架', () => {
      this.selectedCell = -1;
      if (puzzle.checkShelf()) this.traceCaps();
      else this.shelf('还有线索没有对上，再检查商品之间的位置。');
    }, 220);
  }

  private traceCaps(): void {
    const puzzle = this.flow.puzzle;
    const panel = this.panel('瓶盖一笔挑战');
    this.text(panel, 110, 105, '每条连线只能走一次。点住任意瓶盖开始，不能抬手，也不能重复走线。', 14, '#f0e5ce', 720);
    const network = this.add.graphics().lineStyle(4, 0x87927f, .9);
    panel.add(network);
    CAP_EDGES.forEach(([a, b]) => network.lineBetween(CAP_POINTS[a][0], CAP_POINTS[a][1], CAP_POINTS[b][0], CAP_POINTS[b][1]));
    const nodes = CAP_POINTS.map(([x, y], index) => {
      const id = puzzle.shelf[index];
      this.artFit(panel, 'goods', `cap-${id}`, x, y, 70, 58);
      return { x, y };
    });
    const ink = this.add.graphics().lineStyle(7, 0xe94c43, 1);
    panel.add(ink);
    const hint = this.text(panel, 118, 456, '从任意瓶盖开始，想好岔路的顺序。', 14, '#f2d79d', 700);
    let activeId = -1;
    let finished = false;
    let previous: { x: number; y: number } | undefined;
    const point = (pointer: Phaser.Input.Pointer) => {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      return { x: world.x, y: world.y };
    };
    const nearest = (pointer: Phaser.Input.Pointer) => {
      const world = point(pointer);
      let best = -1;
      let distance = 38;
      nodes.forEach((node, index) => {
        const next = Phaser.Math.Distance.Between(world.x, world.y, node.x, node.y);
        if (next < distance) { best = index; distance = next; }
      });
      return best;
    };
    const down = (pointer: Phaser.Input.Pointer) => {
      if (finished || this.modal !== panel || puzzle.drawing) return;
      const node = nearest(pointer);
      if (node < 0 || !puzzle.beginTrace(node)) {
        hint.setText('要从一个瓶盖上按住开始。');
        return;
      }
      activeId = pointer.id;
      previous = point(pointer);
      ink.clear().lineStyle(7, 0xe94c43, 1);
      hint.setText('沿连接线继续画；每条线只能经过一次。');
    };
    const move = (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== activeId || !puzzle.drawing || !previous) return;
      const now = point(pointer);
      ink.lineBetween(previous.x, previous.y, now.x, now.y);
      previous = now;
      const node = nearest(pointer);
      const last = puzzle.path.at(-1);
      if (node >= 0 && node !== last && puzzle.visit(node)) {
        hint.setText(`已走 ${puzzle.used.size}/${CAP_EDGES.length} 条连接`);
      }
    };
    const up = (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== activeId || finished || !puzzle.drawing) return;
      if (puzzle.endTrace()) {
        finished = true;
        this.flow.finishShelf();
        hint.setText('路线完成了！收藏抽屉打开了。');
        this.time.delayedCall(650, () => {
          if (this.modal === panel) { this.close(); this.collection(); }
        });
      } else {
        ink.clear().lineStyle(7, 0xe94c43, 1);
        hint.setText('还没走完所有连线，从任意瓶盖重新尝试。');
      }
      activeId = -1;
      previous = undefined;
    };
    this.input.on('pointerdown', down);
    this.input.on('pointermove', move);
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
    panel.once('destroy', () => {
      puzzle.cancelTrace();
      this.input.off('pointerdown', down);
      this.input.off('pointermove', move);
      this.input.off('pointerup', up);
      this.input.off('pointerupoutside', up);
    });
  }

  private collection(): void {
    const panel = this.panel('');
    this.box(panel, 480, 52, 470, 44, 0x27221f, .42).setStrokeStyle(1, 0xc7aa7d, .24);
    this.text(panel, 480, 52, '这个小抽屉，已经装了他们五年的小秘密。', 18, '#f5ead4', 440)
      .setOrigin(.5).setFontStyle('bold');
    this.art(panel, 'collection', 'drawer-filled', 480, 220, 350, 270);
    const items: readonly [string, string, number][] = [
      ['toy-dragonfly', '旧蜻蜓玩具', 185], ['marbles', '玻璃弹珠', 380],
      ['cards-boats', '折皱的卡片和纸鹤', 580], ['old-snacks-caps', '吃一半的零食和旧瓶盖', 780],
    ];
    for (const [frame, label, x] of items) {
      this.art(panel, 'collection', frame, x, 365, 150, 110);
      this.text(panel, x, 425, label, 12, '#f0e5ce', 170).setOrigin(.5);
    }
    this.button(panel, 740, 495, '收好这些回忆', () => {
      const first = this.flow.stage === 'collection';
      this.flow.viewCollection();
      this.close();
      if (first) {
        if (this.flow.growthComplete) {
          this.snackShown = true;
          this.addSnack(true);
        } else {
          showRoomItemNotice(this, '请点开门框上的刻度，看一看他们成长留下的痕迹。');
        }
      }
    }, 220);
  }

  private addSnack(fall: boolean): void {
    const snack = this.add.container(520, fall ? 210 : 435);
    this.room.add(snack);
    const packet = this.art(snack, 'collection', fall ? 'snack-sealed' : 'snack-flat', 0, 0, 120, 128)
      .setInteractive({ useHandCursor: true });
    const enterMemory = () => {
      if (this.modal || !this.flow.takeSnack()) return;
      this.snackShown = false;
      this.tweens.killTweensOf(snack);
      this.scene.start('chapter2-memory');
    };
    packet.on('pointerdown', enterMemory);
    if (fall) {
      this.tweens.add({
        targets: snack, y: 435, duration: 950, ease: 'Bounce.easeOut',
        onComplete: () => {
          packet.setFrame('snack-flat').setDisplaySize(142, 98);
        },
      });
    }
  }
}


