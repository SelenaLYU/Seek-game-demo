import Phaser from 'phaser';
import { PIGMENTS, newPaintingLife, pigmentAvailable, lifeMilestones, applyPigment, hasPigment, connectRoot, type Pigment, type LifeTarget } from '../gameplay/paintingLife';

type Point={x:number;y:number};
type Hotspot=Point&{id:string;rx:number;ry:number;name:string};
const CLOUD={x:960,y:142},ROOT={x:330,y:407};
const SOURCES:Record<Pigment,{id:string;name:string}>={blue:{id:'sky',name:'蓝云 / Blue cloud'},orange:{id:'sun',name:'落日 / Sunset'},green:{id:'leaves',name:'绿叶 / Green leaves'},purple:{id:'flowers',name:'紫花 / Violet flowers'}};
const INK:Record<Pigment,number>={blue:0x6cbbd3,orange:0xf3b575,green:0x8dbb8f,purple:0xb398d0};
const INTRO_LINES=[
  ['这是一个失去色彩的世界。','This is a world that has lost its colours.'],
  ['不同的颜色，拥有不同的能力。','Each colour holds a different power.'],
  ['借来画中的颜色，点亮这个世界。','Borrow the colours within the painting. Bring this world to life.']
];
const INTRO_LINE_SECONDS=3.4;
const LABELS:Record<string,string>={
  sky:'蓝云 · 借蓝色 / Blue cloud · Borrow',sun:'落日 · 借橙色 / Sunset · Borrow',cloud:'等待雨水的云 / Waiting rain cloud',whale:'沉睡的鲸鱼 / Sleeping whale',
  roots:'根结 / Root knot',garden:'倒悬花园 / Hanging garden',lake:'湖泊 / Lake',leaves:'绿叶 · 借绿色 / Leaves · Borrow',flowers:'紫花 · 借紫色 / Flowers · Borrow violet',
  reflectionTree:'树影 / Tree',reflectionDoor:'门影 / Door',reflectionFlower:'花影 / Flower',
  blueSocket:'轻盈 / Lift',orangeSocket:'苏醒 / Wake',greenSocket:'连接 / Connect',purpleSocket:'梦境 / Dream',seal:'印记 / Mark'
};

