import { preloadRoomPaper, enableRoomPaper, addRoomPaper, ROOM_INK_FONT } from '../ui/RoomPaperTheme';
import Phaser from 'phaser';
import { Sfx } from '../systems/Sfx';
import { Effects } from '../gameplay/Effects';
import type { ChapterOneRoomProgress } from '../gameplay/ChapterOneRoomProgress';
import { ChapterOneRoomSession } from '../gameplay/ChapterOneRoomSession';
import {
  canAwardRoomFragment,
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
import { setSceneMusicTemporarilyPaused } from '../MenuRoomMusic';
import {
  showPhotoMemoryText,
  showFishBasinText,
  showOtherRoomText,
} from '../ui/RoomInteractionCopy';
import { createGameHud, type GameHudHandle } from '../ui/GameHud';
import { showRoomItemNotice, showRoomItemPresentation } from '../ui/RoomItemPresentation';
import { showRoomPaintingPreview } from '../ui/RoomPaintingPreview';
import { resolveImageUrl } from '../assets';
import { loadAudioInBackground } from '../systems/DeferredAudio';
import roomBackgroundUrl from '../../scene/level1-memory-room-night-empty-v2-1920x1080.png?url';
import photoFrameUrl from '../../assets/environment/interactive-family-zoo-photo-frame-384x256.png?url';
import memoryShellUrl from '../../assets/items/room-memory-pearl-shell-v1.png?url';
import flashlightOffUrl from '../../assets/environment/room-flashlight-off.png?url';
import flashlightOnUrl from '../../assets/environment/room-flashlight-on.png?url';
import paintBrushUrl from '../../assets/items/room-paint-brush.png?url';
import fairyTaleBookUrl from '../../assets/items/room-fairytale-book-v1.png?url';
import radioStaticUrl from '../../assets/audio/radio-static.m4a?url';
import radioWindUrl from '../../assets/audio/radio-wind.m4a?url';
import radioChongerfeiUrl from '../../assets/audio/radio-chongerfei.m4a?url';

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
        // 生成素材外围带一圈很淡的环境辉光。家具落位应以实体像素为准，
        // 否则辉光会被当成“底面”，物件本体看起来就会悬在桌面上。
        if (data[(y * w + x) * 4 + 3] > 220) {
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
  private pendingPhotoStory = false;
  private gameHud!: GameHudHandle;
  private fragments = new Set<string>();
  private progressSession!: ChapterOneRoomSession;
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
  /** 电台音频按需加载的请求序号：切频道/关面板时 +1，作废在飞的回调 */
  private radioRequestId = 0;

  private get progress(): ChapterOneRoomProgress {
    return this.progressSession.state;
  }

  constructor() {
    super('room');
  }

  preload(): void { preloadRoomPaper(this);
    const images: Array<[string, string]> = ([
      ['room-bg', roomBackgroundUrl],
      ['room-radio-art', 'assets/environment/interactive-vintage-radio-384x256.png'],
      ['room-book-art', 'assets/items/room-fairytale-book-v1.png'],
      ['room-frame-art', 'assets/environment/room-photo-frame-perspective-v1.png'],
      ['room-frame-complete-art', photoFrameUrl],
      ['room-box-closed-art', 'assets/environment/room-lockbox-closed-v1.png'],
      ['room-box-open-art', 'assets/environment/room-lockbox-open-battery-v1.png'],
      ['room-battery-art', 'assets/items/room-flashlight-battery-v1.png'],
      ['room-aquarium-art', 'assets/environment/room-hermit-crab-aquarium-v1.png'],
      ['room-wall-drawing-incomplete', 'assets/environment/room-wall-drawing-incomplete.png'],
      ['room-photo', photoFrameUrl],
      ['room-memory-shell', memoryShellUrl],
      ['room-flashlight-off', flashlightOffUrl],
      ['room-flashlight-on', flashlightOnUrl],
      ['room-paint-brush', paintBrushUrl],
    ] as Array<[string, string]>).map(([key, path]) => [key, resolveImageUrl(path)] as [string, string]);
    for (const [key, url] of images) {
      if (!this.textures.exists(key)) {
        this.load.image(key, url);
      }
    }
    // 三个电台频道按需加载，不阻塞房间进入。
    // 玩家不去碰录音机就不该付这份下载。openRadio() 里按需后台加载。
  }

  /** 录音机三个频道的音频源（按需加载用；key 与 playRadioAudio 一致） */
  private static readonly RADIO_AUDIO: Record<string, string> = {
    'radio-static': radioStaticUrl,
    'radio-wind': radioWindUrl,
    'radio-chongerfei': radioChongerfeiUrl,
  };

  create(): void { enableRoomPaper(this);
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
    this.pendingPhotoStory = false;

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
    if (hasAllRoomFragments(this.progress)) this.spawnMemoryOrb();

    // Explicit visual-review route; never appears in normal play or as a keyboard shortcut.
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'shadow') {
      this.time.delayedCall(100, () => this.openShadowBoatVisualPreview());
    }

    this.cameras.main.fadeIn(250, 20, 18, 26);
    if (canPowerFlashlight(this.progress)) this.time.delayedCall(350, () => this.combineFlashlight());

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
    this.add.rectangle(526, 160, 140, 102, 0x1b2b3a, 0.22).setDepth(0.8);
    this.wallPicture = this.add.image(
      526,
      160,
      'room-wall-drawing-incomplete',
    ).setDisplaySize(136, 98).setDepth(0.9).setTint(0xc4ccd6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openCompletedPainting());

    // 先确定“物件底部接触家具的哪条边”，再用透明像素 bbox 锚定；可见宽度按承托面留边。
    // 道具以 GPT Image 2.5 Sunburst 按背景机位与夜间光照重绘，保留原素材文件不覆盖。
    // 使用 018e4e2 中的正面版素材；落点以当前标注为准，不沿用该提交的坐标。
    this.addSupportedRoomProp('room-book-art', 732, 176, 40, 2);
    this.addSupportedRoomProp('room-radio-art', 310, 306, 66, 2);
    this.addSupportedRoomProp('room-aquarium-art', 912, 346, 52, 2);
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
      // 独立摆件统一压入夜间蓝灰环境色，避免像另一层高亮贴纸。
      .setTint(0xd6dce5)
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
      { kind: 'radio', x: 310, y: 281, w: 80, h: 54 },
      { kind: 'photo', x: 735, y: 207, w: 58, h: 50 },
      { kind: 'fish', x: 912, y: 320, w: 68, h: 58 },
      { kind: 'book', x: 732, y: 149, w: 58, h: 58 },
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
          imageUrl: resolveImageUrl(fairyTaleBookUrl),
          imageAlt: '月夜兔子封面的童话书',
          entries: [{ text: '这是韩梅梅最喜欢的故事，妈妈经常给她讲。整本故事书已经被翻得有点皱巴了。' }],
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
        // 解完后录音机仍保留原来的调频交互，玩家可以随时回来重听三个频道。
        // completeRadioSequence 自己会拦住重复发拼图和记忆碎片。
        this.openRadio();
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
    const subtitle = this.add
        .text(480, 88, '把碎片拖回相框 · 放对位置会自动吸住', {
          fontFamily: ROOM_INK_FONT,
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#cbb98a',
        })
        .setOrigin(0.5)
        .setResolution(Math.max(2, bufferScaleOf(this)));
    layer.add(subtitle);
    // × 放在 D 的碎片 HUD 挂件（右上 DOM，逻辑区 y 13..73）正下方：
    // 原先 (922,34) 与挂件重叠，× 被毛玻璃压得发糊（HUD 设了 pointer-events:none
    // 不挡点击，但视觉干扰，2026-09-24 实机确认后下移）
    // 固定在真实视口内，避免窄屏相机裁切或 DOM 挂件遮住退出入口。
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭拼图 / Close puzzle');
    close.textContent = '×';
    close.style.cssText = 'position:fixed;right:24px;top:96px;z-index:2147483100;width:36px;height:36px;padding:0;border:0;background:transparent;color:#fff1cf;font:28px/36px Arial,sans-serif;text-shadow:0 1px 4px #15120d;cursor:pointer';
    close.addEventListener('click', () => this.closePanel());
    document.body.append(close);
    const removeClose = () => close.remove();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, removeClose);
    layer.once('destroy', () => {
      removeClose();
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, removeClose);
    });

    const photoSource = this.textures.get('room-photo').getSourceImage() as { width: number; height: number };
    const srcW = photoSource.width / 4;
    const srcH = photoSource.height / 4;
    const { x: boardX, y: boardY, cellW, cellH } = PUZZLE_BOARD;

    // 相框底板：暖纸底 + 木色描边 + 4×4 格线；格子里垫一张极淡整图示意，
    // 玩家对照示意就能找到每块碎片该去的位置（不给示意近乎盲拼）
    const pad = 12;
    const plate = this.add.graphics();
    plate.fillStyle(0xf0e8d4, 1);
    plate.fillRoundedRect(boardX - pad, boardY - pad, cellW * 4 + pad * 2, cellH * 4 + pad * 2, 10);
    plate.lineStyle(3, 0x8a6d3b, 1);
    plate.strokeRoundedRect(boardX - pad, boardY - pad, cellW * 4 + pad * 2, cellH * 4 + pad * 2, 10);
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
        // 拼图在缩放后的窗口里也要容易放下：指针或图片中心接近目标都直接吸附。
        const pointerDistance = Phaser.Math.Distance.Between(p.worldX, p.worldY, home.x, home.y);
        const pieceDistance = Phaser.Math.Distance.Between(img.x, img.y, home.x, home.y);
        if (Math.min(pointerDistance, pieceDistance) < 74) {
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
    }

    // Recover if the player reopens after placing the last piece but before its completion delay fired.
    if (tileCount === 16 && lockedCount === 16) {
      this.time.delayedCall(300, () => this.onPuzzleSolved(layer));
    }

    // 一键拼好：不想逐块拖时直接收束到完成态（演示/快速看回忆的通路），
    // 走与手动完成完全相同的完成演出与发碎片流程（playPuzzleCompletion）
    let shortcutUsed = false;
    const autoSolve = () => {
      if (this.puzzleSolved || shortcutUsed) {
        return;
      }
      shortcutUsed = true;
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
        });
        return;
      }
      this.sfx.collect();
      this.time.delayedCall(delay + 300, () => this.playPuzzleCompletion(layer));
    };
    const autoBtn = this.add
      .text(480, 522, '[ R ] 一键恢复拼图 · Restore puzzle', {
        fontFamily: ROOM_INK_FONT,
        fontSize: '14px',
        color: '#cbb98a',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    autoBtn.on('pointerover', () => autoBtn.setColor('#fff7e4'));
    autoBtn.on('pointerout', () => autoBtn.setColor('#cbb98a'));
    autoBtn.on('pointerdown', autoSolve);
    layer.add(autoBtn);
    const restoreWithKeyboard = () => autoSolve();
    this.input.keyboard?.on('keydown-R', restoreWithKeyboard);
    layer.once('destroy', () => this.input.keyboard?.off('keydown-R', restoreWithKeyboard));
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
    this.pendingPhotoStory = true;
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
      this.cameras.main.flash(140, 230, 207, 151);
      this.closePanel();
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
            this.playRadioAudio('radio-chongerfei');
            break;
        }
      },
      onAllChannelsVisited: () => this.completeRadioSequence(),
    });
  }

  private completeRadioSequence(): void {
    if (this.progress.radioMessageHeard) return;
    this.applyProgressEvent({ type: 'radio-message-heard' });
    this.applyProgressEvent({ type: 'photo-piece-collected' });
    this.saveProgress();
    this.gainFragment('radio');

    // 完成后发放拼块，收音机保持打开，等玩家主动关闭。
    this.time.delayedCall(700, () => {

      this.inventoryBar?.addItem({
        id: 'photo-piece',
        glyph: '拼',
        label: '照片拼块',
        imageUrl: photoFrameUrl,
        imageCrop: { column: 3, row: 3, columns: 4, rows: 4 },
      });
      this.showHint('录音机弹出了一块照片拼图，已经自动放进道具栏。现在可以去拼照片了。', 5200);
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
    // 贝壳覆盖在书桌热区上方；否则同一次点击会被后面的书桌交互截走。
    this.memoryOrb = this.add.container(480, 305).setDepth(30);
    const shell = this.add.image(0, 0, 'room-memory-shell')
      .setDisplaySize(112, 112);
    const hit = this.add.circle(0, 0, 50, 0xffffff, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation();
      this.touchMemoryOrb();
    });
    this.memoryOrb.add([shell, hit]);
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
    this.cameras.main.fade(520, 23, 45, 35);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('ending', { completedChapter: 1 }));
  }

  /** 解谜完成后再次点墙画，只看正面的画本身，不重开桌面、光影或三笔风。 */
  private openCompletedPainting(): void {
    if (this.interacting || this.orbTouched || !this.progress.shadowBoatSolved) return;
    this.interacting = true;
    showRoomPaintingPreview(
      this,
      resolveImageUrl('assets/environment/room-wall-drawing-incomplete.png'),
      () => { this.interacting = false; },
    );
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


    this.hintText = this.add.text(260, 14, '', {
      fontFamily: ROOM_INK_FONT,
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
        if (item?.id === 'flashlight' && this.shadowBoatPanel) {
          this.applyProgressEvent({ type: 'flashlight-placed' });
          this.saveProgress();
          this.shadowBoatPanel.setFlashlightEquipped(true);
          this.inventoryBar?.removeItem('flashlight');
        }
        if (item?.id === 'photo-piece' && !this.interacting) this.openObject('photo');
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
      this.inventoryBar?.addItem({
        id: 'photo-piece',
        glyph: '拼',
        label: '照片拼块',
        imageUrl: photoFrameUrl,
        imageCrop: { column: 3, row: 3, columns: 4, rows: 4 },
      });
    }
    if (this.progress.flashlightCollected && !this.progress.flashlightPlaced) this.addFlashlightToInventory();
    if (this.progress.batteryCollected && !this.progress.flashlightPowered) {
      this.inventoryBar?.addItem({ id: 'flashlight-battery', glyph: '电', label: '电池' });
    }
    if (this.progress.paintBrushCollected && !this.progress.paintBrushUsed) {
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

  private addFlashlightToInventory(): void {
    this.inventoryBar?.addItem({
      id: 'flashlight', glyph: '光', label: '手电筒',
      iconUrl: resolveImageUrl(this.progress.flashlightPowered ? flashlightOnUrl : flashlightOffUrl),
    });
  }

  private combineFlashlight(): void {
    if (!canPowerFlashlight(this.progress) || this.interacting) return;
    this.interacting = true;
    showRoomItemPresentation(this, {
      mode: 'combine',
      onCombined: () => {
        this.applyProgressEvent({ type: 'flashlight-powered' });
        this.saveProgress();
        this.inventoryBar?.removeItem('flashlight-battery');
        this.addFlashlightToInventory();
        this.installRoomProgressObjects();
      },
      onClose: () => {
        this.interacting = false;
        showRoomItemNotice(this, '手电筒亮了，已经收进物品栏。');
      },
    });
  }

  private openBatteryBox(): void {
    if (this.interacting) return;
    if (!this.progress.photoSolved) {
      showRoomItemNotice(this, '无法打开。');
      return;
    }
    this.interacting = true;
    showRoomItemPresentation(this, {
      mode: 'box',
      hasBattery: !this.progress.batteryCollected,
      onTakeBattery: () => {
        this.applyProgressEvent({ type: 'battery-collected' });
        this.saveProgress();
        this.inventoryBar?.addItem({ id: 'flashlight-battery', glyph: '电', label: '电池' });
        this.installRoomProgressObjects();
      },
      onClose: () => {
        this.interacting = false;
        if (canPowerFlashlight(this.progress)) this.combineFlashlight();
        else if (this.progress.batteryCollected && !this.progress.flashlightPowered) {
          showRoomItemNotice(this, '你捡到了一节电池。');
        }
      },
    });
  }

  private openCompletedPhotoStory(): void {
    this.openDomPanel(() => showPhotoMemoryText(this, photoFrameUrl, () => {
      // 文字面板先恢复场景，再在下一拍打开中央木盒，避免两个 UI 重叠。
      this.time.delayedCall(30, () => this.openBatteryBox());
    }));
  }

  private installRoomProgressObjects(): void {
    this.roomProgressProps?.destroy(true);
    const props = this.add.container(0, 0).setDepth(3);
    this.roomProgressProps = props;
    // Rebuilt props belong to this container so old closed boxes and batteries disappear.
    const boxShowsBattery = this.progress.photoSolved && !this.progress.batteryCollected;
    props.add(this.addSupportedRoomProp(
      boxShowsBattery ? 'room-box-open-art' : 'room-box-closed-art', 735, 249, 58, 2.2,
    ));
    // 拼图完成后，大场景里的相框也换成同一张海边全家照；完成前仍保留空相框。
    const frameTexture = this.progress.photoSolved ? 'room-frame-complete-art' : 'room-frame-art';
    const frame = this.addSupportedRoomProp(frameTexture, 735, 230, 42, 2.4);
    if (!this.progress.photoSolved) frame.setTint(0x9eabbc);
    props.add(frame);
    // 只让盒子正面下沿接收点击，避免与压在盒盖上的相框热区重叠。
    const boxHit = this.add.rectangle(735, 244, 64, 22, 0, 0)
      .setInteractive({ useHandCursor: true });
    props.add(boxHit);
    boxHit.on('pointerdown', () => {
      if (!this.interacting && !this.orbTouched) this.openBatteryBox();
    });

    const floorItem = (key: string, x: number, y: number, w: number, h: number, angle: number, pickup: () => void) => {
      const sprite = this.add.image(x, y, key).setDisplaySize(w, h).setAngle(angle)
        .setTint(0xc5c5ba).setInteractive({ useHandCursor: true });
      props.add(sprite);
      sprite.on('pointerover', () => sprite.setTint(OBJECT_TINT));
      sprite.on('pointerout', () => sprite.setTint(0xc5c5ba));
      sprite.on('pointerdown', () => {
        if (!this.interacting && !this.orbTouched) pickup();
      });
    };
    // Flat scattered props: no added shadows, floating hover movement or name labels.
    if (!this.progress.flashlightCollected) {
      floorItem('room-flashlight-off', 530, 431, 25, 43, 104, () => {
        this.applyProgressEvent({ type: 'flashlight-collected' });
        this.saveProgress();
        this.addFlashlightToInventory();
        this.installRoomProgressObjects();
        if (canPowerFlashlight(this.progress)) this.combineFlashlight();
        else showRoomItemNotice(this, '你捡到了一个手电筒。');
      });
    }
    if (!this.progress.paintBrushCollected) {
      floorItem('room-paint-brush', 432, 449, 78, 29, 22, () => {
        this.applyProgressEvent({ type: 'paint-brush-collected' });
        this.saveProgress();
        this.inventoryBar?.addItem({ id: 'paint-brush', glyph: '笔', label: '画笔', iconUrl: resolveImageUrl(paintBrushUrl) });
        this.installRoomProgressObjects();
        showRoomItemNotice(this, '你捡到了一支画笔。');
      });
    }
  }

  private openDeskPopup(): void {
    if (this.interacting || this.orbTouched) return;
    if (!this.progress.flashlightPowered) {
      showRoomItemNotice(this, '手电筒缺少电池，没办法照光。');
      return;
    }
    this.openShadowBoatPuzzle();
    this.inventoryBar?.clearSelection();
    this.inventoryBar?.setExpanded(true);
  }

  private openShadowBoatPuzzle(): void {
    if (this.interacting || this.shadowBoatPanel || !canOpenShadowBoatPuzzle(this.progress)) return;
    this.interacting = true;
    this.shadowBoatPanel = showShadowBoatPuzzleUI(this, {
      initialFlashlightEquipped: this.progress.flashlightPlaced,
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
        this.applyProgressEvent({ type: 'paint-brush-used' });
        this.saveProgress();
        this.inventoryBar?.removeItem('paint-brush');
        this.inventoryBar?.clearSelection();
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
        fontFamily: ROOM_INK_FONT,
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#f0dfb5',
      })
      .setOrigin(0.5)
      .setResolution(Math.max(2, bufferScaleOf(this)))
      .setShadow(0, 1, '#06090a', 3);
  }

  private addCloseButton(layer: Phaser.GameObjects.Container, x: number, y: number): void {
    // 视觉上只留一枚小叉；透明热区仍足够大，方便鼠标点击。
    const hit = this.add
      .rectangle(x, y, 28, 28, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    const glyph = this.add.graphics();
    const drawGlyph = (color: number, alpha: number, width: number) => {
      glyph.clear();
      glyph.lineStyle(width, color, alpha);
      glyph.lineBetween(x - 4, y - 4, x + 4, y + 4);
      glyph.lineBetween(x + 4, y - 4, x - 4, y + 4);
    };
    drawGlyph(0xfff1cf, 0.82, 1.6);
    hit.on('pointerover', () => {
      drawGlyph(0xffffff, 1, 2);
    });
    hit.on('pointerout', () => {
      drawGlyph(0xfff1cf, 0.82, 1.6);
    });
    hit.on('pointerdown', () => this.closePanel());
    layer.add([hit, glyph]);
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
    if (this.pendingPhotoStory) {
      this.pendingPhotoStory = false;
      this.openCompletedPhotoStory();
    }
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
    const sound = this.radioSound;
    this.radioSound = undefined;
    if (!sound) return;
    sound.stop();
    sound.destroy();
  }

  /** 收音机播放期间暂停第一关房间解谜音乐。 */
  private pauseRoomBgm(pause: boolean): void {
    setSceneMusicTemporarilyPaused(this, pause);
  }
}



