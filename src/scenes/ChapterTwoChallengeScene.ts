import Phaser from 'phaser';
import { Player } from '../gameplay/Player';
import { Terrain } from '../gameplay/Terrain';
import { applyHDCamera } from '../systems/Resolution';
import { TEACHER, LIGHT_ORIGIN, LIGHT_LENGTH, LIGHT_HALF_ANGLE, DETECTION_MS, initialSearchlight, updateLight, isInBeam, belowStreet } from '../gameplay/chapterTwoRules';

type Checkpoint = { x: number; y: number; label: string };
type Cover = { from: number; to: number; baseY: number; label: string };
type SwingHazard = { x: number; y: number; length: number; phase: number; label: string };

const WORLD_WIDTH = 3680;
const WORLD_HEIGHT = 1100;
const CHECKPOINTS: Checkpoint[] = [
  { x: 110, y: 212, label: '学校后墙' },
  { x: 1510, y: 566, label: '骑楼二层' },
  { x: 485, y: 776, label: '骑楼底层' },
  { x: 2100, y: 866, label: '长街中段' },
];
const COVERS: Cover[] = [
  { from: 430, to: 505, baseY: 320, label: '骑楼柱影' },
  { from: 850, to: 945, baseY: 380, label: '布棚阴影' },
  { from: 1280, to: 1375, baseY: 440, label: '店招后方' },
  { from: 1450, to: 1545, baseY: 610, label: '二层柱影' },
  { from: 1040, to: 1145, baseY: 610, label: '旧雨棚' },
  { from: 640, to: 735, baseY: 610, label: '货箱后方' },
  { from: 430, to: 545, baseY: 820, label: '底层柱廊' },
  { from: 1190, to: 1305, baseY: 865, label: '摊位布帘' },
  { from: 2040, to: 2170, baseY: 910, label: '长街柱影' },
  { from: 2860, to: 2995, baseY: 950, label: '街口货摊' },
];
const SWINGS: SwingHazard[] = [
  { x: 720, y: 220, length: 98, phase: 0, label: '摆动晾衣架' },
  { x: 930, y: 492, length: 112, phase: 1.7, label: '甩动竹竿' },
];

/** 第二关灰盒：学校后墙 → 骑楼折返 → 长街逃离。 */
export default class ChapterTwoChallengeScene extends Phaser.Scene {
  private player!: Player;
  private terrain!: Terrain;
  private title!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private checkpointText!: Phaser.GameObjects.Text;
  private alertLabel!: Phaser.GameObjects.Text;
  private lightGraphics!: Phaser.GameObjects.Graphics;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private swingGraphics!: Phaser.GameObjects.Graphics;
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

