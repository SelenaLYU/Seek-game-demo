import test from 'node:test';
import assert from 'node:assert/strict';
import { landingSurface, glideStep, ropePoint, onChairSeat, resolveDeskMotion, collapsePosition, paperStormFrame, PAPER_STORM, COLLAPSE, OFFICE_CHECKPOINTS, OFFICE_ROUTE, CHAIR_SEAT } from '../src/gameplay/chapterThreeOffice.ts';

test('office platforms catch descending feet without snapping rising jumps', () => {
  assert.equal(landingSurface(2400, 510, 549)?.top, 530);
  assert.equal(landingSurface(2400, 549, 510), undefined);
  assert.equal(landingSurface(7230, 480, 560), undefined, 'roof gap remains open');
  assert.equal(landingSurface(4500, 280, 550)?.top, 305, 'folder is hit before floor');
});
test('folder can move in all four directions and stays within its flight corridor', () => {
  assert.ok(glideStep(5200, 350, -1, 0, .1).x < 5200);
  assert.ok(glideStep(5200, 350, 1, 0, .1).x > 5200);
  assert.ok(glideStep(5200, 350, 0, -1, .1).y < 350);
  assert.ok(glideStep(5200, 350, 0, 1, .1).y > 350);
  assert.equal(glideStep(4500, 205, -1, -1, 100).y, 205);
});
test('rope reaches the lower landing and each checkpoint is on a solid surface', () => {
  assert.deepEqual(ropePoint(0), { x: 8770, y: 420 });
  assert.deepEqual(ropePoint(1), { x: 9340, y: 930 });
  for (const point of Object.values(OFFICE_CHECKPOINTS)) assert.equal(landingSurface(point.x, point.y - 1, point.y + 1)?.top, point.y);
});

test('chair boost requires feet on the seat, not proximity on the floor or in the air', () => {
  assert.equal(onChairSeat(OFFICE_ROUTE.chair, 530, true), false);
  assert.equal(onChairSeat(OFFICE_ROUTE.chair, CHAIR_SEAT.top, false), false);
  assert.equal(onChairSeat(CHAIR_SEAT.right + 2, CHAIR_SEAT.top, true), false);
  assert.equal(onChairSeat(OFFICE_ROUTE.chair, CHAIR_SEAT.top, true), true);
  assert.equal(landingSurface(OFFICE_ROUTE.chair, 480, 515), CHAIR_SEAT);
});

test('solid desks block walking and crouching from both sides, while jumping onto the top is allowed', () => {
  for (const height of [29,54]) {
    assert.equal(resolveDeskMotion(2600,530,2660,530,height).x,2617);
    assert.equal(resolveDeskMotion(2800,530,2740,530,height).x,2783);
  }
  assert.equal(resolveDeskMotion(2615,455,2620,440).x,2620, 'clear the upper corner while rising');
  assert.equal(landingSurface(2680,445,460)?.top,450);
  assert.equal(resolveDeskMotion(2680,590,2680,575).ceiling,true);
});

test('collapse allows an immediate rooftop run and accelerated rope descent', () => {
  const start=OFFICE_CHECKPOINTS.roof.x-COLLAPSE.lead;
  assert.equal(collapsePosition(start,.5),start);
  assert.equal(collapsePosition(start,2),start, 'two full seconds of warning');
  assert.ok(collapsePosition(start,4)>OFFICE_CHECKPOINTS.roof.x, 'waiting must eventually become fatal');
  const travel=(8710-OFFICE_CHECKPOINTS.roof.x)/285;
  const ropeSeconds=1/.72;
  assert.ok(collapsePosition(start,travel+ropeSeconds)<OFFICE_CHECKPOINTS.phones.x-50, 'running straight through and holding S on the rope remains possible');
  assert.equal(collapsePosition(start,1000),COLLAPSE.stopX);
});

test('distributed paper attacks are staggered, frequent and finish their flights before fading', () => {
  const previous=Array(9).fill(null);
  const exits=[];
  const origins=new Set(); let mixedFrames=0;
  for(let frame=0;frame<36*60;frame++) {
    const time=frame/60;
    const states=Array.from({length:9},(_,i)=>paperStormFrame(time,i));
    for(const [i,state] of states.entries()) {
      const before=previous[i];
      origins.add(state.startX);
      if(before?.visible && !state.visible) {
        assert.ok(before.x<=before.endX+PAPER_STORM.speed/60+1, 'no disappearance in mid-flight');
        assert.ok(before.alpha<.1, 'fade happens at the exit');
        exits.push(time);
      }
      if(before?.visible && state.visible)assert.ok(Math.abs(before.x-state.x-PAPER_STORM.speed/60)<.001,'continuous travel');
      previous[i]=state;
    }
    if(states.some(s=>s.visible) && states.some(s=>!s.visible))mixedFrames++;
  }
  assert.equal(origins.size,9,'nine different launch positions');
  assert.ok(exits.length>=45,'frequent local attacks rather than long global pauses');
  assert.ok(mixedFrames>1800,'emitters do not turn on and off together');
});
