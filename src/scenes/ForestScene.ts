import Phaser from 'phaser';
import { applyHDCamera, logicalWorldViewportWidth } from '../systems/Resolution';
import { Player } from '../gameplay/Player';
import { Terrain } from '../gameplay/Terrain';
import { Vine } from '../gameplay/Vine';
import { Effects } from '../gameplay/Effects';
import { Sfx } from '../systems/Sfx';
import { isBackgroundMusicEnabled, registerBackgroundMusic } from '../MusicSettings';
import type { ChapterOneRoomProgress } from '../gameplay/ChapterOneRoomProgress';
import { ChapterOneRoomSession } from '../gameplay/ChapterOneRoomSession';
import {
  canEnterChapterOneRoom,
  type ChapterOneRoomEvent,
} from '../gameplay/ChapterOneRoomRules';

// 第一关正式美术（说明见 assets/level1/README.md）：
//   大背景只画天空、远山、开阔海面、远处渔村、沙滩和装饰性前景岩岸；
//   可跳礁石 / 海鸥 / 动态浪尖 / 钥匙 / 石门都是独立透明图层，由场景按层叠加，
//   各自带自己的碰撞面（礁石碰撞贴平顶亮色岩面、浪尖碰撞跟着动态位移走）。
// 换素材只替换下面的路径与比例常量，路线数值按玩家跳跃能力标定。
import level1BackgroundUrl from '../../scene/level1-watercolor-game-background-v1-1900x540.png?url';

// 角色序列帧：全部状态合并为一张「按状态分区」的精灵图
//   assets/character/meimei-sheet-right-96x112-8x4.png
//   8 列 × 4 行 = 32 格，单帧 96×112，行序 = idle / run / jump / fall
//   帧号：idle 0-7、run 8-15、jump 16-19、fall 24-27（20-23 / 28-31 为预留空位）
// 换美术时只需替换这张图，保持同样的行序与帧数即可，Player 里的常量不用动。
import footstepUrl from '../../assets/audio/sfx-footstep.wav?url';
import jumpSfxUrl from '../../assets/audio/sfx-jump.wav?url';
import forestBgmUrl from '../../assets/audio/forest-bgm.mp3?url';

/** 本关正式素材的纹理 key 与运行时路径（literal assets/ 路径会被 vite 原样拷进构建产物） */
const ART = {
  background: 'level1-background',
  reef: 'level1-stepping-reef',
  gull: 'level1-swing-seagull',
  wave: 'level1-jump-wave-crest',
  key: 'level1-golden-jasmine-key',
  door: 'level1-memory-room-stone-door',
} as const;

const LEVEL1_FILES: Array<[string, string]> = [
  [ART.reef, 'assets/level1/level1-stepping-reef-v1.png'],
  [ART.gull, 'assets/level1/level1-swing-seagull-v3-cute.png'],
  [ART.wave, 'assets/level1/level1-jump-wave-crest-v2.png'],
  [ART.key, 'assets/level1/level1-golden-jasmine-key-v1.png'],
  [ART.door, 'assets/level1/level1-memory-room-stone-door-v3.png'],
];

/** 礁石（源图 1774×887）：平整可站立岩面在源图 x 547..1018、顶面 y≈248。
 *  碰撞体只盖这块岩面，不按整张透明图片的外框建碰撞。 */
const REEF = { scale: 0.16, standLeft: 547, standRight: 1018, standTop: 248 };

/** 浪尖（源图 1536×1024）：最高暖白泡沫脊在源图 x 829..1263、顶面 y=158 */
const WAVE = { scale: 0.18, ridgeLeft: 829, ridgeRight: 1263, ridgeTop: 158 };

/** 海鸥（源图 1774×887）：抓取点=双脚之间，源图 ≈(730, 800) */
const GULL = { scale: 0.134, gripX: 730, gripY: 800 };

/** 石门（源图 1536×1024）：木门开口 x 512..1023、y 183..903；贴图内容底边 y=908 */
const DOOR = {
  scale: 0.314,
  openingLeft: 512,
  openingRight: 1023,
  openingTop: 183,
  openingBottom: 903,
  contentBottom: 908,
};

/** 金钥匙（源图 1536×1024）：游戏内取 72px 高（素材建议 55–80） */
const KEY = { scale: 0.0945, contentCenterX: 789, contentCenterY: 520 };

/** 海鸥抓点摆长：玩家双手正好抓在双脚上，摆幅只在 ±40px 内轻轻荡 */
const GULL_SWING_LENGTH = 46;

