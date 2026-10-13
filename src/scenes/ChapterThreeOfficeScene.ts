import Phaser from 'phaser';
import cityNightApproach from '../../Chapter 3 资产/office/environment/city-night-approach-v2.png';
import lobbyNoElevator from '../../Chapter 3 资产/office/environment/lobby-no-elevator-v2.png';
import officeInterior from '../../Chapter 3 资产/office/environment/office-interior-v1.png';
import elevatorTransition from '../../Chapter 3 资产/office/environment/elevator-two-floor-transition-v1.png';
import officeFloor from '../../Chapter 3 资产/office/environment/office-floor-module-v1.png';
import rooftopSkyline from '../../Chapter 3 资产/office/environment/rooftop-skyline-v1.png';
import elevatorArt from '../../Chapter 3 资产/office/props/elevator-v1.png';
import elevatorOpenArt from '../../Chapter 3 资产/office/props/elevator-open-v1.png';
import turnstileArt from '../../Chapter 3 资产/office/props/badge-turnstile-v1.png';
import folderArt from '../../Chapter 3 资产/office/props/flying-folder-v1.png';
import computerArt from '../../Chapter 3 资产/office/props/flying-computer-v1.png';
import deskArt from '../../Chapter 3 资产/office/props/solid-desk-v1.png';
import chairArt from '../../Chapter 3 资产/office/props/spring-chair-v1.png';
import glideFolderArt from '../../Chapter 3 资产/office/props/glide-folder-v1.png';
import pillarArt from '../../Chapter 3 资产/office/props/flight-pillar-v1.png';
import parcelArt from '../../Chapter 3 资产/office/props/flying-parcel-v1.png';
import printerArt from '../../Chapter 3 资产/office/props/roof-printer-v1.png';
import ropeArt from '../../Chapter 3 资产/office/props/descent-rope-v1.png';
import phoneArt from '../../Chapter 3 资产/office/props/swing-phone-v1.png';
import brushArt from '../../Chapter 3 资产/office/props/memory-paintbrush-v1.png';
import doorArt from '../../Chapter 3 资产/office/props/color-choice-door-v1.png';
import badgeArt from '../../Chapter 3 资产/office/props/employee-badge-v1.png';
import commuterArt from '../../Chapter 3 资产/office/characters/commuters-3-v1.png';
import meimeiIdleArt from '../../Chapter 3 资产/office/characters/han-meimei-office-idle-4f-v1.png';
import meimeiRunArt from '../../Chapter 3 资产/office/characters/han-meimei-office-run-8f-v1.png';
import meimeiJumpArt from '../../Chapter 3 资产/office/characters/han-meimei-office-jump-4f-v1.png';
import meimeiCrouchArt from '../../Chapter 3 资产/office/characters/han-meimei-office-crouch-4f-v1.png';
import { applyHDCamera } from '../systems/Resolution';
import { OFFICE_ROUTE as R, OFFICE_CHECKPOINTS as CP, OFFICE_LEDGES, OFFICE_DESKS, COLLAPSE, collapsePosition, paperStormFrame, resolveDeskMotion, CHAIR_SEAT, COMMUTERS, onChairSeat, landingSurface, glideStep, ropePoint, type OfficeStage, type OfficeCheckpoint } from '../gameplay/chapterThreeOffice';

type Threat = { view: Phaser.GameObjects.Container; kind: 'person' | 'folder' | 'computer' | 'phone'; x: number; y: number; start: number; end: number; speed: number; phase: number; width: number; height: number; volleyIndex?: number };
const INK = '#edf0e8';
const COPY: Record<OfficeStage, [string, string]> = {
  badge: ['01 / 刷卡上班', '靠近闸机按 E 刷工牌 · E to scan your badge'],
  crowd: ['02 / 早高峰的人潮', '碰到人会重试，找准空隙起跳 · Avoid the commuters. Jump into the gaps.'],
  lift: ['03 / 上行一层', '电梯正在上升 · Going up one floor'],
  office: ['04 / 工作开始追赶你', '等一轮文件飞过，再跳上实心桌台 · Wait for a gap in the storm, then jump over the solid desks.'],
  chair: ['05 / 把办公椅变成跳板', '先跳上绿色椅面，再按空格弹起 · Jump onto the green seat, then press Space again.'],
  glide: ['06 / 让文件夹带你飞', 'WASD 四向滑翔，避开迎面飞来的快递和风口 · Steer with WASD. Dodge incoming air mail and vents.'],
  roof: ['07 / 对楼的截止时间', '身后正在坍塌！越过障碍，到楼边按 E 抓绳 · Floors are collapsing! Keep moving. E to grab the rope.'],
  rope: ['08 / 把工作放下', '沿绳速降，按住 S 加速 · Hold S to slide faster'],
  phones: ['09 / 不接的电话', '观察电话摆动，按 S 低身穿过 · Watch the phones. Hold S to duck beneath them.'],
  door: ['10 / 选择自己的颜色', '已拿到画笔，走近门按 E · Paintbrush found. Press E at the door.'],
  done: ['第三关灰盒 · 闯关完成', '你把画笔带出了公司。后续房间尚未制作。 / The brush is yours. The next room is not built yet.'],
};

