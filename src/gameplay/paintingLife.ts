export const PIGMENTS = ['blue', 'orange', 'green', 'purple'] as const;
export type Pigment = typeof PIGMENTS[number];
export type LifeTarget = 'whale' | 'roots' | 'cloud' | 'garden' | 'reflectionTree' | 'reflectionDoor' | 'reflectionFlower' | 'blueSocket' | 'orangeSocket' | 'greenSocket' | 'purpleSocket';
export interface PaintingLife {
  /** Sharing paint leaves every earlier destination coloured. */
  colors: Record<Pigment, LifeTarget[]>;
  awake: boolean; lifted: boolean; greenFound: boolean;
  links: { garden: boolean; lake: boolean };
  rainStarted: boolean; watered: boolean; grown: boolean;
  treeReal: boolean; doorReal: boolean; complete: boolean;
}
export function newPaintingLife(): PaintingLife {
  return { colors: {blue:[],orange:[],green:[],purple:[]},awake:false,lifted:false,greenFound:false,links:{garden:false,lake:false},rainStarted:false,watered:false,grown:false,treeReal:false,doorReal:false,complete:false };
}
export function pigmentAvailable(s:PaintingLife,c:Pigment) {
  return c==='green'?s.greenFound:c==='purple'?s.grown:true;
}
export function hasPigment(s:PaintingLife,c:Pigment,target:LifeTarget) {return s.colors[c].includes(target);}
export function lifeMilestones(s:PaintingLife) {
  return [s.awake,s.greenFound,s.links.garden&&s.links.lake,s.watered,s.grown,s.treeReal,s.doorReal,s.complete].filter(Boolean).length;
}
const msg=(zh:string,en:string)=>zh+'\n'+en;
const bloomMessage=()=>msg('种子发芽，开出了紫色的花！点击紫花借色，再试试湖里的树影。','The seeds sprout into violet flowers! Borrow violet from a flower, then try the reflected tree.');
function settleLife(s:PaintingLife){
  if(s.rainStarted&&hasPigment(s,'green','roots')&&s.links.garden&&s.links.lake)s.watered=true;
  if(s.watered&&hasPigment(s,'orange','garden'))s.grown=true;
}
export function applyPigment(s:PaintingLife,c:Pigment,target:LifeTarget):string {
  if(s.complete)return msg('这个世界仍在生长。','This world keeps growing.');
  if(!pigmentAvailable(s,c))return c==='purple'?msg('先让种子发芽开花，才能从花里借到紫色。','Grow the seeds into flowers before borrowing violet.'):msg('绿叶还藏在岛后，先唤醒鲸鱼，让它浮起来。','The leaves are hidden behind the island. Wake and lift the whale first.');
  if(target.endsWith('Socket')){
    if(!s.doorReal)return msg('倒影里的门还没有来到这里。','The reflected door has not arrived yet.');
    if(target!==c+'Socket')return msg('这个缺口需要另一种颜色。','This socket needs a different colour.');
  }else{
    const allowed:Record<string,Pigment[]>={whale:['orange','blue'],roots:['green'],cloud:['blue'],garden:['orange'],reflectionTree:['purple'],reflectionDoor:['purple'],reflectionFlower:['purple']};
    if(!allowed[target]?.includes(c))return msg('这里需要另一种颜色。手上的颜色还在，可以继续试。','This place needs a different colour. Your borrowed colour is still selected.');
    if(target==='whale'&&c==='blue'&&!s.awake)return msg('鲸鱼还在睡觉，先给它一丝落日的温暖。','The whale is asleep. Give it some warmth from the sunset first.');
    if(target==='reflectionTree'&&(!s.grown||!s.links.lake))return msg('树影需要开花的根系，才能长到水面之外。','The reflected tree needs flowering roots to grow beyond the water.');
    if(target==='reflectionDoor'&&!s.treeReal)return msg('先用紫花的颜色唤出树影，树枝才能托住门。','Use the violet flowers to bring out the tree first. Its branches can then hold the door.');
  }
  if(hasPigment(s,c,target))return msg('这里已经留下了颜色，可以再从原物体借一抹给别处。','The colour stays here. Borrow another touch from its source for somewhere else.');
  const wasGrown=s.grown;
  s.colors[c].push(target);
  if(target==='whale'&&c==='orange')s.awake=true;
  if(target==='whale'&&c==='blue'){s.lifted=true;s.greenFound=true;}
  if(target==='cloud')s.rainStarted=true;
  settleLife(s);
  if(target==='reflectionTree')s.treeReal=true;
  if(target==='reflectionDoor')s.doorReal=true;
  s.complete=PIGMENTS.every(p=>hasPigment(s,p,(p+'Socket') as LifeTarget));
  if(s.complete)return msg('四种颜色连接了整个世界。每一处颜色都留了下来。','Four colours connect the world. Every borrowed colour remains.');
  if(!wasGrown&&s.grown)return bloomMessage();
  const feedback:Partial<Record<LifeTarget,string>>={
    whale:c==='orange'?msg('鲸鱼醒了，落日仍然温暖。再从蓝云借一点轻盈。','The whale wakes; the sunset stays warm. Borrow some lightness from the blue cloud.'):msg('鲸鱼托着岛群浮起，露出了绿叶。蓝云也保留着颜色。','The whale lifts the islands, revealing green leaves. The blue cloud keeps its colour.'),
    roots:msg('根开始延伸。接着点花园和湖泊，接通两条叶脉。','The roots extend. Click the garden and lake to connect both veins.'),
    cloud:s.watered?msg('雨水送到了种子。借落日的橙色，点中间岛上的三颗种子。','Rain reaches the seeds. Borrow orange from the sunset and touch the three seeds on the middle island.'):msg('云开始下雨。用绿叶的颜色接通花园与湖泊，雨水就能送到种子。','The cloud rains. Connect the garden and lake with green leaves to carry water to the seeds.'),
    garden:msg('种子记住了落日的温暖，等雨水到来就会开花。','The seeds keep the sunset warmth. They will bloom when rain reaches them.'),
    reflectionTree:msg('紫花的颜色沿着根蔓延，把树影带出水面。再借紫色给门影。','Violet spreads along the roots and brings the tree out of the water. Borrow violet again for the door.'),
    reflectionDoor:msg('树枝托起了门。再从画中借四种颜色，点亮画面中央大轮环上的四个灰色落点。','The branches hold the door. Borrow the four colours to fill the four grey sockets around the large central ring.'),
    reflectionFlower:msg('花影也开出了紫花，原来的花仍在盛开。','The reflected flower blooms too. The original flowers keep blooming.')
  };
  return feedback[target]??msg('颜色留在了轮环上，原来的颜色也仍然在。','The ring keeps this colour, and so does its source.');
}
export function connectRoot(s:PaintingLife,target:'garden'|'lake') {
  if(s.complete||!hasPigment(s,'green','roots'))return msg('从绿叶借一点颜色给根结。','Borrow some colour from the green leaves for the root knot.');
  const wasGrown=s.grown;s.links[target]=true;settleLife(s);
  if(!wasGrown&&s.grown)return bloomMessage();
  return s.links.garden&&s.links.lake?(s.watered?msg('水已送到种子，借落日的橙色给它们温暖。','Water reaches the seeds. Borrow orange from the sunset to warm them.'):msg('叶脉接通了。借蓝云的颜色给右上方的灰云，让它下雨。','The veins are connected. Borrow blue for the grey cloud at the upper right to make rain.')):msg('一条叶脉接好了，继续点另一端。','One vein is connected. Click the other destination.');
}
