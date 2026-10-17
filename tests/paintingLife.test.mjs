import test from 'node:test';
import assert from 'node:assert/strict';
import {newPaintingLife,applyPigment,connectRoot,hasPigment,pigmentAvailable,PIGMENTS} from '../src/gameplay/paintingLife.ts';
function awaken(){
 const s=newPaintingLife();applyPigment(s,'orange','whale');applyPigment(s,'blue','whale');
 applyPigment(s,'green','roots');connectRoot(s,'garden');connectRoot(s,'lake');return s;
}
function grow(){const s=awaken();applyPigment(s,'blue','cloud');applyPigment(s,'orange','garden');return s;}

test('locked pigments and wrong targets leave painted destinations unchanged',()=>{
 const s=newPaintingLife(),before=structuredClone(s);
 applyPigment(s,'green','roots');applyPigment(s,'blue','whale');applyPigment(s,'orange','reflectionDoor');
 assert.deepEqual(s,before);
 applyPigment(s,'orange','whale');applyPigment(s,'blue','whale');
 assert.ok(hasPigment(s,'orange','whale')&&hasPigment(s,'blue','whale'));
 assert.ok(s.greenFound&&s.lifted);
});
test('blue can paint the rain cloud without draining the whale or lowering its islands',()=>{
 const s=awaken();applyPigment(s,'blue','cloud');
 assert.ok(s.rainStarted&&s.watered&&s.lifted);
 assert.deepEqual(s.colors.blue,['whale','cloud']);
 applyPigment(s,'blue','cloud');assert.deepEqual(s.colors.blue,['whale','cloud'],'repainting is idempotent');
});
test('early rain waits for connected roots and never requires a river or repeat action',()=>{
 const s=newPaintingLife();applyPigment(s,'blue','cloud');assert.ok(s.rainStarted);assert.equal(s.watered,false);
 applyPigment(s,'orange','whale');applyPigment(s,'blue','whale');applyPigment(s,'green','roots');
 connectRoot(s,'garden');assert.equal(s.watered,false);connectRoot(s,'lake');assert.ok(s.watered);
 assert.ok(hasPigment(s,'blue','cloud'));
});
test('rain and warmth in either order grow violet flowers; one ingredient cannot unlock violet',()=>{
 for(const first of ['blue','orange']){
  const s=awaken();applyPigment(s,first,first==='blue'?'cloud':'garden');
  assert.equal(s.grown,false);assert.equal(pigmentAvailable(s,'purple'),false);
  const second=first==='blue'?'orange':'blue';applyPigment(s,second,second==='blue'?'cloud':'garden');
  assert.ok(s.grown&&pigmentAvailable(s,'purple'));
  assert.ok(hasPigment(s,'orange','whale')&&hasPigment(s,'orange','garden'));
 }
});
test('saved rain and warmth grow flowers when the last root connects',()=>{
 const s=newPaintingLife();applyPigment(s,'orange','garden');applyPigment(s,'blue','cloud');
 applyPigment(s,'orange','whale');applyPigment(s,'blue','whale');applyPigment(s,'green','roots');
 connectRoot(s,'garden');const message=connectRoot(s,'lake');
 assert.ok(s.grown);assert.match(message,/紫色的花/);
});
test('violet comes from grown flowers and remains on earlier reflections',()=>{
 const early=awaken();applyPigment(early,'purple','reflectionTree');assert.equal(early.treeReal,false);
 const s=grow();applyPigment(s,'purple','reflectionDoor');assert.equal(s.doorReal,false);
 applyPigment(s,'purple','reflectionFlower');applyPigment(s,'purple','reflectionTree');applyPigment(s,'purple','reflectionDoor');
 assert.ok(s.grown&&s.treeReal&&s.doorReal);
 assert.deepEqual(s.colors.purple,['reflectionFlower','reflectionTree','reflectionDoor']);
});
test('all four matching sockets finish the world without draining any coloured destination',()=>{
 const s=grow();applyPigment(s,'purple','reflectionTree');applyPigment(s,'purple','reflectionDoor');
 applyPigment(s,'orange','blueSocket');assert.equal(s.complete,false);
 const earlier=structuredClone(s.colors);
 for(const c of PIGMENTS)applyPigment(s,c,c+'Socket');
 assert.ok(s.complete&&s.grown&&s.lifted&&s.rainStarted);
 for(const c of PIGMENTS)for(const target of earlier[c])assert.ok(hasPigment(s,c,target));
 const final=structuredClone(s);applyPigment(s,'purple','reflectionFlower');connectRoot(s,'garden');assert.deepEqual(s,final);
});