/** Borrow colour from the scenery without draining the source or previous targets. */
export default class ChapterThreeColorScene extends Phaser.Scene {
  private state=newPaintingLife();
  private selected:Pigment|null=null;
  private linking=false;
  private borrowing:{from:Point;color:Pigment;until:number}|null=null;
  private feedback: {x:number;y:number;until:number}|null=null;
  private elapsed=0;private whaleLift=0;private gardenGrowth=0;private life=0;
  private art!:Phaser.GameObjects.Graphics;private hud!:HTMLDivElement;
  private message='点画里的落日或蓝云借色，再点需要颜色的地方。原来的颜色会留下。\nBorrow from the sunset or blue cloud, then touch a destination. The source keeps its colour.';
  private hotspots:Hotspot[]=[];
  private introElapsed=0;private introActive=true;private introLine=-1;private intro!:HTMLDivElement;
  private hintUntil=0;
  private pointer:Point={x:640,y:350};private lastHud='';private completionSeen=false;
  constructor(){super('chapter3-colors');}
  create(){
    this.state=newPaintingLife();this.selected=null;this.linking=false;this.borrowing=null;
    this.elapsed=this.whaleLift=this.gardenGrowth=this.life=0;this.lastHud='';this.completionSeen=false;
    this.feedback=null;this.introElapsed=0;this.introActive=true;this.introLine=-1;this.hintUntil=0;
    this.message='点画里的落日或蓝云借色，再点需要颜色的地方。原来的颜色会留下。\nBorrow from the sunset or blue cloud, then touch a destination. The source keeps its colour.';
    this.cameras.main.resetFX();this.cameras.main.setBackgroundColor('#e6e6db');
    const fit=()=>{const {width,height}=this.scale.gameSize;this.cameras.main.setSize(width,height).setZoom(Math.min(width/1280,height/800)).centerOn(640,400);};
    fit();this.scale.on(Phaser.Scale.Events.RESIZE,fit);this.cameras.main.fadeIn(650,235,239,216);
    this.art=this.add.graphics();
    this.createHud();
    this.input.on('pointerdown',this.down,this);this.input.on('pointermove',this.move,this);
    const escape=()=>{this.selected=null;this.linking=false;this.borrowing=null;};
    this.input.keyboard?.on('keydown-ESC',escape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      this.hud.remove();this.scale.off(Phaser.Scale.Events.RESIZE,fit);
      this.input.off('pointerdown',this.down,this);this.input.off('pointermove',this.move,this);
      this.input.keyboard?.off('keydown-ESC',escape);this.input.setDefaultCursor('default');
    });
  }
  private createHud(){
    this.hud=document.createElement('div');this.hud.dataset.colorPuzzle='true';
    this.hud.style.cssText='position:fixed;inset:0;z-index:50;pointer-events:none;color:#435860;font:13px/1.5 Arial,"Microsoft YaHei",sans-serif';
    this.hud.innerHTML='<div data-controls hidden style="position:absolute;right:3%;top:3%;gap:6px;pointer-events:auto"><button data-help>提示 / Hint</button><button data-back>返回 / Back</button><button data-reset>重试 / Reset</button></div><div data-hint hidden style="position:absolute;bottom:5%;left:8%;right:8%;text-align:center;white-space:pre-line;text-shadow:0 1px 4px #fff8e8"></div><div data-feedback aria-live="polite" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap"></div>';
    this.hud.querySelectorAll('button').forEach(b=>b.style.cssText='border:1px solid #b2b8a9;background:#f7f3e6ed;color:#435860;padding:8px 12px;border-radius:8px;cursor:pointer;min-height:40px;touch-action:manipulation');
    this.hud.querySelector('[data-reset]')!.addEventListener('click',()=>this.scene.restart());
    this.hud.querySelector('[data-back]')!.addEventListener('click',()=>this.scene.start('chapter3-painting'));
    this.hud.querySelector('[data-help]')!.addEventListener('click',()=>{
      if(this.introActive)return;
      this.hud.querySelector('[data-hint]')!.textContent=this.nextHint();this.hintUntil=this.elapsed+8;
    });
    this.intro=document.createElement('div');this.intro.dataset.colorIntro='true';
    this.intro.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;pointer-events:auto;background:rgba(237,239,225,.76);color:#41595c';
    this.intro.innerHTML='<div data-intro-line role="status" aria-live="polite" style="opacity:0;padding:24px;max-width:850px"><div data-intro-zh style="font:clamp(22px,2.5vw,36px)/1.8 Georgia,\'Microsoft YaHei\',serif;letter-spacing:.12em"></div><div data-intro-en lang="en" style="font:clamp(13px,1.25vw,18px)/1.8 Georgia,serif;letter-spacing:.035em;margin-top:18px;opacity:.8"></div></div>';
    this.hud.append(this.intro);
    document.body.append(this.hud);
  }
  private updateIntro(deltaSeconds:number){
    if(!this.introActive)return;
    this.introElapsed+=deltaSeconds;
    const index=Math.floor(this.introElapsed/INTRO_LINE_SECONDS);
    if(index>=INTRO_LINES.length){
      this.introActive=false;this.intro.remove();
      const controls=this.hud.querySelector<HTMLElement>('[data-controls]')!;
      controls.hidden=false;controls.style.display='flex';return;
    }
    if(index!==this.introLine){
      this.introLine=index;
      this.intro.querySelector('[data-intro-zh]')!.textContent=INTRO_LINES[index][0];
      this.intro.querySelector('[data-intro-en]')!.textContent=INTRO_LINES[index][1];
    }
    const phase=this.introElapsed%INTRO_LINE_SECONDS;
    const opacity=phase<.65?phase/.65:phase<2.55?1:Math.max(0,(3.2-phase)/.65);
    this.intro.querySelector<HTMLElement>('[data-intro-line]')!.style.opacity=String(opacity);
    if(index===INTRO_LINES.length-1)this.intro.style.background='rgba(237,239,225,'+(.76*Math.min(1,Math.max(0,(3.4-phase)/.85)))+')';
  }
  private choose(c:Pigment){
    if(this.introActive||this.state.complete)return;
    if(!pigmentAvailable(this.state,c)){
      this.message=c==='green'?'绿叶藏在岛后，先唤醒鲸鱼，让它托起岛屿。\nThe leaves are hidden behind the island. Wake the whale and let it lift the islands.':'种子还没有开花。给它雨水和落日的温暖，再从紫花借色。\nThe seeds have not bloomed. Give them rain and sunset warmth, then borrow violet from the flowers.';return;
    }
    this.selected=c;this.linking=false;
    const source=this.hotspots.find(h=>h.id===SOURCES[c].id);
    if(source)this.borrowing={from:{x:source.x,y:source.y},color:c,until:this.elapsed+.8};
    this.message='从'+SOURCES[c].name+'借到了一抹颜色，原物体不会褪色。\nBorrowed '+c+' from the scenery. The original keeps its colour.';
  }
  private nextHint(){
    const s=this.state;
    if(!s.awake)return '山里那只眼睛，似乎在等一丝温暖。\nThe eye inside the mountain is waiting for warmth.';
    if(!s.greenFound)return '蓝色让云漂浮。它能让醒来的鲸鱼浮起来吗？\nBlue keeps clouds afloat. Could it lift an awakened whale?';
    if(!hasPigment(s,'green','roots')&&(!s.links.garden||!s.links.lake))return '点击左侧绿叶借色，再点根结，让根延伸。\nBorrow from the green leaves, then touch the root knot.';
    if(!s.links.garden||!s.links.lake)return '拿绿色直接点花园和湖泊，或点根结后连续点这两处。\nUse green on the garden and lake, or click the root knot then both places.';
    if(!s.watered)return '从蓝云借一点蓝色，给右上方的白云，它就会下雨。\nBorrow blue from the blue cloud for the white cloud at the upper right. It will rain.';
    if(!s.grown)return '选橙色，再点中间岛上发亮的三颗种子。\nChoose orange, then click the three glowing seeds on the middle island.';
    if(!s.treeReal)return '种子开出了紫花。点击花瓣借色，再点湖里的树影，让颜色沿根生长。\nBorrow violet from the new flowers, then touch the reflected tree to grow colour along the roots.';
    if(!s.doorReal)return '树枝能托住门了。再从紫花借色，点湖里的门影。\nThe branches can hold the door now. Borrow violet from the flowers again for the reflected door.';
    if(!s.complete)return '把四种颜色分别送入轮环上的同色缺口。\nPlace all four colours in the matching sockets of the ring.';
    return '停下来看看，你唤醒的世界还在自己生长。\nPause and watch. The world you awakened keeps growing.';
  }
  private down(p:Phaser.Input.Pointer){
    if(this.introActive)return;
    this.hintUntil=0;
    const q=this.cameras.main.getWorldPoint(p.x,p.y);this.pointer=q;
    const h=this.hitAt(q);
    if(!h){
      this.selected=null;this.linking=false;this.borrowing=null;
      this.message='点击空白处取消借色，画里的颜色都会保留。\nTouching empty space cancels borrowing. All painted colours remain.';
      return;
    }
    this.feedback={x:q.x,y:q.y,until:this.elapsed+.55};
    if(h.id==='seal'){
      this.completionSeen=true;this.message='印记已点亮。这个世界会继续生长。\nThe mark is awake. This world will keep growing.';return;
    }
    const source=PIGMENTS.find(c=>SOURCES[c].id===h.id);
    if(source){this.choose(source);return;}
    if(this.linking){
      if(h.id==='garden')this.message=connectRoot(this.state,'garden');
      else if(h.id==='lake'||h.id.startsWith('reflection'))this.message=connectRoot(this.state,'lake');
      else if(h.id==='roots'){this.message='直接点花园和湖泊，连续接好两条根。\nClick the garden and lake to connect both roots.';return;}
      else this.message='根可以接向花园和湖泊。\nRoots can reach the garden and lake.';
      this.linking=!(this.state.links.garden&&this.state.links.lake);return;
    }
    if(this.selected){
      if(this.selected==='green'&&(h.id==='garden'||h.id==='lake'||h.id.startsWith('reflection'))){
        if(!hasPigment(this.state,'green','roots'))applyPigment(this.state,'green','roots');
        this.message=connectRoot(this.state,h.id==='garden'?'garden':'lake');
        this.linking=!(this.state.links.garden&&this.state.links.lake);this.selected=null;return;
      }
      if(h.id==='lake'){this.message='湖中有树、门和花的倒影，选一个试试。\nChoose the reflected tree, door or flower in the lake.';return;}
      const c=this.selected;
      this.message=applyPigment(this.state,c,h.id as LifeTarget);
      if(hasPigment(this.state,c,h.id as LifeTarget)){
        this.selected=null;
        this.linking=c==='green'&&h.id==='roots'&&!(this.state.links.garden&&this.state.links.lake);
      }
      return;
    }
    if(h.id==='roots'&&hasPigment(this.state,'green','roots')){
      this.linking=true;this.message='再点花园或湖泊，让根延伸过去。\nNow click the garden or lake to extend the roots.';return;
    }
    if(h.id==='garden'&&this.state.grown){this.choose('purple');return;}
    this.message=this.inspect(h.id);
  }
  private inspect(id:string){
    const texts:Record<string,string>={
      whale:'山里传来缓慢的呼吸。\nA slow breath comes from inside the mountain.',
      roots:'绿色会让孤立的生命相连。\nGreen joins living things together.',
      garden:this.state.watered?'这三颗种子已经喝到水了，把橙色放在这里。\nThese three seeds have water. Place orange here.':'中间岛上的种子，需要水和温暖才能开出倒悬的花。\nThe seeds on the middle island need water and warmth to bloom downward.',
      cloud:this.state.rainStarted?'蓝色留在了云上，它会继续送来雨水。\nThe cloud keeps its borrowed blue and continues to bring rain.':'从左边蓝云借一点蓝色，让这朵白云下雨。\nBorrow blue from the cloud on the left to make this white cloud rain.',
      lake:'水里有一座不属于天空的森林。\nA forest in the water is missing from the sky.',
      reflectionTree:'倒影里树根朝上，仿佛能托住什么。\nThe reflected roots reach upward, as if waiting to hold something.',
      reflectionDoor:'水里的门没有落脚的地方。\nThe door in the water has nowhere to stand.',
      reflectionFlower:'倒影里的花，比真实的花更完整。\nThe reflected flower is more complete than the real one.'
    };return texts[id]??'这里留下了一处颜色的空缺。\nA colour is missing here.';
  }
  private move(p:Phaser.Input.Pointer){
    this.pointer=this.cameras.main.getWorldPoint(p.x,p.y);
  }
  private hitAt(q:Point):Hotspot|undefined{
    // Only painted objects are interactive; there are no invisible label targets.
    const ringControl=this.hotspots.find(h=>(h.id.endsWith('Socket')||h.id==='seal')&&Math.hypot(q.x-h.x,q.y-h.y)<=27);
    if(ringControl)return ringControl;
    const matches=this.hotspots.filter(h=>Math.abs(q.x-h.x)<=h.rx+16&&Math.abs(q.y-h.y)<=h.ry+16);
    if(this.linking||this.selected==='green'){
      const destination=matches.filter(h=>h.id==='garden'||h.id==='lake').sort((a,b)=>Math.hypot(q.x-a.x,q.y-a.y)-Math.hypot(q.x-b.x,q.y-b.y))[0];
      if(destination)return destination;
    }
    // Prefer small foreground objects over the lake which contains them.
    return matches.sort((a,b)=>{
      const rank=(h:Hotspot)=>Math.hypot(q.x-h.x,q.y-h.y)+(h.id==='lake'?100:0);
      return rank(a)-rank(b);
    })[0];
  }
  private poly(points:Point[],color:number,alpha=1){this.art.fillStyle(color,alpha);this.art.fillPoints(points,true);}
  private stroke(points:Point[],color:number,width=2,alpha=1){this.art.lineStyle(width,color,alpha);this.art.strokePoints(points,false);}
  private ellipse(x:number,y:number,w:number,h:number,color:number,alpha=1){this.art.fillStyle(color,alpha);this.art.fillEllipse(x,y,w,h,128);}
  private colour(live:number,grey=0xb9beb4){return Phaser.Display.Color.GetColor(
    Phaser.Math.Linear((grey>>16)&255,(live>>16)&255,this.life),
    Phaser.Math.Linear((grey>>8)&255,(live>>8)&255,this.life),
    Phaser.Math.Linear(grey&255,live&255,this.life));}
  private hotspot(id:string,x:number,y:number,rx:number,ry:number){
    this.hotspots.push({id,x,y,rx,ry,name:LABELS[id]??id});
  }
  private island(x:number,y:number,w:number){
    const depth=Math.min(125,w*.36);
    this.poly([{x:x-w/2,y},{x:x+w/2,y},{x:x+w*.34,y:y+depth*.56},{x:x+w*.08,y:y+depth},{x:x-w*.2,y:y+depth*.87},{x:x-w*.4,y:y+depth*.45}],this.colour(0x7898a3,0x959f9b));
    this.ellipse(x,y,w,52,this.colour(0xb5c6a0,0xc9cabb));
    for(let i=0;i<4;i++)this.stroke([{x:x-w*.3+i*w*.16,y:y+25},{x:x-w*.26+i*w*.14,y:y+depth*.65}],this.colour(0xbac7b8),3,.4);
  }
  private tree(x:number,y:number,size:number,live=true){
    this.stroke([{x,y},{x:x+8*size,y:y-38*size},{x:x-6*size,y:y-70*size}],live?this.colour(0x809d8c):0xa6aca4,7*size);
    for(let i=0;i<3;i++)this.ellipse(x+(i-1)*19*size,y-(68+i%2*17)*size,58*size,40*size,live?this.colour(i%2?0xd0c2ca:0xa9c5af):0xc1c4ba,.9);
  }
  update(_time:number,delta:number){
    if(!this.art)return;const dt=Math.min(delta/1000,.04);this.elapsed+=dt;
    this.updateIntro(delta/1000);
    const s=this.state;
    this.whaleLift=Phaser.Math.Linear(this.whaleLift,s.lifted?1:0,Math.min(1,dt*2));
    this.gardenGrowth=Phaser.Math.Linear(this.gardenGrowth,s.grown?1:0,Math.min(1,dt*2));
    this.life=Phaser.Math.Linear(this.life,lifeMilestones(s)/8,Math.min(1,dt));
    this.hotspots=[];this.drawWorld();
    const key=JSON.stringify([s,this.selected,this.message,this.linking]);
    if(key!==this.lastHud){
      this.lastHud=key;this.hud.querySelector('[data-feedback]')!.textContent=this.introActive?'':this.message;
    }
    this.hud.querySelector<HTMLElement>('[data-hint]')!.hidden=this.introActive||this.elapsed>=this.hintUntil;
    const hovered=this.introActive?undefined:this.hitAt(this.pointer);
    if(hovered){
      const c=this.selected?INK[this.selected]:0xd2ad67;
      this.art.lineStyle(2,c,.8);this.art.strokeEllipse(hovered.x,hovered.y,Math.min(hovered.rx*2,190),Math.min(hovered.ry*2,95));
    }
    if(this.feedback&&this.feedback.until>this.elapsed){
      this.art.lineStyle(2,0xb6955b,(this.feedback.until-this.elapsed)/.55);
      this.art.strokeCircle(this.feedback.x,this.feedback.y,10+(1-(this.feedback.until-this.elapsed)/.55)*20);
    }
    if(this.borrowing&&this.borrowing.until>this.elapsed&&this.selected){
      const f=1-(this.borrowing.until-this.elapsed)/.8,a=this.borrowing.from;
      this.ellipse(a.x+(this.pointer.x-a.x)*f,a.y+(this.pointer.y-a.y)*f-Math.sin(f*Math.PI)*28,12,12,INK[this.borrowing.color]);
    }
    this.input.setDefaultCursor(hovered||this.selected?'pointer':'default');
  }
  private landscapeOffset(){return -this.whaleLift*18+(this.state.awake?Math.sin(this.elapsed*.9)*2:0);}
  private drawWorld(){
    const g=this.art,s=this.state,t=this.elapsed;g.clear();
    g.fillStyle(this.colour(0xd1e9e3,0xe6e6db));g.fillRect(-1500,-1000,4300,3000);
    this.ellipse(600,170,1350,340,0xf6e7c9,.3);
    for(let i=0;i<42;i++){const x=i*157%1380-50,y=130+i*79%430;this.stroke([{x,y},{x:x+55,y:y-6}],i%2?0xffffff:0x91b3b2,2,.12);}
    this.ellipse(200,145,90,90,INK.orange);this.hotspot('sun',200,145,52,50);
    const cloudY=131,cloudX=415;
    this.ellipse(cloudX,cloudY,180,43,INK.blue,.9);this.ellipse(cloudX-25,cloudY-15,80,55,INK.blue,.9);
    this.hotspot('sky',cloudX,cloudY,96,40);
    this.ellipse(CLOUD.x,CLOUD.y,230,63,s.rainStarted?INK.blue:0xf7f2e4,.9);this.ellipse(CLOUD.x-35,CLOUD.y-20,95,61,s.rainStarted?INK.blue:0xf7f2e4,.9);
    this.hotspot('cloud',CLOUD.x,CLOUD.y,120,48);
    // The whale is the foundation. All three islands sit on its back, with sky
    // between their silhouettes. Lifting moves the whole supported world together.
    const drift=this.landscapeOffset();
    const firstLandHotspot=this.hotspots.length;
    g.save();g.translateCanvas(0,drift);
    const wx=660,wy=537;
    const whaleColor=s.lifted?0x86b3c5:s.awake?0xd0b18e:0xa9b3af;
    this.poly([{x:300,y:515},{x:175,y:487},{x:98,y:441+Math.sin(t)*6},{x:119,y:514},{x:71,y:561},{x:171,y:548},{x:288,y:573}],whaleColor);
    this.ellipse(wx,wy,965,218,whaleColor);
    this.ellipse(wx+87,wy+53,692,99,0xe2e3cd,.55);
    if(s.awake)this.ellipse(1022,539,35,18,INK.orange,.85);
    this.poly([{x:602,y:574},{x:646,y:651+Math.sin(t)*7},{x:740,y:600},{x:705,y:565}],this.colour(0x729eae,0x97a6a3));
    this.stroke([{x:1040,y:558},{x:1100,y:548}],0x506d76,4);
    if(s.awake)this.ellipse(1051,511,16,19,0x395b69);else this.stroke([{x:1039,y:514},{x:1050,y:519},{x:1065,y:513}],0x607976,4);
    for(let i=0;i<4;i++)this.stroke([{x:852+i*23,y:572},{x:841+i*23,y:607}],0x92aaa9,2,.7);
    this.hotspot('whale',660,560,487,86);
    this.hotspots.push({id:'whale',name:LABELS.whale,x:154,y:509,rx:82,ry:59});
    this.island(325,398,260);
    this.island(638,337,284);
    this.island(973,389,325);
    this.tree(260,379,.65,s.awake);
    if(s.greenFound){
      this.ellipse(256,326,77,41,INK.green);this.ellipse(241,307,41,30,INK.green);
      this.hotspot('leaves',252,321,45,31);
      this.ellipse(ROOT.x,ROOT.y,84,47,hasPigment(s,'green','roots')?INK.green:0xc2ccad);
      for(let i=0;i<4;i++)this.stroke([{x:ROOT.x,y:ROOT.y},{x:ROOT.x-40+i*23,y:ROOT.y+22},{x:ROOT.x-51+i*29,y:ROOT.y+43}],0x779b83,4);
      this.hotspot('roots',ROOT.x,ROOT.y,59,42);
    }
    this.hotspot('garden',638,345,133,70);
    const needsWarmth=s.watered&&!s.grown;
    this.ellipse(638,341,126,33,s.watered?0x83adb5:0x939d8e,.8);
    for(let i=0;i<3;i++){
      const x=600+i*38,y=337+(i===1?-5:3);
      this.ellipse(x,y,21,29,hasPigment(s,'orange','garden')?INK.orange:s.watered?0xc3a06a:0xc3b894);
      this.stroke([{x:x-3,y:y+6},{x:x+3,y:y-6}],0x816d4f,2);
      if(needsWarmth){g.lineStyle(3,0xd99643,.65+Math.sin(t*3)*.25);g.strokeEllipse(x,y,30,38);}
    }
    if(needsWarmth){
      this.stroke([{x:638,y:308},{x:638,y:314},{x:633,y:309},{x:638,y:314},{x:643,y:309}],0xc48435,3);
    }
    const connect=(end:Point,active:boolean)=>{
      if(!active)return;
      const pts:Point[]=[];for(let i=0;i<=30;i++){const f=i/30;pts.push({x:ROOT.x+(end.x-ROOT.x)*f,y:ROOT.y+(end.y-ROOT.y)*f+Math.sin(f*Math.PI)*36});}
      this.stroke(pts,0x7b9c86,8);this.stroke(pts,0xd5e2bc,2);
      if(hasPigment(s,'green','roots')){const f=(t*.22)%1;this.ellipse(ROOT.x+(end.x-ROOT.x)*f,ROOT.y+(end.y-ROOT.y)*f+Math.sin(f*Math.PI)*36,11,11,s.watered?0xb5e4dd:0xd8df9e);}
    };
    connect({x:586,y:370},s.links.garden);connect({x:901,y:414},s.links.lake);
    if(this.linking)this.stroke([ROOT,{x:this.pointer.x,y:this.pointer.y-drift}],INK.green,3,.65);
    // Seeds sprout before the petals open. Violet has a visible, lasting source.
    for(let i=0;i<5;i++){
      const x=531+i*52,y=363,len=26+this.gardenGrowth*(42+i%2*16);
      this.stroke([{x,y},{x:x+Math.sin(t+i)*3,y:y+len}],s.grown?0x8ca978:0xa5aaa0,3);
      if(this.gardenGrowth>.05){
        this.ellipse(x-7,y+len*.45,20*this.gardenGrowth,9,INK.green);
        const bloom=Phaser.Math.Clamp((this.gardenGrowth-.25)/.75,0,1);
        for(let petal=0;petal<5;petal++){
          const a=petal*Math.PI*2/5;
          this.ellipse(x+Math.cos(a)*12*bloom,y+len+Math.sin(a)*10*bloom,22*bloom,19*bloom,0x9b78c2);
        }
        this.ellipse(x,y+len,9*bloom,9*bloom,0xf4d697);
      }
    }
    if(s.grown){
      this.hotspot('flowers',635,432,133,43);
      this.stroke([{x:713,y:379},{x:800,y:416},{x:892,y:400}],0x85a58c,7);
      for(let i=0;i<4;i++)this.ellipse(770+i*27,406+Math.sin(i)*8,12,8,INK.purple,.8);
      for(let i=0;i<7;i++){const x=510+(i*47+t*12)%230,y=435-(i*34+t*18)%190;this.fish(x,y,i);}
    }
    if(s.rainStarted){
      for(let i=0;i<18;i++){const f=(i/18+t*.38)%1,x=CLOUD.x+(638-CLOUD.x)*f+(i%3-1)*28,y=185-drift+f*(142+drift);this.stroke([{x,y},{x:x-4,y:y+8}],0x679cad,2,.65);}
    }
    // The lake holds a different world, with separately selectable reflections.
    this.ellipse(973,398,300,100,s.grown?0xb6acd0:0xb7c7c8,.97);
    for(let i=0;i<4;i++)this.ellipse(973,400+i*4,280-i*40,78-i*12,0xe6e8df,.2);
    this.hotspot('lake',973,410,153,52);
    this.stroke([{x:878,y:416},{x:878,y:371},{x:860,y:383},{x:878,y:371},{x:896,y:382}],s.grown?0x776e91:0x929c9c,4);
    this.ellipse(878,423,49,21,s.grown?0xa7a6b7:0xa7b1ac,.8);
    this.hotspot('reflectionTree',878,399,32,31);
    g.lineStyle(3,s.grown?0x807190:0x899b9a);g.strokeRoundedRect(955,373,35,53,16);
    this.hotspot('reflectionDoor',973,400,30,32);
    this.ellipse(1070,400,33,25,s.grown?0xc5aeca:0xbac5ba);this.hotspot('reflectionFlower',1070,400,30,30);
    if(hasPigment(s,'purple','reflectionFlower'))this.ellipse(1070,318+Math.sin(t)*5,47,35,INK.purple);
    if(s.treeReal){
      this.tree(1090,361,1.1);this.ellipse(1086,279,85,47,INK.purple,.7);this.stroke([{x:1090,y:361},{x:1032,y:321},{x:990,y:311},{x:924,y:303}],0x8ea58e,8);
      this.hotspots.push({id:'reflectionTree',name:LABELS.reflectionTree,x:1090,y:305,rx:55,ry:55});
    }
    if(s.doorReal){
      g.fillStyle(0x9481b5);g.fillRoundedRect(922,211,62,99,28);g.lineStyle(3,0xe7cea0);g.strokeRoundedRect(922,211,62,99,28);
      this.hotspots.push({id:'reflectionDoor',name:LABELS.reflectionDoor,x:953,y:260,rx:37,ry:49});
      this.drawRing();
    }
    if(s.complete)this.drawLivingWorld();
    g.restore();
    for(const h of this.hotspots.slice(firstLandHotspot)){
      h.y+=drift;
    }
    if(this.selected){this.ellipse(this.pointer.x+17,this.pointer.y-15,16,22,INK[this.selected],.85);}
  }
  private fish(x:number,y:number,i:number){
    const c=[0xe3bc9c,0xb7b1d5,0xa9d3c9][i%3];this.ellipse(x,y,19,10,c,.8);
    this.poly([{x:x-8,y},{x:x-16,y:y-7},{x:x-16,y:y+7}],c,.7);
  }
  private drawRing(){
    const g=this.art,s=this.state;const x=745,y=165;
    g.lineStyle(3,0xa7b8a3,.8);g.strokeCircle(x,y,70);
    this.stroke([{x,y:y+70},{x:785,y:278},{x:835,y:321},{x:924,y:303}],0x8aa488,6);
    for(const [i,c] of PIGMENTS.entries()){
      const a=-Math.PI/2+i*Math.PI/2,px=x+70*Math.cos(a),py=y+70*Math.sin(a),filled=hasPigment(s,c,(c+'Socket') as LifeTarget);
      this.ellipse(px,py,34,34,filled?INK[c]:0xf0efdf);
      g.lineStyle(2,INK[c]);g.strokeCircle(px,py,18);
      this.hotspot(c+'Socket',px,py,34,34);
    }
    if(s.complete){
      this.stroke([{x:x-18,y:y-17},{x:x+11,y:y-23},{x:x+26,y:y+4},{x:x+8,y:y+25},{x:x-22,y:y+17},{x:x-18,y:y-17}],0xad905c,4);
      this.stroke([{x:x-10,y:y+7},{x:x+3,y:y-9},{x:x+14,y:y+5}],0xf4dd9e,4);
      this.hotspot('seal',x,y,33,33);
    }
  }
  private drawLivingWorld(){
    const t=this.elapsed,g=this.art;
    // A persistent impossible ecosystem: water orbits the sky, roots reach stars.
    const ring:Point[]=[];
    for(let i=0;i<=90;i++){const a=i*Math.PI*2/90;ring.push({x:655+445*Math.cos(a),y:340+135*Math.sin(a)});}
    this.stroke(ring,0xe6f1d8,12,.32);this.stroke(ring,0x83c6d2,5,.5);
    for(let i=0;i<18;i++){
      const a=t*.22+i*.7,x=655+445*Math.cos(a),y=340+135*Math.sin(a);
      this.ellipse(x,y,6,6,0xf7ecc5,.85);
    }
    for(let i=0;i<12;i++){
      const x=600+i*31,y=135+Math.sin(i*2.1)*40;
      this.stroke([{x:758,y:230},{x:720+(x-720)*.5,y:160},{x,y}],0x99b5a1,1,.5);
      g.fillStyle(0xf4dba1);g.fillCircle(x,y,3+Math.sin(t+i));
    }
    for(let i=0;i<16;i++)this.fish(150+(i*77+t*17)%950,230+Math.sin(t*.6+i)*90,i);
    this.ellipse(973,398,286,89,0x686d98,.2);
    for(let i=0;i<7;i++)this.ellipse(851+i*40,402+Math.sin(t+i)*9,5,5,0xf5e5b9,.9);
  }
}
