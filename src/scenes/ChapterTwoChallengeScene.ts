import Phaser from 'phaser';
import { Player } from '../gameplay/Player';
import { Terrain } from '../gameplay/Terrain';
import { drawStreetSurface, drawTileRoofCap } from '../gameplay/chapterTwoArt';
import { applyHDCamera } from '../systems/Resolution';
import { TEACHER, TEACHER_ART, LIGHT_ORIGIN, LIGHT_LENGTH, LIGHT_HALF_ANGLE, DETECTION_MS, initialSearchlight, updateLight, isInBeam, belowStreet } from '../gameplay/chapterTwoRules';

type Checkpoint = { x: number; y: number; label: string };
type Cover = { from: number; to: number; baseY: number; label: string };
type SwingHazard = { x: number; y: number; baseY: number; length: number; phase: number; label: string };

const WORLD_WIDTH = 3680;
const WORLD_HEIGHT = 1100;
const CHECKPOINTS: Checkpoint[] = [
  { x: 110, y: 212, label: '学校后墙' },
  { x: 575, y: 276, label: '货箱堆' },
  { x: 1510, y: 566, label: '骑楼二层' },
  { x: 485, y: 776, label: '骑楼底层' },
  { x: 2100, y: 866, label: '长街中段' },
];
const COVERS: Cover[] = [
  { from: 430, to: 505, baseY: 320, label: '骑楼柱影' },
  { from: 850, to: 945, baseY: 380, label: '布棚阴影' },
  { from: 1280, to: 1375, baseY: 440, label: '店招后方' },
  { from: 1450, to: 1545, baseY: 610, label: '二层柱影' },
  // 旧雨棚 [1040,1145]：模块 C 支点东迁后整条棚下走道落进竹竿杀区 [944,1156]，
  // 不再是安全岛（遮光仍有效，=穿杆中途站定的屏灯位，等下一扇穿杆窗再走）。
  { from: 1040, to: 1145, baseY: 610, label: '旧雨棚' },
  { from: 640, to: 735, baseY: 610, label: '货箱后方' },
  { from: 430, to: 545, baseY: 820, label: '底层柱廊' },
  // 摊位布帘 [1190,1265]：竹竿支点东迁后（模块 C）布帘右缘从 1305 收到 1265——
  // 杀区东沿 1156 与木凳(1170)之间只有 14px，无法站定；出仓改在布帘下屏灯蓄相位，
  // 出口几何（上凳→主窗→二段跳）详见 SWINGS[1] 注释（木凳顶 528 为天然防杆安全岛）。
  { from: 1190, to: 1265, baseY: 610, label: '摊位布帘' },
  { from: 2040, to: 2170, baseY: 910, label: '长街柱影' },
  { from: 2860, to: 2995, baseY: 950, label: '街口货摊' },
  // 摆动晾衣架旁的货箱堆：被灯逼停时的第二个安全位（jev 判定 add_mid_cover 0.73；
  // 摆动杀区 x[628,812] 内无全程安全点，此处在杀区外沿，距杆尖极限 39px）。
  { from: 540, to: 618, baseY: 320, label: '货箱堆' },
];
const SWINGS: SwingHazard[] = [
  { x: 720, y: 220, baseY: 320, length: 98, phase: 0, label: '摆动晾衣架' },

  // 竹竿支点右移 930→1050、相位 1.7→2.6（模块 C）。支点东迁后杀区成为 x[944,1156]：
  // 站位线上死区 ~50px 宽、随摆整体东西向扫动（峰值约 193px/s，低于满速 225px/s），
  // 玩家可贴扫描边缘「两段穿杆」通过；单段全程直穿不成立（θ≈0 时杆身垂直贯穿站位线）。
  // 通关路线：布帘 [1190,1265] 屏灯等相 → 木凳顶（y=610 上 46px，中心 528 > 杆最低 543，
  // 天然免杀）。主窗 = 危险间隙 |θ|<0.45（约 1100ms/周期）；木凳顶等相位，在杆西端点
  // (θ≈-0.8) 起跳：跳-1 克服东半带（θ 扫至 1.2 死区移至东侧），二段跳接力把西侧极端
  // 时已飞出杀区西沿，落在 [904,938] 走道。全窗口时序断言见 tests/chapterTwoRules。

  { x: 1050, y: 492, baseY: 610, length: 112, phase: 2.6, label: '甩动竹竿' },
];

