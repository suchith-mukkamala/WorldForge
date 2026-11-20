import {cacheBuildingArt,type BuildingArt} from './atlasBuildingArt';
import {BLOCK_FACES,type BlockModel} from './blockModels';
import type {DepthCamera} from './depthProjection';
import type {Point} from './motion';

type BlockView={key:string;xx:number;xy:number;yx:number;yy:number;
  rise:number;frontX:number;frontY:number;depthX:number;depthY:number;depthZ:number};

/** Orthographic projection with the same horizontal axes as the atlas.
 * Elevation exaggerates the land independently of the size of a cube. */
export function depthBlockView({yaw,pitch}:DepthCamera):BlockView{
  const angle=yaw*Math.PI/180,tilt=pitch*Math.PI/180;
  const c=Math.cos(angle),s=Math.sin(angle),lift=Math.sin(tilt),fall=Math.cos(tilt);
  const aheadX=s+c,aheadY=c-s;
  const sign=(n:number)=>Math.abs(n)<1e-8?0:Math.sign(n);
  return {key:yaw+':'+pitch,xx:aheadY,xy:aheadX*lift,
    yx:-aheadX,yy:aheadY*lift,rise:Math.SQRT2*fall,
    frontX:sign(aheadX),frontY:sign(aheadY),
    depthX:aheadX*fall,depthY:aheadY*fall,depthZ:Math.SQRT2*lift};
}
export const OVERHEAD_BLOCK_VIEW=depthBlockView({yaw:315,pitch:70});
export const DESCENT_BLOCK_VIEW=depthBlockView({yaw:318,pitch:50});

const colorCache=new Map<string,string>();
function faceColor(color:string,light:number,tone:number):string{
  const key=color+':'+light+':'+tone;
  const cached=colorCache.get(key);
  if(cached)return cached;
  const base=parseInt(color.slice(1),16),factor=light*(.91+.06*tone);
  const channel=(shift:number)=>Math.min(255,Math.round((base>>shift&255)*factor));
  const result='rgb('+channel(16)+','+channel(8)+','+channel(0)+')';
  colorCache.set(key,result);
  return result;
}

export function paintBlockModel(ctx:CanvasRenderingContext2D,model:BlockModel,
  p:Point,view:BlockView,unit:number){
  const {xx,xy,yx,yy,rise,frontX,frontY,depthX,depthY,depthZ}=view;
  const faces=model.faces.filter(f=>{
    const {dx,dy,dz}=BLOCK_FACES[f.direction];
    return dz===1||dx*frontX>0||dy*frontY>0;
  }).map(f=>{
    const {dx,dy,dz}=BLOCK_FACES[f.direction];
    const order=(f.x+dx/2)*depthX+(f.y+dy/2)*depthY+(f.z+dz/2)*depthZ;
    return {f,order};
  }).sort((a,b)=>a.order-b.order);
  let left=p.x,top=p.y,right=p.x,bottom=p.y;
  ctx.lineWidth=unit*.08;
  for(const {f} of faces){
    const {quad,light}=BLOCK_FACES[f.direction];
    const grain=(Math.imul(f.x,31)^Math.imul(f.y,17)^Math.imul(f.z,13))&3;
    const color=faceColor(f.color,light,grain);
    ctx.fillStyle=color;ctx.strokeStyle=color;
    ctx.beginPath();
    for(let i=0;i<quad.length;i++){
      const [u,v,w]=quad[i],x=f.x+u,y=f.y+v,z=f.z+w;
      const sx=p.x+(x*xx+y*yx)*unit,sy=p.y+(x*xy+y*yy-z*rise)*unit;
      left=Math.min(left,sx);top=Math.min(top,sy);
      right=Math.max(right,sx);bottom=Math.max(bottom,sy);
      if(i===0)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy);
    }
    ctx.closePath();ctx.fill();ctx.stroke();
  }
  return {left,top,right,bottom};
}

const STAMP_DENSITY=2;
const STAMP_SIZE=112;
export const BLOCK_ANCHOR={x:STAMP_SIZE/2,y:STAMP_SIZE-30};
const propCache=new Map<string,{image:HTMLCanvasElement;x:number;y:number;w:number;h:number}>();
const artKey=(model:BlockModel,view:BlockView,unit:number)=>
  [model.key,view.key,unit].join('|');

export function paintBlockScenery(ctx:CanvasRenderingContext2D,model:BlockModel,
  p:Point,view:BlockView,unit:number):void{
  const key=artKey(model,view,unit);
  let sprite=propCache.get(key);
  if(!sprite){
    const image=document.createElement('canvas');
    image.width=image.height=STAMP_SIZE;
    const painter=image.getContext('2d');
    if(!painter)return;
    const {left,top,right,bottom}=paintBlockModel(painter,model,BLOCK_ANCHOR,view,unit*STAMP_DENSITY);
    const x=Math.max(0,Math.floor(left)-1),y=Math.max(0,Math.floor(top)-1);
    sprite={image,x,y,w:Math.min(STAMP_SIZE,Math.ceil(right)+1)-x,
      h:Math.min(STAMP_SIZE,Math.ceil(bottom)+1)-y};
    if(propCache.size>=180)propCache.clear();
    propCache.set(key,sprite);
  }
  const {image,x,y,w,h}=sprite;
  ctx.drawImage(image,x,y,w,h,
    p.x+(x-BLOCK_ANCHOR.x)/STAMP_DENSITY,p.y+(y-BLOCK_ANCHOR.y)/STAMP_DENSITY,
    w/STAMP_DENSITY,h/STAMP_DENSITY);
}

export function blockBuildingArt(cache:Map<string,BuildingArt>,model:BlockModel,
  view:BlockView,unit:number):BuildingArt|undefined{
  return cacheBuildingArt(cache,artKey(model,view,unit),STAMP_SIZE,painter=>
    paintBlockModel(painter,model,BLOCK_ANCHOR,view,unit*STAMP_DENSITY));
}

/** Art and alpha picking use the same source-pixel transform. */
export const blockStampScale=(scale:number)=>scale/STAMP_DENSITY;
