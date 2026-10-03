import Phaser from 'phaser';
import { Player } from '../gameplay/Player';
import { Terrain } from '../gameplay/Terrain';
import { applyHDCamera } from '../systems/Resolution';
import { TEACHER, LIGHT_ORIGIN, LIGHT_LENGTH, LIGHT_HALF_ANGLE, DETECTION_MS, initialSearchlight, updateLight, isInBeam, belowStreet } from '../gameplay/chapterTwoRules';

import { NIGHT } from '../gameplay/ChapterTwoNightArt';

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
  private swingImages: Phaser.GameObjects.Image[] = [];
  private platformArtIndex = 0;
  private hurdleArtIndex = 0;
  private artDebug?: Phaser.GameObjects.Graphics;
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
    this.load.image('night-background', 'assets/level2/night-v1/background-night.png');
    this.load.image('night-p01', 'assets/level2/night-v1/p01.png');
    this.load.image('night-p02', 'assets/level2/night-v1/p02.png');
    this.load.image('night-p03', 'assets/level2/night-v1/p03.png');
    this.load.image('night-p04', 'assets/level2/night-v1/p04.png');
    this.load.image('night-p05', 'assets/level2/night-v1/p05.png');
    this.load.image('night-p06', 'assets/level2/night-v1/p06.png');
    this.load.image('night-p07', 'assets/level2/night-v1/p07.png');
    this.load.image('night-p08', 'assets/level2/night-v1/p08.png');
    this.load.image('night-p09', 'assets/level2/night-v1/p09.png');
    this.load.image('night-h01', 'assets/level2/night-v1/h01.png');
    this.load.image('night-h02', 'assets/level2/night-v1/h02.png');
    this.load.image('night-h03', 'assets/level2/night-v1/h03.png');
    this.load.image('night-h04', 'assets/level2/night-v1/h04.png');
    this.load.image('night-h05', 'assets/level2/night-v1/h05.png');
    this.load.image('night-h06', 'assets/level2/night-v1/h06.png');
    this.load.image('night-h07', 'assets/level2/night-v1/h07.png');
    this.load.image('night-h08', 'assets/level2/night-v1/h08.png');
    this.load.image('night-h09', 'assets/level2/night-v1/h09.png');
    this.load.image('night-c01', 'assets/level2/night-v1/c01.png');
    this.load.image('night-c02', 'assets/level2/night-v1/c02.png');
    this.load.image('night-c03', 'assets/level2/night-v1/c03.png');
    this.load.image('night-c04', 'assets/level2/night-v1/c04.png');
    this.load.image('night-c05', 'assets/level2/night-v1/c05.png');
    this.load.image('night-c06', 'assets/level2/night-v1/c06.png');
    this.load.image('night-c07', 'assets/level2/night-v1/c07.png');
    this.load.image('night-c08', 'assets/level2/night-v1/c08.png');
    this.load.image('night-c09', 'assets/level2/night-v1/c09.png');
    this.load.image('night-c10', 'assets/level2/night-v1/c10.png');
    this.load.image('night-s01', 'assets/level2/night-v1/s01.png');
    this.load.image('night-s02', 'assets/level2/night-v1/s02.png');
    this.load.image('night-w01', 'assets/level2/night-v1/w01.png');
    this.load.image('night-teacher', 'assets/level2/night-v1/teacher.png');
    this.load.image('night-ticket', 'assets/level2/night-v1/old-banknote.png');
    this.load.image('night-door', 'assets/level2/night-v1/door.png');
    // 与第一关共用同一个主角图集；当前 Player 没有静态 preload 方法，
    // 因此在场景中按既有常量加载，避免重复注册纹理。
    if (!this.textures.exists(Player.SHEET)) {
      this.load.spritesheet(Player.SHEET, Player.SHEET_URL, {
        frameWidth: Player.FRAME_W,
        frameHeight: Player.FRAME_H,
      });
    }
  }

  create(): void {
    this.platformArtIndex = 0; this.hurdleArtIndex = 0;
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
    this.cameras.main.setBackgroundColor('#23344b');

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
    this.swingImages = NIGHT.swings.map(a => this.add.image(a.x, a.y, `night-${a.id}`)
      .setOrigin(.5, 0).setDisplaySize(a.width, a.height).setDepth(19));
    this.add.image(NIGHT.teacher.x, NIGHT.teacher.y, 'night-teacher').setOrigin(.5, 1)
      .setDisplaySize(NIGHT.teacher.width, NIGHT.teacher.height).setDepth(18);
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
    this.setupArtPreview();
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
    this.add.image(0, 0, 'night-background').setOrigin(0, 0).setDepth(-30);
    this.add.text(1370, 515, '↓ 落下后向左走', { fontSize: '13px', color: '#d5dfdf', backgroundColor: '#23344baa', padding: { x: 6, y: 3 } }).setDepth(10);
    this.add.text(455, 730, '↓ 到底层后向右走', { fontSize: '13px', color: '#d5dfdf', backgroundColor: '#23344baa', padding: { x: 6, y: 3 } }).setDepth(10);
  }

  private addStreetPlatform(x: number, y: number, width: number, height: number): void {
    this.terrain.addPlatform({ x, y, width, height });
    const a = NIGHT.platforms[this.platformArtIndex++];
    if (a.x !== x || a.y !== y || a.width !== width || a.height !== height) throw new Error(`Platform geometry mismatch: ${a.id}`);
    this.add.image(x, y, `night-${a.id}`).setOrigin(0, 0).setDepth(4);
  }

  private addHurdle(x: number, baseY: number, height: number, _label: string): Phaser.GameObjects.Rectangle {
    const a = NIGHT.hurdles[this.hurdleArtIndex++];
    if (a.x !== x || a.y !== baseY || a.height !== height) throw new Error(`Hurdle geometry mismatch: ${a.id}`);
    const obstacle = this.add.rectangle(x, baseY - height, 26, height, 0xffffff, 0).setOrigin(.5, 0);
    this.physics.add.existing(obstacle, true);
    this.add.image(x, baseY, `night-${a.id}`).setOrigin(.5, 1).setScale(.5).setDepth(12);
    return obstacle;
  }

  private addWall(x: number, y: number, width: number, height: number, _label: string): Phaser.GameObjects.Rectangle {
    const wall = this.add.rectangle(x, y, width, height, 0xffffff, 0).setOrigin(.5, 0);
    this.physics.add.existing(wall, true);
    this.add.image(x, y, 'night-w01').setOrigin(.5, 0).setDepth(11);
    return wall;
  }

  private drawCovers(): void {
    for (const a of NIGHT.covers) {
      this.add.image(a.x, a.y, `night-${a.id}`).setOrigin(0, 1).setScale(.5).setDepth(16);
    }
  }

  /** Local inspection controls, only visible with ?artPreview=1. */
  private setupArtPreview(): void {
    if (new URLSearchParams(location.search).get('artPreview') !== '1') return;
    const panel = document.createElement('div');
    panel.id = 'chapter2-art-preview';
    panel.style.cssText = 'position:fixed;z-index:10000;right:12px;bottom:12px;display:flex;gap:6px;align-items:center;padding:8px;background:#162536e8;color:#d9e6e7;font:12px sans-serif;border-radius:8px;';
    const status = document.createElement('output');status.id='art-preview-status';
    const jump = (index: number) => {
      this.checkpointIndex = index;
      const c=CHECKPOINTS[index];this.player.teleportTo(c.x,c.y);
      this.previousPlayer.set(c.x,c.y);this.searchlight=initialSearchlight();this.detectionMs=0;this.alert=0;
      this.restarting=false;this.cameras.main.centerOn(c.x,c.y);this.cameras.main.followOffset.set(0,0);
    };
    for (const [label, index] of [['起点',0],['二层',1],['底层',2],['长街',3]] as const) {
      const btn=document.createElement('button');btn.textContent=label;btn.onclick=()=>jump(index);panel.append(btn);
    }
    const end=document.createElement('button');end.textContent='终点';end.onclick=()=>{
      this.checkpointIndex=3;this.player.teleportTo(3320,900);this.previousPlayer.set(3320,900);
      this.searchlight=initialSearchlight();this.detectionMs=0;this.alert=0;this.restarting=false;
      this.cameras.main.centerOn(3320,900);
    };panel.append(end);
    this.artDebug=this.add.graphics().setDepth(195).setVisible(false);
    const debug=this.artDebug;
    debug.lineStyle(1,0x65f4c2,.95);
    for (const p of NIGHT.platforms) debug.strokeRect(p.x,p.y,p.width,p.height);
    for (const h of NIGHT.hurdles) debug.strokeRect(h.body.x,h.body.y,h.body.width,h.body.height);
    debug.strokeRect(1663,448,38,286);
    debug.lineStyle(1,0xe0b75d,.8);
    for(const c of NIGHT.covers) debug.strokeRect(c.zone.from,c.zone.minY,c.zone.to-c.zone.from,c.zone.maxY-c.zone.minY);
    const btn=document.createElement('button');btn.textContent='显示碰撞框';btn.onclick=()=>{debug.setVisible(!debug.visible);btn.textContent=debug.visible?'隐藏碰撞框':'显示碰撞框';};panel.append(btn);
    panel.append(status);document.body.append(panel);
    const update=()=>{const b=this.player.view.body as Phaser.Physics.Arcade.Body;status.textContent=`x${Math.round(this.player.view.x)} y${Math.round(this.player.view.y)} ${b.blocked.down?'落地':'空中'}`;panel.dataset.loaded=String(NIGHT.platforms.length+NIGHT.hurdles.length+NIGHT.covers.length+NIGHT.swings.length+5);panel.dataset.grounded=String(b.blocked.down);};
    this.events.on('postupdate',update);
    this.events.once('shutdown',()=>{this.events.off('postupdate',update);panel.remove();});
  }

  private createGoal(): void {
    const tokenGlow = this.add.circle(3420, 898, 28, 0xe4bd5e, .25).setDepth(20);
    const token = this.add.image(3420, 898, 'night-ticket').setDisplaySize(NIGHT.ticket.width, NIGHT.ticket.height).setDepth(21);
    const tokenLabel = this.add.text(3420, 860, '旧钞票 · 记忆信物', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#3b3222',
      backgroundColor: 'rgba(247,242,220,.9)', padding: { x: 7, y: 4 },
    }).setOrigin(.5).setDepth(22);
    const tokenHit = this.add.rectangle(3420, 898, 58, 68, 0xffffff, 0);
    this.physics.add.existing(tokenHit, true);

    const door = this.add.image(3600, 872, 'night-door').setDisplaySize(76,156).setDepth(12);
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
      door.setTint(0xd5e8d4);
      doorSign.setText('门已开启');
      this.announce('拿到旧钞票了。老师停下了，继续向右进入第二记忆房。', 3600);
      this.tweens.add({ targets: door, alpha: { from: .64, to: 1 }, duration: 420, yoyo: true });
    });
    this.physics.add.overlap(this.player.view, doorHit, () => {
      if (this.restarting) return;
      if (!this.tokenCollected) { this.warn('门还没有回应。先拿到街口的旧钞票。'); return; }
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
    this.announce(`到达${checkpoint.label}。先观察灯光和动态障碍。`);
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
      else this.hint(this.checkpointIndex === 1 ? '第二层向左走，穿过骑楼再下到底层。' : '趁灯光移开，向下一处阴影前进。');
    }
    this.wasLit = lit && moved && canCatch;
    if (this.detectionMs >= DETECTION_MS) this.restartFromCheckpoint('被老师看见了');
  }

  private updateDynamicHazards(time: number): void {
    for (const [index, swing] of SWINGS.entries()) {
      const angle = Math.sin(time * .0021 + swing.phase) * .82;
      const end = {
        x: swing.x + Math.sin(angle) * swing.length,
        y: swing.y + Math.cos(angle) * swing.length,
      };
      this.swingImages[index].setRotation(-angle);
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
    this.announce(`${reason}——回到最近的安全位置。`, 800);
    this.cameras.main.flash(190, 241, 186, 150);
    this.tweens.add({ targets: this.player.view, alpha: .16, duration: 170, yoyo: true, repeat: 1 });
    this.time.delayedCall(470, () => {
      const checkpoint = CHECKPOINTS[this.checkpointIndex];
      this.player.teleportTo(checkpoint.x, checkpoint.y);
      this.player.view.setAlpha(1);
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