/** 第二关：学校后墙 → 骑楼折返 → 长街逃离。碰撞与前景结构分别构建。 */
export default class ChapterTwoChallengeScene extends Phaser.Scene {
  private player!: Player;
  private terrain!: Terrain;
  private title!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private checkpointText!: Phaser.GameObjects.Text;
  private alertLabel!: Phaser.GameObjects.Text;
  private lightGraphics!: Phaser.GameObjects.Graphics;
  private hotspotGraphics!: Phaser.GameObjects.Graphics;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private swingArt: Phaser.GameObjects.Image[] = [];
  private coverArt: Phaser.GameObjects.Image[] = [];
  private checkpointIndex = 0;
  private detectionMs = 0;
  private alert = 0;
  private wasLit = false;
  private searchlight = initialSearchlight();
  private previousPlayer = new Phaser.Math.Vector2();
  private tokenCollected = false;
  private leaving = false;
  private restarting = false;
  private tutorialSafe = true;
  /** 关键反馈的保护期：期间每帧导航提示不得抢屏（教学/检查点/重试/拾取） */
  private statusHoldMs = 0;

  constructor() {
    super({
      key: 'chapter2',
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1100 }, debug: false } },
    });
  }

  preload(): void {
    // 与第一关共用同一个年年角色（三套序列帧由 Player 统一下发）
    Player.preload(this);
    this.load.image('chapter2-background', 'assets/scenes/chapter2/chapter2-qilou-gen-v3-7360x2200.png');
    this.load.atlas('chapter2-obstacles', 'assets/level2/qilou/chapter2-static-obstacles-3x3.png', 'assets/level2/qilou/chapter2-static-obstacles-3x3.aligned.json');
    this.load.atlas('chapter2-covers', 'assets/level2/qilou/chapter2-cover-modules-5x2.png', 'assets/level2/qilou/chapter2-cover-modules-5x2.aligned.json');
    this.load.atlas('chapter2-dynamic', 'assets/level2/qilou/chapter2-dynamic-goal-modules-4x2.png', 'assets/level2/qilou/chapter2-dynamic-goal-modules-4x2.aligned.json');
    this.load.atlas('chapter2-platforms', 'assets/level2/qilou/chapter2-platform-tiles-4x2.png', 'assets/level2/qilou/chapter2-platform-tiles-4x2.aligned.json');
  }

  create(): void {
    this.checkpointIndex = 0;
    this.detectionMs = 0;
    this.alert = 0;
    this.tokenCollected = false;
    this.leaving = false;
    this.restarting = false;
    this.tutorialSafe = true;
    this.wasLit = false;
    // 开场教学文案自带保护期；否则第一帧就会被 updateSearchlight 的导航提示覆盖
    this.statusHoldMs = 4500;
    this.searchlight = initialSearchlight();

    applyHDCamera(this);
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor('#b8c7c4');

    if (!this.textures.exists('chapter2-background')) {
      // 静默失败曾让缺失纹理渲染成绿色棋盘四轮未被发现（见 module-review 文档）。
      this.add.text(24, 24, '背景纹理加载失败：chapter2-background', {
        fontFamily: 'sans-serif', fontSize: '18px', color: '#ff5040', backgroundColor: '#200',
      }).setScrollFactor(0).setDepth(9999);
    }
    this.drawQilouStreet();
    this.terrain = new Terrain(this, false);

    // 第一层：持续向右。
    this.addStreetPlatform(0, 260, 420, 28);
    this.addStreetPlatform(390, 320, 430, 28);
    this.addStreetPlatform(790, 380, 450, 28);
    // 平台在封路墙前留出 103px 平台缺口：平台左缘 1265 与第二层摊位布帘右缘 1265 对齐，
    // 第一层→第二层仍垂直可下（角色半径 18 早落），玩家不用移位穿缝（模块 C 同步对位）。
    this.addStreetPlatform(1265, 440, 295, 28);
    // 第二层：从右侧落下，再向左穿过骑楼。
    this.addStreetPlatform(420, 610, 1280, 28);
    // 第三层：从左侧落下，再向右穿过长街。
    this.addStreetPlatform(330, 820, 800, WORLD_HEIGHT - 820);
    this.addStreetPlatform(1090, 865, 850, WORLD_HEIGHT - 865);
    this.addStreetPlatform(1900, 910, 850, WORLD_HEIGHT - 910);
    this.addStreetPlatform(2700, 950, 980, 150);
    // 接缝落在世界 x≈1940 的街面台阶处（切缝即台阶立面），无需盖柱。

    const hurdles = [
      this.addHurdle(505, 320, 48, '路障'),
      this.addHurdle(1040, 380, 56, '晾衣架'),
      this.addHurdle(1450, 440, 62, '施工栏'),
      this.addHurdle(1170, 610, 46, '木凳'), // 甩动竹竿东侧挡板：顶面 564 = 天然防杆安全岛（详见 SWINGS[1] 注释）
      this.addHurdle(760, 610, 54, '货箱'),
      this.addHurdle(820, 820, 58, '竹竿架'),
      this.addHurdle(1540, 865, 62, '摊位架'),
      this.addHurdle(2350, 910, 66, '修路栏'),
      this.addHurdle(3180, 950, 60, '街口木架'),
      this.addWall(1682, 448, 38, 286, '此路封住 · 向左'),
    ];
    this.drawCovers();

    this.player = new Player(this, { x: CHECKPOINTS[0].x, y: CHECKPOINTS[0].y, speed: 225 });
    this.physics.add.collider(this.player.view, this.terrain.solids);
    this.physics.add.collider(this.player.view, hurdles);
    this.previousPlayer.set(this.player.view.x, this.player.view.y);

    this.createGoal();
    this.createHazardArt();
    this.lightGraphics = this.add.graphics().setDepth(14);
    this.hotspotGraphics = this.add.graphics().setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
    this.hudGraphics = this.add.graphics().setDepth(200);
    this.title = this.add.text(145, 24, '第二关 · 骑楼街逃课', {
      fontFamily: 'sans-serif', fontSize: '19px', color: '#253631',
      backgroundColor: 'rgba(247,241,220,.9)', padding: { x: 12, y: 8 },
    }).setOrigin(0).setDepth(201);
    this.status = this.add.text(18, 474, '先向右逃。灯光从身后扫来时，马上松开方向键站定。', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#f4edda',
      backgroundColor: 'rgba(20,31,29,.9)', padding: { x: 11, y: 8 },
    }).setOrigin(0).setDepth(201);
    this.checkpointText = this.add.text(18, 514, '路线 · 第一层向右 →', {
      fontFamily: 'sans-serif', fontSize: '11px', color: '#40524c',
      backgroundColor: 'rgba(235,235,218,.82)', padding: { x: 8, y: 5 },
    }).setOrigin(0, 1).setDepth(201);
    this.alertLabel = this.add.text(0, 0, '警觉 0%', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#f4ead0',
    }).setOrigin(0, .5).setDepth(201);

    this.cameras.main.startFollow(this.player.view, true, .085, .085);
    this.cameras.main.setDeadzone(180, 115);
    this.cameras.main.fadeIn(350, 20, 29, 28);
  }

  update(time: number, delta: number): void {
    this.statusHoldMs = Math.max(0, this.statusHoldMs - delta);
    if (!this.leaving && !this.restarting) this.player.update(delta);
    if (!this.restarting && !this.leaving && belowStreet(this.player.view.x, this.player.view.y + 34)) {
      this.restartFromCheckpoint('离开了街道路面');
    }
    this.updateCheckpoint();
    this.updateSearchlight(time, delta);
    this.updateDynamicHazards(time);
    this.layoutHud(time);
    this.previousPlayer.set(this.player.view.x, this.player.view.y);
  }

  private drawQilouStreet(): void {
    this.add.image(0, 0, 'chapter2-background').setOrigin(0).setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(-30);
    // 保留少量路线提示；场景建筑本身由正式背景提供。
    this.add.text(92, 112, '学校后墙', { fontFamily: 'sans-serif', fontSize: '15px', color: '#4d5b56', backgroundColor: '#f5eed8bb', padding: { x: 5, y: 3 } }).setDepth(-5);
    this.add.text(1370, 515, '↓ 落下后向左走', { fontFamily: 'sans-serif', fontSize: '16px', color: '#4b3e32', backgroundColor: '#efe2c5cc', padding: { x: 8, y: 5 } }).setDepth(10);
    this.add.text(455, 730, '↓ 到底层后向右走', { fontFamily: 'sans-serif', fontSize: '16px', color: '#4b3e32', backgroundColor: '#efe2c5cc', padding: { x: 8, y: 5 } }).setDepth(10);
    this.add.text(3260, 865, '骑楼街口', { fontFamily: 'sans-serif', fontSize: '16px', color: '#4d514a' }).setDepth(-5);
  }

  private addStreetPlatform(x: number, y: number, width: number, height: number): void {
    this.terrain.addPlatform({ x, y, width, height });
    drawStreetSurface(this, x, y, width, height);
  }

  private addHurdle(x: number, baseY: number, height: number, label: string): Phaser.GameObjects.Rectangle {
    const frames: Record<string, string> = {
      路障: 'road-barricade', 晾衣架: 'laundry-rack-static', 施工栏: 'construction-rail',
      木凳: 'wooden-stool', 货箱: 'cargo-crate', 竹竿架: 'bamboo-pole-rack',
      摊位架: 'market-stall-frame', 修路栏: 'road-repair-barrier', 街口木架: 'street-wood-rack',
    };
    const frame = this.textures.getFrame('chapter2-obstacles', frames[label]);
    this.add.image(x, baseY, 'chapter2-obstacles', frames[label])
      .setOrigin(.5, 1).setScale(height / frame.height).setDepth(12);
    const obstacle = this.add.rectangle(x, baseY - height / 2, 26, height, 0x000000, 0)
      .setOrigin(.5).setDepth(11);
    this.physics.add.existing(obstacle, true);
    return obstacle;
  }

  private addWall(x: number, y: number, width: number, height: number, label: string): Phaser.GameObjects.Rectangle {
    // 这根柱子就是封路实体：可见尺寸必须与原 38×286 的阻挡范围重合；柱头加瓦檐，不裸顶。
    // 0x89928c：在缝柱材质上再压一档（终审建议：原亮白贴图即使 tint 后仍比同屏柱浅）。
    this.add.image(x, y, 'chapter2-platforms', 'route-blocking-wall')
      .setOrigin(.5, 0).setDisplaySize(width, height).setTint(0x89928c).setDepth(10);
    const wallGraphics = this.add.graphics().setDepth(10);
    drawTileRoofCap(wallGraphics, x, y, width / 2 + 11);
    // 与缝柱同材质压暗 + 底部接触 AO：基座与柱身统一色相，消除贴片感。
    wallGraphics.fillStyle(0x2f2a22, .18).fillRect(x - width / 2 - 3, y + height - 6, width + 6, 6);
    const wall = this.add.rectangle(x, y, width, height, 0x000000, 0).setOrigin(.5, 0).setDepth(11);
    this.physics.add.existing(wall, true);
    this.add.text(x - 12, y + height / 2, label, {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#f2ead4', backgroundColor: '#34413ddd', padding: { x: 6, y: 4 },
    }).setOrigin(.5).setAngle(-90).setDepth(12);
    return wall;
  }

  private drawCovers(): void {
    const frames = ['cover-upper-column', 'cover-cloth-awning', 'cover-shop-sign', 'cover-second-floor-column', 'cover-old-rain-awning', 'cover-cargo-stack', 'cover-ground-arcade', 'cover-market-curtain', 'cover-street-column', 'cover-corner-stall', 'cover-cargo-stack'];
    this.coverArt = [];
    COVERS.forEach((cover, index) => {
      const width = cover.to - cover.from;
      const source = this.textures.getFrame('chapter2-covers', frames[index]);
      const scale = Math.min(166 / source.height, (width + 24) / source.width);
      this.coverArt.push(this.add.image((cover.from + cover.to) / 2, cover.baseY, 'chapter2-covers', frames[index])
        .setOrigin(.5, 1).setScale(scale).setDepth(16));
    });
  }

  private createGoal(): void {
    const token = this.add.image(3420, 898, 'chapter2-dynamic', 'memory-ticket').setScale(48 / this.textures.getFrame('chapter2-dynamic', 'memory-ticket').width).setDepth(21);
    const tokenGlow = this.add.circle(3420, 898, 28, 0xe4bd5e, .16).setDepth(20);
    const tokenLabel = this.add.text(3420, 860, '旧票根 · 记忆信物', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#3b3222',
      backgroundColor: 'rgba(247,242,220,.9)', padding: { x: 7, y: 4 },
    }).setOrigin(.5).setDepth(22);
    const tokenHit = this.add.rectangle(3420, 898, 58, 68, 0xffffff, 0);
    this.physics.add.existing(tokenHit, true);

    const door = this.add.image(3600, 872, 'chapter2-dynamic', 'memory-room-door').setScale(156 / this.textures.getFrame('chapter2-dynamic', 'memory-room-door').height).setDepth(12);
    const doorSign = this.add.text(3600, 780, '第二记忆房', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#e8e5d6', align: 'center',
    }).setOrigin(.5).setDepth(13);
    const doorHit = this.add.rectangle(3600, 872, 96, 170, 0xffffff, 0);
    this.physics.add.existing(doorHit, true);

    this.physics.add.overlap(this.player.view, tokenHit, () => {
      if (this.tokenCollected || this.restarting) return;
      this.tokenCollected = true;
      this.detectionMs = 0; this.alert = 0;
      token.destroy(); tokenGlow.destroy(); tokenLabel.destroy(); tokenHit.destroy();
      door.setTint(0xc7e8cf);
      doorSign.setText('门已开启');
      this.announce('拿到旧票根了。老师停下了，继续向右进入第二记忆房。', 3600);
      this.tweens.add({ targets: door, alpha: { from: .64, to: 1 }, duration: 420, yoyo: true });
    });
    this.physics.add.overlap(this.player.view, doorHit, () => {
      if (this.restarting) return;
      if (!this.tokenCollected) { this.warn('门还没有回应。先拿到街口的旧票根。'); return; }
      if (this.leaving) return;
      this.leaving = true;
      this.cameras.main.fadeOut(450, 21, 34, 31);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('chapter2-room', { entryItem: 'memory-token-2' });
      });
    });
  }

  private updateCheckpoint(): void {
    const body = this.player.view.body as Phaser.Physics.Arcade.Body;
    if (this.restarting || this.leaving || !body.blocked.down) return;
    const x = this.player.view.x;
    const y = this.player.view.y;
    let next = false;
    // 摆动晾衣架前的检查点：失败重试循环从 ~4s 压到 ~1s（playtest 实测 52 次死亡全在此段）。
    if (this.checkpointIndex === 0) next = x > 530 && x < 628 && Math.abs(y + 34 - 320) < 4;
    else if (this.checkpointIndex === 1) next = x > 1190 && x < 1265 && Math.abs(y + 34 - 610) < 4;
    else if (this.checkpointIndex === 2) next = x >= 330 && x < 620 && Math.abs(y + 34 - 820) < 4;
    else if (this.checkpointIndex === 3) next = x > 1980 && Math.abs(y + 34 - 910) < 4;
    if (!next) return;
    this.checkpointIndex += 1;
    const checkpoint = CHECKPOINTS[this.checkpointIndex];
    const direction = this.checkpointIndex === 1 ? '躲进货箱堆，看晾衣架相位'
      : this.checkpointIndex === 2 ? '第二层向左 ←'
        : this.checkpointIndex === 3 ? '底层向右 →' : '向街口前进 →';
    this.checkpointText.setText(`检查点 · ${checkpoint.label} · ${direction}`);
    this.announce(`到达${checkpoint.label}。先观察灯光和动态障碍。`);
    this.tweens.add({ targets: this.checkpointText, alpha: { from: .35, to: 1 }, duration: 280, yoyo: true });
  }

  private updateSearchlight(_time: number, delta: number): void {
    const x = this.player.view.x, y = this.player.view.y;
    const insideCover = (cover: Cover) => x >= cover.from && x <= cover.to
      && y >= cover.baseY - 115 && y <= cover.baseY + 24;
    const inCover = COVERS.some(insideCover);
    // Keep structural feet opaque; fade only the occupied cover so the player remains readable.
    this.coverArt.forEach((art, index) => art.setAlpha(insideCover(COVERS[index]) ? .55 : 1));
    const moved = Phaser.Math.Distance.Between(this.previousPlayer.x, this.previousPlayer.y, x, y)
      / Math.max(delta / 1000, .001) > 12;
    if (x > 300 || y > 300) this.tutorialSafe = false;
    const canCatch = !this.tutorialSafe && !this.tokenCollected && !this.restarting && !this.leaving;
    this.searchlight = updateLight(this.searchlight, { x, y, moving: moved, covered: inCover, enabled: canCatch, delta });
    this.detectionMs = this.searchlight.exposure;
    const angle = this.searchlight.angle;
    const lit = !inCover && isInBeam(angle, x, y);
    if (this.searchlight.tracking && !this.wasLit) this.cameras.main.shake(90, .0025);

    // 人物和灯源使用固定世界坐标，相机移开后老师自然离开画面。
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const perpendicular = { x: -direction.y, y: direction.x };
    this.lightGraphics.clear();
    const beamColor = this.searchlight.tracking ? 0xffc27a : 0xffdf9e;
    // Same cone bounds as isInBeam; three nested cones soften the side edges
    // so the beam reads as light instead of a hard-edged polygon mask.
    for (const [widthFactor, alphaFactor] of [[1, .35], [.72, .5], [.45, .65]] as const) {
      for (let index = 0; index < 24; index += 1) {
        const near = LIGHT_LENGTH * index / 24;
        const far = LIGHT_LENGTH * (index + 1) / 24;
        const corner = (distance: number, side: number) => ({
          x: LIGHT_ORIGIN.x + direction.x * distance + perpendicular.x * distance * Math.tan(LIGHT_HALF_ANGLE) * widthFactor * side,
          y: LIGHT_ORIGIN.y + direction.y * distance + perpendicular.y * distance * Math.tan(LIGHT_HALF_ANGLE) * widthFactor * side,
        });
        this.lightGraphics.fillStyle(beamColor, Math.min(.9, (.06 + .2 * Math.pow(1 - index / 24, 2)) * alphaFactor))
          .fillPoints([corner(near, -1), corner(far, -1), corner(far, 1), corner(near, 1)], true);
      }
    }
    // Volumetric hot spot at the lamp: small additive glow only (large-area ADD
    // turned the teal walls fluorescent; the cone itself is normal-blended).
    this.hotspotGraphics.clear();
    this.hotspotGraphics.fillStyle(0xfff3cf, .32).fillCircle(LIGHT_ORIGIN.x, LIGHT_ORIGIN.y, 5);
    this.hotspotGraphics.fillStyle(0xfff3cf, .22).fillCircle(LIGHT_ORIGIN.x, LIGHT_ORIGIN.y, 11);
    this.hotspotGraphics.fillStyle(0xffefc0, .14).fillCircle(LIGHT_ORIGIN.x, LIGHT_ORIGIN.y, 18);
    // 老师美术只创建一次，光束角度和命中仍由规则模块控制。
    const progress = this.detectionMs / DETECTION_MS;
    // 前 0.35 秒就到 60%，余下约 0.6 秒快速拉满。
    this.alert = progress <= .37
      ? progress * (.6 / .37)
      : .6 + .4 * Math.pow((progress - .37) / .63, 1.1);

    if (!this.tokenCollected && !this.restarting) {
      if (inCover) this.hint('骑楼遮住了老师的光，现在可以移动。');
      else if (lit && moved && this.detectionMs >= 350) this.warn('已经被注意到了！再不停下就会被抓住。');
      else if (lit && moved) this.warn('老师的灯跟上来了——马上站定！');
      else if (lit) this.hint('站住了。保持不动，等灯光移开。');
      // 这一条必须是兜底 else：exposure 还在衰减（alert > 0）但人已经不在灯里、也不在遮蔽里时，
      // 用 `alert === 0` 做条件会一帧都命中不了，文案会停在上一条（实测站在空地上仍显示
      // 「骑楼遮住了老师的光，现在可以移动。」）。导航提示走 hint，保护期内不会抢关键反馈。
      else this.hint(this.checkpointIndex === 1 ? '东段改走布帘下等相位，蹬木凳顶跳向左。' : '趁灯光移开，向下一处阴影前进。');
    }
    this.wasLit = lit && moved && canCatch;
    if (this.detectionMs >= DETECTION_MS) this.restartFromCheckpoint('被老师看见了');
  }

  private createHazardArt(): void {
    const teacherScale = TEACHER_ART.displayHeight / TEACHER_ART.height;
    this.add.image(TEACHER.x, TEACHER.groundY, 'chapter2-dynamic', 'teacher-flashlight')
      .setName('chapter2-teacher-art').setOrigin(TEACHER_ART.originX, TEACHER_ART.originY).setScale(teacherScale).setDepth(13);
    this.swingArt = SWINGS.map((swing, index) => {
      const frame = index === 0 ? 'swing-laundry-rest' : 'swing-bamboo-rest';
      const source = this.textures.getFrame('chapter2-dynamic', frame);
      // 挂点连接到背景前的支架，不再只有一件飘在空中的衣架。
      const bracket = this.add.graphics().setDepth(8);
      // Freestanding post reaches the real platform; a floating square reads like a debug marker.
      for (const [width, color] of [[6, 0x443d30], [3, 0xc4af83]]) {
        bracket.lineStyle(width, color, .95)
          .lineBetween(swing.x - 30, swing.y - 22, swing.x, swing.y - 22)
          .lineBetween(swing.x - 30, swing.y - 22, swing.x - 30, swing.baseY)
          .lineBetween(swing.x - 30, swing.y + 16, swing.x, swing.y - 22)
          .lineBetween(swing.x, swing.y - 22, swing.x, swing.y - 4);
      }
      bracket.lineStyle(2, 0x443d30, 1).strokeCircle(swing.x, swing.y, 4);
      // 摆杆贴图 art 原点跟随 SWINGS[i].x 自动寻位：挂点/支撑架/杆身一起东迁，无写死像素。
      const pivotX = index === 0 ? .46 : .5;
      return this.add.image(swing.x, swing.y, 'chapter2-dynamic', frame)
        .setName(`chapter2-swing-${index}`).setOrigin(pivotX, 0)
        .setScale(swing.length / source.height).setDepth(19);
    });
  }

  private updateDynamicHazards(time: number): void {
    for (const [index, swing] of SWINGS.entries()) {
      const angle = Math.sin(time * .0021 + swing.phase) * .82;
      const end = {
        x: swing.x + Math.sin(angle) * swing.length,
        y: swing.y + Math.cos(angle) * swing.length,
      };
      // Phaser 的正旋转将向下的向量转向左；判定端点向右，视觉必须取负角。
      this.swingArt[index].setRotation(-angle);
      if (!this.restarting && !this.leaving && !this.tokenCollected
        && this.distanceToSegment(this.player.view.x, this.player.view.y, swing.x, swing.y, end.x, end.y) < 25) {
        this.restartFromCheckpoint(`撞到了${swing.label}`);
      }
    }

  }

  private distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const abx = bx - ax, aby = by - ay;
    const lengthSquared = abx * abx + aby * aby;
    const t = lengthSquared === 0 ? 0 : Phaser.Math.Clamp(((px - ax) * abx + (py - ay) * aby) / lengthSquared, 0, 1);
    return Phaser.Math.Distance.Between(px, py, ax + abx * t, ay + aby * t);
  }

  private restartFromCheckpoint(reason: string): void {
    if (this.restarting) return;
    this.restarting = true;
    this.searchlight = initialSearchlight();
    this.wasLit = false;
    const body = this.player.view.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0).setAllowGravity(false);
    // 连续快速重生时，旧的重生淡入淡出 tween 会与新 tween 叠加，
    // 把角色卡在半透明（实测摆动障碍区连续死亡时必现）。先全部清掉再复位。
    this.tweens.killTweensOf(this.player.view);
    this.player.view.setAlpha(1);
    this.announce(`${reason}——回到最近的安全位置。`, 800);
    this.cameras.main.flash(190, 241, 186, 150);
    // 淡出只管死亡原地的反馈；传送后的淡入在 delayedCall 里独立开启。
    // 不用 yoyo+repeat 链：其结束值语义在快速重生时会与 delayedCall 的 setAlpha 竞争，
    // 实测单次死亡后角色卡在 alpha≈0.59（隔离复现）。两段显式 from/to 各自收敛到 1。
    this.tweens.add({ targets: this.player.view, alpha: { from: 1, to: .16 }, duration: 170 });
    this.time.delayedCall(470, () => {
      const checkpoint = CHECKPOINTS[this.checkpointIndex];
      this.player.teleportTo(checkpoint.x, checkpoint.y);
      this.tweens.killTweensOf(this.player.view);
      this.player.view.setAlpha(.16);
      this.tweens.add({ targets: this.player.view, alpha: { from: .16, to: 1 }, duration: 300 });
      this.previousPlayer.set(checkpoint.x, checkpoint.y);
      this.announce(`从${checkpoint.label}重试。先看灯光，再看街道障碍。`);
      this.restarting = false;
    });
  }

  /** 关键反馈（教学 / 检查点 / 重试 / 拾取）：holdMs 内不被每帧导航提示覆盖 */
  private announce(message: string, holdMs = 2600): void {
    this.status.setText(message);
    this.statusHoldMs = holdMs;
  }

  /** 导航提示：关键反馈还在保护期内时不抢屏 */
  private hint(message: string): void {
    if (this.statusHoldMs > 0) return;
    this.status.setText(message);
  }

  /** 紧迫警告（被灯锁定 / 即将被抓）：立即抢占，不等保护期 */
  private warn(message: string): void {
    this.statusHoldMs = 0;
    this.status.setText(message);
  }

  private layoutHud(time: number): void {
    // worldView 随窗口比例变化（applyHDCamera 用 cover 模式，宽度 = 540 × 宽高比），
    // 所以 HUD 必须贴 view 的四条边定位，不能写死 960×540 的绝对坐标。
    const view = this.cameras.main.worldView;
    this.title.setPosition(view.x + 145, view.y + 24);
    this.status.setPosition(view.x + 18, view.y + view.height - 66);
    this.checkpointText.setPosition(view.x + 18, view.y + view.height - 8);
    const x = view.x + view.width - 36 - 278;
    const y = view.y + 26;
    const pulse = this.alert > .5 ? .85 + Math.sin(time * .015) * .15 : 1;
    this.hudGraphics.clear();
    if (this.alert > .005) {
      this.hudGraphics.fillStyle(0x8f1f1b, this.alert * .07).fillRect(view.x, view.y, view.width, view.height);
      this.hudGraphics.lineStyle(8 + this.alert * 12, 0xd5483e, .24 + this.alert * .5).strokeRect(view.x + 4, view.y + 4, view.width - 8, view.height - 8);
    }
    this.hudGraphics.fillStyle(0x17231f, .84).fillRoundedRect(x, y, 278, 44, 9);
    this.hudGraphics.fillStyle(0xebe1bf, .22).fillRoundedRect(x + 76, y + 16, 178, 11, 5);
    const color = this.alert > .72 ? 0xd9483f : this.alert > .3 ? 0xe0a64e : 0x83a88c;
    this.hudGraphics.fillStyle(color, pulse).fillRoundedRect(x + 76, y + 16, 178 * this.alert, 11, 5);
    this.hudGraphics.lineStyle(1, 0xf2e8cc, .4).strokeRoundedRect(x + 76, y + 16, 178, 11, 5);
    this.alertLabel
      .setText(`警觉 ${Math.round(this.alert * 100)}%`)
      .setColor(this.alert > .45 ? '#ffb0a2' : '#f4ead0')
      .setPosition(x + 15, y + 22);
  }
}
