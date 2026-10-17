import test from 'node:test';
import assert from 'node:assert/strict';
import {REST,START,CROP,alignedPoint,projectPoint,projectGround,alignmentError,isAligned,PAINTING_WIDTH as W,PAINTING_HEIGHT as H} from '../src/gameplay/paintingPerspective.ts';
test('one viewpoint changes all depths; both axes must align',()=>{
 assert.ok(alignmentError(START)>60);assert.ok(isAligned(REST));
 assert.equal(isAligned({x:REST.x,y:START.y}),false);
 assert.equal(isAligned({x:START.x,y:REST.y}),false);
 assert.ok(isAligned({x:REST.x+3,y:REST.y-3}));
 const p={x:600,y:300};const near=projectPoint(p,0,START),far=projectPoint(p,1,START);
 assert.ok(Math.hypot(near.x-far.x,near.y-far.y)>60,'depth parallax, not translating the entire picture');
});
test('terrain edges remain covered; ground and scenery never invert',()=>{
 const area=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 for(const x of [300,565,850])for(const y of [215,315,485]){
  const handle={x,y};
  for(let i=0;i<4;i++){
   const crop=CROP[i];
   const p=(x,y)=>i===3?projectGround({x:x/24*W,y:y/20*H},handle):projectPoint(alignedPoint({x:crop.x+x/24*crop.w,y:crop.y+y/20*crop.h},i),i,handle);
   for(let row=0;row<20;row++)for(let col=0;col<24;col++){
    const a=p(col,row),b=p(col+1,row),c=p(col,row+1),d=p(col+1,row+1);
    assert.ok(area(a,b,d)>0&&area(a,d,c)>0,`fold ${i} ${x},${y} ${col},${row}`);
   }
  }
  for(let t=0;t<=10;t++)for(const p of [{x:0,y:t/10*H},{x:W,y:t/10*H},{x:t/10*W,y:0},{x:t/10*W,y:H}]){
   const q=projectGround(p,handle);assert.ok(Math.hypot(q.x-p.x,q.y-p.y)<1e-7);
  }
 }
});
