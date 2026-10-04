import Phaser from 'phaser';
import { Sfx } from '../systems/Sfx';
import { Effects } from '../gameplay/Effects';
import type { ChapterOneRoomProgress } from '../gameplay/ChapterOneRoomProgress';
import { ChapterOneRoomSession } from '../gameplay/ChapterOneRoomSession';
import {
  canAwardRoomFragment,
  canCollectFlashlightBattery,
  canCollectPhotoMissingPiece,
  canDrawWind,
  canOpenShadowBoatPuzzle,
  canPowerFlashlight,
  hasAllRoomFragments,
  type ChapterOneRoomEvent,
} from '../gameplay/ChapterOneRoomRules';
import { applyHDCamera, bufferScaleOf } from '../systems/Resolution';
import { showClockPuzzleUI } from '../ui/ClockPuzzleUI';
import { showRadioPuzzleUI, type RadioPuzzleHandle } from '../ui/RadioPuzzleUI';
import { createFragmentHud, type FragmentHudHandle } from '../ui/FragmentHud';
import {
  createRoomInventoryUI,
  type RoomInventoryItem,
  type RoomInventoryUIHandle,
} from '../ui/RoomInventoryUI';
import { showShadowBoatPuzzleUI, type ShadowBoatPuzzleHandle } from '../ui/ShadowBoatPuzzleUI';
import { setBackgroundMusicTemporarilyPaused } from '../MusicSettings';
import {
  showPhotoMemoryText,
  showFishBasinText,
  showOtherRoomText,
} from '../ui/RoomInteractionCopy';
import { createGameHud, type GameHudHandle } from '../ui/GameHud';
import { showRoomDeskPopup, type RoomDeskPopupHandle } from '../ui/RoomDeskPopup';
import { resolveImageUrl } from '../assets';
import { loadAudioInBackground } from '../systems/DeferredAudio';
import roomBackgroundUrl from '../../scene/level1-memory-room-night-empty-v2-1920x1080.png?url';
import photoFrameUrl from '../../assets/story/seek-childhood-photo-placeholder.svg?url';
import { RADIO_PREVIEW_MS } from '../story/ChapterOneStory';
import flashlightOffUrl from '../../assets/environment/room-flashlight-off.png?url';
import flashlightOnUrl from '../../assets/environment/room-flashlight-on.png?url';
import paintBrushUrl from '../../assets/items/room-paint-brush.png?url';
import radioStaticUrl from '../../assets/audio/radio-static.mp3?url';
import radioWindUrl from '../../assets/audio/radio-wind.mp3?url';

const ROOM_WIDTH = 960;
const ROOM_HEIGHT = 540;
const ROOM_BG_WIDTH = 960;
const ROOM_BG_HEIGHT = 540;

const GOLD = 0xe6cf97;
/** 照片拼图棋盘几何（左侧相框 408×272 + 右侧托盘的散件拖放布局）——
 *  openPuzzle 与完成演出共用，防止两处几何漂移 */
const PUZZLE_BOARD = { x: 48, y: 126, cellW: 102, cellH: 68 };
/** 物件整体微降的暖色调：向水彩背景的环境色靠拢，削弱“另一张贴图层”的感觉 */
const OBJECT_TINT = 0xf2ecdf;

type ObjectKind = 'radio' | 'photo' | 'fish' | 'book' | 'desk';

interface RoomObjectDef {
  kind: ObjectKind;
  texture: string;
  /** center=按可见中心挂墙；bottom=按可见底部贴桌面/地面 */
  anchor: 'center' | 'bottom';
  /** 锚点世界坐标（center：可见中心；bottom：可见底部接地点） */
  x: number;
  y: number;
  /** 期望可见高/宽（px，按美术交互预览图 1:2 换算） */
  targetH?: number;
  targetW?: number;
  depth: number;
  /** 地面接触阴影（仅落地的大件；桌面小件靠背景自带的家具明暗） */
  shadow?: boolean;
}

/** The room art already contains every inspectable object; no duplicate prop layer. */
const OBJECT_DEFS: RoomObjectDef[] = [];

interface VisibleBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  w: number;
  h: number;
}

const BBOX_CACHE = new Map<string, VisibleBox>();

/** 纹理不透明像素包围盒：摆件按“可见像素”贴家具，自动吃掉美术 PNG 的透明留白 */
function visibleBounds(scene: Phaser.Scene, key: string): VisibleBox {
  const cached = BBOX_CACHE.get(key);
  if (cached) return cached;
  const source = scene.textures.get(key).getSourceImage() as
    CanvasImageSource & { width: number; height: number };
  const w = source.width;
  const h = source.height;
  const box: VisibleBox = { left: 0, top: 0, right: w - 1, bottom: h - 1, w, h };
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(source, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    let left = w;
    let right = -1;
    let top = h;
    let bottom = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 24) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    if (right >= left) {
      box.left = left;
      box.top = top;
      box.right = right;
      box.bottom = bottom;
    }
  }
  BBOX_CACHE.set(key, box);
  return box;
}

export default class RoomScene extends Phaser.Scene {
  private sfx!: Sfx;
  private hintText!: Phaser.GameObjects.Text;
  private hudLayer!: Phaser.GameObjects.Container;
  private fragmentHud?: FragmentHudHandle;
  private inventoryBar?: RoomInventoryUIHandle;
  private shadowBoatPanel?: ShadowBoatPuzzleHandle;
  private deskPopup?: RoomDeskPopupHandle;
  private gameHud!: GameHudHandle;
  private fragments = new Set<string>();
  private progressSession!: ChapterOneRoomSession;
  private missingPhotoSprite?: Phaser.GameObjects.Image;
  private wallPicture?: Phaser.GameObjects.Image;
  private memoryOrb: Phaser.GameObjects.Container | null = null;
  private roomProgressProps?: Phaser.GameObjects.Container;
  private orbTouched = false;
  /** 有面板（拼图/收音机/时钟/文字）打开时锁定其它交互 */
  private interacting = false;
  private panel: Phaser.GameObjects.Container | null = null;
  private radioPanel?: RadioPuzzleHandle;
  private hintTimer?: Phaser.Time.TimerEvent;
  private hintFade?: Phaser.Tweens.Tween;
  private progressSaveWarningShown = false;
  private progressStorageUnavailable = false;
  /** 拼图已解开（锁输入，播完成效果） */
  private puzzleSolved = false;
  /** hudLayer 随渲染缓冲重缩放的处理器（场景关闭时解绑） */
  private hudSyncHandler?: () => void;
  /** 记忆球/收音机打开时的动态灯（场景 shutdown 会清空 LightsManager，重启重建） */
  private orbLight?: Phaser.GameObjects.Light;
  private radioLight?: Phaser.GameObjects.Light;
  private radioSound?: Phaser.Sound.BaseSound;
  private radioPreviewTimer?: Phaser.Time.TimerEvent;
  /** 电台音频按需加载的请求序号：切频道/关面板时 +1，作废在飞的回调 */
  private radioRequestId = 0;

  private get progress(): ChapterOneRoomProgress {
    return this.progressSession.state;
  }

  constructor() {
    super('room');
  }

