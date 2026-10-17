import Phaser from 'phaser';
import skyUrl from '../../art/chapter3/painting-world/phase2/sky.webp?url';
import whaleUrl from '../../art/chapter3/painting-world/phase2/whale.webp?url';
import terrainUrl from '../../art/chapter3/painting-world/phase2/terrain.webp?url';
import plantsUrl from '../../art/chapter3/painting-world/phase2/botanicals.webp?url';
import effectsUrl from '../../art/chapter3/painting-world/phase2/effects.webp?url';
import vineUrl from '../../art/chapter3/painting-world/phase2/vine.webp?url';
import { PIGMENTS, hasPigment, type PaintingLife, type LifeTarget } from '../gameplay/paintingLife';

export type PaintedHotspot={id:string;x:number;y:number;rx:number;ry:number};
type Layer={image:Phaser.GameObjects.Image;fx?:Phaser.FX.ColorMatrix;colour:number};
const ASSETS={sky:skyUrl,whale:whaleUrl,terrain:terrainUrl,plants:plantsUrl,effects:effectsUrl,vine:vineUrl};
const key=(name:string)=>'colour-watercolour-'+name;

/** Independent watercolour layers retain their pigment texture even while dormant. */
export class ColorWatercolorWorld {
  private layers=new Map<string,Layer>();
  private dt=0;
  constructor(private scene:Phaser.Scene){
    this.frames('whale',1,1);this.frames('terrain',1,1);this.frames('vine',1,1);
    this.frames('plants',3,2);this.frames('effects',3,2);
  }
  static preload(scene:Phaser.Scene){
    for(const [name,url] of Object.entries(ASSETS))if(!scene.textures.exists(key(name)))scene.load.image(key(name),url);
  }
  private frames(name:string,cols:number,rows:number){
    const texture=this.scene.textures.get(key(name));if(texture.has('0'))return;
    const source=texture.getSourceImage() as HTMLImageElement;
    const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(source,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    // Trim only each cell's transparent padding; soft pigment edges stay in the frame.
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const xs=name==='plants'?[0,535/1536,1010/1536,1]:[0,1/3,2/3,1];
      const ys=name==='plants'?[0,556/1024,1]:[0,.5,1];
      const x0=cols===1?0:Math.floor(xs[col]*canvas.width),x1=cols===1?canvas.width:Math.floor(xs[col+1]*canvas.width);
      const y0=rows===1?0:Math.floor(ys[row]*canvas.height),y1=rows===1?canvas.height:Math.floor(ys[row+1]*canvas.height);
      let l=x1,r=x0,t=y1,b=y0;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(pixels[(y*canvas.width+x)*4+3]>5){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
      if(r<l){l=x0;r=x1-1;t=y0;b=y1-1;}
      l=Math.max(x0,l-3);r=Math.min(x1-1,r+3);t=Math.max(y0,t-3);b=Math.min(y1-1,b+3);
      texture.add(String(row*cols+col),0,l,t,r-l+1,b-t+1);
    }
  }
  private paint(id:string,asset:string,frame:number,x:number,y:number,w:number,h:number,depth:number,colour=1,alpha=1,originY=.5){
    let layer=this.layers.get(id);
    if(!layer){
      const image=this.scene.add.image(x,y,key(asset),asset==='sky'?undefined:String(frame));
      layer={image,colour};this.layers.set(id,layer);
    }
    layer.colour=Phaser.Math.Linear(layer.colour,colour,Math.min(1,this.dt*2));
    // Full-colour particles need no offscreen FX passes.
    if(layer.colour<.999&&!layer.fx)layer.fx=layer.image.preFX?.addColorMatrix();
    // Unsolved objects keep their own opaque grey wash as the terrain gains colour.
    const smallTarget=/roots|seeds|reflection|rain-cloud|Socket|ring-trace/.test(id);
    layer.fx?.saturate(-(1-layer.colour)).brightness(1-(smallTarget?.32:.12)*(1-layer.colour),true);
    const image=layer.image,scale=Math.min(w/image.frame.width,h/image.frame.height);
    image.setOrigin(.5,originY).setPosition(x,y).setScale(scale).setDepth(depth).setAlpha(alpha).setVisible(alpha>.001).setAngle(0).setFlipY(false);
    return image;
  }
  draw(s:PaintingLife,t:number,dt:number,lift:number,growth:number,life:number):PaintedHotspot[]{
    this.dt=dt;this.layers.forEach(l=>l.image.setVisible(false));
    const hotspots:PaintedHotspot[]=[];
    const hit=(id:string,x:number,y:number,rx:number,ry:number)=>hotspots.push({id,x,y,rx,ry});
    const drift=-lift*22+(s.awake?Math.sin(t*.8)*2.5:0);
    this.paint('sky','sky',0,640,400,1300,820,-10,1);
    this.paint('sun','effects',0,195,125,165,165,1,1);hit('sun',195,125,77,77);
    this.paint('blue-cloud','effects',1,407,100,153,76,1,1);hit('sky',407,100,77,38);
    this.paint('rain-cloud','effects',2,880,110,285,125,1,s.rainStarted?1:0);hit('cloud',880,110,142,62);
    this.paint('rain-pigment','effects',1,880,110,235,90,2,1,s.rainStarted?.6:0);
    this.paint('whale','whale',0,640,535+drift,1250,460,2,s.lifted?1:0);
    if(s.awake&&!s.lifted){
      // Recolour luminance into warm gold, retaining the whale's original brushwork.
      // Multiplying a blue sprite by yellow would turn it dark instead.
      const whale=this.layers.get('whale')!;
      whale.fx??=whale.image.preFX?.addColorMatrix();
      whale.fx?.set([
        .26,.51,.23,0,45,
        .21,.41,.18,0,12,
        .09,.18,.08,0,3,
        0,0,0,1,0
      ]);
    }
    hit('whale',720,625+drift,460,80);hit('whale',120,545+drift,105,65);
    this.paint('terrain','terrain',0,675,438+drift,1010,295,3,life);
    const tree=this.paint('green-tree','plants',0,325,435+drift,260,235,5,s.greenFound?1:0,1,1);
    tree.setAngle(Math.sin(t*.55)*.5);
    if(s.greenFound)hit('leaves',325,300+drift,100,70);
    hit('roots',350,460+drift,85,48);
    this.paint('roots','plants',4,350,460+drift,185,105,6,hasPigment(s,'green','roots')?1:0);
    for(const [id,x,y,active] of [['garden',625,385,s.links.garden],['lake',975,447,s.links.lake]] as const){
      const dx=x-350,dy=y-445;
      const root=this.paint('root-'+id,'vine',0,350+dx/2,445+dy/2+drift,Math.hypot(dx,dy),45,6,1,active?1:0);
      root.setDisplaySize(Math.hypot(dx,dy),44).setAngle(Math.atan2(dy,dx)*180/Math.PI);
    }
    this.paint('seeds','plants',3,642,374+drift,165,85,7,hasPigment(s,'orange','garden')?1:0,1-growth);
    hit('garden',642,377+drift,90,48);
    const flowers=this.paint('flowers','plants',1,642,380+drift,260*Math.max(.01,growth),285*Math.max(.01,growth),7,1,growth,1);
    flowers.setAngle(Math.sin(t*.7)*1.1*growth);
    if(s.grown&&growth>.15)hit('flowers',642,250+drift,110,110);
    if(s.watered&&!s.grown){
      // A warm watercolour glint sits on the seeds, not a caption or a hard halo.
      this.paint('seed-warmth','effects',0,642,371+drift,140,70,6,1,.12+.06*Math.sin(t*2));
    }
    hit('lake',1000,449+drift,140,48);
    this.paint('tree-reflection','plants',2,920,453+drift,92,90,6,s.treeReal?1:0,.92).setFlipY(true);
    this.paint('door-reflection','plants',5,1015,456+drift,86,108,6,s.doorReal?1:0,.96).setFlipY(true);
    this.paint('flower-reflection','plants',1,1100,453+drift,65,86,6,hasPigment(s,'purple','reflectionFlower')?1:0,.90).setFlipY(true);
    hit('reflectionTree',920,453+drift,40,43);hit('reflectionDoor',1015,456+drift,38,50);hit('reflectionFlower',1100,453+drift,30,40);
    this.paint('coral-tree','plants',2,1020,408+drift,245,215,7,1,s.treeReal?1:0,1).setAngle(Math.sin(t*.6)*.7);
    this.paint('real-door','plants',5,1005,380+drift,145,180,8,1,s.doorReal?1:0,1);
    this.paint('extra-flower','plants',1,1120,409+drift,80,100,8,1,hasPigment(s,'purple','reflectionFlower')?1:0,1);
    if(s.rainStarted)for(let i=0;i<22;i++){
      const f=(i/22+t*.32)%1;
      this.paint('rain'+i,'effects',4,880+(642-880)*f+(i%5-2)*12,157+(365+drift-157)*f,7,18,9,1,Math.sin(f*Math.PI)*.65).setAngle(35);
    }
    if(s.grown)for(let i=0;i<(s.complete?14:5);i++){
      const x=220+(i*153+t*14)%880,y=180+Math.sin(t*.5+i*2)*70;
      this.paint('fish'+i,'effects',3,x,y,29,19,9,1,.65).setAngle(Math.cos(t*.5+i*2)*8);
    }
    if(s.doorReal){
      // The central circle spans the flower tips (75) to the whale's underside (735).
      const cx=640,cy=405,radius=330;
      // Keep the interior open so the world and its pigment sources remain visible.
      for(let i=0;i<96;i++){
        const a=i*Math.PI/48;
        this.paint('ring-trace'+i,'effects',4,cx+radius*Math.cos(a),cy+radius*Math.sin(a),20,32,10,s.complete?1:0,.85).setAngle(a*180/Math.PI);
      }
      for(const [i,c] of PIGMENTS.entries()){
        const a=-Math.PI/2+i*Math.PI/2,x=cx+radius*Math.cos(a),y=cy+radius*Math.sin(a);
        const filled=hasPigment(s,c,(c+'Socket') as LifeTarget);
        const asset=i<2?'effects':'plants',frame=[1,0,0,1][i];
        this.paint(c+'Socket-bed','effects',2,x,y,102,94,11,1,1);
        this.paint(c+'Socket',asset,frame,x,y,80,80,12,filled?1:0,1);
        // A small coloured pigment sample remains beside each empty grey silhouette.
        this.paint(c+'Socket-colour',asset,frame,x+38,y+31,30,30,13,1,filled?0:1);
        hit(c+'Socket',x,y,44,44);
      }
      if(s.complete){this.paint('seal','effects',5,cx,cy,125,125,14,1,.85+.15*Math.sin(t));hit('seal',cx,cy,55,55);}
    }
    return hotspots;
  }
  destroy(){this.layers.forEach(l=>l.image.destroy());this.layers.clear();}
}
