import Phaser from 'phaser';
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

/** Playable platforming prototype; all visuals are inexpensive authored shapes. */
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
  private roofTiles: { view: Phaser.GameObjects.Graphics; left: number; top: number; falling: number }[] = [];
  private roofProps: { view: Phaser.GameObjects.Container; x: number; top: number }[] = [];
  private cracks!: Phaser.GameObjects.Graphics;
  private airMail!: Phaser.GameObjects.Container;
  private airPhase: 'waiting' | 'warning' | 'flying' = 'waiting';
  private airTimer = 0; private airX = 0; private airY = 0;
  private deaths = 0; private brush = false;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private touch = new Set<string>(); private heldJump = false; private heldUse = false;
  private actor!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Graphics;
  private folder!: Phaser.GameObjects.Container;
  private lift!: Phaser.GameObjects.Container;
  private gate!: Phaser.GameObjects.Rectangle;
  private paintbrush!: Phaser.GameObjects.Container;
  private threats: Threat[] = [];
  private hud!: HTMLDivElement; private heading!: HTMLElement; private hint!: HTMLElement; private tally!: HTMLElement;
  private toast = ''; private toastUntil = 0;
  private wind!: Phaser.GameObjects.Graphics;
  private readonly pillars = [{ x: 5020, top: 190, bottom: 345 }, { x: 5480, top: 390, bottom: 780 }, { x: 6280, top: 180, bottom: 365 }];

  constructor() { super('chapter3'); }
  create(): void {
    this.stage = 'badge'; this.checkpoint = 'badge'; this.px = 180; this.py = 1050;
    this.vx = this.vy = this.elapsed = this.deaths = this.invulnerable = 0;
    this.grounded = true; this.brush = false; this.threats = []; this.touch.clear();
    this.heldJump = this.heldUse = false; this.coyote = this.jumpBuffer = 0;
    this.toast = ''; this.toastUntil = 0; this.liftTime = this.ropeT = 0;
    this.stormTime = 0;
    this.collapseActive = false; this.collapseTime = this.collapseStart = this.collapseFront = 0;
    this.roofTiles = []; this.roofProps = []; this.airPhase = 'waiting'; this.airTimer = .4;
    applyHDCamera(this, 'expand-horizontal');
    this.cameras.main.setBackgroundColor('#1d2931');
    this.cameras.main.setBounds(0, 60, R.width, 1220);
    this.drawWorld();
    this.actor = this.add.container(this.px, this.py).setDepth(20);
    this.body = this.add.graphics(); this.actor.add(this.body);
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
  private object(x: number, y: number, kind: string): Phaser.GameObjects.Container {
    const c = this.add.container(x, y); const g = this.add.graphics(); c.add(g);
    g.lineStyle(2, 0xd8e0dc, .8);
    if (kind === 'folder') {
      g.fillStyle(0xc8c09e); g.fillTriangle(-48, 0, -15, -30, 0, 0); g.fillTriangle(0, 0, 40, -28, 52, 0);
      g.lineBetween(-48, 0, 52, 0); g.lineBetween(0, 0, 0, -20);
    } else if (kind === 'computer') {
      g.fillStyle(0x879ca2); g.fillRoundedRect(-26, -36, 52, 35, 4);
      g.fillStyle(0x243840); g.fillRect(-20, -30, 40, 22); g.lineBetween(0, 0, 0, 10); g.lineBetween(-20, 10, 20, 10);
    } else if (kind === 'phone') {
      g.lineStyle(9, 0xd49b85); g.beginPath(); g.arc(0, -10, 25, .15, Math.PI - .15); g.strokePath();
      g.fillStyle(0xd49b85); g.fillRoundedRect(-33, -13, 18, 28, 6); g.fillRoundedRect(15, -13, 18, 28, 6);
    } else if (kind === 'chair') {
      g.fillStyle(0x80b2ab); g.fillRoundedRect(-27, -58, 54, 32, 6); g.fillRect(-35, -24, 70, 12);
      g.lineBetween(0, -15, 0, 0); g.lineBetween(-32, 0, 32, 0); g.strokeCircle(-25, 0, 5); g.strokeCircle(25, 0, 5);
    } else if (kind === 'brush') {
      g.lineStyle(8, 0xd6b66a); g.lineBetween(-12, 16, 10, -25); g.fillStyle(0x7bc5b1); g.fillTriangle(3, -25, 18, -19, 24, -51);
    } else {
      g.fillStyle([0x87999c, 0x9c938b, 0x738b9b][Math.floor(x / 31) % 3]); g.fillCircle(0, -53, 10); g.fillRoundedRect(-12, -40, 24, 28, 4);
      g.lineBetween(-6, -10, -12, 0); g.lineBetween(6, -10, 12, 0);
      g.fillStyle(0xd09c86); g.fillRect(13, -32, 19, 16);
    }
    return c;
  }
  private drawWorld() {
    const bg = this.add.graphics();
    bg.fillStyle(0x293943); bg.fillRect(0, 60, 4650, 1100); bg.fillRect(6500, 60, 2250, 1100);
    for (let x = 70; x < R.width; x += 260) {
      bg.fillStyle(0x45565e, .45); bg.fillRect(x, 110, 160, 190); bg.fillRect(x, 650, 160, 180);
      bg.lineStyle(2, 0x74878b, .25); bg.lineBetween(x + 80, 110, x + 80, 300);
    }
    for (const p of OFFICE_LEDGES) {
      if (p === CHAIR_SEAT || OFFICE_DESKS.includes(p as typeof OFFICE_DESKS[number])) continue;
      if (p.left >= R.landing && p.right <= 8750) {
        for (let x = p.left; x < p.right; x += 80) {
          const tile = this.add.graphics().setPosition(x, p.top).setDepth(2);
          const width = Math.min(80, p.right - x);
          tile.fillStyle(0x728080); tile.fillRect(0, 0, width, 30);
          tile.fillStyle(0xb9c4bd); tile.fillRect(0, 0, width, 5);
          tile.fillStyle(0x303f45); tile.fillRect(0, 30, width, 145);
          this.roofTiles.push({ view: tile, left: x, top: p.top, falling: 0 });
        }
        continue;
      }
      bg.fillStyle(0x728080); bg.fillRect(p.left, p.top, p.right - p.left, 30);
      bg.fillStyle(0xb9c4bd); bg.fillRect(p.left, p.top, p.right - p.left, 5);
      bg.fillStyle(0x303f45); bg.fillRect(p.left, p.top + 30, p.right - p.left, 145);
    }
    this.label(100, 820, 'THIRD CHAPTER / 第三关\n朝九晚五之外', 32);
    this.label(100, 930, '灰盒试玩 · OFFICE ESCAPE', 15, '#acb9b9');
    this.gate = this.add.rectangle(R.gate, 975, 24, 150, 0xd29078);
    this.add.rectangle(335, 1010, 35, 80, 0x6c8588); this.label(307, 949, 'ID / E', 14);
    this.label(620, 820, 'RUSH HOUR / 不必和所有人走同一条路', 22);
    // Irregular groups share a speed, so their landing gaps do not collapse.
    for (const [i, commuter] of COMMUTERS.entries()) {
      const { x, scale } = commuter;
      const view = this.object(x, 1050, 'person').setScale(scale);
      this.threats.push({ view, kind: 'person', x, y: 1050, start: 560, end: 1880, speed: 42, phase: i * 1.73, width: 16 * scale, height: 55 * scale });
    }
    bg.fillStyle(0x17262e); bg.fillRect(1910, 340, 150, 710);
    this.lift = this.add.container(1990, 1050);
    this.lift.add(this.add.rectangle(0, -75, 140, 150, 0x596d73).setStrokeStyle(3, 0xd6c69b));
    this.lift.add(this.add.text(-38, -136, '01 ↑ 02', { fontSize: '16px', color: INK }));
    this.label(1880, 844, 'E / 电梯\nElevator', 18);
    this.label(2180, 315, 'PAPER STORM / 文件风暴', 26);
    for (let i = 0; i < 9; i++) {
      const x = 2470 + i * 166, kind = i % 3 === 0 ? 'computer' : 'folder';
      const view = this.object(x, 455, kind).setVisible(false);
      this.threats.push({ view, kind, x, y: 455, start: 2370, end: 4050, speed: -150 - i * 6, phase: i * .81, width: kind === 'computer' ? 28 : 39, height: 34, volleyIndex: i });
    }
    // Closed storage desks are visibly solid all the way to the floor.
    for (const desk of OFFICE_DESKS) {
      bg.fillStyle(0x607a7b); bg.fillRect(desk.left, desk.top, 140, desk.bottom - desk.top);
      bg.fillStyle(0xa7b9b2); bg.fillRect(desk.left, desk.top, 140, 8);
      bg.lineStyle(2, 0x91a9a4); bg.strokeRect(desk.left + 8, desk.top + 16, 124, 54);
      bg.lineBetween(desk.left + 70, desk.top + 16, desk.left + 70, desk.bottom - 10);
    }
    this.object(R.chair, 530, 'chair'); this.label(4110, 355, 'SPRING CHAIR\n办公椅 / SPACE', 22, '#d9c18a');
    this.add.rectangle(R.chair, CHAIR_SEAT.top + 2, 70, 4, 0xa8e4b3).setDepth(4);
    this.folder = this.object(R.folder, 299, 'folder').setDepth(12);
    this.label(4440, 215, '登上文件夹\nBoard the folder', 16);
    this.label(4800, 105, 'INBOX → OUTBOX / 飞出收件箱', 24);
    for (const p of this.pillars) {
      bg.fillStyle(0x976f62, .75); bg.fillRoundedRect(p.x - 38, p.top, 76, p.bottom - p.top, 8);
      this.label(p.x - 30, p.top + 20, '!', 35, '#f2d4b0');
    }
    this.wind = this.add.graphics();
    this.cracks = this.add.graphics().setDepth(5);
    this.airMail = this.add.container(0, 0).setDepth(14).setVisible(false);
    const parcel = this.add.graphics();
    parcel.fillStyle(0xe3a183); parcel.fillRoundedRect(-32, -21, 64, 42, 4);
    parcel.lineStyle(3, 0xffe1ad); parcel.lineBetween(-29, -18, 0, 5); parcel.lineBetween(0, 5, 29, -18);
    parcel.fillStyle(0xf0cf91); parcel.fillTriangle(-32, -14, -58, 0, -32, 14);
    this.airMail.add(parcel);
    this.label(6560, 315, 'DEADLINE / 截止时间在身后', 25);
    for (const [x, y] of [[6830, 530], [7490, 490], [8010, 530], [8470, 490]]) {
      const printer = this.add.container(x, y).setDepth(4);
      printer.add(this.add.rectangle(0, -24, 65, 48, 0xa8957e).setStrokeStyle(2, 0xe0cfb2));
      printer.add(this.label(-28, -42, 'PRINT', 11));
      this.roofProps.push({ view: printer, x, top: y });
    }
    const ropeStart = ropePoint(0), ropeEnd = ropePoint(1);
    bg.lineStyle(5, 0xd8bd7d); bg.lineBetween(ropeStart.x, ropeStart.y, ropeEnd.x, ropeEnd.y);
    this.add.circle(ropeStart.x, ropeStart.y, 12, 0xd8bd7d);
    this.label(8590, 265, '楼外绳索 / E\nGrab the rope at the edge', 20);
    for (let i = 0; i < 5; i++) {
      const x = 9700 + i * 185;
      const view = this.object(x, 995, 'phone');
      this.threats.push({ view, kind: 'phone', x, y: 995, start: x, end: x, speed: 0, phase: i * 1.65, width: 32, height: 35 });
    }
    this.label(9490, 800, 'AFTER HOURS / 不是每个电话都要接', 24);
    this.paintbrush = this.object(R.brush, 1010, 'brush');
    this.add.rectangle(R.door, 980, 96, 140, 0x678c83).setStrokeStyle(4, 0xd2b77b);
    this.add.circle(R.door + 28, 985, 5, 0xebd4a1);
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
      if (t === 1) { this.stage = 'office'; this.px = 2110; this.save('office'); }
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
        this.stage = 'crowd'; this.gate.setFillStyle(0x79b5a0); this.gate.setScale(1, .15); this.save('crowd');
      }
      if (this.stage === 'crowd' && use && Math.abs(this.px - R.lift) < 85 && this.grounded) { this.stage = 'lift'; this.liftTime = 0; this.vx = this.vy = 0; }
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
    const g = this.body; g.clear(); const h = duck ? 29 : 54;
    const stride = this.grounded && Math.abs(this.vx) > 5 ? Math.sin(this.elapsed * 13) * 7 : 0;
    g.fillStyle(0xe2cda7); g.fillCircle(0, -h + 8, 9);
    g.fillStyle(0x546d70); g.fillRoundedRect(-11, -h + 20, 22, Math.max(10, h - 32), 5);
    g.lineStyle(5, 0xd2c4a6); g.lineBetween(-5, -12, -7 + stride, 0); g.lineBetween(5, -12, 7 - stride, 0);
    g.lineStyle(3, 0xc4b595); g.lineBetween(-11, -h + 24, -16 - stride / 2, -h + 39); g.lineBetween(11, -h + 24, 16 + stride / 2, -h + 39);
    g.fillStyle(0xe4c57f); g.fillRect(-3, -h + 25, 6, 9);
    this.actor.alpha = this.invulnerable > 0 ? .5 + Math.sin(this.elapsed * 25) * .3 : 1;
  }
  private updateHud() {
    this.heading.textContent = COPY[this.stage][0]; this.hint.textContent = this.elapsed < this.toastUntil ? this.toast : COPY[this.stage][1];
    this.tally.textContent = `检查点 ${Object.keys(CP).indexOf(this.checkpoint) + 1}/6 · 重试 ${this.deaths} · ${this.brush ? '画笔 ✓ / Brush' : '工牌 / ID badge'}${this.collapseActive ? ' · 身后坍塌中 / Collapse approaching' : ''} · Greybox v1`;
  }
  private finish() {
    this.stage = 'done'; this.vx = this.vy = 0;
    this.scene.start('chapter3-painting');
  }
}