  preload(): void {
    const images: Array<[string, string]> = ([
      ['room-bg', roomBackgroundUrl],
      ['room-radio-art', 'assets/environment/room-vintage-cassette-recorder-perspective-v1.png'],
      ['room-book-art', 'assets/items/room-fairytale-book-perspective-v1.png'],
      ['room-frame-art', 'assets/environment/room-photo-frame-perspective-v1.png'],
      ['room-box-closed-art', 'assets/environment/room-lockbox-closed-perspective-v1.png'],
      ['room-box-open-art', 'assets/environment/room-lockbox-open-empty-perspective-v1.png'],
      ['room-battery-art', 'assets/items/room-flashlight-battery-perspective-v1.png'],
      ['room-aquarium-art', 'assets/environment/room-hermit-crab-aquarium-perspective-v1.png'],
      ['room-wall-drawing-incomplete', 'assets/environment/room-wall-drawing-incomplete.png'],
      ['room-wall-drawing-complete', 'assets/environment/room-wall-drawing-complete.png'],
      ['room-photo', photoFrameUrl],
      ['room-flashlight-off', flashlightOffUrl],
      ['room-flashlight-on', flashlightOnUrl],
      ['room-paint-brush', paintBrushUrl],
    ] as Array<[string, string]>).map(([key, path]) => [key, resolveImageUrl(path)] as [string, string]);
    for (const [key, url] of images) {
      if (!this.textures.exists(key)) {
        this.load.image(key, url);
      }
    }
    // 电台音频（radio-static 206KB + radio-wind 453KB）不进 preload：
    // 玩家不去碰录音机就不该付这份下载。openRadio() 里按需后台加载。
  }

  /** 录音机两个频道的音频源（按需加载用；key 与 playRadioAudio 一致） */
  private static readonly RADIO_AUDIO: Record<string, string> = {
    'radio-static': radioStaticUrl,
    'radio-wind': radioWindUrl,
  };

  create(): void {
    this.stopRadioAudio();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stopRadioAudio());
    // Gameplay 进度由场景外的持久层管理，场景重进只重建显示状态。
    this.progressSession = ChapterOneRoomSession.restore();
    this.progressSaveWarningShown = false;
    this.progressStorageUnavailable = false;
    this.fragments = new Set(this.progress.fragments);
    this.fragmentHud?.destroy();
    this.fragmentHud = undefined;
    this.inventoryBar?.destroy();
    this.inventoryBar = undefined;
    this.shadowBoatPanel?.close();
    this.shadowBoatPanel = undefined;
    this.memoryOrb = null;
    this.orbTouched = false;
    this.interacting = false;
    this.panel?.destroy();
    this.panel = null;
    this.radioPanel = undefined;
    this.hintTimer?.remove();
    this.hintFade?.remove();
    this.hintTimer = undefined;
    this.hintFade = undefined;
    this.orbLight = undefined;
    this.radioLight = undefined;
    this.puzzleSolved = false;

    applyHDCamera(this);

    // 光影（依据 3.90 源码 LightPipeline/Light-frag，相机 zoom 感知、无法线图也能漫反射）：
    // 只有背景走 Light2D 管线，环境光压一档，再用“有来源”的灯把重点区域点亮；
    // 物件不切管线保持清晰。WebGL 专属：Canvas 回退时背景按原图渲染、只是无光效，不会黑图。
    this.lights.enable().setAmbientColor(0xd8d0c0);
    this.add.image(ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 'room-bg')
      .setDisplaySize(ROOM_BG_WIDTH, ROOM_BG_HEIGHT)
      .setDepth(0);
    this.lights.addLight(150, 250, 330, 0xbcd4de, 0.35); // 左侧窗外的冷天光
    this.lights.addLight(505, 320, 300, 0xffe0b0, 0.5); // 方桌上方的暖主光
    this.lights.addLight(780, 320, 260, 0xffd9a8, 0.28); // 右侧柜面的暖补光

    this.buildWindowDust();

    this.sfx = new Sfx(this, { ambient: false }); // 室内：无风声鸟鸣

    this.buildNewRoomAssets();
    this.buildObjects();
    this.buildHud();
    this.restoreInventory();
    this.restoreFragmentHud();
    this.installRoomProgressObjects();
    this.spawnMissingPhotoPiece();
    if (hasAllRoomFragments(this.progress)) this.spawnMemoryOrb();