/**
 * 第一关路线（世界 1900×540）：左岸岩台 → 礁石 A → 抓住海鸥荡过海面 → 礁石 B（取金钥匙）
 * → 可踩浪尖 → 右岸岩台与石门。
 * 每次跳跃的横向极限约 245px（单跳）/ 405px（+二段跳），路线间距都按这个标定：
 * 礁石 A 到礁石 B 之间 485px 是故意跨不过去的，必须靠海鸥载过去。
 */
const LAYOUT = {
  startLow: { left: 0, right: 190, top: 420 },
  startHigh: { left: 190, right: 510, top: 370 },
  reefA: { standCenter: 677, top: 350 },
  reefB: { standCenter: 1237, top: 330 },
  crest: { ridgeCenter: 1439, top: 341, amplitude: 13, periodMs: 3200 },
  landing: { left: 1560, right: 1900, top: 465 },
  key: { x: 1237, y: 292 },
  door: { openingCenterX: 1740 },
  gull: { fromX: 830, toX: 1090, fromY: 302, toY: 282, speed: 105 },
} as const;

const WORLD_WIDTH = 1900;
const WORLD_HEIGHT = 540;
/** 掉到这个高度以下算落水 */
const FALL_Y = 620;

export default class ForestScene extends Phaser.Scene {
  private player!: Player;
  private terrain!: Terrain;
  private sfx!: Sfx;
  private keyCollected = false;
  private enteredRoom = false;
  private progressSession!: ChapterOneRoomSession;
  private statusText!: Phaser.GameObjects.Text;
  private progressStorageUnavailable = false;
  private checkpoint = { x: 110, y: 386 };
  private questText!: Phaser.GameObjects.Text;
  private touchJumpButton?: Phaser.GameObjects.Text;

  // —— 顶部导航与指示 ——
  private exitButton!: Phaser.GameObjects.Text;
  private restartButton!: Phaser.GameObjects.Text;
  private helpButton!: Phaser.GameObjects.Text;
  private targetBeacon!: Phaser.GameObjects.Text;

  // —— 场景内操作与交互引导 ——
  private startTutorialBadge?: Phaser.GameObjects.Container;
  private tutorialFading = false;
  private gullPrompt!: Phaser.GameObjects.Text;
  private gullGrabRing!: Phaser.GameObjects.Arc;
  private crestPrompt!: Phaser.GameObjects.Text;
  private keyBeacon?: Phaser.GameObjects.Container;
  private helpModal?: Phaser.GameObjects.Container;

  // —— 海鸥：抓点 + 载具，用 Vine 的单摆当"挂在脚上荡"的物理 ——
  private gullVine!: Vine;
  private gullImage!: Phaser.GameObjects.Image;
  private gullFeetX: number = LAYOUT.gull.fromX;
  private gullFeetY: number = LAYOUT.gull.fromY;
  private gullFacing: -1 | 1 = 1;

  // —— 浪尖：上下起浮的落脚点，图像与碰撞体同步位移 ——
  private crestImage!: Phaser.GameObjects.Image;
  private crestBody!: Phaser.GameObjects.Rectangle;

  private door?: Phaser.GameObjects.Image;
  private doorHint?: Phaser.GameObjects.Text;

  private get progress(): ChapterOneRoomProgress {
    return this.progressSession.state;
  }