/** Chapter 3 office route with painted assets over the confirmed greybox gameplay. */
export default class ChapterThreeOfficeScene extends Phaser.Scene {
  stage: OfficeStage = 'badge';
  checkpoint: OfficeCheckpoint = 'badge';
  px = 180; py = 1050; vx = 0; vy = 0;
  private grounded = true;
  private coyote = 0; private jumpBuffer = 0; private invulnerable = 0;
  private elapsed = 0; private liftTime = 0; private ropeT = 0;
  private stormTime = 0;
  private cameraX = 480; private cameraY = 900;
  private collapseActive = false; private collapseTime = 0; private collapseStart = 0; private collapseFront = 0;
  private roofTiles: { view: Phaser.GameObjects.Image; left: number; top: number; falling: number }[] = [];
  private roofProps: { view: Phaser.GameObjects.Container; x: number; top: number }[] = [];
  private cracks!: Phaser.GameObjects.Graphics;
  private airMail!: Phaser.GameObjects.Container;
  private airPhase: 'waiting' | 'warning' | 'flying' = 'waiting';
  private airTimer = 0; private airX = 0; private airY = 0;
  private deaths = 0; private brush = false;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private touch = new Set<string>(); private heldJump = false; private heldUse = false;
  private actor!: Phaser.GameObjects.Container;
  private actorSprite!: Phaser.GameObjects.Image;
  private duckChangedAt = 0; private wasDucking = false; private duckReleasedUntil = 0;
  private folder!: Phaser.GameObjects.Container;
  private lift!: Phaser.GameObjects.Container;
  private liftImage!: Phaser.GameObjects.Image;
  private liftDoorOpen = false;
  private gate!: Phaser.GameObjects.Rectangle;
  private gateView!: Phaser.GameObjects.Image;
  private badgeView!: Phaser.GameObjects.Image;
  private paintbrush!: Phaser.GameObjects.Container;
  private threats: Threat[] = [];
  private hud!: HTMLDivElement; private heading!: HTMLElement; private hint!: HTMLElement; private tally!: HTMLElement;
  private toast = ''; private toastUntil = 0;
  private wind!: Phaser.GameObjects.Graphics;
  private readonly pillars = [{ x: 5020, top: 190, bottom: 345 }, { x: 5480, top: 390, bottom: 780 }, { x: 6280, top: 180, bottom: 365 }];