    // Explicit visual-review route; never appears in normal play or as a keyboard shortcut.
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'shadow') {
      this.time.delayedCall(100, () => this.openShadowBoatVisualPreview());
    }

    this.cameras.main.fadeIn(250, 20, 18, 26);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__roomScene = this;
    }
  }

  /** 窗光里的浮尘：房间没有角色后，画面保有一点缓慢的“活”感 */
  private buildWindowDust(): void {
    for (let i = 0; i < 7; i++) {
      const mote = this.add
        .ellipse(70 + Math.random() * 210, 150 + Math.random() * 170, 3, 3, 0xfff6df, 0.14)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(0.2);
      this.tweens.add({
        targets: mote,
        x: mote.x + 26,
        y: mote.y - 44,
        duration: 6000 + i * 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 500,
      });
    }
  }

  /** 夜景底图自带家具；独立道具按家具支撑面摆放，而非按 PNG 画布中心估坐标。 */
  private buildNewRoomAssets(): void {
    // 队友确认这两张就是年年的画：挂在中央空墙；这是墙面画，不是书桌或家具道具。
    // 空墙在 1:2 缓冲坐标中只有约 180px 宽；旧版 160px 几乎铺满墙面，比例显得失真。
    // 保留原画内容，只缩小并补一圈窄木框，让它与书架/窗框的建筑尺度一致。
    this.add.rectangle(526, 160, 124, 92, 0x241b18, 0.72)
      .setStrokeStyle(2, 0x5a4433, 0.9)
      .setDepth(0.8);
    this.wallPicture = this.add.image(
      526,
      160,
      this.progress.shadowBoatSolved ? 'room-wall-drawing-complete' : 'room-wall-drawing-incomplete',
    ).setDisplaySize(116, 84).setDepth(0.9).setTint(0xc4ccd6);

    // 先确定“物件底部接触家具的哪条边”，再用透明像素 bbox 锚定；可见宽度按承托面留边。
    // 按队友视频里的指点：书放书柜上层、录音机与锁盒放中层、鱼缸放最右侧柜面。
    // 全部沿用队友原始 PNG；这里只统一实际家具支撑面、间距与显示尺度。
    this.addSupportedRoomProp('room-book-art', 720, 180, 32, 2);
    this.addSupportedRoomProp('room-radio-art', 695, 250, 58, 2);
    this.addSupportedRoomProp('room-aquarium-art', 872, 340, 52, 2);
  }

  /** 将透明 PNG 的可见像素水平居中，并让可见底缘恰好接触家具支撑面。 */
  private addSupportedRoomProp(
    texture: string,
    centerX: number,
    surfaceY: number,
    visibleWidth: number,
    depth: number,
  ): Phaser.GameObjects.Image {
    const bounds = visibleBounds(this, texture);
    const source = this.textures.get(texture).getSourceImage() as { width: number; height: number };
    const scale = visibleWidth / bounds.w;
    const visibleCenterX = (bounds.left + bounds.right) / 2;
    const imageX = centerX - (visibleCenterX - (source.width - 1) / 2) * scale;
    const imageY = surfaceY - (bounds.bottom - (source.height - 1) / 2) * scale;
    return this.add.image(imageX, imageY, texture)
      .setDisplaySize(source.width * scale, source.height * scale)
      .setDepth(depth);
  }

  /** 六个可点击物件：按美术预览落位（可见像素贴家具），微降色调融入画面 + 极淡悬停微光 */
  private buildObjects(): void {
    for (const def of OBJECT_DEFS) {
      const box = visibleBounds(this, def.texture);
      const vw0 = box.right - box.left + 1;
      const vh0 = box.bottom - box.top + 1;
      const scale = def.targetH !== undefined ? def.targetH / vh0 : (def.targetW ?? vh0) / vw0;
      const vw = vw0 * scale;
      const vh = vh0 * scale;
      // 把“可见像素”的中心/底部对到锚点（补偿 PNG 透明留白）
      const offX = (box.left + box.right + 1) / 2 - box.w / 2;
      const img = this.add
        .image(def.x - offX * scale, 0, def.texture)
        .setScale(scale)
        .setDepth(def.depth)
        .setTint(OBJECT_TINT);
      if (def.anchor === 'bottom') {
        img.setOrigin(0.5, 1);
        img.y = def.y + (box.h - 1 - box.bottom) * scale;
      } else {
        img.setOrigin(0.5, 0.5);
        img.y = def.y - ((box.top + box.bottom + 1) / 2 - box.h / 2) * scale;
      }
      const cy = def.anchor === 'bottom' ? def.y - vh / 2 : def.y;

      if (def.shadow) {
        // 只给落地大件一滩很淡的软影；桌面小件靠背景自带的家具明暗，避免贴纸感
        this.add
          .ellipse(def.x, def.y + 2, vw * 0.8, 9, 0x0c1512, 0.16)
          .setDepth(def.depth - 0.15);
      }
      // 悬停只保留极淡的暖金微光（不再缩放整张图，缩放会暴露“独立图层”）；
      // 隐形热区与视觉尺寸解耦，小物件也容易点中
      const glow = this.add
        .ellipse(def.x, cy, Math.max(vw * 1.35, 40), Math.max(vh * 1.2, 34), GOLD, 0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(def.depth - 0.05);
      const hit = this.add
        .rectangle(def.x, cy, Math.max(vw + 24, 50), Math.max(vh + 20, 46), 0x000000, 0)
        .setDepth(def.depth + 0.1)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => {
        if (this.interacting) return;
        this.tweens.add({ targets: glow, alpha: 0.12, duration: 140 });
      });
      hit.on('pointerout', () => {
        this.tweens.add({ targets: glow, alpha: 0, duration: 180 });
      });
      hit.on('pointerdown', () => this.onObjectClicked(def));
    }

    // Invisible inspect targets follow the already-painted objects in the room art.
    // This avoids drawing a second clock/radio/photo/calendar over the same illustration.
    const inspectTargets: Array<{ kind: ObjectKind; x: number; y: number; w: number; h: number }> = [
      { kind: 'radio', x: 695, y: 231, w: 66, h: 46 },
      // 相框热区贴合可见画框；与下方木盒热区留出间隔。
      { kind: 'photo', x: 782, y: 198, w: 44, h: 34 },
      { kind: 'fish', x: 872, y: 314, w: 64, h: 58 },
      { kind: 'book', x: 720, y: 156, w: 48, h: 50 },
      // 点击底图中已有的桌子，弹出独立书桌近景；不把另一张桌子贴回房间。
      { kind: 'desk', x: 480, y: 292, w: 270, h: 62 },
    ];
    for (const target of inspectTargets) {
      this.add.rectangle(target.x, target.y, target.w, target.h, 0x000000, 0)
        .setDepth(9)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.onObjectClicked({
          kind: target.kind, texture: '', anchor: 'center', x: target.x, y: target.y, depth: 9,
        }));
    }
  }

  private onObjectClicked(def: RoomObjectDef): void {
    if (this.interacting || this.orbTouched) {
      return;
    }
    this.openObject(def.kind);
  }

  private openObject(kind: ObjectKind): void {
    switch (kind) {
      case 'fish':
        this.openDomPanel(() => showFishBasinText(this));
        break;
      case 'book':
        this.openDomPanel(() => showOtherRoomText(this, {
          title: '童话书',
          entries: [{ text: '书页已经泛黄，边角被反复翻阅得柔软了。' }],
        }));
        break;
      case 'desk':
        this.openDeskPopup();
        break;
      case 'photo':
        if (this.progress.photoSolved) {
          this.openDomPanel(() => showPhotoMemoryText(this, photoFrameUrl));
        } else {
          this.openPuzzle();
        }
        break;
      case 'radio':
        if (this.progress.radioMessageHeard) {
          this.openDomPanel(() =>
            showOtherRoomText(this, {
              title: '卧室里的录音机',
              entries: [{ text: '录音机关联的记忆碎片已经找齐。正式录音内容待制作。' }],
            }),
          );
        } else {
          this.openRadio();
        }
        break;
    }
  }

  /** DOM 文字面板（D 的组件）：打开时暂停场景，面板关闭（场景 resume）后解锁交互 */
  private openDomPanel(open: () => { element?: HTMLElement; close: () => void }): void {
    this.interacting = true;
    const handle = open();
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      this.interacting = false;
      this.events.off(Phaser.Scenes.Events.RESUME, unlock);
    };
    this.events.once(Phaser.Scenes.Events.RESUME, unlock);
    const element = handle?.element;
    if (element) {
      const observer = new MutationObserver(() => {
        if (!document.body.contains(element)) {
          observer.disconnect();
          unlock();
        }
      });
      observer.observe(document.body, { childList: true });
    }
  }


  // ---------- 照片拼图（散件拖放） ----------

  /** 照片拼图：16 块碎片散放在右侧托盘，每块**独立拖拽**；拖到相框里正确的
   * 格子附近自动吸住锁定（金边一闪），放错弹回托盘——全部归位即完成。
   * （2026-09-24 重构：碎片是独立物件，替换原 4×4 滑块换位玩法。） */
  private openPuzzle(): void {
    this.interacting = true;
    const layer = this.add.container(0, 0).setDepth(200);
    this.panel = layer;

    this.panelBackdrop(layer);
    layer.add(this.panelTitle(480, 58, '把照片拼回原样'));
    layer.add(
      this.add
        .text(480, 82, '把碎片拖回相框 · 放对位置会自动吸住', {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          color: '#cbb98a',
        })
        .setOrigin(0.5),
    );
    // × 放在 D 的碎片 HUD 挂件（右上 DOM，逻辑区 y 13..73）正下方：
    // 原先 (922,34) 与挂件重叠，× 被毛玻璃压得发糊（HUD 设了 pointer-events:none
    // 不挡点击，但视觉干扰，2026-09-24 实机确认后下移）
    this.addCloseButton(layer, 922, 92);

    const photoSource = this.textures.get('room-photo').getSourceImage() as { width: number; height: number };
    const srcW = photoSource.width / 4;
    const srcH = photoSource.height / 4;
    const { x: boardX, y: boardY, cellW, cellH } = PUZZLE_BOARD;

    // 相框底板：暖纸底 + 木色描边 + 4×4 格线；格子里垫一张极淡整图示意，
    // 玩家对照示意就能找到每块碎片该去的位置（不给示意近乎盲拼）
    const pad = 12;
    const plate = this.add.graphics();
    plate.fillStyle(0xf0e8d4, 1);
    plate.fillRoundedRect(
      boardX - pad, boardY - pad, cellW * 4 + pad * 2, cellH * 4 + pad * 2, 10,
    );
    plate.lineStyle(3, 0x8a6d3b, 1);
    plate.strokeRoundedRect(
      boardX - pad, boardY - pad, cellW * 4 + pad * 2, cellH * 4 + pad * 2, 10,
    );
    plate.lineStyle(1, 0x5a4a33, 0.35);
    for (let i = 1; i < 4; i++) {
      plate.lineBetween(boardX + i * cellW, boardY, boardX + i * cellW, boardY + cellH * 4);
      plate.lineBetween(boardX, boardY + i * cellH, boardX + cellW * 4, boardY + i * cellH);
    }
    layer.add(plate);
    layer.add(
      this.add
        .image(boardX + cellW * 2, boardY + cellH * 2, 'room-photo')
        .setDisplaySize(cellW * 4, cellH * 4)
        .setAlpha(0.13),
    );

    const homeXY = (t: number) => ({
      x: boardX + (t % 4) * cellW + cellW / 2,
      y: boardY + Math.floor(t / 4) * cellH + cellH / 2,
    });

    interface TileRec {
      t: number;
      img: Phaser.GameObjects.Image;
      trayX: number;
      trayY: number;
      trayRot: number;
      scale: number;
      locked: boolean;
    }
    const tiles: TileRec[] = [];
    let lockedCount = 0;
    const tileCount = this.progress.photoMissingPieceCollected ? 16 : 15;

    for (let t = 0; t < tileCount; t++) {
      const c = t % 4;
      const r = Math.floor(t / 4);
      // 预切小图：不用 setCrop——裁剪图的输入热区不可靠（点一块会命中旁边块）
      const tileKey = `photo-tile-${c}-${r}`;
      if (!this.textures.exists(tileKey)) {
        const source = this.textures.get('room-photo').getSourceImage() as
          CanvasImageSource & { width: number; height: number };
        const cnv = document.createElement('canvas');
        cnv.width = srcW;
        cnv.height = srcH;
        cnv.getContext('2d')?.drawImage(source, c * srcW, r * srcH, srcW, srcH, 0, 0, srcW, srcH);
        this.textures.addCanvas(tileKey, cnv);
      }
      const placed = this.progress.photoPlacements.includes(t);
      const home = homeXY(t);
      const img = this.add.image(0, 0, tileKey).setDisplaySize(cellW, cellH);
      if (!placed) img.setInteractive({ useHandCursor: true });
      const scale = img.scaleX;
      // 托盘位（右侧散放）：固定置换打乱 + 抖动 + 微旋转，读作"散落的碎片"
      const sc = (t * 7 + 3) % 16;
      const trayX = 512 + (sc % 4) * 104 + ((t * 37) % 13) - 6;
      const trayY = 132 + Math.floor(sc / 4) * 90 + ((t * 53) % 11) - 5;
      const trayRot = ((((t * 29) % 13) - 6) * Math.PI) / 180;
      img.setPosition(placed ? home.x : trayX, placed ? home.y : trayY).setRotation(placed ? 0 : trayRot);
      layer.add(img);
      const rec: TileRec = { t, img, trayX, trayY, trayRot, scale, locked: placed };
      tiles.push(rec);
      if (placed) lockedCount += 1;

      // 拖拽用 Phaser 原生 drag：纯增量跟随（dragstart 的 dragX/dragY 实测传 0，
      // 首个 drag 事件只记基线）；dragstart 必须杀残留 tween，否则快速连拖错位
      if (!placed) this.input.setDraggable(img);
      let prevDx: number | null = null;
      let prevDy: number | null = null;
      img.on('dragstart', () => {
        if (this.puzzleSolved || rec.locked) {
          return;
        }
        this.tweens.killTweensOf(img);
        img.setScale(scale * 1.07); // 抓起瞬时微放大"提起来"
        img.setRotation(0);
        prevDx = null;
        prevDy = null;
        layer.bringToTop(img);
      });
      img.on('drag', (_p: Phaser.Input.Pointer, dx: number, dy: number) => {
        if (this.puzzleSolved || rec.locked) {
          return;
        }
        if (prevDx === null || prevDy === null) {
          prevDx = dx;
          prevDy = dy;
          return;
        }
        img.setPosition(img.x + (dx - prevDx), img.y + (dy - prevDy));
        prevDx = dx;
        prevDy = dy;
      });
      img.on('dragend', (p: Phaser.Input.Pointer) => {
        img.setScale(scale);
        if (this.puzzleSolved || rec.locked) {
          return;
        }
        const home = homeXY(t);
        // 落点用指针世界坐标判定：增量跟随跳过首个 drag 事件作基线，
        // img.x 恒滞后指针约一步（长拖可达 70px+），用 img.x 判会把放对的判错
        if (Phaser.Math.Distance.Between(p.worldX, p.worldY, home.x, home.y) < 50) {
          // 放对：吸住锁定，金边一闪
          rec.locked = true;
          this.applyProgressEvent({ type: 'photo-placement-added', tile: t });
          this.saveProgress();
          img.disableInteractive();
          this.tweens.killTweensOf(img);
          this.tweens.add({
            targets: img,
            x: home.x,
            y: home.y,
            rotation: 0,
            duration: 120,
            ease: 'Quad.easeOut',
          });
          const flash = this.add
            .rectangle(home.x, home.y, cellW + 8, cellH + 8)
            .setStrokeStyle(3, GOLD, 1);
          layer.add(flash);
          this.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 380,
            ease: 'Quad.easeOut',
            onComplete: () => flash.destroy(),
          });
          this.sfx.step();
          lockedCount += 1;
          if (lockedCount === tileCount) {
            if (tileCount === 15) {
              this.applyProgressEvent({ type: 'photo-base-arranged' });
              this.saveProgress();
              this.showHint('照片还差最后一块。去收音机旁找找。', 4500);
              const gap = this.add.text(homeXY(15).x, homeXY(15).y, '缺片', {
                fontFamily: 'sans-serif', fontSize: '13px', color: '#715d3b',
                backgroundColor: 'rgba(240,232,212,.78)', padding: { x: 8, y: 5 },
              }).setOrigin(0.5);
              layer.add(gap);
            } else {
              this.time.delayedCall(300, () => this.onPuzzleSolved(layer));
            }
          }
        } else {
          // 放错：弹回托盘原位（微旋转一并还原）
          this.tweens.killTweensOf(img);
          this.tweens.add({
            targets: img,
            x: trayX,
            y: trayY,
            rotation: trayRot,
            duration: 240,
            ease: 'Quad.easeOut',
          });
        }
      });
    }

    if (tileCount === 15 && lockedCount === 15) {
      this.applyProgressEvent({ type: 'photo-base-arranged' });
      this.saveProgress();
      this.showHint('照片还差最后一块。去收音机旁找找。', 4500);
      const gap = this.add.text(homeXY(15).x, homeXY(15).y, '缺片', {
        fontFamily: 'sans-serif', fontSize: '13px', color: '#715d3b',
        backgroundColor: 'rgba(240,232,212,.78)', padding: { x: 8, y: 5 },
      }).setOrigin(0.5);
      layer.add(gap);
    }

    // Recover if the player reopens after placing the last piece but before its completion delay fired.
    if (tileCount === 16 && lockedCount === 16) {
      this.time.delayedCall(300, () => this.onPuzzleSolved(layer));
    }

    // 一键拼好：不想逐块拖时直接收束到完成态（演示/快速看回忆的通路），
    // 走与手动完成完全相同的完成演出与发碎片流程（playPuzzleCompletion）
    const autoSolve = () => {
      if (this.puzzleSolved) {
        return;
      }
      this.puzzleSolved = true; // 锁住输入，防止动画期间继续拖动
      let delay = 0;
      for (const rec of tiles) {
        const home = homeXY(rec.t);
        rec.img.disableInteractive();
        this.tweens.killTweensOf(rec.img);
        this.tweens.add({
          targets: rec.img,
          x: home.x,
          y: home.y,
          rotation: 0,
          scale: rec.scale,
          duration: 260,
          delay,
          ease: 'Cubic.easeOut',
        });
        delay += 46;
        this.applyProgressEvent({ type: 'photo-placement-added', tile: rec.t });
      }
      if (tileCount === 15) {
        this.applyProgressEvent({ type: 'photo-base-arranged' });
      }
      this.saveProgress();
      if (tileCount === 15) {
        this.puzzleSolved = false;
        this.time.delayedCall(delay + 300, () => {
          this.showHint('照片还差最后一块。去收音机旁找找。', 4500);
          const gap = this.add.text(homeXY(15).x, homeXY(15).y, '缺片', {
            fontFamily: 'sans-serif', fontSize: '13px', color: '#715d3b',
            backgroundColor: 'rgba(240,232,212,.78)', padding: { x: 8, y: 5 },
          }).setOrigin(0.5);
          layer.add(gap);
        });
        return;
      }
      this.sfx.collect();
      this.time.delayedCall(delay + 300, () => this.playPuzzleCompletion(layer));
    };
    const autoBtn = this.add
      .text(480, 522, '一下拼好 · 直接看回忆', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#cbb98a',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    autoBtn.on('pointerover', () => autoBtn.setColor('#fff7e4'));
    autoBtn.on('pointerout', () => autoBtn.setColor('#cbb98a'));
    autoBtn.on('pointerdown', autoSolve);
    layer.add(autoBtn);
  }

  private onPuzzleSolved(layer: Phaser.GameObjects.Container): void {
    if (this.puzzleSolved) {
      return;
    }
    this.puzzleSolved = true;
    this.playPuzzleCompletion(layer);
  }

  /** 拼图完成演出（手动拼完与“一键拼好”共用）：照片合拢 → 金光扫过 → 进文字面板发碎片 */
  private playPuzzleCompletion(layer: Phaser.GameObjects.Container): void {
    this.applyProgressEvent({ type: 'photo-solved' });
    this.saveProgress();
    this.gainFragment('photo');
    this.inventoryBar?.removeItem('photo-piece');
    this.installRoomProgressObjects();
    // 完成效果：完整照片淡入合拢 → 金光扫过 + 光环 → 停一拍再收起进文字面板
    //（几何与 openPuzzle 共用 PUZZLE_BOARD——新棋盘在左侧 408×272，居中值是旧版）
    const { x: boardX, y: boardY, cellW, cellH } = PUZZLE_BOARD;
    const cx = boardX + cellW * 2;
    const cy = boardY + cellH * 2;
    const full = this.add
      .image(cx, cy, 'room-photo')
      .setDisplaySize(cellW * 4, cellH * 4)
      .setAlpha(0);
    layer.add(full);
    this.tweens.add({ targets: full, alpha: 1, duration: 320, ease: 'Quad.easeOut' });

    const sweep = this.add
      .rectangle(-20, cy, 64, cellH * 4 + 40, 0xfff2cc, 0.32)
      .setBlendMode(Phaser.BlendModes.ADD);
    layer.add(sweep);
    this.tweens.add({
      targets: sweep,
      x: boardX + cellW * 4 + 50,
      duration: 650,
      delay: 240,
      ease: 'Quad.easeInOut',
      onComplete: () => sweep.destroy(),
    });
    Effects.ring(this, cx, cy);
    this.time.delayedCall(1150, () => {
      if (this.panel !== layer) {
        return; // 演出期间面板被关掉：不发碎片
      }
      this.closePanel();
      this.cameras.main.flash(140, 230, 207, 151);
      this.openDomPanel(() => showPhotoMemoryText(this, photoFrameUrl));
    });
  }

  // ---------- 收音机调频 ----------

  private openRadio(): void {
    this.interacting = true;
    this.pauseRoomBgm(true);
    // 打开面板的同帧就把两个频道排进后台队列：玩家拧旋钮时大概率已经下好，
    // 但不阻塞面板出现（见 systems/DeferredAudio）。
    for (const [key, url] of Object.entries(RoomScene.RADIO_AUDIO)) {
      loadAudioInBackground(this, key, url);
    }
    // 收音机“发声”时从机身泛出一圈暖光（有来源的光）
    this.radioLight = this.lights.addLight(505, 335, 210, 0xffc98a, 0.55);
    this.radioPanel = showRadioPuzzleUI(this, {
      onClose: () => this.closePanel(),
      onChannelChange: channel => {
        switch (channel) {
          case 1:
            this.playRadioAudio('radio-static');
            break;
          case 2:
            this.playRadioAudio('radio-wind');
            break;
          case 3:
            this.playRadioPreview();
            break;
          case 4:
            this.stopRadioAudio();
            break;
        }
      },
    });
  }

  // ---------- 挂钟调时 ----------

  private openClock(): void {
    this.interacting = true;
    showClockPuzzleUI(this, {
      onClose: () => { this.interacting = false; },
          onSolved: () => {
            this.interacting = false;
            this.cameras.main.flash(140, 230, 207, 151);
            this.applyProgressEvent({ type: 'clock-solved' });
            this.saveProgress();
      },
    });
  }

  // ---------- 碎片 / 记忆球 / 结尾 ----------

  private gainFragment(kind: 'photo' | 'radio' | 'shadowBoat'): void {
    if (this.fragments.has(kind) || !canAwardRoomFragment(this.progress, kind)) {
      return;
    }
    this.fragments.add(kind);
    this.applyProgressEvent({ type: 'fragment-collected', fragment: kind });
    this.saveProgress();
    this.sfx.collect();
    this.fragmentHud?.collect(kind);
    this.gameHud?.setProgressPercent(
      (this.progress.fragments.length / 3) * 100,
      `碎片聚合 ${this.progress.fragments.length}/3`,
    );
    this.gameHud?.setScore(this.progress.score);
    if (hasAllRoomFragments(this.progress)) {
      this.spawnMemoryOrb();
    }
  }

  private spawnMemoryOrb(): void {
    // 悬在方桌上空（挂钟 234 与桌面 360 之间），避开挂钟与相框
    this.memoryOrb = this.add.container(480, 305).setDepth(6);
    // Shell greybox: approved story object, formal watercolor artwork still pending.
    const shell = this.add.graphics();
    shell.fillStyle(0xf1dfbb, 1);
    shell.fillPoints([
      new Phaser.Math.Vector2(-8, 21), new Phaser.Math.Vector2(-38, -5),
      new Phaser.Math.Vector2(-30, -27), new Phaser.Math.Vector2(-12, -38),
      new Phaser.Math.Vector2(12, -38), new Phaser.Math.Vector2(30, -27),
      new Phaser.Math.Vector2(38, -5), new Phaser.Math.Vector2(8, 21),
    ], true);
    shell.lineStyle(2, 0xb99d75, 1);
    for (const x of [-28, -14, 0, 14, 28]) shell.lineBetween(0, 18, x, -25);
    const label = this.add.text(0, 45, '贝壳 · 美术占位', {
      fontSize: '12px', color: '#f1dfbb', backgroundColor: '#172d23',
    }).setOrigin(0.5);
    const hit = this.add.circle(0, 0, 44, 0xffffff, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.touchMemoryOrb());
    this.memoryOrb.add([shell, label, hit]);
    this.orbLight = this.lights.addLight(480, 305, 240, GOLD, 0.8);
    this.tweens.add({
      targets: this.memoryOrb,
      y: 291,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: this.orbLight,
      intensity: { from: 0.5, to: 1.0 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.sfx.door();
    this.gameHud?.setObjective('触碰贝壳，重温海边回忆');
    this.showHint('三块碎片合成了贝壳——点击它');
  }

  private touchMemoryOrb(): void {
    if (!this.memoryOrb || this.orbTouched || !hasAllRoomFragments(this.progress)) {
      return;
    }
    this.orbTouched = true;
    this.sfx.enter();
    this.tweens.add({
      targets: this.memoryOrb,
      scale: 2.2,
      alpha: 0,
      duration: 520,
      ease: 'Quad.easeOut',
    });
    this.gameHud.showLevelClearedModal({
      title: '— 第一章·记忆之房 完美通关！ —',
      description: '照片拼图、收音机调频、光影小船三块记忆碎片全部找齐！\n三块碎片合成贝壳，唤起一家三口的海边回忆。',
      score: this.progress.score,
      nextLabel: '下一关：启程前往记忆之岛 →',
      onNext: () => {
        this.cameras.main.fade(520, 23, 45, 35);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('ending', { completedChapter: 1 }));
      },
      onStay: () => {
        this.orbTouched = false;
        this.showHint('留在房间继续回味童年物件。');
      },
      onRestart: () => this.scene.restart(),
      onHome: () => this.scene.start('menu'),
    });
  }

  // ---------- HUD / 面板公共件 ----------

  /** 面板遮光：与 D 的文字面板（blur+brightness .79）观感对齐，三个玩法面板统一 */
  private panelBackdrop(layer: Phaser.GameObjects.Container): void {
    const dim = this.add.rectangle(480, 270, ROOM_WIDTH, ROOM_HEIGHT, 0x0c1310, 0.66).setInteractive();
    layer.add(dim);
  }

  private buildHud(): void {
    // 210：盖过谜题面板的暗幕（200），时钟答错的提示才看得见
    this.hudLayer = this.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(210)
      .setScale(bufferScaleOf(this));
    // HUD 是 scrollFactor 0 层（世界单位 = 缓冲像素），渲染缓冲随窗口变化时跟着缩放
    this.scale.off(Phaser.Scale.Events.RESIZE, this.hudSyncHandler);
    this.hudSyncHandler = () => this.hudLayer.setScale(bufferScaleOf(this));
    this.scale.on(Phaser.Scale.Events.RESIZE, this.hudSyncHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.hudSyncHandler) {
        this.scale.off(Phaser.Scale.Events.RESIZE, this.hudSyncHandler);
      }
      this.hudSyncHandler = undefined;
    });
    this.gameHud = createGameHud({
      scene: this,
      title: '第一章 · 记忆之房',
      stageKey: 'room',
      minimal: true,
      initialScore: this.progress.score,
      initialLives: this.progress.lives,
      initialObjective: this.progress.chapterOneCompleted
        ? '触碰贝壳，重温海边回忆'
        : '收集三块童年记忆碎片',
      onRestart: () => this.scene.restart(),
      onHome: () => this.scene.start('menu'),
    });
    this.gameHud.setProgressPercent(
      (this.progress.fragments.length / 3) * 100,
      `碎片聚合 ${this.progress.fragments.length}/3`,
    );

    this.input.keyboard?.on('keydown-ESC', () => this.gameHud.showPauseModal());

    this.hintText = this.add.text(260, 14, '', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: '#f4f9f2',
      // 与森林提示同款深色底牌，任何背景上可读
      backgroundColor: 'rgba(9, 20, 15, 0.8)',
      padding: { x: 10, y: 6 },
    });
    this.hudLayer.add(this.hintText);
    this.showHint('点击房间里的物件寻找线索', 4500);

    this.fragmentHud = createFragmentHud(this);
    this.inventoryBar = createRoomInventoryUI(this, {
      onItemSelected: item => {
        this.shadowBoatPanel?.setBrushEquipped(item?.id === 'paint-brush');
        if (item) this.showHint(`已选择：${item.label}`, 1800);
      },
    });
  }

  private saveProgress(): void {
    if (this.progressSession.save()) {
      this.progressStorageUnavailable = false;
      this.progressSaveWarningShown = false;
    } else {
      this.progressStorageUnavailable = true;
    }
    if (this.progressStorageUnavailable && !this.progressSaveWarningShown) {
      this.progressSaveWarningShown = true;
      this.showHint('进度仅保存在本次游玩中；关闭页面后可能丢失。', 6000);
    }
  }

  private applyProgressEvent(event: ChapterOneRoomEvent): void {
    this.progressSession.dispatch(event);
  }

  private restoreInventory(): void {
    if (this.progress.photoMissingPieceCollected && !this.progress.photoSolved) {
      this.inventoryBar?.addItem({ id: 'photo-piece', glyph: '拼', label: '照片拼块' });
    }
    if (this.progress.batteryCollected && !this.progress.flashlightPowered) {
      this.inventoryBar?.addItem({ id: 'flashlight-battery', glyph: '电', label: '手电筒电池' });
    }
    if (this.progress.paintBrushCollected) {
      this.inventoryBar?.addItem({ id: 'paint-brush', glyph: '笔', label: '画笔', iconUrl: paintBrushUrl });
    }
  }

  private restoreFragmentHud(): void {
    for (const fragment of this.fragments) {
      if (fragment === 'photo' || fragment === 'radio' || fragment === 'shadowBoat') {
        this.fragmentHud?.collect(fragment);
      }
    }
  }

  /** Place the progression items as small, clickable props within the existing room art. */
  private installRoomProgressObjects(): void {
    this.roomProgressProps?.destroy(true);
    const props = this.add.container(0, 0).setDepth(2);
    this.roomProgressProps = props;
    const prop = (
      x: number, y: number, label: string, enabled: boolean, action: () => void,
      hitWidth = 36, hitHeight = 25,
    ) => {
      const card = this.add.container(x, y);
      const back = this.add.ellipse(0, 1, 22, 5, 0x171b16, enabled ? 0.2 : 0.12);
      const text = this.add.text(0, -12, label, {
        fontFamily: 'sans-serif', fontSize: '9px', color: enabled ? '#f5e6bd' : '#c2bba7',
        backgroundColor: '#171b16aa', padding: { x: 3, y: 2 },
      }).setOrigin(0.5).setAlpha(0);
      card.add([back, text]);
      props.add(card);
      if (enabled) {
        const hit = this.add.rectangle(0, 0, hitWidth, hitHeight, 0x000000, 0).setInteractive({ useHandCursor: true });
        card.add(hit);
        hit.on('pointerdown', () => {
          if (!this.interacting && !this.orbTouched) action();
        });
        hit.on('pointerover', () => text.setAlpha(1));
        hit.on('pointerout', () => text.setAlpha(0));
      }
    };

    const boxLabel = !this.progress.photoSolved
      ? '木盒（锁着）'
      : this.progress.batteryCollected
      ? '木盒（已空）'
      : '木盒（有电池）';
    const boxTexture = !this.progress.photoSolved ? 'room-box-closed-art' : 'room-box-open-art';
    // 这些会随进度状态刷新，必须纳入 roomProgressProps；旧版直接加到 Scene，
    // 每次刷新都会残留一套相框/锁盒/电池，造成肉眼可见的重复叠图。
    props.add(this.addSupportedRoomProp(boxTexture, 782, 250, 56, 2.2));
    const boxVisibleTop = 211;
    props.add(this.addSupportedRoomProp('room-frame-art', 782, boxVisibleTop + 3, 30, 2.3));
    if (this.progress.photoSolved && !this.progress.batteryCollected) {
      props.add(this.addSupportedRoomProp('room-battery-art', 782, 238, 22, 2.4));
    }
    prop(782, 230, boxLabel, true, () => {
      if (!this.progress.photoSolved) {
        return this.showHint('木盒锁着，盒盖上的凹槽像是在等一张完整的照片。');
      }
      if (this.progress.batteryCollected) {
        return this.showHint('木盒里已经空了。');
      }
      this.applyProgressEvent({ type: 'battery-collected' });
      this.saveProgress();
      this.inventoryBar?.addItem({ id: 'flashlight-battery', glyph: '电', label: '手电筒电池' });
      this.showHint('打开木盒，找到了一节旧手电筒电池。去装到手电筒上。');
      this.installRoomProgressObjects();
    }, 60, 40);
    // 渲染正式手电筒物件（开/关状态共用相同位置、缩放与中心锚点）
    const flashlightTexture = this.progress.flashlightPowered ? 'room-flashlight-on' : 'room-flashlight-off';
    const flashlightSprite = this.add.image(484, 318, flashlightTexture)
      .setDisplaySize(16, 24)
      .setOrigin(0.5, 0.5)
      .setTint(OBJECT_TINT)
      .setInteractive({ useHandCursor: true });
    props.add(flashlightSprite);

    const flashlightLabel = this.add.text(484, 334, this.progress.flashlightPowered ? '手电筒（已点亮）' : '手电筒', {
      fontFamily: 'sans-serif', fontSize: '9px', color: '#f5e6bd', backgroundColor: '#0c1511aa', padding: { x: 3, y: 2 }
    }).setOrigin(0.5).setAlpha(0);
    props.add(flashlightLabel);

    flashlightSprite.on('pointerover', () => {
      flashlightSprite.setTint(0xfffae8);
      flashlightLabel.setAlpha(1);
    });
    flashlightSprite.on('pointerout', () => {
      flashlightSprite.setTint(OBJECT_TINT);
      flashlightLabel.setAlpha(0);
    });
    flashlightSprite.on('pointerdown', () => {
      if (this.interacting || this.orbTouched) return;
      if (!this.progress.flashlightPowered) {
        if (!canPowerFlashlight(this.progress) || !this.inventoryBar?.hasItem('flashlight-battery')) {
          return this.showHint('手电筒没有电池。先打开照片拼图旁的木盒。');
        }
        this.applyProgressEvent({ type: 'flashlight-powered' });
        this.inventoryBar?.removeItem('flashlight-battery');
        this.saveProgress();
        this.installRoomProgressObjects();
        this.showHint('手电筒亮了。墙上的影子可以继续拼合。');
        return;
      }
      if (canOpenShadowBoatPuzzle(this.progress)) this.openShadowBoatPuzzle();
    });

    if (!this.progress.paintBrushCollected) {
      // 渲染正式扁头水彩排笔
      const brushSprite = this.add.image(446, 318, 'room-paint-brush')
        .setDisplaySize(18, 9)
        .setOrigin(0.5, 0.5)
        .setAngle(-8)
        .setTint(OBJECT_TINT)
        .setInteractive({ useHandCursor: true });
      props.add(brushSprite);

      const brushLabel = this.add.text(446, 329, '扁头水彩笔', {
        fontFamily: 'sans-serif', fontSize: '9px', color: '#f5e6bd', backgroundColor: '#0c1511aa', padding: { x: 3, y: 2 }
      }).setOrigin(0.5).setAlpha(0);
      props.add(brushLabel);

      brushSprite.on('pointerover', () => {
        brushSprite.setTint(0xfffae8);
        brushSprite.y = 316;
        brushLabel.setAlpha(1);
      });
      brushSprite.on('pointerout', () => {
        brushSprite.setTint(OBJECT_TINT);
        brushSprite.y = 318;
        brushLabel.setAlpha(0);
      });
      brushSprite.on('pointerdown', () => {
        if (this.interacting || this.orbTouched) return;
        this.applyProgressEvent({ type: 'paint-brush-collected' });
        this.saveProgress();
        this.inventoryBar?.addItem({ id: 'paint-brush', glyph: '笔', label: '画笔', iconUrl: paintBrushUrl });
        this.installRoomProgressObjects();
        this.showHint('先收好画笔。影子对齐后才能在墙上画风。');
      });
    }
  }

  private spawnMissingPhotoPiece(): void {
    if (!canCollectPhotoMissingPiece(this.progress) || this.missingPhotoSprite) return;
    const key = 'photo-tile-3-3';
    if (!this.textures.exists(key)) {
      const source = this.textures.get('room-photo').getSourceImage() as CanvasImageSource & { width: number; height: number };
      const canvas = document.createElement('canvas');
      const tileW = source.width / 4;
      const tileH = source.height / 4;
      canvas.width = tileW;
      canvas.height = tileH;
      canvas.getContext('2d')?.drawImage(source, tileW * 3, tileH * 3, tileW, tileH, 0, 0, tileW, tileH);
      this.textures.addCanvas(key, canvas);
    }
    const piece = this.add.image(344, 331, key).setDisplaySize(38, 26).setDepth(4)
      .setInteractive({ useHandCursor: true });
    this.missingPhotoSprite = piece;
    this.tweens.add({ targets: piece, alpha: 0.62, y: 328, duration: 900, yoyo: true, repeat: -1 });
    piece.on('pointerdown', () => {
      if (this.interacting || !canCollectPhotoMissingPiece(this.progress)) return;
      this.applyProgressEvent({ type: 'photo-piece-collected' });
      this.saveProgress();
      piece.destroy();
      this.missingPhotoSprite = undefined;
      this.inventoryBar?.addItem({ id: 'photo-piece', glyph: '拼', label: '照片拼块' });
      this.showHint(this.progress.photoBaseArranged ? '缺失的一块找到了。回去补上照片。' : '找到了一块照片碎片。');
    });
  }

  private openDeskPopup(): void {
    if (this.interacting || this.deskPopup || this.orbTouched) return;
    this.interacting = true;
    this.deskPopup = showRoomDeskPopup(this, {
      puzzleAvailable: canOpenShadowBoatPuzzle(this.progress),
      onEnterPuzzle: () => {
        const popup = this.deskPopup;
        this.deskPopup = undefined;
        popup?.close();
        this.openShadowBoatPuzzle();
      },
      onClose: () => {
        this.deskPopup = undefined;
        this.interacting = false;
      },
    });
  }

  private openShadowBoatPuzzle(): void {
    if (this.interacting || this.shadowBoatPanel) return;
    this.interacting = true;
    this.shadowBoatPanel = showShadowBoatPuzzleUI(this, {
      initialAligned: this.progress.shadowBoatAligned,
      initialWindStrokeCount: this.progress.windStrokeCount,
      initialCompleted: this.progress.shadowBoatSolved,
      initialPieces: this.progress.shadowBoatPieces,
      initialFlashlightX: this.progress.shadowBoatLightX,
      onAligned: (pieces, flashlightX) => {
        this.applyProgressEvent({ type: 'shadow-boat-aligned', pieces, lightX: flashlightX });
        this.saveProgress();
        this.inventoryBar?.setExpanded(true);
        this.showHint(this.progress.paintBrushCollected ? '影子拼好了。选中画笔，按顺序描完三笔风。' : '影子拼好了。先找到画笔，再描出三笔风。', 5000);
      },
      onStateChange: (pieces, flashlightX) => {
        this.applyProgressEvent({ type: 'shadow-boat-state-changed', pieces, lightX: flashlightX });
        this.saveProgress();
      },
      onWindStrokeCompleted: index => {
        if (!canDrawWind(this.progress) || index !== this.progress.windStrokeCount + 1) return;
        this.applyProgressEvent({ type: 'wind-stroke-completed', index });
        this.saveProgress();
      },
      onCompleted: () => {
        if (this.progress.shadowBoatSolved) return;
        this.applyProgressEvent({ type: 'shadow-boat-solved' });
        this.saveProgress();
        this.wallPicture?.setTexture('room-wall-drawing-complete');
        this.gainFragment('shadowBoat');
        this.showHint('三笔风吹动了纸船，第三块记忆碎片出现了。', 4500);
      },
      onClose: () => {
        this.shadowBoatPanel = undefined;
        this.interacting = false;
      },
    });
    this.shadowBoatPanel.setBrushEquipped(this.inventoryBar?.getSelectedItem()?.id === 'paint-brush');
  }

  private openShadowBoatVisualPreview(): void {
    if (this.interacting || this.shadowBoatPanel) return;
    this.interacting = true;
    this.shadowBoatPanel = showShadowBoatPuzzleUI(this, {
      onClose: () => {
        this.shadowBoatPanel = undefined;
        this.interacting = false;
      },
      initialPieces: this.progress.shadowBoatPieces,
      initialFlashlightX: this.progress.shadowBoatLightX,
      initialAligned: this.progress.shadowBoatAligned,
      initialWindStrokeCount: this.progress.windStrokeCount,
      initialCompleted: this.progress.shadowBoatSolved,
      flashlightPowered: true,
    });
  }

  /** 提示显示一段时间后自动淡出（与森林的区域提示一致，不再常驻） */
  private showHint(message: string, holdMs = 3000): void {
    this.hintTimer?.remove();
    this.hintFade?.remove();
    const visibleMessage = this.progressStorageUnavailable && !message.includes('关闭页面后可能丢失')
      ? `${message}（进度仅在本次游玩中保留）`
      : message;
    this.hintText.setText(visibleMessage).setColor('#ffe9a8').setAlpha(1);
    this.hintTimer = this.time.delayedCall(holdMs, () => {
      this.hintFade = this.tweens.add({
        targets: this.hintText,
        alpha: 0,
        duration: 600,
      });
    });
  }

  private panelTitle(x: number, y: number, text: string): Phaser.GameObjects.Text {
    // 与 D 的文字面板同款标题色/字号，玩法面板与文字面板读作同一套界面
    return this.add
      .text(x, y, text, {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#f0dfb5',
      })
      .setOrigin(0.5)
      .setShadow(0, 1, '#06090a', 3);
  }

  private addCloseButton(layer: Phaser.GameObjects.Container, x: number, y: number): void {
    const btn = this.add
      .text(x, y, '×', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '28px',
        color: '#f0dfb5',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#fff7e4'));
    btn.on('pointerout', () => btn.setColor('#f0dfb5'));
    btn.on('pointerdown', () => this.closePanel());
    layer.add(btn);
  }

  private closePanel(): void {
    const radioPanel = this.radioPanel;
    this.radioPanel = undefined;
    radioPanel?.close();
    this.stopRadioAudio();
    this.panel?.destroy();
    this.panel = null;
    this.interacting = false;
    if (this.radioLight) {
      this.lights.removeLight(this.radioLight);
      this.radioLight = undefined;
    }
    this.pauseRoomBgm(false);
    if (this.progress.radioMessageHeard) this.spawnMissingPhotoPiece();
  }

  /** Silent, explicitly labelled development preview; never plays predecessor dialogue. */
  private playRadioPreview(): void {
    this.stopRadioAudio();
    this.radioPreviewTimer = this.time.delayedCall(RADIO_PREVIEW_MS, () => {
      this.radioPreviewTimer = undefined;
      if (!this.radioPanel || this.radioPanel.getChannel() !== 3 || this.progress.radioMessageHeard) return;
      this.applyProgressEvent({ type: 'radio-message-heard' });
      this.saveProgress();
      this.gainFragment('radio');
      this.showHint('录音占位流程已完成。关闭面板后可拾取照片碎片。', 4200);
    });
  }

  /**
   * Switching channels or closing the panel interrupts the previous recording.
   *
   * 音频按需后台加载：还没下完时先记下「当前该播哪个频道」，下完再接上；
   * 用 requestId 作废上一次请求，避免快速切频道时旧回调把已经过期的音频播出来。
   */
  private playRadioAudio(key: string): void {
    this.stopRadioAudio();
    const requestId = ++this.radioRequestId;
    const play = (): void => {
      if (requestId !== this.radioRequestId || !this.radioPanel) return;
      if (!this.cache.audio.exists(key)) return;
      const sound = this.sound.add(key, { volume: 0.75 });
      this.radioSound = sound;
      sound.once(Phaser.Sound.Events.COMPLETE, () => {
        if (this.radioSound === sound) this.radioSound = undefined;
        sound.destroy();
      });
      sound.play();
    };
    const url = RoomScene.RADIO_AUDIO[key];
    if (this.cache.audio.exists(key) || !url) play();
    else loadAudioInBackground(this, key, url, play);
  }

  private stopRadioAudio(): void {
    // 作废在飞的后台加载回调（切频道/关面板都算）
    this.radioRequestId += 1;
    this.radioPreviewTimer?.remove(false);
    this.radioPreviewTimer = undefined;
    const sound = this.radioSound;
    this.radioSound = undefined;
    if (!sound) return;
    sound.stop();
    sound.destroy();
  }

  /** 收音机播放期间暂停房间 BGM（menu-room-bgm 由 main.ts 在 CREATE 时播放） */
  private pauseRoomBgm(pause: boolean): void {
    const manager = this.sound as unknown as {
      sounds?: Array<Phaser.Sound.WebAudioSound>;
    };
    const music = manager.sounds?.find((s) => s.key === 'music-menu-room');
    if (!music) {
      return;
    }
    setBackgroundMusicTemporarilyPaused(music, pause);
  }
}
