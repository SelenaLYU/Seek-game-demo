import Phaser from 'phaser';
import { ColorWatercolorWorld } from './ColorWatercolorWorld';
import { PIGMENTS, newPaintingLife, pigmentAvailable, lifeMilestones, applyPigment, hasPigment, connectRoot, type Pigment, type LifeTarget } from '../gameplay/paintingLife';

type Point={x:number;y:number};
type Hotspot=Point&{id:string;rx:number;ry:number;name:string};
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
  private world!:ColorWatercolorWorld;
  private message='点画里的落日或蓝云借色，再点需要颜色的地方。原来的颜色会留下。\nBorrow from the sunset or blue cloud, then touch a destination. The source keeps its colour.';
  private hotspots:Hotspot[]=[];
  private introElapsed=0;private introActive=true;private introLine=-1;private intro!:HTMLDivElement;
  private hintUntil=0;
  private pointer:Point={x:640,y:350};private lastHud='';private completionSeen=false;
  constructor(){super('chapter3-colors');}
  preload(){ColorWatercolorWorld.preload(this);}
  create(){
    this.state=newPaintingLife();this.selected=null;this.linking=false;this.borrowing=null;
    this.elapsed=this.whaleLift=this.gardenGrowth=this.life=0;this.lastHud='';this.completionSeen=false;
    this.feedback=null;this.introElapsed=0;this.introActive=true;this.introLine=-1;this.hintUntil=0;
    this.message='点画里的落日或蓝云借色，再点需要颜色的地方。原来的颜色会留下。\nBorrow from the sunset or blue cloud, then touch a destination. The source keeps its colour.';
    this.cameras.main.resetFX();this.cameras.main.setBackgroundColor('#fff4df');
    const fit=()=>{const {width,height}=this.scale.gameSize;this.cameras.main.setSize(width,height).setZoom(Math.min(width/1280,height/800)).centerOn(640,400);};
    fit();this.scale.on(Phaser.Scale.Events.RESIZE,fit);this.cameras.main.fadeIn(650,235,239,216);
    this.world=new ColorWatercolorWorld(this);
    this.art=this.add.graphics().setDepth(100);
    this.createHud();
    this.input.on('pointerdown',this.down,this);this.input.on('pointermove',this.move,this);
    const escape=()=>{this.selected=null;this.linking=false;this.borrowing=null;};
    this.input.keyboard?.on('keydown-ESC',escape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      this.world.destroy();this.hud.remove();this.scale.off(Phaser.Scale.Events.RESIZE,fit);
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
    if(!s.awake)return '鲸鱼的眼睛，似乎在等一丝落日的温暖。\nThe whale is waiting for some warmth from the sunset.';
    if(!s.greenFound)return '蓝色让云漂浮。它能让醒来的鲸鱼浮起来吗？\nBlue keeps clouds afloat. Could it lift an awakened whale?';
    if(!hasPigment(s,'green','roots')&&(!s.links.garden||!s.links.lake))return '点击左侧绿叶借色，再点根结，让根延伸。\nBorrow from the green leaves, then touch the root knot.';
    if(!s.links.garden||!s.links.lake)return '拿绿色直接点花园和湖泊，或点根结后连续点这两处。\nUse green on the garden and lake, or click the root knot then both places.';
    if(!s.watered)return '从蓝云借一点蓝色，给右上方的灰云，它就会下雨。\nBorrow blue from the blue cloud for the grey cloud at the upper right. It will rain.';
    if(!s.grown)return '选橙色，再点中间岛上发亮的三颗种子。\nChoose orange, then click the three glowing seeds on the middle island.';
    if(!s.treeReal)return '种子开出了紫花。点击花瓣借色，再点湖里的树影，让颜色沿根生长。\nBorrow violet from the new flowers, then touch the reflected tree to grow colour along the roots.';
    if(!s.doorReal)return '树枝能托住门了。再从紫花借色，点湖里的门影。\nThe branches can hold the door now. Borrow violet from the flowers again for the reflected door.';
    if(!s.complete)return '画面中央出现了大轮环。把四种颜色放到圆周上的四个灰色图案上，旁边的小色样对应颜色。\nFind the large ring in the centre. Match each grey shape around it to the small colour sample beside it.';
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
      whale:'鲸鱼正在沉睡，试着借落日的橙色唤醒它。\nThe whale is asleep. Borrow orange from the sunset to wake it.',
      roots:'绿色会让孤立的生命相连。\nGreen joins living things together.',
      garden:this.state.watered?'这三颗种子已经喝到水了，把橙色放在这里。\nThese three seeds have water. Place orange here.':'中间岛上的种子，需要水和温暖才能开出倒悬的花。\nThe seeds on the middle island need water and warmth to bloom downward.',
      cloud:this.state.rainStarted?'蓝色留在了云上，它会继续送来雨水。\nThe cloud keeps its borrowed blue and continues to bring rain.':'从左边蓝云借一点蓝色，让这朵灰云下雨。\nBorrow blue from the cloud on the left to make this grey cloud rain.',
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
    const ringControl=this.hotspots.find(h=>(h.id.endsWith('Socket')||h.id==='seal')&&Math.hypot(q.x-h.x,q.y-h.y)<=h.rx+8);
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
  private ellipse(x:number,y:number,w:number,h:number,color:number,alpha=1){this.art.fillStyle(color,alpha);this.art.fillEllipse(x,y,w,h,128);}
  update(_time:number,delta:number){
    if(!this.art)return;const dt=Math.min(delta/1000,.04);this.elapsed+=dt;
    this.updateIntro(delta/1000);
    const s=this.state;
    this.whaleLift=Phaser.Math.Linear(this.whaleLift,s.lifted?1:0,Math.min(1,dt*2));
    this.gardenGrowth=Phaser.Math.Linear(this.gardenGrowth,s.grown?1:0,Math.min(1,dt*2));
    this.life=Phaser.Math.Linear(this.life,lifeMilestones(s)/8,Math.min(1,dt));
    this.art.clear();
    this.hotspots=this.world.draw(s,this.elapsed,dt,this.whaleLift,this.gardenGrowth,this.life).map(h=>({...h,name:LABELS[h.id]??h.id}));
    if(s.doorReal&&!s.complete)for(const c of PIGMENTS){
      const socket=this.hotspots.find(h=>h.id===c+'Socket');
      if(!socket||hasPigment(s,c,(c+'Socket') as LifeTarget))continue;
      const emphasis=this.selected===c?.75+.2*Math.sin(this.elapsed*3):.55;
      this.art.lineStyle(this.selected===c?3:2,INK[c],emphasis);
      this.art.strokeCircle(socket.x,socket.y,48);
    }
    const key=JSON.stringify([s,this.selected,this.message,this.linking]);
    if(key!==this.lastHud){
      this.lastHud=key;this.hud.querySelector('[data-feedback]')!.textContent=this.introActive?'':this.message;
      if(!this.introActive){
        this.hud.querySelector('[data-hint]')!.textContent=this.message;
        this.hintUntil=this.elapsed+7;
      }
    }
    const hint=this.hud.querySelector<HTMLElement>('[data-hint]')!;
    hint.hidden=this.introActive||this.elapsed>=this.hintUntil;
    const besideRing=s.doorReal&&this.scale.gameSize.width>=900;
    hint.style.left=besideRing?'2%':'8%';hint.style.right=besideRing?'77%':'8%';
    const hovered=this.introActive?undefined:this.hitAt(this.pointer);
    if(hovered||(!this.introActive&&this.selected)){
      const c=this.selected?INK[this.selected]:0xd2ad67;
      this.ellipse(this.pointer.x+18,this.pointer.y-18,this.selected?16:10,this.selected?20:13,c,this.selected?.95:.55);
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
}
