import fs from 'node:fs';
import assert from 'node:assert/strict';
const tabs=await(await fetch('http://127.0.0.1:9335/json/list')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
const read=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description);return r.result?.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const mouse=async(type,x,y)=>{
  const p=await read(`(()=>{const s=window.__game.scene.getScene('chapter3-painting'),c=s.cameras.main,r=window.__game.canvas.getBoundingClientRect(),o=c.getWorldPoint(0,0);return{x:r.left+(${x}-o.x)*c.zoom*r.width/window.__game.scale.gameSize.width,y:r.top+(${y}-o.y)*c.zoom*r.height/window.__game.scale.gameSize.height};})()`);
  await send('Input.dispatchMouseEvent',{type,...p,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:1,clickCount:type==='mouseMoved'?0:1});await wait(25);
};
const phase=()=>read(`window.__game.scene.getScene('chapter3-painting').phase`);
const key=async(type,key,code)=>send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0)});
try {
  await send('Runtime.enable');await send('Page.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:5175/?scene=chapter3'});
  for(let i=0;i<100;i++){if(await read(`!!window.__game?.scene.getScene('chapter3')?.actor`))break;await wait(100);}
  await read(`(()=>{const s=window.__game.scene.getScene('chapter3');s.stage='door';s.brush=true;s.px=11100;s.py=1050;return true;})()`);
  await key('keyDown','e','KeyE');await wait(150);await key('keyUp','e','KeyE');await wait(250);
  assert.equal(await read(`window.__game.scene.isActive('chapter3-painting')`),true,'office door enters painting');
  assert.equal(await phase(),'erase');
  fs.mkdirSync('node_modules/.cache/chapter3-review',{recursive:true});
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('node_modules/.cache/chapter3-review/painting-start.png',Buffer.from(shot.data,'base64'));
  await read(`(()=>{const s=window.__game.scene.getScene('chapter3-painting');s.held.add('right');for(let i=0;i<200;i++)s.update(0,1000/60);s.held.clear();return true;})()`);
  assert.equal(await read(`window.__game.scene.getScene('chapter3-painting').px`),345,'cannot cross without the blank');
  await mouse('mousePressed',190,203);
  for(let row=0;row<4;row++)for(let col=0;col<6;col++)await mouse('mouseMoved',190+col*22,203+row*22);
  await mouse('mouseReleased',300,269);assert.equal(await phase(),'paper');
  await mouse('mousePressed',245,236);await mouse('mouseMoved',700,200);await mouse('mouseReleased',700,200);await wait(350);
  assert.equal(await phase(),'paper');assert.equal(Math.round(await read(`window.__game.scene.getScene('chapter3-painting').paper.x`)),245,'invalid drop returns safely');
  await mouse('mousePressed',245,230);await mouse('mouseMoved',480,400);await mouse('mouseReleased',480,400);assert.equal(await phase(),'bridge');
  await read(`(()=>{const s=window.__game.scene.getScene('chapter3-painting');s.px=320;return true;})()`);
  await mouse('mousePressed',480,405);await mouse('mouseMoved',245,230);await mouse('mouseReleased',245,230);await wait(300);assert.equal(await phase(),'paper','bridge can be borrowed again from the bank');
  await mouse('mousePressed',245,230);await mouse('mouseMoved',480,400);await mouse('mouseReleased',480,400);
  await key('keyDown','d','KeyD');await wait(3400);await key('keyUp','d','KeyD');
  assert.ok(await read(`window.__game.scene.getScene('chapter3-painting').px>790`),'walk across the placed bridge');
  await key('keyDown','e','KeyE');await wait(100);await key('keyUp','e','KeyE');assert.equal(await phase(),'done');
  assert.equal(errors.length,0,JSON.stringify(errors));
  await read(`window.__game.scene.getScene('chapter3-painting').scene.restart();true;`);
  console.log('PASS: office-door transition, real pointer erasing, invalid drop, reversible bridge, keyboard crossing and exit.');
}finally{ws.close();}