  constructor() {
    super({
      key: 'chapter2',
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1100 }, debug: false } },
    });
  }

  preload(): void {
    if (!this.textures.exists(Player.SHEET)) {
      this.load.spritesheet(Player.SHEET, Player.SHEET_URL, {
        frameWidth: Player.FRAME_W,
        frameHeight: Player.FRAME_H,
      });
    }
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
    this.searchlight = initialSearchlight();

    applyHDCamera(this);
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor('#b8c7c4');

    this.drawQilouStreet();
    this.terrain = new Terrain(this, false);

    // 第一层：持续向右。
    this.addStreetPlatform(0, 260, 420, 28);
    this.addStreetPlatform(390, 320, 430, 28);
    this.addStreetPlatform(790, 380, 450, 28);
    // 平台在封路墙前留出 103px 下落口，角色能清楚地落到第二层后再向左折返。
    this.addStreetPlatform(1210, 440, 350, 28);
    // 第二层：从右侧落下，再向左穿过骑楼。
    this.addStreetPlatform(420, 610, 1280, 28);
    // 第三层：从左侧落下，再向右穿过长街。
    this.addStreetPlatform(330, 820, 800, WORLD_HEIGHT - 820);
    this.addStreetPlatform(1090, 865, 850, WORLD_HEIGHT - 865);
    this.addStreetPlatform(1900, 910, 850, WORLD_HEIGHT - 910);
    this.addStreetPlatform(2700, 950, 980, 150);

    const hurdles = [
      this.addHurdle(560, 320, 48, '路障'),
      this.addHurdle(1040, 380, 56, '晾衣架'),
      this.addHurdle(1450, 440, 62, '施工栏'),
      this.addHurdle(1170, 610, 46, '木凳'),
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
    this.lightGraphics = this.add.graphics().setDepth(14);
    this.swingGraphics = this.add.graphics().setDepth(19);
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
    const backdrop = this.add.graphics().setDepth(-30);
    backdrop.fillStyle(0xb8c7c4).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    backdrop.fillStyle(0xd8d0b7).fillRect(0, 70, WORLD_WIDTH, WORLD_HEIGHT - 90);
    const colors = [0xc7bda4, 0xbda994, 0xd1bfa0, 0xb6aa9a, 0xc8b28f];
    for (let index = 0, x = 0; x < WORLD_WIDTH; index += 1, x += 420) {
      const y = 84 + Math.min(360, index * 42);
      const height = 390 + index * 20;
      backdrop.fillStyle(colors[index % colors.length]).fillRect(x, y, 430, height);
      backdrop.fillStyle(0x586965, .58);
      for (let wx = x + 48; wx < x + 390; wx += 105) {
        backdrop.fillRect(wx, y + 62, 48, 72);
        backdrop.fillRect(wx, y + 190, 52, 88);
      }
      backdrop.fillStyle(0x6c6659, .82).fillRect(x, y + height - 24, 430, 24);
      backdrop.fillStyle(0x8e826e, .88).fillRect(x + 250, y + 76, 22, height + 180);
    }
    backdrop.fillStyle(0x59635e, .35).fillRect(0, 995, WORLD_WIDTH, 105);
    backdrop.lineStyle(3, 0x6d7771, .45);
    for (let x = -80; x < WORLD_WIDTH; x += 150) backdrop.lineBetween(x, 1100, x + 160, 995);

    this.add.text(92, 112, '学校后墙', { fontFamily: 'sans-serif', fontSize: '15px', color: '#4d5b56' }).setDepth(-5);
    this.add.text(1370, 515, '↓ 落下后向左走', { fontFamily: 'sans-serif', fontSize: '16px', color: '#4b3e32', backgroundColor: '#efe2c5cc', padding: { x: 8, y: 5 } }).setDepth(10);
    this.add.text(455, 730, '↓ 到底层后向右走', { fontFamily: 'sans-serif', fontSize: '16px', color: '#4b3e32', backgroundColor: '#efe2c5cc', padding: { x: 8, y: 5 } }).setDepth(10);
    this.add.text(3260, 865, '骑楼街口', { fontFamily: 'sans-serif', fontSize: '16px', color: '#4d514a' }).setDepth(-5);
  }

  private addStreetPlatform(x: number, y: number, width: number, height: number): void {
    this.terrain.addPlatform({ x, y, width, height });
    const graphics = this.add.graphics().setDepth(4);
    graphics.fillStyle(0x615d53).fillRect(x, y, width, height);
    graphics.fillStyle(0xc0aa82).fillRect(x, y, width, 9);
    graphics.fillStyle(0x7d7669, .75).fillRect(x, y + 9, width, 5);
    graphics.lineStyle(1, 0x403f3a, .3);
    for (let tx = x + 28; tx < x + width; tx += 62) graphics.lineBetween(tx, y + 15, tx - 10, y + height);
  }

  private addHurdle(x: number, baseY: number, height: number, label: string): Phaser.GameObjects.Rectangle {
    const obstacle = this.add.rectangle(x, baseY - height, 26, height, 0x8e5d42)
      .setOrigin(.5, 0).setStrokeStyle(3, 0x4d382f).setDepth(12);
    this.physics.add.existing(obstacle, true);
    this.add.text(x, baseY - height - 8, label, {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#4a3931',
      backgroundColor: 'rgba(238,226,198,.76)', padding: { x: 4, y: 2 },
    }).setOrigin(.5, 1).setDepth(13);
    return obstacle;
  }

  private addWall(x: number, y: number, width: number, height: number, label: string): Phaser.GameObjects.Rectangle {
    const wall = this.add.rectangle(x, y, width, height, 0x4d5b56).setOrigin(.5, 0).setDepth(11);
    this.physics.add.existing(wall, true);
    this.add.text(x - 12, y + height / 2, label, {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#f2ead4', backgroundColor: '#34413ddd', padding: { x: 6, y: 4 },
    }).setOrigin(.5).setAngle(-90).setDepth(12);
    return wall;
  }

  private drawCovers(): void {
    const graphics = this.add.graphics().setDepth(16);
    for (const cover of COVERS) {
      const width = cover.to - cover.from;
      graphics.fillStyle(0x263d3a, .3).fillRoundedRect(cover.from, cover.baseY - 166, width, 166, 7);
      graphics.fillStyle(0x3e5750, .92).fillRect(cover.from + 10, cover.baseY - 160, 24, 160);
      graphics.fillStyle(0x8a7051, .92).fillRect(cover.from, cover.baseY - 160, width, 12);
      this.add.text((cover.from + cover.to) / 2, cover.baseY - 174, cover.label, {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#e8dfc7',
        backgroundColor: 'rgba(35,55,50,.78)', padding: { x: 5, y: 3 },
      }).setOrigin(.5).setDepth(17);
    }
  }

  private createGoal(): void {
    const tokenGlow = this.add.circle(3420, 898, 28, 0xe4bd5e, .25).setDepth(20);
    const token = this.add.star(3420, 898, 6, 9, 21, 0xe3bd58).setStrokeStyle(2, 0x695332).setDepth(21);
    const tokenLabel = this.add.text(3420, 860, '旧票根 · 记忆信物', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#3b3222',
      backgroundColor: 'rgba(247,242,220,.9)', padding: { x: 7, y: 4 },
    }).setOrigin(.5).setDepth(22);
    const tokenHit = this.add.rectangle(3420, 898, 58, 68, 0xffffff, 0);
    this.physics.add.existing(tokenHit, true);

    const door = this.add.rectangle(3600, 872, 76, 156, 0x596761).setStrokeStyle(5, 0x34433e).setDepth(12);
    const doorSign = this.add.text(3600, 836, '第二记忆房', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#e8e5d6', align: 'center',
    }).setOrigin(.5).setDepth(13);
    const doorHit = this.add.rectangle(3600, 872, 96, 170, 0xffffff, 0);
    this.physics.add.existing(doorHit, true);

    this.physics.add.overlap(this.player.view, tokenHit, () => {
      if (this.tokenCollected || this.restarting) return;
      this.tokenCollected = true;
      this.detectionMs = 0; this.alert = 0;
      token.destroy(); tokenGlow.destroy(); tokenLabel.destroy(); tokenHit.destroy();
      door.setFillStyle(0x789b88).setStrokeStyle(5, 0xd5c589);
      doorSign.setText('门已开启');
      this.status.setText('拿到旧票根了。老师停下了，继续向右进入第二记忆房。');
      this.tweens.add({ targets: door, alpha: { from: .64, to: 1 }, duration: 420, yoyo: true });
    });
    this.physics.add.overlap(this.player.view, doorHit, () => {
      if (this.restarting) return;
      if (!this.tokenCollected) { this.status.setText('门还没有回应。先拿到街口的旧票根。'); return; }
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
    if (this.checkpointIndex === 0) next = x > 1400 && x < 1663 && Math.abs(y + 34 - 610) < 4;
    else if (this.checkpointIndex === 1) next = x >= 330 && x < 620 && Math.abs(y + 34 - 820) < 4;
    else if (this.checkpointIndex === 2) next = x > 1980 && Math.abs(y + 34 - 910) < 4;
    if (!next) return;
    this.checkpointIndex += 1;
    const checkpoint = CHECKPOINTS[this.checkpointIndex];
    const direction = this.checkpointIndex === 1 ? '第二层向左 ←' : '底层向右 →';
    this.checkpointText.setText(`检查点 · ${checkpoint.label} · ${direction}`);
    this.status.setText(`到达${checkpoint.label}。先观察灯光和动态障碍。`);
    this.tweens.add({ targets: this.checkpointText, alpha: { from: .35, to: 1 }, duration: 280, yoyo: true });
  }

  private updateSearchlight(_time: number, delta: number): void {
    const x = this.player.view.x, y = this.player.view.y;
    const inCover = COVERS.some(cover => x >= cover.from && x <= cover.to
      && y >= cover.baseY - 115 && y <= cover.baseY + 24);
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
    const end = { x: LIGHT_ORIGIN.x + Math.cos(angle) * LIGHT_LENGTH, y: LIGHT_ORIGIN.y + Math.sin(angle) * LIGHT_LENGTH };
    const halfWidth = LIGHT_LENGTH * Math.tan(LIGHT_HALF_ANGLE);
    const perpendicular = { x: -Math.sin(angle) * halfWidth, y: Math.cos(angle) * halfWidth };
    this.lightGraphics.clear();
    this.lightGraphics.fillStyle(this.searchlight.tracking ? 0xffbf72 : 0xf2db8e, .27).fillTriangle(
      LIGHT_ORIGIN.x, LIGHT_ORIGIN.y,
      end.x + perpendicular.x, end.y + perpendicular.y,
      end.x - perpendicular.x, end.y - perpendicular.y,
    );
    this.lightGraphics.lineStyle(2, 0xffe9a5, .6).lineBetween(LIGHT_ORIGIN.x, LIGHT_ORIGIN.y, end.x, end.y);
    this.lightGraphics.fillStyle(0x283633, .96).fillCircle(TEACHER.x, TEACHER.groundY - 60, 12);
    this.lightGraphics.fillRect(TEACHER.x - 9, TEACHER.groundY - 48, 18, 48);
    this.lightGraphics.lineStyle(8, 0x384a45).lineBetween(TEACHER.x + 5, TEACHER.groundY - 30, LIGHT_ORIGIN.x, LIGHT_ORIGIN.y);
    const progress = this.detectionMs / DETECTION_MS;
    // 前 0.35 秒就到 60%，余下约 0.6 秒快速拉满。
    this.alert = progress <= .37
      ? progress * (.6 / .37)
      : .6 + .4 * Math.pow((progress - .37) / .63, 1.1);

    if (!this.tokenCollected && !this.restarting) {
      if (inCover) this.status.setText('骑楼遮住了老师的光，现在可以移动。');
      else if (lit && moved && this.detectionMs >= 350) this.status.setText('已经被注意到了！再不停下就会被抓住。');
      else if (lit && moved) this.status.setText('老师的灯跟上来了——马上站定！');
      else if (lit) this.status.setText('站住了。保持不动，等灯光移开。');
      else if (this.alert === 0) this.status.setText(this.checkpointIndex === 1 ? '第二层向左走，穿过骑楼再下到底层。' : '趁灯光移开，向下一处阴影前进。');
    }
    this.wasLit = lit && moved && canCatch;
    if (this.detectionMs >= DETECTION_MS) this.restartFromCheckpoint('被老师看见了');
  }

  private updateDynamicHazards(time: number): void {
    this.swingGraphics.clear();
    this.swingGraphics.lineStyle(9, 0x765a42, 1);
    for (const swing of SWINGS) {
      const angle = Math.sin(time * .0021 + swing.phase) * .82;
      const end = {
        x: swing.x + Math.sin(angle) * swing.length,
        y: swing.y + Math.cos(angle) * swing.length,
      };
      this.swingGraphics.fillStyle(0x384a45, 1).fillCircle(swing.x, swing.y, 8);
      this.swingGraphics.lineBetween(swing.x, swing.y, end.x, end.y);
      this.swingGraphics.fillStyle(0xb99c76, 1).fillCircle(end.x, end.y, 10);
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
    this.detectionMs = 0; this.alert = 0;
    const body = this.player.view.body as Phaser.Physics.Arcade.Body;
    this.searchlight = initialSearchlight();
    this.wasLit = false;
    body.setVelocity(0, 0).setAllowGravity(false);
    this.status.setText(`${reason}——回到最近的安全位置。`);
    this.cameras.main.flash(190, 241, 186, 150);
    this.tweens.add({ targets: this.player.view, alpha: .16, duration: 170, yoyo: true, repeat: 1 });
    this.time.delayedCall(470, () => {
      const checkpoint = CHECKPOINTS[this.checkpointIndex];
      this.player.teleportTo(checkpoint.x, checkpoint.y);
      this.player.view.setAlpha(1);
      this.previousPlayer.set(checkpoint.x, checkpoint.y);
      this.status.setText(`从${checkpoint.label}重试。先看灯光，再看街道障碍。`);
      this.restarting = false;
    });
  }

  private layoutHud(time: number): void {
    const view = this.cameras.main.worldView;
    this.title.setPosition(view.x + 145, view.y + 24);
    this.status.setPosition(view.x + 18, view.y + 474);
    this.checkpointText.setPosition(view.x + 18, view.y + 532);
    const x = view.x + 646;
    const y = view.y + 26;
    const pulse = this.alert > .5 ? .85 + Math.sin(time * .015) * .15 : 1;
    this.hudGraphics.clear();
    if (this.alert > .005) {
      this.hudGraphics.fillStyle(0x8f1f1b, this.alert * .07).fillRect(view.x, view.y, 960, 540);
      this.hudGraphics.lineStyle(8 + this.alert * 12, 0xd5483e, .24 + this.alert * .5).strokeRect(view.x + 4, view.y + 4, 952, 532);
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