  constructor() {
    super({
      key: 'forest',
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 1100 }, debug: false },
      },
    });
  }

  preload(): void {
    if (!this.textures.exists(Player.SHEET)) {
      this.load.spritesheet(Player.SHEET, Player.SHEET_URL, {
        frameWidth: Player.FRAME_W,
        frameHeight: Player.FRAME_H,
      });
    }
    const audio: Array<[string, string]> = [
      ['sfx-footstep', footstepUrl],
      ['sfx-jump', jumpSfxUrl],
      ['forest-bgm', forestBgmUrl],
    ];
    for (const [key, url] of audio) {
      if (!this.cache.audio.exists(key)) this.load.audio(key, url);
    }
    if (!this.textures.exists(ART.background)) {
      this.load.image(ART.background, level1BackgroundUrl);
    }
    for (const [key, url] of LEVEL1_FILES) {
      if (!this.textures.exists(key)) this.load.image(key, url);
    }
  }

  create(): void {
    // Phaser 会复用场景实例；章节进度从存档恢复，进门动画锁按本次场景运行重置。
    this.progressSession = ChapterOneRoomSession.restore();
    this.keyCollected = this.progress.forestKeyCollected;
    this.progressStorageUnavailable = false;
    this.enteredRoom = false;
    this.checkpoint = { x: 110, y: 386 };
    applyHDCamera(this, 'expand-horizontal');
    const camera = this.cameras.main;
    let viewportWidth = logicalWorldViewportWidth(this);
    const updateViewport = () => {
      viewportWidth = logicalWorldViewportWidth(this);
      const zoom = this.scale.gameSize.height / WORLD_HEIGHT;
      camera.setZoom(zoom);
      camera.setSize(this.scale.gameSize.width, this.scale.gameSize.height);
      camera.setDeadzone(Math.min(180, viewportWidth * 0.22), 100);
      if (this.questText) this.questText.setX(viewportWidth - 32);
      if (this.targetBeacon) this.targetBeacon.setX(viewportWidth - 32);
      if (this.touchJumpButton) this.touchJumpButton.setX(Math.min(viewportWidth - 75, WORLD_WIDTH - 20));
    };
    updateViewport();
    this.scale.on(Phaser.Scale.Events.RESIZE, updateViewport);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, updateViewport));
    this.sfx = new Sfx(this);
    this.cameras.main.setBackgroundColor('#12506b');
    // 正式水彩大背景按逻辑画布完整铺开，与世界坐标同步滚动（不下挂视差）。
    this.add
      .image(0, 0, ART.background)
      .setOrigin(0, 0)
      .setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT)
      .setDepth(-20);
    // 物理世界在地面下留出落水检测空间，避免世界边界变成"隐形地板"，
    // 让玩家掉进缝隙后卡在地图底部。
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT + 360);
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.add
      .text(32, 26, '第一章 · 海边的记忆', {
        fontFamily: 'sans-serif',
        fontSize: '17px',
        color: '#fff5df',
        backgroundColor: '#18332fe6',
        padding: { x: 11, y: 8 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    // 顶部操作区：退出到主菜单与重试本关按钮
    this.exitButton = this.add
      .text(216, 26, '⌂ 退出菜单', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#e8ddbf',
        backgroundColor: '#1b3833f0',
        padding: { x: 9, y: 7 },
      })
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive({ useHandCursor: true });
    this.exitButton.on('pointerover', () => this.exitButton.setBackgroundColor('#28594e'));
    this.exitButton.on('pointerout', () => this.exitButton.setBackgroundColor('#1b3833f0'));
    this.exitButton.on('pointerdown', () => this.scene.start('menu'));

    this.restartButton = this.add
      .text(306, 26, '↺ 重新开始', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#e8ddbf',
        backgroundColor: '#1b3833f0',
        padding: { x: 9, y: 7 },
      })
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive({ useHandCursor: true });
    this.restartButton.on('pointerover', () => this.restartButton.setBackgroundColor('#28594e'));
    this.restartButton.on('pointerout', () => this.restartButton.setBackgroundColor('#1b3833f0'));
    this.restartButton.on('pointerdown', () => {
      this.player.teleportTo(110, 386);
      this.checkpoint = { x: 110, y: 386 };
      this.setStatus('已回到关卡起点。');
    });

    this.helpButton = this.add
      .text(398, 26, '? 操作指南 [H]', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#ffefc6',
        backgroundColor: '#35431bf0',
        padding: { x: 9, y: 7 },
      })
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive({ useHandCursor: true });
    this.helpButton.on('pointerover', () => this.helpButton.setBackgroundColor('#506627'));
    this.helpButton.on('pointerout', () => this.helpButton.setBackgroundColor('#35431bf0'));
    this.helpButton.on('pointerdown', () => this.toggleHelpModal());

    this.input.keyboard?.on('keydown-H', () => this.toggleHelpModal());
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.helpModal) {
        this.toggleHelpModal();
      } else {
        this.scene.start('menu');
      }
    });

    this.questText = this.add
      .text(viewportWidth - 32, 26, '目标 · 找到发光的钥匙', {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: '#fff4d7',
        backgroundColor: '#18332fe6',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);

    // 屏幕边缘视外目标指引
    this.targetBeacon = this.add
      .text(viewportWidth - 32, 66, '✦ 金钥匙在前方 →', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#ffefc6',
        backgroundColor: '#3f2e14ee',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);
    this.tweens.add({
      targets: this.targetBeacon,
      alpha: { from: 0.75, to: 1 },
      duration: 750,
      yoyo: true,
      repeat: -1,
    });

    // 创建场景内世界引导（新手操作气泡、海鸥交互浮标、浪尖提示等）
    this.createInWorldGuidance();

    // 地面碰撞：左岸两级岩台 + 右岸岩台；中间海面全靠独立素材搭路。
    this.terrain = new Terrain(this, false);
    for (const [span, kind] of [
      [LAYOUT.startLow, 'ground'],
      [LAYOUT.startHigh, 'ground'],
      [LAYOUT.landing, 'ground'],
    ] as const) {
      this.terrain.addPlatform({
        x: span.left,
        y: span.top,
        width: span.right - span.left,
        height: WORLD_HEIGHT - span.top,
        kind,
      });
    }

    // 两处可跳礁石：图与碰撞面都按"平整岩面"对齐。
    this.addReef(LAYOUT.reefA.standCenter, LAYOUT.reefA.top);
    this.addReef(LAYOUT.reefB.standCenter, LAYOUT.reefB.top);

    this.createCrest();
    this.createGull();

    // 真实角色：Player 自带物理体、输入与 idle/run/jump/fall 动画。
    this.player = new Player(this, { x: 110, y: 386, sfx: this.sfx });
    this.physics.add.collider(this.player.view, this.terrain.solids);
    this.physics.add.collider(this.player.view, this.crestBody);

    this.createKey();
    if (this.keyCollected) {
      this.markKeyCollected(false);
      this.showDoor(false);
    }

    this.statusText = this.add
      .text(18, 500, this.keyCollected ? '钥匙已找到 · 去石门找记忆之房' : '移动 A/D 或 ←/→    跳跃 空格 / W / ↑    靠近海鸥按跳跃抓住它', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#dedede',
        backgroundColor: '#171717',
        padding: { x: 10, y: 7 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    camera.startFollow(this.player.view, true, 0.1, 0.1);
    camera.setDeadzone(Math.min(180, viewportWidth * 0.22), 100);

    if (!this.sound.isPlaying('forest-bgm')) {
      const music = this.sound.add('forest-bgm', { loop: true, volume: 0.3 });
      const unregisterMusic = registerBackgroundMusic(music);
      const startMusic = () => {
        if (isBackgroundMusicEnabled() && !this.sound.locked && !music.isPlaying) music.play();
      };
      const cleanupMusic = () => {
        this.sound.off(Phaser.Sound.Events.UNLOCKED, startMusic);
        unregisterMusic();
        music.destroy();
      };
      music.once(Phaser.Sound.Events.DESTROY, unregisterMusic);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupMusic);
      if (this.sound.locked) this.sound.once(Phaser.Sound.Events.UNLOCKED, startMusic);
      else startMusic();
    }

    this.createTouchControls();
  }

  update(_time: number, delta: number): void {
    // 顺序要紧：先让海鸥飞（锚点动），再让玩家决定是否抓它，
    // 最后 player.update 才会把玩家摆到新的抓点上——同一帧里就被带走了。
    this.updateGull(delta);
    this.updateCrest(delta);

    if (this.player.attached) {
      this.gullVine.setNear(false);
    } else {
      this.gullVine.idleUpdate(delta);
      const handY = this.player.view.y - 34;
      const nearGull =
        Phaser.Math.Distance.Between(this.player.view.x, handY, this.gullVine.handX, this.gullVine.handY) < 108;
      this.gullVine.setNear(nearGull && this.gullVine.available);
      if (nearGull && this.gullVine.available) this.player.tryGrabVine(this.gullVine);
    }

    this.player.update(delta);
    this.syncGullVisual();

    const body = this.player.view.body as Phaser.Physics.Arcade.Body;
    const x = this.player.view.x;
    const grounded = body.blocked.down || body.touching.down;

    // 更新海鸥交互引导浮标
    const handY = this.player.view.y - 34;
    const nearGull =
      Phaser.Math.Distance.Between(this.player.view.x, handY, this.gullVine.handX, this.gullVine.handY) < 118;
    this.gullPrompt.setPosition(this.gullVine.handX, this.gullVine.handY + 36);
    if (this.player.attached) {
      this.gullPrompt.setVisible(true);
      this.gullPrompt.setText('[A / D] 蓄力摆荡    [空格 / ↑] 甩向对岸');
      this.gullPrompt.setBackgroundColor('#244636f2');
    } else if (nearGull) {
      this.gullPrompt.setVisible(true);
      this.gullPrompt.setText('[空格 / ↑] 跳起抓牢海鸥双脚');
      this.gullPrompt.setBackgroundColor('#17352bf2');
    } else if (x > 570 && x < 1200) {
      this.gullPrompt.setVisible(true);
      this.gullPrompt.setText('海鸥 · 跳跃可抓取');
      this.gullPrompt.setBackgroundColor('#17352caa');
    } else {
      this.gullPrompt.setVisible(false);
    }

    // 更新浪尖落脚提示
    if (x > 1320 && x < 1550) {
      this.crestPrompt.setVisible(true);
    } else {
      this.crestPrompt.setVisible(false);
    }

    // 屏幕右侧视野外目标箭头引导
    const viewRight = this.cameras.main.worldView.right;
    if (!this.keyCollected) {
      if (LAYOUT.key.x > viewRight - 30) {
        this.targetBeacon.setVisible(true);
        this.targetBeacon.setText('✦ 金钥匙在前方 →');
      } else {
        this.targetBeacon.setVisible(false);
      }
    } else if (!this.enteredRoom) {
      if (LAYOUT.door.openingCenterX > viewRight - 40) {
        this.targetBeacon.setVisible(true);
        this.targetBeacon.setText('🚪 石门在最右侧 →');
      } else {
        this.targetBeacon.setVisible(false);
      }
    } else {
      this.targetBeacon.setVisible(false);
    }

    // 走出起点后淡出操作教程
    if (!this.tutorialFading && x > 400 && this.startTutorialBadge) {
      this.tutorialFading = true;
      this.tweens.add({
        targets: this.startTutorialBadge,
        alpha: 0,
        duration: 400,
        onComplete: () => {
          this.startTutorialBadge?.destroy();
          this.startTutorialBadge = undefined;
        },
      });
    }

    // 在每段安全落脚地面更新检查点；跨越平台失败时回到最近落脚点。
    if (grounded) {
      const nextCheckpoint =
        x >= 1650 ? { x: 1720, y: 431 } :
        x >= 1300 ? { x: 1237, y: 296 } :
        x >= 620 ? { x: 677, y: 316 } : null;
      if (nextCheckpoint && nextCheckpoint.y !== this.checkpoint.y) {
        this.checkpoint = nextCheckpoint;
        this.sfx.checkpoint();
        this.setStatus('安全抵达下一段海岸，继续向前探索。');
      }
    }

    if (this.player.view.y > FALL_Y && !this.enteredRoom) {
      this.player.teleportTo(this.checkpoint.x, this.checkpoint.y);
      this.sfx.fall();
      this.cameras.main.flash(180, 245, 238, 215, false);
      this.setStatus('差一点！回到最近的岸边，再试一次。');
    }
  }

  private createInWorldGuidance(): void {
    // 起点按键教学卡片（常驻于左侧起始平台上方）
    this.startTutorialBadge = this.add.container(260, 270).setDepth(15);
    const badgeBg = this.add
      .rectangle(0, 0, 310, 68, 0x112822, 0.88)
      .setStrokeStyle(1.5, 0xe2ce9b, 0.65);
    const line1 = this.add
      .text(0, -13, '移动 [ A / D ] 或 [ ← / → ]', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#fff3d5',
      })
      .setOrigin(0.5);
    const line2 = this.add
      .text(0, 13, '跳跃 [ 空格 / W ]   轻按小跳 · 长按大跳 · 空中二段跳', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#bed4c5',
      })
      .setOrigin(0.5);
    this.startTutorialBadge.add([badgeBg, line1, line2]);
    this.tweens.add({
      targets: this.startTutorialBadge,
      y: 264,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 海鸥抓取动态引导标签
    this.gullPrompt = this.add
      .text(LAYOUT.gull.fromX, LAYOUT.gull.fromY + 36, '[空格] 跳起抓住海鸥', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#fff3cd',
        backgroundColor: '#16332bf0',
        padding: { x: 8, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);

    // 浪尖借力提示
    this.crestPrompt = this.add
      .text(LAYOUT.crest.ridgeCenter, LAYOUT.crest.top - 36, '∿ 踩着浪尖借力起跳', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#eef8ff',
        backgroundColor: '#1b3b4bf2',
        padding: { x: 7, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);

    // 金钥匙光柱地标（在未拾取前持续指引）
    if (!this.keyCollected) {
      this.keyBeacon = this.add.container(LAYOUT.key.x, LAYOUT.key.y).setDepth(-3);
      const lightRay = this.add
        .rectangle(0, -60, 20, 150, 0xffe6a3, 0.22)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: lightRay,
        alpha: { from: 0.15, to: 0.35 },
        duration: 900,
        yoyo: true,
        repeat: -1,
      });
      const keyHint = this.add
        .text(0, -40, '✦ 金钥匙', {
          fontFamily: 'sans-serif',
          fontSize: '12px',
          color: '#fff5d0',
          backgroundColor: '#3f2d12e6',
          padding: { x: 6, y: 3 },
        })
        .setOrigin(0.5);
      this.keyBeacon.add([lightRay, keyHint]);
    }

    // Reef A 起跳平台醒目路标
    const reefSign = this.add.container(LAYOUT.reefA.standCenter, LAYOUT.reefA.top - 24).setDepth(10);
    const signBox = this.add
      .rectangle(0, 0, 190, 26, 0x14342bf2)
      .setStrokeStyle(1.2, 0xe2ce9b, 0.7);
    const signText = this.add
      .text(0, 0, '▲ 起跳点 · 跳向海鸥自动抓牢', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#fff5d2',
      })
      .setOrigin(0.5);
    reefSign.add([signBox, signText]);
    this.tweens.add({
      targets: reefSign,
      y: LAYOUT.reefA.top - 30,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Reef B 目标礁石路标
    const reefBSign = this.add.container(LAYOUT.reefB.standCenter, LAYOUT.reefB.top - 24).setDepth(10);
    const signBBox = this.add
      .rectangle(0, 0, 150, 26, 0x2d2b17f0)
      .setStrokeStyle(1.2, 0xf0d88e, 0.65);
    const signBText = this.add
      .text(0, 0, '▼ 目标礁石 · 金钥匙', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#fffae5',
      })
      .setOrigin(0.5);
    reefBSign.add([signBBox, signBText]);
  }

  /** 打开/关闭横版动作游戏操作指南弹窗（支持随时按 H 或点击顶部按钮） */
  private toggleHelpModal(): void {
    if (this.helpModal) {
      this.helpModal.destroy();
      this.helpModal = undefined;
      return;
    }
    const vpW = logicalWorldViewportWidth(this);
    const modal = this.add.container(0, 0).setScrollFactor(0).setDepth(300);
    this.helpModal = modal;

    // 半透明深邃水彩遮罩
    const mask = this.add
      .rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 0x07110e, 0.78)
      .setOrigin(0)
      .setInteractive();
    mask.on('pointerdown', () => this.toggleHelpModal());
    modal.add(mask);

    // 主面板卡片
    const cx = vpW / 2;
    const cy = 270;
    const panel = this.add.container(cx, cy);
    const panelBg = this.add
      .rectangle(0, 0, 520, 360, 0x142b24, 0.96)
      .setStrokeStyle(2, 0xe4d19e, 0.85);

    const title = this.add
      .text(0, -145, '— 第一章 · 海边跑酷操作指南 —', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#fff3d2',
      })
      .setOrigin(0.5);

    const content = [
      '🏃 基础移动：按 [ A / D ] 或 [ ← / → ] 左右平稳移动',
      '🦘 跳跃身法：按 [ 空格 / W / ↑ ] 轻按小跳，长按大跳；空中再按二段跳',
      '🕊️ 核心技巧 · 飞鸥摆荡：',
      '    1. 走到左侧礁石起跳点，等待海鸥飞近；',
      '    2. 跳起触碰海鸥双脚即可【自动抓紧】；',
      '    3. 抓牢后海鸥带着你向右飞，按 [ A / D ] 蓄力摆荡；',
      '    4. 按 [ 空格 / ↑ ] 即可借力潇洒跳上对岸礁石！',
      '🌊 浪尖借力：上下浮动的暖白浪尖可作跳板起跳；',
      '🔑 终极目标：拾取右侧礁石上的金钥匙，开启石门进入记忆之房！',
    ].join('\n\n');

    const desc = this.add
      .text(0, 0, content, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#dbe8de',
        lineSpacing: 2,
      })
      .setOrigin(0.5);

    const closeBtn = this.add
      .text(0, 142, '【 知道了，继续游戏 】', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#fff4d6',
        backgroundColor: '#274b3f',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setBackgroundColor('#386d5c'));
    closeBtn.on('pointerout', () => closeBtn.setBackgroundColor('#274b3f'));
    closeBtn.on('pointerdown', () => this.toggleHelpModal());

    panel.add([panelBg, title, desc, closeBtn]);
    modal.add(panel);
  }

  /** 可跳礁石：贴图与碰撞面共用"平整岩面"这一组源图坐标，改尺寸不用重新对位 */
  private addReef(standCenterX: number, topY: number): void {
    const standCenter = (REEF.standLeft + REEF.standRight) / 2;
    this.add
      .image(standCenterX - standCenter * REEF.scale, topY - REEF.standTop * REEF.scale, ART.reef)
      .setOrigin(0, 0)
      .setScale(REEF.scale)
      .setDepth(-8);
    this.terrain.addPlatform({
      x: standCenterX - ((REEF.standRight - REEF.standLeft) / 2) * REEF.scale,
      y: topY,
      width: (REEF.standRight - REEF.standLeft) * REEF.scale,
      height: WORLD_HEIGHT - topY,
      kind: 'float',
    });
  }

  /** 动态浪尖：整张图与落脚碰撞一起上下起浮（素材要求"动态位移与碰撞体同步"） */
  private createCrest(): void {
    const ridgeCenter = (WAVE.ridgeLeft + WAVE.ridgeRight) / 2;
    this.crestImage = this.add
      .image(LAYOUT.crest.ridgeCenter - ridgeCenter * WAVE.scale, LAYOUT.crest.top - WAVE.ridgeTop * WAVE.scale, ART.wave)
      .setOrigin(0, 0)
      .setScale(WAVE.scale)
      .setDepth(-7);
    this.crestImage.setData('baseY', this.crestImage.y);
    this.crestBody = this.add
      .rectangle(
        LAYOUT.crest.ridgeCenter - ((WAVE.ridgeRight - WAVE.ridgeLeft) / 2) * WAVE.scale,
        LAYOUT.crest.top,
        (WAVE.ridgeRight - WAVE.ridgeLeft) * WAVE.scale,
        60,
        0xffffff,
      )
      .setOrigin(0, 0)
      .setVisible(false);
    this.physics.add.existing(this.crestBody, false);
    const body = this.crestBody.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    this.crestBody.setData('baseY', this.crestBody.y);
  }

  private updateCrest(_delta: number): void {
    const bob = Math.sin((this.time.now / LAYOUT.crest.periodMs) * Math.PI * 2) * LAYOUT.crest.amplitude;
    this.crestImage.setY((this.crestImage.getData('baseY') as number) + bob);
    this.crestBody.setY((this.crestBody.getData('baseY') as number) + bob);
  }

  /**
   * 海鸥：脚是抓点，也是一条会飞的摆绳锚点。
   * 玩家跳起来按跳跃抓住它的脚，被它带着荡过海面，再按跳跃松手下到对岸。
   */
  private createGull(): void {
    this.gullFeetX = LAYOUT.gull.fromX;
    this.gullFeetY = LAYOUT.gull.fromY;
    this.gullImage = this.add
      .image(this.gullFeetX, this.gullFeetY, ART.gull)
      .setOrigin(GULL.gripX / 1774, GULL.gripY / 887)
      .setScale(GULL.scale)
      .setDepth(-5);
    // 锚点在抓点正上方一个摆长处：静止时 hand == 双脚，玩家双手正好抓在脚上
    this.gullVine = new Vine(this, this.gullFeetX, this.gullFeetY - GULL_SWING_LENGTH, {
      length: GULL_SWING_LENGTH,
      minLength: GULL_SWING_LENGTH,
      maxLength: GULL_SWING_LENGTH,
      stiffness: 520,
      placeholder: false,
    });
    // 海鸥抓点光环：指引玩家何处可以抓牢
    this.gullGrabRing = this.add
      .circle(this.gullFeetX, this.gullFeetY, 18, 0xffebaa, 0.4)
      .setStrokeStyle(2, 0xfff6d4, 0.9)
      .setDepth(-4);
    this.tweens.add({
      targets: this.gullGrabRing,
      scale: { from: 0.85, to: 1.3 },
      alpha: { from: 0.85, to: 0.2 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private updateGull(delta: number): void {
    const span = Math.abs(LAYOUT.gull.toX - LAYOUT.gull.fromX);
    const periodMs = ((span * 2) / LAYOUT.gull.speed) * 1000;
    const cycle = (this.time.now % periodMs) / periodMs;
    const p = cycle < 0.5 ? cycle * 2 : 2 - cycle * 2;
    const feetX = Phaser.Math.Linear(LAYOUT.gull.fromX, LAYOUT.gull.toX, p);
    const feetY = Phaser.Math.Linear(LAYOUT.gull.fromY, LAYOUT.gull.toY, p);
    // 飞行方向：用于镜像海鸥朝向
    this.gullFacing = cycle < 0.5 ? 1 : -1;
    this.gullVine.driftVx = delta > 0 ? ((feetX - this.gullFeetX) / delta) * 1000 : 0;
    this.gullFeetX = feetX;
    this.gullFeetY = feetY;
    this.gullVine.setAnchor(feetX, feetY - GULL_SWING_LENGTH);
  }

  /** 海鸥贴图永远钉在自己的双脚上（=摆绳的握点），并随着玩家摆动轻轻侧倾 */
  private syncGullVisual(): void {
    this.gullImage.setPosition(this.gullVine.handX, this.gullVine.handY);
    this.gullImage.setRotation(this.gullVine.angle * 0.35);
    this.gullImage.setScale(this.gullFacing * GULL.scale, GULL.scale);
    if (this.gullGrabRing) {
      this.gullGrabRing.setPosition(this.gullVine.handX, this.gullVine.handY);
      this.gullGrabRing.setVisible(!this.player.attached);
    }
  }

  private createKey(): void {
    const keyImage = this.add
      .image(LAYOUT.key.x, LAYOUT.key.y, ART.key)
      .setScale(KEY.scale)
      .setDepth(-1);
    this.tweens.add({
      targets: keyImage,
      y: keyImage.y - 10,
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    // 拾取区独立于图像：图像只做浮动动画，物理位置不跟着变，避免"看得到却捡不到"。
    const keyZone = this.add.zone(LAYOUT.key.x, LAYOUT.key.y, 70, 76);
    this.physics.add.existing(keyZone, true);
    this.physics.add.overlap(this.player.view, keyZone, () => {
      if (this.keyCollected || !this.player) return;
      this.applyProgressEvent({ type: 'forest-key-collected' });
      this.keyCollected = this.progress.forestKeyCollected;
      this.saveProgress();
      keyImage.destroy();
      keyZone.destroy();
      this.keyBeacon?.destroy();
      this.keyBeacon = undefined;
      this.sfx.key();
      Effects.sparkBurst(this, LAYOUT.key.x, LAYOUT.key.y);
      this.markKeyCollected(true);
      this.showDoor(true);
    });
  }

  private markKeyCollected(announce: boolean): void {
    this.questText.setText('目标 · 走进右边的石门');
    if (announce) this.setStatus('钥匙找到了！右边礁岩上裂开了一扇石门。');
  }

  /** 石门：取到钥匙后才显现（素材要求），交互区以木门开口为准，不含两侧装饰岩块 */
  private showDoor(animated: boolean): void {
    if (this.door) return;
    const imageLeft = LAYOUT.door.openingCenterX - ((DOOR.openingLeft + DOOR.openingRight) / 2) * DOOR.scale;
    const imageTop = LAYOUT.landing.top - DOOR.contentBottom * DOOR.scale;
    this.door = this.add
      .image(imageLeft + (1536 / 2) * DOOR.scale, imageTop + (1024 / 2) * DOOR.scale, ART.door)
      .setScale(DOOR.scale)
      .setDepth(-6);
    const openingWidth = (DOOR.openingRight - DOOR.openingLeft) * DOOR.scale;
    const openingHeight = (DOOR.openingBottom - DOOR.openingTop) * DOOR.scale;
    const openingCenterX = imageLeft + ((DOOR.openingLeft + DOOR.openingRight) / 2) * DOOR.scale;
    const openingCenterY = imageTop + ((DOOR.openingTop + DOOR.openingBottom) / 2) * DOOR.scale;
    this.doorHint = this.add
      .text(openingCenterX, openingCenterY - openingHeight / 2 - 26, '记忆之房 · 走近进入', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#f4e8c8',
        backgroundColor: '#24352ddd',
        padding: { x: 8, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(5);
    const doorZone = this.add.zone(openingCenterX, openingCenterY, openingWidth, openingHeight);
    this.physics.add.existing(doorZone, true);
    this.physics.add.overlap(this.player.view, doorZone, () => {
      if (this.enteredRoom) return;
      if (!canEnterChapterOneRoom(this.progress)) {
        this.setStatus('石门还差一点力气推开…');
        return;
      }
      this.enteredRoom = true;
      this.applyProgressEvent({ type: 'forest-door-entered' });
      this.saveProgress();
      this.doorHint?.setText('回家的路，打开了…');
      this.questText.setText('记忆 · 屋里有人在等你');
      this.setStatus('石门后面亮着…');
      this.sfx.door();
      this.player.freeze();
      this.time.delayedCall(550, () => this.scene.start('room'));
    });

    if (animated) {
      this.door.setAlpha(0);
      this.doorHint.setAlpha(0);
      Effects.ring(this, openingCenterX, openingCenterY);
      this.tweens.add({ targets: [this.door, this.doorHint], alpha: 1, duration: 900, ease: 'Quad.easeOut' });
    }
  }

  private createTouchControls(): void {
    if (!window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints === 0) return;
    const makeButton = (x: number, label: string, onDown: () => void, onUp: () => void) => {
      const button = this.add
        .text(x, 460, label, {
          fontFamily: 'sans-serif',
          fontSize: '26px',
          color: '#dddddd',
          backgroundColor: '#303030',
          padding: { x: 18, y: 12 },
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(120)
        .setInteractive();
      button.on('pointerdown', onDown);
      button.on('pointerup', onUp);
      button.on('pointerout', onUp);
      return button;
    };
    makeButton(74, '◀', () => this.player.setTouchMove(-1), () => this.player.setTouchMove(0));
    makeButton(154, '▶', () => this.player.setTouchMove(1), () => this.player.setTouchMove(0));
    const rightButtonX = Math.min(logicalWorldViewportWidth(this) - 75, WORLD_WIDTH - 20);
    this.touchJumpButton = makeButton(rightButtonX, '↑', () => this.player.pressTouchJump(true), () => this.player.pressTouchJump(false));
  }

  private saveProgress(): void {
    if (this.progressSession.save()) {
      this.progressStorageUnavailable = false;
    } else {
      this.progressStorageUnavailable = true;
      this.setStatus('进度写入失败，关闭页面后可能丢失。');
    }
  }

  private setStatus(message: string): void {
    const text = this.progressStorageUnavailable && !message.includes('关闭页面后可能丢失')
      ? `${message} · 进度仅在本次游玩中保留`
      : message;
    this.statusText.setText(text);
  }

  private applyProgressEvent(event: ChapterOneRoomEvent): void {
    this.progressSession.dispatch(event);
  }
}
