import Phaser from 'phaser';

/** A single, reversible painting puzzle: erase a patch, then borrow the blank as a bridge. */
export default class ChapterThreePaintingScene extends Phaser.Scene {
  private phase: 'erase' | 'paper' | 'bridge' | 'done' = 'erase';
  private erased = new Set<number>();
  private rubbing = false; private dragging = false;
  private px = 150; private destination: number | null = null;
  private elapsed = 0; private held = new Set<string>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private actor!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Graphics;
  private scratch!: Phaser.GameObjects.Graphics;
  private paper!: Phaser.GameObjects.Container;
  private bridge!: Phaser.GameObjects.Graphics;
  private target!: Phaser.GameObjects.Graphics;
  private hud!: HTMLDivElement;
  private hint!: HTMLElement;
  private paperLabel!: Phaser.GameObjects.Text;
  private readonly source = { x: 245, y: 236, width: 132, height: 88 };

  constructor() { super('chapter3-painting'); }
  create() {
    this.phase = 'erase'; this.erased.clear(); this.held.clear();
    this.rubbing = this.dragging = false; this.px = 150; this.destination = null; this.elapsed = 0;
    this.cameras.main.setBackgroundColor('#eae3d4');
    const fit = () => {
      const { width, height } = this.scale.gameSize;
      this.cameras.main.setSize(width, height).setZoom(Math.min(width / 960, height / 540)).centerOn(480, 270);
    };
    fit(); this.scale.on(Phaser.Scale.Events.RESIZE, fit);
    this.drawPainting(); this.makeHud();
    this.keys = this.input.keyboard!.addKeys('A,D,LEFT,RIGHT,E') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.addCapture('LEFT,RIGHT');
    this.input.on('pointerdown', this.pointerDown, this);
    this.input.on('pointermove', this.pointerMove, this);
    this.input.on('pointerup', this.pointerUp, this);
    this.input.on('pointerupoutside', this.pointerUp, this);
    const blur = () => { this.held.clear(); this.input.keyboard?.resetKeys(); this.pointerUp(); };
    window.addEventListener('blur', blur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud.remove(); this.scale.off(Phaser.Scale.Events.RESIZE, fit);
      this.input.off('pointerdown', this.pointerDown, this); this.input.off('pointermove', this.pointerMove, this);
      this.input.off('pointerup', this.pointerUp, this); this.input.off('pointerupoutside', this.pointerUp, this);
      window.removeEventListener('blur', blur);
    });
  }
  private text(x: number, y: number, value: string, size = 16, color = '#576b70') {
    return this.add.text(x, y, value, { fontFamily: 'Georgia, Microsoft YaHei, serif', fontSize: `${size}px`, color, align: 'center', lineSpacing: 6 }).setOrigin(.5);
  }
  private drawPainting() {
    const g = this.add.graphics();
    g.fillStyle(0xf5f0e5); g.fillRoundedRect(18, 18, 924, 504, 10);
    g.lineStyle(2, 0xbaab91); g.strokeRoundedRect(28, 28, 904, 484, 8);
    g.fillStyle(0xcbdfe0); g.fillRect(44, 98, 872, 377);
    g.fillStyle(0xe1e8dc, .55); g.fillEllipse(530, 230, 820, 220);
    g.fillStyle(0xf2dba6); g.fillCircle(735, 165, 39);
    // Loose translucent brush marks keep this prototype visibly inside a painting.
    for (let i = 0; i < 34; i++) {
      g.lineStyle(2 + i % 4, i % 2 ? 0xffffff : 0x89acb1, .14);
      const x = 58 + (i * 137) % 825, y = 120 + (i * 43) % 290;
      g.lineBetween(x, y, Math.min(908, x + 50 + i % 45), y - 6);
    }
    for (const [x,y] of [[490,170],[790,240],[110,150]]) {
      g.fillStyle(0xfaf7ed,.7); g.fillEllipse(x,y,95,25); g.fillEllipse(x-20,y-9,43,27);
    }
    for (const [left,right] of [[55,360],[600,905]]) {
      g.fillStyle(0x899c91); g.fillTriangle(left,410,right,410,(left+right)/2,488);
      g.fillStyle(0xb4bea3); g.fillRoundedRect(left,397,right-left,22,8);
      g.lineStyle(3,0xf6edcf); g.lineBetween(left+4,403,right-4,403);
      g.lineStyle(1,0x667f79,.45);
      for(let x=left+20;x<right;x+=27)g.lineBetween(x,423,x-10,450);
    }
    // The wall contains the painted area that can be erased and lifted away.
    g.fillStyle(0xa98a7c); g.fillRoundedRect(164,184,164,145,7);
    g.fillStyle(0xc5aaa0); g.fillRect(179,192,132,88);
    g.lineStyle(2,0xf5ead8); g.strokeRect(179,192,132,88);
    g.lineStyle(3,0x92756d,.65);
    for(let i=0;i<7;i++)g.lineBetween(182,201+i*11,305,210+i*10);
    this.scratch = this.add.graphics();
    this.paperLabel = this.text(246,160,'擦一擦这块颜色\nRub away the colour',15);
    this.paper = this.add.container(245,236).setDepth(12).setVisible(false);
    const sheet=this.add.graphics();
    sheet.fillStyle(0x6a7771,.15);sheet.fillRoundedRect(-65,-38,138,92,5);
    sheet.fillStyle(0xfffcf0);sheet.fillPoints([{x:-66,y:-44},{x:57,y:-47},{x:69,y:35},{x:-58,y:45}],true);
    sheet.lineStyle(1,0xcfbea2);sheet.lineBetween(-55,-30,53,-34);
    this.paper.add(sheet);
    this.target=this.add.graphics();this.bridge=this.add.graphics();
    this.text(480,447,'这里少了一笔\nA missing brushstroke',16);
    g.fillStyle(0x688e8b);g.fillRoundedRect(800,300,64,104,28);
    g.lineStyle(3,0xf8e8bd);g.strokeRoundedRect(800,300,64,104,28);
    g.fillStyle(0xf8e8bd);g.fillCircle(850,358,3);
    this.text(832,274,'画的另一边\nBeyond the painting',15);
    this.actor=this.add.container(this.px,400).setDepth(10);this.body=this.add.graphics();this.actor.add(this.body);
    this.text(480,72,'借 一 片 空 白  /  BORROW A BLANK',23,'#596c68');
  }
  private makeHud() {
    this.hud=document.createElement('div');
    this.hud.style.cssText='position:fixed;inset:0;z-index:50;pointer-events:none;font:14px/1.5 Arial,"Microsoft YaHei",sans-serif;color:#425b58';
    this.hud.innerHTML='<div style="position:absolute;left:20px;bottom:20px;background:#f7f2e7ec;padding:10px 16px;border-radius:5px;max-width:70%" data-hint></div><div style="position:absolute;right:16px;top:16px;display:flex;gap:8px;pointer-events:auto"><button data-reset>重新试 / Reset</button><button data-home>首页 / Home</button></div><div style="position:absolute;right:20px;bottom:20px;display:flex;gap:8px;pointer-events:auto"><button data-left>←</button><button data-right>→</button><button data-enter>进入 / E</button></div>';
    this.hud.querySelectorAll('button').forEach(b=>b.style.cssText='background:#f8f2e6;color:#425b58;border:1px solid #b3ad96;border-radius:5px;padding:10px 14px;cursor:pointer;touch-action:none');
    this.hint=this.hud.querySelector('[data-hint]')!;
    this.hud.querySelector('[data-reset]')!.addEventListener('click',()=>this.scene.restart());
    this.hud.querySelector('[data-home]')!.addEventListener('click',()=>this.scene.start('menu'));
    this.hud.querySelector('[data-enter]')!.addEventListener('click',()=>this.tryExit());
    for(const direction of ['left','right']) {
      const button=this.hud.querySelector<HTMLButtonElement>(`[data-${direction}]`)!;
      button.addEventListener('pointerdown',e=>{button.setPointerCapture(e.pointerId);this.held.add(direction);});
      for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>this.held.delete(direction));
    }
    document.body.append(this.hud);
  }
  private point(pointer: Phaser.Input.Pointer) { return this.cameras.main.getWorldPoint(pointer.x,pointer.y); }
  private pointerDown(pointer: Phaser.Input.Pointer) {
    const p=this.point(pointer);
    if(this.phase==='erase' && Math.abs(p.x-this.source.x)<80 && Math.abs(p.y-this.source.y)<65) {
      this.rubbing=true;this.eraseAt(p.x,p.y);return;
    }
    if(this.phase==='paper' && Math.abs(p.x-this.paper.x)<80 && Math.abs(p.y-this.paper.y)<65) {
      this.tweens.killTweensOf(this.paper);
      this.dragging=true;return;
    }
    if(this.phase==='bridge' && p.x>360 && p.x<600 && Math.abs(p.y-402)<25 && (this.px<345 || this.px>615)) {
      this.phase='paper';this.bridge.clear();this.paper.setPosition(p.x,p.y).setVisible(true);this.dragging=true;this.destination=null;return;
    }
    if(p.y>335 && p.y<470){this.destination=Phaser.Math.Clamp(p.x,75,880);if(p.x>795 && this.px>790)this.tryExit();}
  }
  private pointerMove(pointer: Phaser.Input.Pointer) {
    const p=this.point(pointer);
    if(this.rubbing)this.eraseAt(p.x,p.y);
    if(this.dragging)this.paper.setPosition(Phaser.Math.Clamp(p.x,85,875),Phaser.Math.Clamp(p.y,125,440));
  }
  private pointerUp() {
    this.rubbing=false;
    if(!this.dragging)return;
    this.dragging=false;
    if(Math.abs(this.paper.x-480)<125 && Math.abs(this.paper.y-399)<65) {
      this.phase='bridge';this.paper.setVisible(false);
      this.bridge.fillStyle(0xfffcf0);this.bridge.fillPoints([{x:352,y:403},{x:605,y:398},{x:609,y:415},{x:356,y:420}],true);
      this.bridge.lineStyle(2,0xd8c9ab);this.bridge.lineBetween(357,418,604,413);
      this.paperLabel.setText('空白变成了一条路\nThe blank became a path');
    } else {
      this.tweens.add({targets:this.paper,x:245,y:230,duration:240,ease:'Sine.Out'});
    }
  }
  private eraseAt(x:number,y:number) {
    if(this.phase!=='erase')return;
    for(let row=0;row<4;row++)for(let col=0;col<6;col++) {
      const cx=190+col*22,cy=203+row*22;
      if(Math.hypot(x-cx,y-cy)>30)continue;
      const id=row*6+col;if(this.erased.has(id))continue;
      this.erased.add(id);this.scratch.fillStyle(0xfffcf0);this.scratch.fillRoundedRect(cx-11,cy-11,22,22,3);
    }
    if(this.erased.size>=18){
      this.phase='paper';this.rubbing=false;
      this.scratch.fillStyle(0x667777);this.scratch.fillRect(179,192,132,88);
      this.paper.setVisible(true);this.paperLabel.setText('把空白拖到断开的路上\nDrag the blank into the gap');
    }
  }
  update(_time:number,delta:number) {
    if(!this.actor)return;
    const dt=Math.min(delta/1000,.033);this.elapsed+=dt;
    const axis=Number(this.keys.D.isDown||this.keys.RIGHT.isDown||this.held.has('right'))-Number(this.keys.A.isDown||this.keys.LEFT.isDown||this.held.has('left'));
    let direction=axis;
    if(axis)this.destination=null;
    else if(this.destination!==null){direction=Math.sign(this.destination-this.px);if(Math.abs(this.destination-this.px)<4){this.destination=null;direction=0;}}
    if(this.phase==='done')direction=0;
    let next=Phaser.Math.Clamp(this.px+direction*155*dt,75,880);
    if(this.phase!=='bridge' && this.phase!=='done')next=this.px<480?Math.min(next,345):Math.max(next,615);
    this.px=next;this.actor.setPosition(this.px,400);
    const g=this.body;g.clear();const stride=direction?Math.sin(this.elapsed*12)*5:0;
    g.fillStyle(0x705246);g.fillCircle(0,-46,10);g.fillStyle(0xe9cca4);g.fillCircle(1,-44,7);
    g.fillStyle(0xf2e5cb);g.fillRoundedRect(-10,-34,20,23,4);g.fillStyle(0x789395);g.fillRect(-10,-16,20,9);
    g.lineStyle(4,0xddbc98);g.lineBetween(-5,-8,-7+stride,0);g.lineBetween(5,-8,7-stride,0);
    g.lineStyle(3,0xb68b51);g.lineBetween(12,-21,21,-39);
    this.target.clear();
    if(this.phase==='paper') {this.target.lineStyle(2,0xfffae8,.5+Math.sin(this.elapsed*3)*.2);for(let x=366;x<600;x+=24)this.target.lineBetween(x,404,x+13,404);}
    const hints={erase:'按住鼠标或手指，在墙上的色块来回擦拭 / Hold and rub the painted patch.',paper:'拖动白纸，放到两块陆地之间 / Drag the blank between the islands.',bridge:'A D / ← → 行走，也可以点击地面；走到门前按 E / Walk to the door, then press E.',done:'这一小段试玩完成 / Prototype complete'};
    this.hint.textContent=hints[this.phase];
    if(Phaser.Input.Keyboard.JustDown(this.keys.E))this.tryExit();
  }
  private tryExit() {
    if(this.phase!=='bridge'||this.px<790)return;
    this.phase='done';this.destination=null;
    const panel=document.createElement('div');
    panel.style.cssText='position:absolute;inset:28% 23%;padding:26px;background:#faf5e9f5;border:1px solid #b9b298;border-radius:8px;display:grid;place-content:center;gap:18px;text-align:center;pointer-events:auto';
    panel.innerHTML='<h2 style="margin:0">空白，也可以是一条路。</h2><div>A blank can become a path.</div><div>画中世界 · 第一种玩法试玩完成<br>Painting world · First puzzle prototype complete</div><button>再试一次 / Try again</button>';
    panel.querySelector('button')!.addEventListener('click',()=>this.scene.restart());this.hud.append(panel);
  }
}
