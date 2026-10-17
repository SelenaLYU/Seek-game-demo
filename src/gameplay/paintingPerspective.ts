export type Point = { x: number; y: number };
export const PAINTING_WIDTH = 1100;
export const PAINTING_HEIGHT = 688;
export const PAINTING_MARK = { x: 555, y: 330 };
export const RADIUS = 165;
export const REST: Point = { x: 565, y: 315 };
export const START: Point = { x: 795, y: 440 };
export const ARC = [[180, 280], [280, 390], [30, 180]];
// Landmarks trace actual branch, cliff and bank silhouettes; never drawn as lines.
const CONTOURS: Point[][] = [
  [[251,540],[275,430],[343,350],[417,286],[490,260],[560,270],[630,280]],
  [[890,178],[925,240],[972,300],[1007,355],[1007,410],[990,465],[960,510],[920,550]],
  [[1510,520],[1610,560],[1730,580],[1850,590],[1970,560],[2110,482]],
].map(c=>c.map(([x,y])=>({x,y})));
export const CROP = [
  {x:0,y:0,w:800,h:724}, {x:790,y:140,w:670,h:584}, {x:1460,y:445,w:712,h:279},
];
export function circlePoint(degrees:number):Point {
  const a=degrees*Math.PI/180;
  return {x:PAINTING_MARK.x+RADIUS*Math.cos(a),y:PAINTING_MARK.y+RADIUS*Math.sin(a)};
}
/** Monotone strip coordinates preserve orientation. Every textured pixel of a patch
 * shares the same mapping, including foliage, rock texture and its natural edge. */
export function alignedPoint(p:Point,layer:number):Point {
  const contour=CONTOURS[layer], vertical=layer===1;
  const axis=(v:Point)=>vertical?v.y:v.x;
  // Outside the traced edge, preserve the canopy/root mass rather than extending
  // the edge's steep tangent through the entire tree or cliff.
  const end=axis(p)<axis(contour[0])?0:axis(p)>axis(contour[contour.length-1])?contour.length-1:-1;
  if(end>=0){
    const angle=layer===2?ARC[layer][end===0?1:0]:ARC[layer][end===0?0:1];
    const q=circlePoint(angle),a=contour[end];
    const y=q.y+(p.y-a.y)*.72;
    const influence=Math.exp(-(((p.y-a.y)/155)**2));
    return {x:q.x+(p.x-a.x)*.72,y:layer===0?(p.y*.72-40)*(1-influence)+y*influence:y};
  }
  let k=0;
  while(k<contour.length-2&&axis(p)>axis(contour[k+1]))k++;
  const a=contour[k],b=contour[k+1],t=(axis(p)-axis(a))/(axis(b)-axis(a));
  const span=ARC[layer];
  const degrees=(n:number)=>layer===2?span[1]-(span[1]-span[0])*n/(contour.length-1):span[0]+(span[1]-span[0])*n/(contour.length-1);
  const q=circlePoint(degrees(k)),r=circlePoint(degrees(k+1));
  const x=q.x+(r.x-q.x)*t,y=q.y+(r.y-q.y)*t;
  const offset=p.y-a.y-(b.y-a.y)*t;
  const edgeY=y+offset*.72;
  const influence=Math.exp(-((offset/155)**2));
  return vertical?{x:x+(p.x-a.x-(b.x-a.x)*t)*.7,y}
    :{x,y:layer===0?(p.y*.72-40)*(1-influence)+edgeY*influence:edgeY};
}

// One camera, one vanishing-point control. Scenery remains at different world depths.
const DEPTHS=[560,1500,950];
export function projectAtDepth(p:Point,depth:number,handle:Point):Point {
  const dx=handle.x-REST.x,dy=handle.y-REST.y,f=950;
  const x=(p.x-PAINTING_MARK.x)*depth/f-dx*.65;
  const y=(p.y-PAINTING_MARK.y)*depth/f-dy*.55;
  const z=depth-dy*.5;
  const yaw=dx*.00022,pitch=dy*.00018;
  const rx=x*Math.cos(yaw)-z*Math.sin(yaw),rz=x*Math.sin(yaw)+z*Math.cos(yaw);
  const ry=y*Math.cos(pitch)-rz*Math.sin(pitch),zz=y*Math.sin(pitch)+rz*Math.cos(pitch);
  return {x:PAINTING_MARK.x+f*rx/zz+dx*.45,y:PAINTING_MARK.y+f*ry/zz+dy*.35};
}
export function projectPoint(p:Point,layer:number,handle:Point):Point {
  return projectAtDepth(p,DEPTHS[layer],handle);
}
/** One continuous ground mesh, pinned only at the canvas perimeter. */
export function projectGround(p:Point,handle:Point):Point {
  const depth=4000-3300*Math.max(0,Math.min(1,(p.y-210)/(PAINTING_HEIGHT-210)));
  const q=projectAtDepth(p,depth,handle);
  const edge=Math.sin(Math.PI*p.x/PAINTING_WIDTH)*Math.sin(Math.PI*p.y/PAINTING_HEIGHT);
  return {x:p.x+(q.x-p.x)*edge,y:p.y+(q.y-p.y)*edge};
}
export function seamPoints(handle:Point):[Point,Point][] {
  return ARC.map((span,i)=>[
    projectPoint(circlePoint(span[1]),i,handle),
    projectPoint(circlePoint(ARC[(i+1)%3][0]),(i+1)%3,handle),
  ]);
}
export function alignmentError(handle:Point):number {
  return Math.max(...seamPoints(handle).map(([a,b])=>Math.hypot(a.x-b.x,a.y-b.y)));
}
export function isAligned(handle:Point):boolean {return alignmentError(handle)<13;}
