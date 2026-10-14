import test from 'node:test';
import assert from 'node:assert/strict';
import {warpLandscape,PAINTING_REST,PAINTING_WIDTH as W,PAINTING_HEIGHT as H} from '../src/gameplay/paintingPerspective.ts';

test('solved landscape preserves the painted contours exactly',()=>{
  for(let y=0;y<=H;y+=16)for(let x=0;x<=W;x+=16){
    assert.deepEqual(warpLandscape({x,y},PAINTING_REST),{x,y});
  }
});
test('drag extremes keep every triangle upright and within the canvas',()=>{
  for(const x of [330,550,820])for(const y of [235,340,470]){
    for(let row=0;row<24;row++)for(let col=0;col<36;col++){
      const p=(c,r)=>warpLandscape({x:c/36*W,y:r/24*H},{x,y});
      const a=p(col,row),b=p(col+1,row),c=p(col,row+1),d=p(col+1,row+1);
      for(const v of [a,b,c,d])assert.ok(v.x>=-1e-8&&v.x<=W+1e-8&&v.y>=-1e-8&&v.y<=H+1e-8);
      const area=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
      assert.ok(area(a,b,d)>0&&area(a,d,c)>0,'no folded or inverted triangles');
    }
    for(let i=0;i<=20;i++)for(const p of [{x:0,y:H*i/20},{x:W,y:H*i/20},{x:W*i/20,y:0},{x:W*i/20,y:H}]){
      const q=warpLandscape(p,{x,y});assert.ok(Math.hypot(q.x-p.x,q.y-p.y)<1e-8);
    }
  }
});
