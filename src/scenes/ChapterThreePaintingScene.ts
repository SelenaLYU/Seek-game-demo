import Phaser from 'phaser';
<<<<<<< Updated upstream
import paintingWorldBackgroundUrl from '../../Chapter 3 资产/painting-world/painting-world-background-v1-1920x1080.png';
=======
import landscapeUrl from '../../art/chapter3/painting-world/phase1/environment-aligned.png?url';
import { warpLandscape, PAINTING_REST as REST, PAINTING_START as START, PAINTING_MARK as MARK, PAINTING_WIDTH as W, PAINTING_HEIGHT as H, type Point } from '../gameplay/paintingPerspective';
>>>>>>> Stashed changes

const KEY = 'chapter3-environment-painting';
const SURFACE = 'chapter3-deformed-painting';
const COLS = 36, ROWS = 24;

/** All puzzle contours belong to the painted terrain and use its one continuous mesh. */
export default class ChapterThreePaintingScene extends Phaser.Scene {
<<<<<<< Updated upstream
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
  preload() {
    this.load.image('chapter3-painting-background', paintingWorldBackgroundUrl);
  }
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
    // The painting is a 1920×1080 asset authored for this 960×540 greybox.
    // Compress it vertically by 10 logical pixels so the painted ledge tops
    // coincide with the existing y=397 collision surfaces; interaction layers
    // remain separate and retain their original hit areas.
    this.add.image(0, 0, 'chapter3-painting-background').setOrigin(0, 0).setDisplaySize(960, 530);
    const g = this.add.graphics();
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
=======
  private corner:Point={...START};
  private dragging=false; private solved=false; private collected=false; private elapsed=0;
  private art!:Phaser.GameObjects.Graphics;
  private surface!:Phaser.Textures.CanvasTexture;
  private picture!:CanvasImageSource;
  private pictureWidth=1; private pictureHeight=1;
  private lastX=NaN; private lastY=NaN;
  private readyAt=Infinity;
  private dragOffset:Point={x:0,y:0};
  private hud!:HTMLDivElement; private hint!:HTMLElement;
  private hintValue='';
  constructor(){super('chapter3-painting');}
  preload(){if(!this.textures.exists(KEY))this.load.image(KEY,landscapeUrl);}
  create(){
    this.corner={...START};this.dragging=this.solved=this.collected=false;
    this.elapsed=0;this.lastX=this.lastY=NaN;this.readyAt=Infinity;this.hintValue='';
    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor('#d9d6c3');
    // Contain the puzzle so its handle and landscape remain accessible on narrow screens.
    const fit=()=>{const {width,height}=this.scale.gameSize;this.cameras.main.setSize(width,height).setZoom(Math.min(width/W,height/H)).centerOn(W/2,H/2);};
    fit();this.scale.on(Phaser.Scale.Events.RESIZE,fit);
    this.picture=this.textures.get(KEY).getSourceImage() as HTMLImageElement;
    this.pictureWidth=(this.picture as HTMLImageElement).width;
    this.pictureHeight=(this.picture as HTMLImageElement).height;
    this.surface=this.textures.createCanvas(SURFACE,1586,992)!;
    this.add.image(W/2,H/2,SURFACE).setDisplaySize(W,H);
    this.art=this.add.graphics();
>>>>>>> Stashed changes
    this.hud=document.createElement('div');
    this.hud.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:50;color:#304a43;font:14px/1.6 Georgia,"Microsoft YaHei",serif';
    this.hud.innerHTML='<button data-reset style="position:absolute;right:22px;top:22px;border:1px solid #a79976;border-radius:6px;background:#f6eddae8;color:#435d60;padding:8px 12px;pointer-events:auto;cursor:pointer">重试 / Reset</button><div data-hint style="position:absolute;bottom:4%;left:12%;right:12%;text-align:center;text-shadow:0 1px 4px #fff5de;background:#f6eddaaa;border-radius:8px;padding:5px"></div>';
    document.body.append(this.hud);this.hint=this.hud.querySelector('[data-hint]')!;
    this.hud.querySelector('[data-reset]')!.addEventListener('click',()=>this.scene.restart());
    this.input.on('pointerdown',this.down,this);this.input.on('pointermove',this.move,this);
    this.input.on('pointerup',this.up,this);this.input.on('pointerupoutside',this.up,this);
    const blur=()=>{this.dragging=false;};window.addEventListener('blur',blur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      this.hud.remove();this.scale.off(Phaser.Scale.Events.RESIZE,fit);window.removeEventListener('blur',blur);
      this.input.off('pointerdown',this.down,this);this.input.off('pointermove',this.move,this);
      this.input.off('pointerup',this.up,this);this.input.off('pointerupoutside',this.up,this);
      this.textures.remove(SURFACE);
    });
    this.renderLandscape();
  }
  private down(p:Phaser.Input.Pointer){
    const q=this.cameras.main.getWorldPoint(p.x,p.y);
    if(this.solved){
      if(!this.collected&&this.elapsed>=this.readyAt&&Math.hypot(q.x-MARK.x,q.y-MARK.y)<55){
        this.collected=true;this.cameras.main.fadeOut(500,235,239,216);
        this.time.delayedCall(500,()=>this.scene.start('chapter3-colors'));
      }
      return;
    }
    if(Math.hypot(q.x-this.corner.x,q.y-this.corner.y)<45){
      this.dragging=true;this.dragOffset={x:this.corner.x-q.x,y:this.corner.y-q.y};
    }
  }
  private move(p:Phaser.Input.Pointer){
    if(!this.dragging)return;
    const q=this.cameras.main.getWorldPoint(p.x,p.y);
    this.corner.x=Phaser.Math.Clamp(q.x+this.dragOffset.x,330,820);
    this.corner.y=Phaser.Math.Clamp(q.y+this.dragOffset.y,235,470);
  }
  private up(){
    if(!this.dragging)return;this.dragging=false;
    if(Math.hypot(this.corner.x-REST.x,this.corner.y-REST.y)<23){
      this.solved=true;this.readyAt=this.elapsed+.55;
      this.tweens.add({targets:this.corner,x:REST.x,y:REST.y,duration:450,ease:'Sine.Out'});
    }
  }
  private warp(p:Point){return warpLandscape(p,this.corner);}

  /** Affine triangles share vertices; a subpixel overlap covers rasterization seams.
   * This is continuous texture deformation, not image crossfading or moving clue overlays.
   */
  private renderLandscape(){
    if(this.lastX===this.corner.x&&this.lastY===this.corner.y)return;
    this.lastX=this.corner.x;this.lastY=this.corner.y;
    const ctx=this.surface.context, width=this.surface.width,height=this.surface.height;
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    const source:Point[]=[],dest:Point[]=[];
    for(let row=0;row<=ROWS;row++)for(let col=0;col<=COLS;col++){
      source.push({x:col/COLS*this.pictureWidth,y:row/ROWS*this.pictureHeight});
      const p=this.warp({x:col/COLS*W,y:row/ROWS*H});
      dest.push({x:p.x/W*width,y:p.y/H*height});
    }
    const triangle=(ia:number,ib:number,ic:number)=>{
      const a=source[ia],b=source[ib],c=source[ic],p=dest[ia],q=dest[ib],r=dest[ic];
      const bx=b.x-a.x,by=b.y-a.y,cx=c.x-a.x,cy=c.y-a.y,det=bx*cy-by*cx;
      const aa=((q.x-p.x)*cy-(r.x-p.x)*by)/det;
      const cc=((r.x-p.x)*bx-(q.x-p.x)*cx)/det;
      const bb=((q.y-p.y)*cy-(r.y-p.y)*by)/det;
      const dd=((r.y-p.y)*bx-(q.y-p.y)*cx)/det;
      const center={x:(p.x+q.x+r.x)/3,y:(p.y+q.y+r.y)/3};
      ctx.save();ctx.beginPath();
      [p,q,r].forEach((v,i)=>{
        const length=Math.hypot(v.x-center.x,v.y-center.y);
        const x=v.x+(v.x-center.x)/length*.65,y=v.y+(v.y-center.y)/length*.65;
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      });
      ctx.closePath();ctx.clip();
      ctx.setTransform(aa,bb,cc,dd,p.x-aa*a.x-cc*a.y,p.y-bb*a.x-dd*a.y);
      ctx.drawImage(this.picture,0,0);ctx.restore();
    };
    for(let row=0;row<ROWS;row++)for(let col=0;col<COLS;col++){
      const a=row*(COLS+1)+col,b=a+1,c=a+COLS+1,d=c+1;
      triangle(a,b,d);triangle(a,d,c);
    }
    this.surface.refresh();
  }
  update(_t:number,delta:number){
    this.elapsed+=Math.min(delta,50)/1000;if(!this.art)return;
    this.renderLandscape();
    const g=this.art,c=this.corner;g.clear();
    if(!this.solved){
      g.fillStyle(0xffe7a6,.12+.04*Math.sin(this.elapsed*2));g.fillCircle(c.x,c.y,23);
      g.lineStyle(2,0xb49255,.95);g.beginPath();
      for(let i=0;i<=60;i++){
        const t=i/60*Math.PI*2,x=c.x+13*Math.sin(t),y=c.y+9*Math.sin(t)*Math.cos(t);
        if(i===0)g.moveTo(x,y);else g.lineTo(x,y);
      }
      g.strokePath();
      g.lineBetween(c.x-2,c.y+3,c.x-7,c.y+26);
      g.lineBetween(c.x+3,c.y+3,c.x+9,c.y+22);
    }else if(!this.collected&&this.elapsed>=this.readyAt){
      const alpha=Math.min(1,(this.elapsed-this.readyAt)*3);
      g.fillStyle(0xffdc87,(.12+.04*Math.sin(this.elapsed*2))*alpha);g.fillCircle(MARK.x,MARK.y,42);
      g.lineStyle(4,0xb88d42,alpha);
      g.strokePoints([{x:MARK.x-20,y:MARK.y-20},{x:MARK.x+12,y:MARK.y-28},{x:MARK.x+26,y:MARK.y},{x:MARK.x+9,y:MARK.y+25},{x:MARK.x-24,y:MARK.y+16}],false);
      g.lineStyle(3,0xffefb6,alpha);
      g.strokePoints([{x:MARK.x-13,y:MARK.y+6},{x:MARK.x+1,y:MARK.y-12},{x:MARK.x+13,y:MARK.y+3},{x:MARK.x-3,y:MARK.y+16}],false);
    }
    const message=this.collected?'印记正在打开另一处画境……<br>The mark is opening another painted world…':this.solved?'景物之间出现了印记，触碰它继续。<br>Touch the mark to continue.':this.dragging?'让树枝、岩壁与溪岸的弧度相接。<br>Bring the branch, rock and riverbank into alignment.':'拉动风中的金色线结，观察景物之间的形状。<br>Pull the golden knot and watch the shapes between the landscape.';
    if(message!==this.hintValue){this.hint.innerHTML=message;this.hintValue=message;}
  }
}
