import Phaser from 'phaser';
import backgroundUrl from '../../art/chapter3/painting-world/phase1/valley-flat-ground.webp?url';
import atlasUrl from '../../art/chapter3/painting-world/phase1/valley-flat-scenery.webp?url';
import { alignedPoint, projectPoint, projectGround, isAligned, seamPoints, CROP, REST, START, PAINTING_MARK as MARK, PAINTING_WIDTH as W, PAINTING_HEIGHT as H, type Point } from '../gameplay/paintingPerspective';

const BG='painting-valley-underpaint-v3',ATLAS='painting-valley-patches-v3',SURFACE='painting-valley-projection-v3';
const COLS=24,ROWS=20;
type Patch={image:HTMLCanvasElement;source:Point[];base:Point[]};
export default class ChapterThreePaintingScene extends Phaser.Scene {
  private handle:Point={...START};
  private active=-1; private pointerId=-1; private offset:Point={x:0,y:0};
  private solved=false; private collected=false; private elapsed=0; private readyAt=Infinity;
  private art!:Phaser.GameObjects.Graphics;
  private surface!:Phaser.GameObjects.Mesh;
  private meshes:Phaser.GameObjects.Mesh[]=[];
  private indices:number[]=[];
  private patches:Patch[]=[];
  private lastState=''; private hud!:HTMLDivElement; private hint!:HTMLElement;
  private hintValue='';
  constructor(){super('chapter3-painting');}
  preload(){
    if(!this.textures.exists(BG))this.load.image(BG,backgroundUrl);
    if(!this.textures.exists(ATLAS))this.load.image(ATLAS,atlasUrl);
  }
  create(){
    this.handle={...START};this.active=-1;this.pointerId=-1;
    this.solved=this.collected=false;this.elapsed=0;this.readyAt=Infinity;this.lastState='';this.hintValue='';
    this.cameras.main.resetFX();this.cameras.main.setBackgroundColor('#d9d6c3');
    const fit=()=>{const {width,height}=this.scale.gameSize;this.cameras.main.setSize(width,height).setZoom(Math.min(width/W,height/H)).centerOn(W/2,H/2);};
    fit();this.scale.on(Phaser.Scale.Events.RESIZE,fit);
    this.add.image(W/2,H/2,BG).setDisplaySize(W,H);
    this.preparePatches();this.prepareMeshes();this.art=this.add.graphics().setDepth(10);
    this.hud=document.createElement('div');
    this.hud.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:50;color:#304a43;font:14px/1.6 Georgia,"Microsoft YaHei",serif';
    this.hud.innerHTML='<button data-reset style="position:absolute;right:22px;top:22px;border:1px solid #a79976;border-radius:6px;background:#f6eddae8;color:#435d60;padding:8px 12px;pointer-events:auto;cursor:pointer">重试 / Reset</button><div data-hint style="position:absolute;bottom:2%;left:12%;right:12%;text-align:center;text-shadow:0 1px 4px #fff5de;background:#f6eddaaa;border-radius:8px;padding:5px"></div>';
    document.body.append(this.hud);this.hint=this.hud.querySelector('[data-hint]')!;
    this.hud.querySelector('[data-reset]')!.addEventListener('click',()=>this.scene.restart());
    this.input.on('pointerdown',this.down,this);this.input.on('pointermove',this.move,this);
    this.input.on('pointerup',this.up,this);this.input.on('pointerupoutside',this.cancel,this);
    const blur=()=>this.cancel();window.addEventListener('blur',blur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      this.hud.remove();this.scale.off(Phaser.Scale.Events.RESIZE,fit);window.removeEventListener('blur',blur);
      this.input.off('pointerdown',this.down,this);this.input.off('pointermove',this.move,this);
      this.input.off('pointerup',this.up,this);this.input.off('pointerupoutside',this.cancel,this);
      this.meshes.forEach(m=>m.destroy());this.meshes=[];
      for(let i=0;i<4;i++)this.textures.remove(SURFACE+i);this.patches=[];
    });
    this.renderLandscape();
  }
  private preparePatches(){
    const atlas=this.textures.get(ATLAS).getSourceImage() as HTMLImageElement;
    this.patches=CROP.map((crop,i)=>{
      // Runtime atlas extraction; underlying approved art is preserved intact.
      const image=document.createElement('canvas');image.width=2172;image.height=724;
      const ctx=image.getContext('2d')!;ctx.save();ctx.beginPath();
      const bounds=i===0?[[0,0],[800,0],[800,400],[730,400],[730,724],[0,724]]:
        i===1?[[820,140],[1460,140],[1460,724],[790,724],[790,430],[820,430]]:
        [[1460,445],[2172,445],[2172,724],[1460,724]];
      bounds.forEach(([x,y],j)=>j?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();
      ctx.drawImage(atlas,0,0,2172,724);ctx.restore();
      const fade=ctx.createLinearGradient(0,660,0,724);fade.addColorStop(0,'#fff');fade.addColorStop(1,'transparent');
      ctx.globalCompositeOperation='destination-in';ctx.fillStyle=fade;ctx.fillRect(0,0,2172,724);
      const source:Point[]=[],base:Point[]=[];
      for(let y=0;y<=ROWS;y++)for(let x=0;x<=COLS;x++){
        const p={x:crop.x+crop.w*x/COLS,y:crop.y+crop.h*y/ROWS};source.push(p);base.push(alignedPoint(p,i));
      }
      return {image,source,base};
    });
    const image=document.createElement('canvas');image.width=1586;image.height=992;
    image.getContext('2d')!.drawImage(this.textures.get(BG).getSourceImage() as HTMLImageElement,0,0,1586,992);
    const source:Point[]=[],base:Point[]=[];
    for(let y=0;y<=ROWS;y++)for(let x=0;x<=COLS;x++){
      source.push({x:x/COLS*1586,y:y/ROWS*992});base.push({x:x/COLS*W,y:y/ROWS*H});
    }
    this.patches.push({image,source,base});

  }
  private down(p:Phaser.Input.Pointer){
    const q=this.cameras.main.getWorldPoint(p.x,p.y);
    if(this.solved){
      if(!this.collected&&this.elapsed>=this.readyAt&&Math.hypot(q.x-MARK.x,q.y-MARK.y)<55){
        this.collected=true;this.cameras.main.fadeOut(500,235,239,216);
        this.time.delayedCall(500,()=>this.scene.start('chapter3-colors'));
      }return;
    }
    if(this.active!==-1)return;
    if(Math.hypot(q.x-this.handle.x,q.y-this.handle.y)>=43)return;
    this.active=0;this.pointerId=p.id;
    this.offset={x:this.handle.x-q.x,y:this.handle.y-q.y};
  }
  private move(p:Phaser.Input.Pointer){
    if(this.active<0||p.id!==this.pointerId)return;
    const q=this.cameras.main.getWorldPoint(p.x,p.y);
    this.handle.x=Phaser.Math.Clamp(q.x+this.offset.x,300,850);
    this.handle.y=Phaser.Math.Clamp(q.y+this.offset.y,215,485);
  }
  private cancel(){this.active=-1;this.pointerId=-1;}
  private up(p:Phaser.Input.Pointer){
    if(this.active<0||p.id!==this.pointerId)return;this.cancel();
    if(isAligned(this.handle)){
      this.solved=true;this.readyAt=this.elapsed+.7;
      this.tweens.add({targets:this.handle,x:REST.x,y:REST.y,duration:550,ease:'Sine.Out'});
    }
  }
  private prepareMeshes(){
    this.indices=[];this.meshes=[];
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
      const a=y*(COLS+1)+x,b=a+1,c=a+COLS+1,d=c+1;this.indices.push(a,b,d,a,d,c);
    }
    for(const i of [3,1,2,0]){
      const patch=this.patches[i],vertices:number[]=[],uvs:number[]=[];
      patch.base.forEach(p=>vertices.push(p.x,-p.y));
      patch.source.forEach(p=>uvs.push(p.x/patch.image.width,p.y/patch.image.height));
      this.textures.addCanvas(SURFACE+i,patch.image);
      const mesh=this.add.mesh(0,0,SURFACE+i);
      mesh.setSize(W,H);mesh.setOrtho(W,H);mesh.hideCCW=false;
      mesh.addVertices(vertices,uvs,this.indices);
      mesh.setDepth(i===3?0:i===1?1:i===2?2:3);
      this.meshes[i]=mesh;
    }
    this.surface=this.meshes[3];
  }
  private renderLandscape(){
    const state=JSON.stringify(this.handle);if(state===this.lastState)return;this.lastState=state;
    // Shared GPU triangle edges avoid Canvas clip antialias seams and alpha overlap.
    for(let i=0;i<4;i++){
      const dest=this.patches[i].base.map(p=>i===3?projectGround(p,this.handle):projectPoint(p,i,this.handle));
      const mesh=this.meshes[i];
      mesh.vertices.forEach((v,j)=>{const q=dest[this.indices[j]];v.x=q.x;v.y=-q.y;});
      mesh.setOrtho(W,H);
    }
  }
  update(_t:number,delta:number){
    this.elapsed+=delta/1000;if(!this.art)return;this.renderLandscape();
    const g=this.art;g.clear();
    if(!this.solved){
      [this.handle].forEach((c,i)=>{
        g.fillStyle(0xffe7a6,i===this.active?.25:.12);g.fillCircle(c.x,c.y,24);
        g.lineStyle(i===this.active?3:2,0xb49255,.95);g.beginPath();
        for(let n=0;n<=60;n++){const t=n/60*Math.PI*2,x=c.x+13*Math.sin(t),y=c.y+9*Math.sin(t)*Math.cos(t);if(n===0)g.moveTo(x,y);else g.lineTo(x,y);}g.strokePath();
        g.lineBetween(c.x-2,c.y+3,c.x-7,c.y+26);g.lineBetween(c.x+3,c.y+3,c.x+9,c.y+22);
      });
      // A tiny glint at an actual near-contact offers feedback without revealing a ring.
      if(this.active>=0)for(const [a,b] of seamPoints(this.handle))if(Math.hypot(a.x-b.x,a.y-b.y)<18){
        g.fillStyle(0xffe5a2,.7);g.fillCircle((a.x+b.x)/2,(a.y+b.y)/2,3);
      }
    }else if(!this.collected&&this.elapsed>=this.readyAt){
      const alpha=Math.min(1,(this.elapsed-this.readyAt)*3);
      g.fillStyle(0xffdc87,.14*alpha);g.fillCircle(MARK.x,MARK.y,42);g.lineStyle(4,0xb88d42,alpha);
      g.strokePoints([{x:MARK.x-20,y:MARK.y-20},{x:MARK.x+12,y:MARK.y-28},{x:MARK.x+26,y:MARK.y},{x:MARK.x+9,y:MARK.y+25},{x:MARK.x-24,y:MARK.y+16}],false);
      g.lineStyle(3,0xffefb6,alpha);g.strokePoints([{x:MARK.x-13,y:MARK.y+6},{x:MARK.x+1,y:MARK.y-12},{x:MARK.x+13,y:MARK.y+3},{x:MARK.x-3,y:MARK.y+16}],false);
    }
    const message=this.collected?'印记正在打开另一处画境……<br>The mark opens another painted world…':this.solved?'触碰印记，继续前行。<br>Touch the mark to continue.':this.active>=0?'挪动视点，让远近景物在眼前相接。<br>Move the viewpoint. Let the distant edges meet.':'拉动风中的线结，山谷会随你的视线改变。<br>Pull the knot. The valley shifts with your viewpoint.';
    if(message!==this.hintValue){this.hint.innerHTML=message;this.hintValue=message;}
  }
}
