import fs from 'node:fs';
import assert from 'node:assert/strict';
const tabs=await(await fetch('http://127.0.0.1:9335/json/list')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const k=++id;pending.set(k,{resolve,reject});ws.send(JSON.stringify({id:k,method,params}));});
const read=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result?.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const s="window.__game.scene.getScene('chapter3-painting')";
const mouse=async(type,x,y)=>{
 const p=await read("(()=>{const c="+s+".cameras.main,r=window.__game.canvas.getBoundingClientRect(),o=c.getWorldPoint(0,0);return{x:r.left+("+x+"-o.x)*c.zoom*r.width/window.__game.scale.gameSize.width,y:r.top+("+y+"-o.y)*c.zoom*r.height/window.__game.scale.gameSize.height};})()");
 await send('Input.dispatchMouseEvent',{type,...p,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:1,clickCount:1});await wait(50);
};
try{
 await send('Runtime.enable');await send('Page.enable');
 await send('Page.navigate',{url:(process.env.SEEK_PREVIEW_URL || 'http://127.0.0.1:5176/')+'?scene=chapter3-painting'});
 for(let i=0;i<100;i++){if(await read("!!window.__game?.scene.getScene('chapter3-painting')?.art"))break;await wait(100);}
 assert.equal(await read(s+'.solved'),false);
 await mouse('mousePressed',785,440);await mouse('mouseMoved',550,410);await mouse('mouseReleased',550,410);
 assert.equal(await read(s+'.solved'),false,'horizontal alignment alone cannot solve the shape');
 const warped=await read(s+'.warp({x:632,y:310})');assert.ok(Math.abs(warped.y-310)>20,'paint deforms with wall');
 await mouse('mousePressed',550,410);await mouse('mouseMoved',550,340);await mouse('mouseReleased',550,340);await wait(600);
 assert.equal(await read(s+'.solved'),true);
 assert.equal(await read(s+'.collected'),false,'must inspect revealed clue');
 await mouse('mousePressed',550,310);await mouse('mouseReleased',550,310);
 assert.equal(await read(s+'.collected'),true);
 await wait(1300);
 assert.equal(await read("window.__game.scene.isActive('chapter3-colors')"),true,'seal starts the colour puzzle');
 await read("window.__game.scene.getScene('chapter3-colors').scene.start('chapter3-painting');true;");await wait(300);
 assert.equal(await read(s+'.collected'),false);
 fs.mkdirSync('node_modules/.cache/chapter3-review',{recursive:true});
 const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('node_modules/.cache/chapter3-review/room-deformation.png',Buffer.from(shot.data,'base64'));
 assert.equal(errors.length,0,JSON.stringify(errors));
 console.log('PASS: direct corner drag, wall-bound deformation, incorrect shape rejected, shape solved, clue collected, reset; no chapter completion.');
}finally{ws.close();}