  constructor() { super('chapter3'); }
  preload(): void {
    this.load.image('chapter3-office-city-night-approach', cityNightApproach);
    this.load.image('chapter3-office-lobby-no-elevator', lobbyNoElevator);
    this.load.image('chapter3-office-upper-interior', officeInterior);
    this.load.image('chapter3-office-elevator-transition', elevatorTransition);
    this.load.image('chapter3-office-floor-module', officeFloor);
    this.load.image('chapter3-office-rooftop-skyline', rooftopSkyline);
    const sprites = {
      elevator: elevatorArt, elevatorOpen: elevatorOpenArt,
      turnstile: turnstileArt, folder: folderArt,
      computer: computerArt, desk: deskArt, chair: chairArt, glideFolder: glideFolderArt,
      pillar: pillarArt, parcel: parcelArt, printer: printerArt, rope: ropeArt,
      phone: phoneArt, brush: brushArt, door: doorArt, badge: badgeArt,
      commuters: commuterArt, meimeiIdle: meimeiIdleArt, meimeiRun: meimeiRunArt,
      meimeiJump: meimeiJumpArt, meimeiCrouch: meimeiCrouchArt,
    };
    for (const [name, url] of Object.entries(sprites)) this.load.image(`chapter3-office-${name}`, url);
  }
  create(): void {
    this.stage = 'badge'; this.checkpoint = 'badge'; this.px = 180; this.py = 1050;
    this.vx = this.vy = this.elapsed = this.deaths = this.invulnerable = 0;
    this.grounded = true; this.brush = false; this.threats = []; this.touch.clear();
    this.heldJump = this.heldUse = false; this.coyote = this.jumpBuffer = 0;
    this.toast = ''; this.toastUntil = 0; this.liftTime = this.ropeT = 0;
    this.stormTime = 0;
    this.liftDoorOpen = false;
    this.collapseActive = false; this.collapseTime = this.collapseStart = this.collapseFront = 0;
    this.roofTiles = []; this.roofProps = []; this.airPhase = 'waiting'; this.airTimer = .4;
    applyHDCamera(this, 'expand-horizontal');
    this.cameras.main.setBackgroundColor('#1d2931');
    this.cameras.main.setBounds(0, 60, R.width, 1220);
    this.drawWorld();
    this.actor = this.add.container(this.px, this.py).setDepth(20);
    this.actorSprite = this.add.image(0, 0, 'chapter3-office-meimeiIdle', 'f0').setOrigin(.5, 1);
    this.actorSprite.setDisplaySize(54 * this.actorSprite.frame.width / this.actorSprite.frame.height, 54);
    this.actor.add(this.actorSprite);
    this.keys = this.input.keyboard!.addKeys('A,D,W,S,LEFT,RIGHT,UP,DOWN,SPACE,E,R') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    this.makeHud();
    const blur = () => { this.touch.clear(); this.input.keyboard?.resetKeys(); };
    window.addEventListener('blur', blur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud.remove(); this.touch.clear(); window.removeEventListener('blur', blur);
    });
    this.cameraX = this.cameras.main.width / this.cameras.main.zoom / 2;
    this.cameraY = this.py - 124;
    this.cameras.main.centerOn(this.cameraX, this.cameraY);
  }

  private label(x: number, y: number, text: string, size = 18, color = INK) {
    return this.add.text(x, y, text, { fontFamily: 'Arial, Microsoft YaHei, sans-serif', fontSize: `${size}px`, color, lineSpacing: 6 }).setDepth(3);
  }
  private art(kind: string, x: number, y: number, width: number, height: number, depth = 2) {
    return this.add.image(x, y, `chapter3-office-${kind}`, 'trim').setDisplaySize(width, height).setDepth(depth);
  }
  private object(x: number, y: number, kind: string): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    let image: Phaser.GameObjects.Image;
    if (kind === 'person') {
      image = this.add.image(0, 0, 'chapter3-office-commuters', `worker-${Math.abs(Math.floor(x / 110)) % 3}`)
        .setOrigin(.5, 1);
      image.setDisplaySize(55 * image.frame.width / image.frame.height, 55);
    } else {
      const spec: Record<string, [string, number, number, number]> = {
        folder: ['folder', 100, 40, -18], computer: ['computer', 55, 50, -16],
        phone: ['phone', 60, 42, -9], chair: ['chair', 70, 80, -20],
        brush: ['brush', 42, 72, -30], glideFolder: ['glideFolder', 106, 35, -12],
      };
      const [texture, width, height, offsetY] = spec[kind]!;
      image = this.art(texture, 0, offsetY, width, height);
    }
    c.add(image);
    return c;
  }
  private drawWorld() {
    // Trim via texture frames, retaining the original transparent PNGs in Chapter 3 资产/office.
    const trims: Record<string, [number, number, number, number]> = {
      elevator: [362, 86, 571, 999], elevatorOpen: [362, 86, 571, 999],
      turnstile: [405, 236, 670, 769],
      folder: [280, 166, 1110, 630], computer: [195, 154, 950, 916],
      desk: [93, 153, 1472, 681], chair: [324, 90, 654, 1008],
      glideFolder: [17, 166, 1949, 477], pillar: [286, 96, 327, 1559],
      parcel: [315, 164, 913, 684], printer: [164, 175, 1115, 820],
      rope: [44, 38, 1244, 1110], phone: [384, 76, 527, 1063],
      brush: [166, 69, 749, 1405], door: [357, 86, 571, 1040],
      badge: [375, 64, 598, 1039],
    };
    for (const [name, [x, y, width, height]] of Object.entries(trims))
      this.textures.get(`chapter3-office-${name}`).add('trim', 0, x, y, width, height);
    const workerFrames: [number, number, number, number][] = [[119, 53, 353, 909], [596, 108, 309, 852], [1096, 65, 306, 896]];
    workerFrames.forEach(([x, y, width, height], i) => this.textures.get('chapter3-office-commuters').add(`worker-${i}`, 0, x, y, width, height));
    const meimeiFrames: Record<string, [number, number, number, number][]> = {
      meimeiIdle: [[190,11,207,866],[584,12,206,864],[979,15,199,860],[1369,13,209,864]],
      meimeiRun: [[5,20,266,649],[271,21,272,644],[543,22,271,643],[814,22,272,611],[1086,33,271,635],[1357,30,272,637],[1629,25,271,638],[1900,25,266,630]],
      meimeiJump: [[21,138,385,722],[499,55,388,760],[887,9,443,665],[1330,92,380,765]],
      meimeiCrouch: [[178,10,185,767],[612,124,261,648],[1094,248,273,518],[1595,9,240,764]],
    };
    for (const [key, frames] of Object.entries(meimeiFrames))
      frames.forEach(([x, y, width, height], i) => this.textures.get(`chapter3-office-${key}`).add(`f${i}`, 0, x, y, width, height));
    const floorTexture = this.textures.get('chapter3-office-floor-module');
    for (let i = 0; i < 7; i++) floorTexture.add(`segment-${i}`, 0, 30 + i * 220, 302, 220, 475);
    // One continuous two-storey painting joins the night lobby and upper office.
    // Its painted lower and upper floor lines align with greybox y=1050 and y=530.
    this.add.image(-600, 651, 'chapter3-office-city-night-approach').setOrigin(0, 0).setDisplaySize(1170, 659).setDepth(-10);
    this.add.image(450, 651, 'chapter3-office-lobby-no-elevator').setOrigin(0, 0).setDisplaySize(1460, 659).setDepth(-9);
    // The camera can follow the player from ground (1050) up to the upper route (530).
    // Cover that entire vertical range; the previous 659px strip left a large empty band after the lift.
    for (const x of [1910, 4076, 9290]) this.add.image(x, 60, 'chapter3-office-upper-interior')
      .setOrigin(0, 0).setDisplaySize(2166, 1220).setDepth(-9);
    for (const x of [4650, 6350, 8050]) this.add.image(x, 60, 'chapter3-office-rooftop-skyline')
      .setOrigin(0, 0).setDisplaySize(1800, 1013).setDepth(-8);
    this.add.image(902, -179, 'chapter3-office-elevator-transition')
      .setOrigin(0, 0).setDisplaySize(2175, 1450).setDepth(-7);
    for (const p of OFFICE_LEDGES) {
      if (p === CHAIR_SEAT || OFFICE_DESKS.includes(p as typeof OFFICE_DESKS[number])) continue;
      if (p.left >= R.landing && p.right <= 8750) {
        for (let x = p.left; x < p.right; x += 80) {
          const width = Math.min(80, p.right - x);
          const tile = this.add.image(x, p.top, 'chapter3-office-floor-module', `segment-${Math.floor(x / 80) % 7}`)
            .setOrigin(0, 0).setDisplaySize(width, 175).setDepth(2);
          this.roofTiles.push({ view: tile, left: x, top: p.top, falling: 0 });
        }
        continue;
      }
      for (let x = p.left; x < p.right; x += 80) {
        this.add.image(x, p.top, 'chapter3-office-floor-module', `segment-${Math.floor(x / 80) % 7}`)
          .setOrigin(0, 0).setDisplaySize(Math.min(80, p.right - x), 175).setDepth(2);
      }
    }
    this.label(100, 820, 'THIRD CHAPTER / 第三关\n朝九晚五之外', 32);
    this.label(100, 930, '灰盒试玩 · OFFICE ESCAPE', 15, '#acb9b9');
    this.gate = this.add.rectangle(R.gate, 975, 24, 150, 0xd29078).setVisible(false);
    this.gateView = this.art('turnstile', R.gate - 26, 1050, 118, 104, 4).setOrigin(.5, 1);
    this.badgeView = this.art('badge', 338, 965, 22, 37, 5); this.label(307, 916, 'ID / E', 14);
    this.label(620, 820, 'RUSH HOUR / 不必和所有人走同一条路', 22);
    // Irregular groups share a speed, so their landing gaps do not collapse.
    for (const [i, commuter] of COMMUTERS.entries()) {
      const { x, scale } = commuter;
      const view = this.object(x, 1050, 'person').setScale(scale);
      this.threats.push({ view, kind: 'person', x, y: 1050, start: 560, end: 1880, speed: 42, phase: i * 1.73, width: 16 * scale, height: 55 * scale });
    }
    this.lift = this.add.container(1990, 1050);
    this.liftImage = this.art('elevator', 0, -122, 160, 235, 5);
    this.lift.add(this.liftImage);
    this.label(1880, 844, 'E / 电梯\nElevator', 18);
    this.label(2180, 315, 'PAPER STORM / 文件风暴', 26);
    for (let i = 0; i < 9; i++) {
      const x = 2470 + i * 166, kind = i % 3 === 0 ? 'computer' : 'folder';
      const view = this.object(x, 455, kind).setVisible(false);
      this.threats.push({ view, kind, x, y: 455, start: 2370, end: 4050, speed: -150 - i * 6, phase: i * .81, width: kind === 'computer' ? 28 : 39, height: 34, volleyIndex: i });
    }
    // Closed storage desks are visibly solid all the way to the floor.
    for (const desk of OFFICE_DESKS)
      this.art('desk', desk.left, desk.bottom, 140, desk.bottom - desk.top, 4).setOrigin(0, 1);
    this.object(R.chair, 530, 'chair'); this.label(4110, 355, 'SPRING CHAIR\n办公椅 / SPACE', 22, '#d9c18a');
    this.add.rectangle(R.chair, CHAIR_SEAT.top + 2, 70, 4, 0xa8e4b3).setDepth(4);
    this.folder = this.object(R.folder, 299, 'glideFolder').setDepth(12);
    this.label(4440, 215, '登上文件夹\nBoard the folder', 16);
    this.label(4800, 105, 'INBOX → OUTBOX / 飞出收件箱', 24);
    for (const p of this.pillars) this.art('pillar', p.x, p.top, 76, p.bottom - p.top, 4).setOrigin(.5, 0);
    this.wind = this.add.graphics();
    this.cracks = this.add.graphics().setDepth(5);
    this.airMail = this.add.container(0, 0).setDepth(14).setVisible(false);
    this.airMail.add(this.art('parcel', 0, 0, 64, 42, 14));
    this.label(6560, 315, 'DEADLINE / 截止时间在身后', 25);
    for (const [x, y] of [[6830, 530], [7490, 490], [8010, 530], [8470, 490]]) {
      const printer = this.add.container(x, y).setDepth(4);
      printer.add(this.art('printer', 0, -25, 65, 50, 4));
      this.roofProps.push({ view: printer, x, top: y });
    }
    const ropeStart = ropePoint(0), ropeEnd = ropePoint(1);
    this.art('rope', ropeStart.x, ropeStart.y, ropeEnd.x - ropeStart.x, ropeEnd.y - ropeStart.y, 3).setOrigin(0, 0);
    this.label(8590, 265, '楼外绳索 / E\nGrab the rope at the edge', 20);
    for (let i = 0; i < 5; i++) {
      const x = 9700 + i * 185;
      const view = this.object(x, 995, 'phone');
      this.threats.push({ view, kind: 'phone', x, y: 995, start: x, end: x, speed: 0, phase: i * 1.65, width: 32, height: 35 });
    }
    this.label(9490, 800, 'AFTER HOURS / 不是每个电话都要接', 24);
    this.paintbrush = this.object(R.brush, 1010, 'brush');
    this.art('door', R.door, 1050, 96, 140, 3).setOrigin(.5, 1);
    this.label(R.door - 66, 853, 'YOUR OWN COLOUR\n自己的颜色', 18);
  }

  private makeHud() {
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none;color:#edf0e8;font:14px/1.5 Arial,"Microsoft YaHei",sans-serif';
    this.hud.innerHTML = `<div style="position:absolute;left:20px;top:16px;max-width:70%;background:#1b2b32dd;padding:12px 18px;border-left:3px solid #d6bc82"><strong data-title style="font-size:19px"></strong><div data-hint></div><small data-tally style="color:#aabebb"></small></div>
      <div style="position:absolute;right:16px;top:16px;display:flex;gap:8px;pointer-events:auto"><button data-retry>Retry / R</button><button data-back>Back</button></div>
      <div style="position:absolute;bottom:15px;left:20px;color:#bbc9c6">A D / ← → 移动 · Space 跳跃 · S 蹲下 · E 互动 · R 检查点<br>Move · Jump · Duck · Interact · Retry</div>
      <div data-touch style="position:absolute;bottom:64px;left:16px;right:16px;display:flex;gap:8px;pointer-events:auto"><button data-key="LEFT">←</button><button data-key="RIGHT">→</button><button data-key="UP">↑</button><button data-key="DOWN">↓</button><span style="flex:1"></span><button data-key="SPACE">Jump</button><button data-key="E">E</button></div>`;
    this.hud.querySelectorAll('button').forEach(b => b.style.cssText = 'color:#f2ebdb;background:#34484de8;border:1px solid #9caa9d;border-radius:5px;padding:10px 15px;cursor:pointer;touch-action:none');
    this.heading = this.hud.querySelector('[data-title]')!; this.hint = this.hud.querySelector('[data-hint]')!; this.tally = this.hud.querySelector('[data-tally]')!;
    this.hud.querySelector('[data-retry]')!.addEventListener('click', () => this.respawn());
    this.hud.querySelector('[data-back]')!.addEventListener('click', () => this.scene.start('menu'));
    this.hud.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button => {
      const key = button.dataset.key!;
      button.addEventListener('pointerdown', e => { button.setPointerCapture(e.pointerId); this.touch.add(key); });
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => this.touch.delete(key));
    });
    document.body.append(this.hud);
  }
  private down(...names: string[]) { return names.some(n => this.keys[n]?.isDown || this.touch.has(n)); }
  private notice(text: string) { this.toast = text; this.toastUntil = this.elapsed + 2.5; }
  private save(point: OfficeCheckpoint) { this.checkpoint = point; this.notice('检查点已记录 / Checkpoint saved'); }
  private respawn() {
    if (this.stage === 'done') { this.scene.restart(); return; }
    const cp = CP[this.checkpoint]; this.px = cp.x; this.py = cp.y; this.vx = this.vy = 0;
    this.stage = this.checkpoint; this.grounded = true; this.invulnerable = 1.6;
    this.jumpBuffer = this.coyote = 0; this.brush = false; this.paintbrush.setVisible(true);
    this.airPhase = 'waiting'; this.airTimer = .4; this.airMail.setVisible(false);
    if (this.checkpoint === 'office') this.stormTime = 0;
    if (this.checkpoint === 'roof') this.startCollapse();
    else if (this.checkpoint !== 'phones') this.resetCollapse();
    this.folder.setPosition(R.folder, 299); this.lift.setPosition(R.lift, this.checkpoint === 'crowd' || this.checkpoint === 'badge' ? R.ground : R.upper);
    this.liftDoorOpen = this.checkpoint !== 'crowd' && this.checkpoint !== 'badge';
    this.liftImage.setTexture(`chapter3-office-${this.liftDoorOpen ? 'elevatorOpen' : 'elevator'}`, 'trim');
    this.actor.setVisible(true);
    this.deaths++; this.notice('回到当前检查点 / Back to checkpoint');
  }
  update(_time: number, delta: number): void {
    if (!this.actor) return;
    const dt = Math.min(delta / 1000, .033); this.elapsed += dt; this.invulnerable -= dt;
    if (this.stage === 'office' || this.stormTime > 0) this.stormTime += dt;
    const jumpHeld = this.down('SPACE', 'W', 'UP'), useHeld = this.down('E');
    const jump = jumpHeld && !this.heldJump, use = useHeld && !this.heldUse;
    this.heldJump = jumpHeld; this.heldUse = useHeld;
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.respawn();
    const dx = Number(this.down('D', 'RIGHT')) - Number(this.down('A', 'LEFT'));
    const dy = Number(this.down('S', 'DOWN')) - Number(this.down('W', 'UP'));
    const duck = dy > 0 && this.grounded && this.stage !== 'glide';
    if (this.stage === 'done') { this.drawActor(false); this.updateHud(); return; }
    if (this.stage === 'lift') {
      this.liftTime += dt;
      const t = Math.min(1, this.liftTime / 2.8); const ease = t * t * (3 - 2 * t);
      this.px = R.lift; this.py = R.ground - (R.ground - R.upper) * ease; this.lift.y = this.py;
      if (t === 1) {
        this.stage = 'office'; this.px = 2110; this.liftDoorOpen = true;
        this.liftImage.setTexture('chapter3-office-elevatorOpen', 'trim');
        this.actor.setVisible(true); this.save('office');
      }
    } else if (this.stage === 'rope') {
      this.ropeT += dt * (dy > 0 ? .72 : .40);
      const p = ropePoint(this.ropeT); this.px = p.x; this.py = p.y + 58;
      if (this.ropeT >= 1) { this.stage = 'phones'; this.px = 9400; this.py = 1050; this.vy = 0; this.save('phones'); this.notice('安全落地 / Safe landing.'); }
    } else if (this.stage === 'glide') {
      const p = glideStep(this.px, this.py, dx, dy, dt); this.px = p.x; this.py = p.y;
      this.folder.setPosition(this.px, this.py + 4); this.folder.rotation = dy * .08;
      this.updateAirMail(dt);
      for (const p of this.pillars) if (Math.abs(this.px - p.x) < 58 && this.py > p.top && this.py - 52 < p.bottom) { this.respawn(); break; }
      if (this.px >= 6500) {
        if (this.py > 545) this.respawn();
        else { this.stage = 'roof'; this.py = Math.min(this.py, 530); this.vy = 80; this.folder.setPosition(R.folder, 299); this.airMail.setVisible(false); this.save('roof'); this.startCollapse(); }
      }
    } else {
      const inCrowd = this.stage === 'crowd';
      this.vx = dx * (duck ? 125 : inCrowd ? 320 : 285);
      if (jump || (inCrowd && jumpHeld && this.grounded)) this.jumpBuffer = .18; else this.jumpBuffer -= dt;
      this.coyote = this.grounded ? .10 : this.coyote - dt;
      if (this.jumpBuffer > 0 && this.coyote > 0 && !duck) {
        const spring = this.stage === 'chair' && onChairSeat(this.px, this.py, this.grounded);
        this.vy = spring ? -900 : inCrowd ? -680 : -565; this.grounded = false; this.coyote = 0; this.jumpBuffer = 0;
        if (spring) this.notice('弹簧起跳！向右登上文件夹 / Spring! Land on the folder.');
      }
      const previousFeet = this.py;
      const previousX = this.px;
      this.px = Phaser.Math.Clamp(this.px + this.vx * dt, 35, R.width - 40);
      if (this.stage === 'badge') this.px = Math.min(this.px, R.gate - 35);
      if (this.stage === 'crowd') this.px = Math.min(this.px, 2020);
      this.vy = Math.min(950, this.vy + 1400 * dt); this.py += this.vy * dt; this.grounded = false;
      const solid = resolveDeskMotion(previousX, previousFeet, this.px, this.py, duck ? 29 : 54);
      this.px = solid.x; this.py = solid.feet;
      if (solid.ceiling) this.vy = Math.max(0, this.vy);
      const surface = landingSurface(this.px, previousFeet, this.py);
      if (surface && this.vy >= 0) { this.py = surface.top; this.vy = 0; this.grounded = true; }
      if (this.stage === 'badge' && use && Math.abs(this.px - 345) < 95) {
        this.stage = 'crowd'; this.gate.setFillStyle(0x79b5a0); this.gate.setScale(1, .15);
        this.gateView.setAlpha(.35); this.badgeView.setVisible(false); this.save('crowd');
      }
      if (this.stage === 'crowd' && use && Math.abs(this.px - R.lift) < 85 && this.grounded) {
        if (!this.liftDoorOpen) {
          this.liftDoorOpen = true;
          this.liftImage.setTexture('chapter3-office-elevatorOpen', 'trim');
          this.notice('电梯开门了，再按 E 进入 / Doors open. Press E again to enter.');
        } else {
          this.stage = 'lift'; this.liftTime = 0; this.vx = this.vy = 0;
          this.liftImage.setTexture('chapter3-office-elevator', 'trim');
          this.actor.setVisible(false);
        }
      }
      if (this.stage === 'office' && this.px > 4110) { this.stage = 'chair'; this.save('chair'); }
      if (this.stage === 'chair' && surface === CHAIR_SEAT && previousFeet < CHAIR_SEAT.top) this.notice('已踩上椅面，再按空格弹跳 / On the seat. Press Space to spring!');
      if (this.stage === 'chair' && surface?.top === 305 && this.px > 4430) { this.stage = 'glide'; this.grounded = false; this.vy = 0; this.airPhase = 'waiting'; this.airTimer = .4; }
      if (this.stage === 'roof' && use && Math.abs(this.px - R.rope) < 105 && Math.abs(this.py - 478) < 95) {
        this.stage = 'rope'; this.ropeT = 0; this.vx = this.vy = 0;
        this.collapseActive = false;
        this.notice('已抓住绳子，坍塌停止 / Rope secured. The collapse has stopped.');
      }
      if (this.stage === 'roof' && this.py >= 450) {
        for (const [x, top] of [[6830, 530], [7490, 490], [8010, 530], [8470, 490]]) {
          if (Math.abs(this.px - x) < 43 && this.py > top - 47 && this.py - 54 < top && this.invulnerable <= 0) { this.respawn(); break; }
        }
      }
      if (this.stage === 'phones' && Math.abs(this.px - R.brush) < 42 && this.py > 970) {
        this.brush = true; this.stage = 'door'; this.paintbrush.setVisible(false); this.notice('获得画笔 / Paintbrush collected');
      }
      if (this.stage === 'door' && this.brush && use && Math.abs(this.px - R.door) < 65) this.finish();
      if (this.py > 1230) this.respawn();
    }
    this.animateThreats(dt, duck);
    this.updateCollapse(dt);
    this.actor.setPosition(this.px, this.py); this.drawActor(duck);
    const cam = this.cameras.main;
    const viewW = cam.width / cam.zoom, viewH = cam.height / cam.zoom;
    const lookAhead = this.collapseActive ? .08 : .2;
    this.cameraX = Phaser.Math.Linear(this.cameraX, Phaser.Math.Clamp(this.px + viewW * lookAhead, viewW / 2, R.width - viewW / 2), 1 - Math.exp(-7 * dt));
    this.cameraY = Phaser.Math.Linear(this.cameraY, Phaser.Math.Clamp(this.py - viewH * .23, 60 + viewH / 2, 1280 - viewH / 2), 1 - Math.exp(-6 * dt));
    // centerOn accounts for Phaser's zoom origin; raw scroll coordinates do not.
    cam.centerOn(this.cameraX, this.cameraY);
    this.updateHud();
  }
  private animateThreats(dt: number, duck: boolean) {
    this.wind.clear();
    for (const h of this.threats) {
      const active = h.kind === 'person' ? this.stage === 'crowd' : h.kind === 'phone' ? ['phones', 'door'].includes(this.stage) : this.stage === 'office';
      if (h.kind === 'person') {
        h.x += h.speed * dt; if (h.x > h.end) h.x = h.start;
        h.view.setPosition(h.x, 1050); h.view.rotation = Math.sin(this.elapsed * 7 + h.phase) * .045;
      } else if (h.kind === 'phone') {
        const swing = Math.sin(this.elapsed * 1.8 + h.phase);
        h.view.setPosition(h.x + swing * 65, 940 + Math.cos(this.elapsed * 1.8 + h.phase) * 68); h.view.rotation = swing * .6;
        this.wind.lineStyle(1, 0x8d9a9f); this.wind.lineBetween(h.x, 850, h.view.x, h.view.y - 10);
      } else {
        const flight = paperStormFrame(this.stormTime, h.volleyIndex!);
        h.view.setVisible(flight.visible).setAlpha(flight.alpha);
        h.view.setPosition(flight.x, 432 + Math.sin(h.phase) * 53);
        h.view.rotation = Math.sin(this.elapsed * 3 + h.phase) * .15;
        if (flight.warning && this.stage === 'office') { this.wind.lineStyle(2, 0xe7a286, .65); this.wind.lineBetween(flight.endX, h.view.y, flight.startX, h.view.y); }
      }
      if (!active || !h.view.visible || this.invulnerable > 0) continue;
      const foot = h.kind === 'person', enemyY = h.view.y;
      const top = foot ? enemyY - h.height : enemyY - 30;
      const bottom = foot ? enemyY : enemyY + 12;
      if (Math.abs(this.px - h.view.x) < h.width + 10 && this.py > top + 4 && this.py - (duck ? 29 : 54) < bottom - 4) {
        this.respawn(); break;
      }
    }
    if (this.stage === 'glide') {
      if (this.airPhase === 'warning') {
        this.wind.lineStyle(3, 0xf2b389, .55 + Math.sin(this.elapsed * 15) * .2);
        this.wind.lineBetween(Math.max(this.px + 60, this.airX - 500), this.airY, this.airX, this.airY);
      }
      this.wind.lineStyle(2, 0xbed3ce, .25);
      for (let i = 0; i < 16; i++) { const x = 4670 + (i * 153 + this.elapsed * 75) % 1750; const y = 220 + i % 4 * 95; this.wind.lineBetween(x, y, x + 70, y - 10); }
    }
  }
  private updateAirMail(dt: number) {
    this.airTimer -= dt;
    if (this.airPhase === 'waiting') {
      this.airMail.setVisible(false);
      if (this.airTimer <= 0 && this.px < 6200) {
        this.airPhase = 'warning'; this.airTimer = 1;
        this.airX = this.px + 650; this.airY = this.py - 26;
        this.airMail.setPosition(this.airX, this.airY).setAlpha(.4).setVisible(true);
        this.notice('迎面快递！离开橙色航线 / Incoming air mail! Leave the orange lane.');
      }
    } else if (this.airPhase === 'warning') {
      if (this.airTimer <= 0) { this.airPhase = 'flying'; this.airMail.setAlpha(1); }
    } else {
      this.airX -= 240 * dt; this.airMail.setPosition(this.airX, this.airY);
      if (this.invulnerable <= 0 && Math.abs(this.px - this.airX) < 48 && Math.abs(this.py - 26 - this.airY) < 35) {
        this.respawn(); return;
      }
      if (this.airX < this.px - 180) { this.airPhase = 'waiting'; this.airTimer = .7; this.airMail.setVisible(false); }
    }
  }
  private resetCollapse() {
    this.collapseActive = false; this.collapseTime = this.collapseStart = this.collapseFront = 0;
    this.cracks.clear();
    for (const tile of this.roofTiles) {
      tile.falling = 0; tile.view.setPosition(tile.left, tile.top).setRotation(0).setAlpha(1).setVisible(true);
    }
    for (const prop of this.roofProps) prop.view.setPosition(prop.x, prop.top).setRotation(0).setAlpha(1).setVisible(true);
  }
  private startCollapse() {
    this.resetCollapse(); this.collapseActive = true;
    this.collapseStart = this.px - COLLAPSE.lead; this.collapseFront = this.collapseStart;
    this.notice('身后开始坍塌，往绳索跑！ / The floor is collapsing. Run for the rope!');
  }
  private updateCollapse(dt: number) {
    if (this.collapseActive) {
      this.collapseTime += dt;
      this.collapseFront = collapsePosition(this.collapseStart, this.collapseTime);
      // The collapse is fatal even during respawn invulnerability. Resetting the
      // roof checkpoint restores both the floor and its full escape interval.
      if (this.px - 13 <= this.collapseFront) {
        this.respawn(); this.notice('被坍塌追上了，再试一次 / The collapse caught up. Try again.'); return;
      }
    }
    this.cracks.clear();
    for (const tile of this.roofTiles) {
      if (this.collapseFront <= tile.left && tile.falling === 0) continue;
      tile.falling += dt;
      const t = tile.falling;
      tile.view.setPosition(tile.left - t * 15, tile.top + 100 * t + 450 * t * t)
        .setRotation(-t * .22).setAlpha(Math.max(0, 1 - t / 1.5)).setVisible(t < 1.5);
    }
    for (const prop of this.roofProps) {
      const tile = this.roofTiles.find(t => prop.x >= t.left && prop.x < t.left + 80 && prop.top === t.top);
      const t = tile?.falling ?? 0;
      prop.view.setPosition(prop.x - t * 15, prop.top + 100 * t + 450 * t * t)
        .setRotation(-t * .22).setAlpha(Math.max(0, 1 - t / 1.5)).setVisible(t < 1.5);
    }
    if (this.collapseActive) {
      for (const tile of this.roofTiles) {
        if (tile.left < this.collapseFront || tile.left > this.collapseFront + 180) continue;
        this.cracks.lineStyle(3, 0xe8a37d, .8);
        this.cracks.beginPath(); this.cracks.moveTo(tile.left + 7, tile.top);
        this.cracks.lineTo(tile.left + 29, tile.top + 16); this.cracks.lineTo(tile.left + 19, tile.top + 26);
        this.cracks.lineTo(tile.left + 47, tile.top + 44); this.cracks.strokePath();
      }
      this.cracks.fillStyle(0xdd9873, .12);
      this.cracks.fillRect(this.collapseFront - 18, 270, 36, 890);
    }
  }
  private drawActor(duck: boolean) {
    if (duck !== this.wasDucking) {
      this.duckChangedAt = this.elapsed;
      if (!duck) this.duckReleasedUntil = this.elapsed + .12;
      this.wasDucking = duck;
    }
    let key = 'meimeiIdle'; let frame = 0; let height = 54;
    if (duck) {
      key = 'meimeiCrouch'; frame = Math.min(2, Math.floor((this.elapsed - this.duckChangedAt) * 12));
      // Keep the sprite's natural scale through the crouch instead of flattening it.
      height = [54, 46, 37][frame];
    } else if (this.elapsed < this.duckReleasedUntil) {
      key = 'meimeiCrouch'; frame = 3;
    } else if (!this.grounded || this.stage === 'glide' || this.stage === 'rope') {
      key = 'meimeiJump'; frame = this.vy < -150 ? 1 : this.vy < 200 ? 2 : 3;
    } else if (Math.abs(this.vx) > 5) {
      key = 'meimeiRun'; frame = Math.floor(this.elapsed * 12) % 8;
    } else {
      frame = Math.floor(this.elapsed * 3) % 4;
    }
    this.actorSprite.setTexture(`chapter3-office-${key}`, `f${frame}`);
    this.actorSprite.setDisplaySize(height * this.actorSprite.frame.width / this.actorSprite.frame.height, height);
    this.actorSprite.setFlipX(this.vx < -2);
    this.actor.alpha = this.invulnerable > 0 ? .5 + Math.sin(this.elapsed * 25) * .3 : 1;
  }
  private updateHud() {
    this.heading.textContent = COPY[this.stage][0];
    this.hint.textContent = this.elapsed < this.toastUntil ? this.toast : this.stage === 'crowd' && this.liftDoorOpen
      ? '电梯已打开，按 E 进入 / Doors open. Press E to enter.' : COPY[this.stage][1];
    this.tally.textContent = `检查点 ${Object.keys(CP).indexOf(this.checkpoint) + 1}/6 · 重试 ${this.deaths} · ${this.brush ? '画笔 ✓ / Brush' : '工牌 / ID badge'}${this.collapseActive ? ' · 身后坍塌中 / Collapse approaching' : ''} · Greybox v1`;
  }
  private finish() {
    this.stage = 'done'; this.vx = this.vy = 0;
    this.scene.start('chapter3-painting');
  }
}
