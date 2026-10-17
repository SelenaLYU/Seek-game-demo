import fs from 'node:fs';
import assert from 'node:assert/strict';
const tabs = await (await fetch('http://127.0.0.1:9335/json/list')).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => ws.onopen = resolve);
let id = 0; const requests = new Map(); const errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
  if (requests.has(m.id)) { const r = requests.get(m.id); requests.delete(m.id); m.error ? r.reject(m.error) : r.resolve(m.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; requests.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })); });
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
};
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:5175/?scene=chapter3' });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    ready = await evaluate(`!!window.__game?.scene.getScene('chapter3')?.actor`);
    if (ready) break; await new Promise(r => setTimeout(r, 150));
  }
  assert.ok(ready, 'scene boots');
  await evaluate(`(async()=>{window.__officeRules=await import('/src/gameplay/chapterThreeOffice.ts');return true;})()`);
  await new Promise(r => setTimeout(r, 500));
  fs.mkdirSync('node_modules/.cache/chapter3-review', { recursive: true });
  const initial = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('node_modules/.cache/chapter3-review/start.png', Buffer.from(initial.data, 'base64'));
  const results = await evaluate(`(() => {
    const s = window.__game.scene.getScene('chapter3'); window.__game.loop.sleep();
    const result = [];
    const step = (n, ...keys) => { s.touch = new Set(keys); for(let i=0;i<n;i++) s.update(0, 1000/60); };
    const record = name => result.push({ name, stage:s.stage, x:Math.round(s.px), y:Math.round(s.py), deaths:s.deaths, vy:Math.round(s.vy), collapse:s.collapseActive, front:Math.round(s.collapseFront), fallen:s.roofTiles.filter(t=>t.falling>0).length });
    step(35,'RIGHT');step(1,'E');record('badge');
    // Contact is fatal, but the larger jump and irregular gaps remain traversable.
    s.invulnerable=0; s.px=s.threats[1].x; s.py=1050;step(1);record('crowd-collision');
    s.invulnerable=0;s.px=480;
    for(let i=0;i<1200 && s.px<1920;i++) {
      const ahead=s.threats.filter(h=>h.kind==='person').map(h=>h.x-s.px).filter(d=>d>0).sort((a,b)=>a-b)[0];
      step(1,'RIGHT',...(s.grounded && ahead<100?['SPACE']:[]));
    }
    record('crowd-route');
    // Segment starts are positioned directly so every mechanic is exercised independently.
    s.px=1970;s.py=1050;s.vy=0;s.grounded=true;step(1,'E');step(180);record('lift');
    s.px=2590;s.py=530;s.invulnerable=999;step(60,'RIGHT','DOWN');record('desk-blocks-duck');
    s.checkpoint='office';s.respawn();s.invulnerable=0;record('office-route-start');
    // Time each desk crossing against nearby independent emitters. Predict the
    // same two-jump route using real collision rules, without disabling damage.
    const canCrossDesk = () => {
      const rules=window.__officeRules;
      let x=s.px,y=s.py,vy=0,ground=true;
      for(let n=1;n<=110;n++){
        if(ground && (n===1 || y<=450)){vy=-565;ground=false;}
        const oldY=y,oldX=x; x+=285/60;vy+=1400/60;y+=vy/60;
        const solid=rules.resolveDeskMotion(oldX,oldY,x,y);x=solid.x;y=solid.feet;
        const land=rules.landingSurface(x,oldY,y);ground=false;
        if(land && vy>=0){y=land.top;vy=0;ground=true;}
        const duck=ground && y>500;
        for(const h of s.threats.filter(h=>h.volleyIndex!==undefined)){
          const f=rules.paperStormFrame(s.stormTime+n/60,h.volleyIndex), ey=432+Math.sin(h.phase)*53;
          if(f.visible && Math.abs(x-f.x)<h.width+10 && y>ey-26 && y-(duck?29:54)<ey+8)return false;
        }
      }
      return true;
    };
    for(let i=0;i<6000 && s.stage==='office';i++) {
      const desk=[2630,3180,3720].some(x=>x-s.px>0 && x-s.px<100);
      if(s.grounded && s.py>500 && desk && !canCrossDesk()){step(1,'DOWN');continue;}
      const jump=s.grounded && (desk || s.py<=450);
      step(1,'RIGHT',...(jump?['SPACE']:s.py>500?['DOWN']:[]));
    }
    record('office-route');
    s.checkpoint='chair';s.respawn();s.invulnerable=0;
    s.px=4270;step(1,'SPACE');record('chair-floor-jump');
    s.respawn();step(12,'RIGHT');step(16,'SPACE','RIGHT');step(40);record('chair-seat');
    step(1,'SPACE','RIGHT');record('chair-boost');step(47,'RIGHT');step(26);record('chair-folder');
    let airEncounters=0, lastPhase=s.airPhase;
    if(s.stage==='glide') {
      for(let i=0;i<600 && s.stage==='glide';i++){
        let target=420;
        if(s.px>5140 && s.px<5610)target=350;
        if(s.px>=5610)target=465;
        let low=205, high=650;
        for(const p of s.pillars) if(p.x>s.px-110 && p.x<s.px+260){
          if(p.top<205)low=Math.max(low,p.bottom+65);
          if(p.bottom>650)high=Math.min(high,p.top-20);
        }
        if(s.airPhase!=='waiting' && s.airX-s.px<500 && s.airX>s.px-80){
          const lane=s.airY+26;
          if(Math.abs(target-lane)<80){
            const choices=[lane-100,lane+100].filter(y=>y>=low && y<=high);
            if(choices.length)target=choices.sort((a,b)=>Math.abs(a-s.py)-Math.abs(b-s.py))[0];
          }
        }
        target=Math.max(low,Math.min(high,target));
        step(1,'RIGHT',...(s.py<target-5?['DOWN']:s.py>target+5?['UP']:[]));
        if(s.airPhase==='flying' && lastPhase!=='flying')airEncounters++;
        lastPhase=s.airPhase;
      }
    }
    record('folder-landing');
    result.push({name:'incoming-obstacles', count:airEncounters});
    s.stage='glide';s.checkpoint='chair';s.px=4800;s.py=420;s.invulnerable=0;
    s.airPhase='flying';s.airX=4805;s.airY=394;step(1);record('air-collision');
    s.checkpoint='roof';s.respawn();s.px=7090;s.py=530;s.grounded=true;
    step(1,'RIGHT','SPACE');step(46,'RIGHT');record('roof-gap');
    s.respawn();record('collapse-wait-start');step(250);record('collapse-catches-waiting');
    s.respawn();s.invulnerable=0;record('roof-route-start');
    for(let i=0;i<1200 && s.px<8710;i++) {
      const printer=[6830,7490,8010,8470].some(x=>x-s.px>0 && x-s.px<90);
      const gap=[7160,7710,8190].some(x=>x-s.px>0 && x-s.px<65);
      step(1,'RIGHT',...(s.grounded && (printer||gap)?['SPACE']:[]));
    }
    record('roof-route');
    step(1,'E');record('rope-grab');step(170);record('rope');
    step(180);record('collapse-stopped');
    for(let i=0;i<700 && s.stage==='phones';i++)step(1,'RIGHT','DOWN');
    record('phone-route');
    s.px=10720;s.py=1050;step(1);record('brush');
    s.px=11100;step(1,'E');record('door');
    return result;
  })()`);
  console.log(JSON.stringify(results, null, 2));
  for (const [name, stage] of [['badge','crowd'],['lift','office'],['chair-folder','glide'],['folder-landing','roof'],['roof-gap','roof'],['rope','phones'],['brush','door'],['door','done']]) {
    assert.equal(results.find(r=>r.name===name)?.stage, stage, name);
  }
  assert.equal(results.find(r=>r.name==='crowd-collision').deaths,1);
  assert.equal(results.find(r=>r.name==='crowd-collision').x,480);
  assert.equal(results.find(r=>r.name==='desk-blocks-duck').x,2617);
  assert.equal(results.find(r=>r.name==='folder-landing').collapse,true);
  assert.ok(results.find(r=>r.name==='collapse-catches-waiting').deaths>results.find(r=>r.name==='collapse-wait-start').deaths);
  assert.ok(results.find(r=>r.name==='roof-route').fallen>0);
  assert.equal(results.find(r=>r.name==='rope-grab').stage,'rope');
  assert.equal(results.find(r=>r.name==='rope-grab').collapse,false);
  assert.equal(results.find(r=>r.name==='rope-grab').front,results.find(r=>r.name==='rope').front);
  assert.equal(results.find(r=>r.name==='rope').collapse,false);
  assert.equal(results.find(r=>r.name==='rope').front,results.find(r=>r.name==='collapse-stopped').front);
  assert.equal(results.find(r=>r.name==='chair-seat').y,506);
  assert.ok(results.find(r=>r.name==='chair-floor-jump').vy>-600);
  assert.ok(results.find(r=>r.name==='chair-boost').vy<-850);
  assert.ok(results.find(r=>r.name==='incoming-obstacles').count>=2);
  assert.equal(results.find(r=>r.name==='air-collision').stage,'chair');
  assert.ok(results.find(r=>r.name==='air-collision').deaths>results.find(r=>r.name==='folder-landing').deaths);
  assert.ok(results.find(r=>r.name==='crowd-route').x>=1920, 'crowd route is traversable');
  assert.equal(results.find(r=>r.name==='office-route').stage, 'chair');
  assert.ok(results.find(r=>r.name==='roof-route').x>=8520, 'all roof gaps and printers are traversable');
  for(const [start,end] of [['crowd-collision','crowd-route'],['roof-route-start','roof-route'],['roof-route','rope'],['rope','phone-route']]) {
    assert.equal(results.find(r=>r.name===start).deaths,results.find(r=>r.name===end).deaths, end+' without damage');
  }
  assert.equal(results.find(r=>r.name==='phone-route').stage, 'door');
  assert.equal(results.find(r=>r.name==='roof-gap').y, 490, 'lands on the next roof');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  if(process.argv.includes('--review')) {
    await evaluate(`window.__game.loop.wake();true;`);
    for(const [name, setup] of [
      ['crowd', "s.stage='crowd';s.px=930;s.py=1050;s.cameraX=1110;s.cameraY=926;"],
      ['chair-seat', "s.stage='chair';s.px=4270;s.py=506;s.cameraX=4440;s.cameraY=382;"],
      ['incoming', "s.stage='glide';s.px=5200;s.py=350;s.cameraX=5390;s.cameraY=280;s.airPhase='waiting';s.airTimer=0;"],
      ['rope-edge', "s.stage='roof';s.px=8700;s.py=490;s.cameraX=8890;s.cameraY=370;s.airMail.setVisible(false);"]
    ]) {
      await evaluate(`(() => {const s=window.__game.scene.getScene('chapter3');s.hud.querySelector('h2')?.parentElement.remove();s.touch.clear();s.vy=0;s.vx=0;s.invulnerable=999;s.toastUntil=0;${setup}return true;})()`);
      await new Promise(r=>setTimeout(r,name==='incoming'?1400:400));
      const shot=await send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync('node_modules/.cache/chapter3-review/'+name+'.png',Buffer.from(shot.data,'base64'));
    }
  }
  await evaluate(`window.__game.loop.wake();window.__game.scene.getScene('chapter3').scene.restart();true;`);
  console.log('PASS: browser scene boot, collisions, all traversal mechanics, brush and exit.');
} finally { ws.close(); }
