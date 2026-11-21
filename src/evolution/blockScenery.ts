import type {BuildingArt} from './atlasBuildingArt';
import {BLOCK_FACES,type BlockModel} from './blockModels';
import type {DepthCamera} from './depthProjection';
import {rasterFace} from './depthTerrain';
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

const colorCache=new Map<string,number>();
function faceColor(color:string,light:number,tone:number):number{
  const key=color+':'+light+':'+tone;
  const cached=colorCache.get(key);
  if(cached)return cached;
  const base=parseInt(color.slice(1),16),factor=light*(.94+.04*tone);
  const channel=(shift:number)=>Math.min(255,Math.round((base>>shift&255)*factor));
  const result=(255<<24|channel(0)<<16|channel(8)<<8|channel(16))>>>0;
  colorCache.set(key,result);
  return result;
}

function projectBlock(model:BlockModel,view:BlockView,unit:number){
  const {xx,xy,yx,yy,rise,frontX,frontY,depthX,depthY,depthZ}=view;
  const faces=model.faces.filter(f=>{
    const {dx,dy,dz}=BLOCK_FACES[f.direction];
    return dz===1||dx*frontX>0||dy*frontY>0;
  }).map(f=>{
    const {dx,dy,dz}=BLOCK_FACES[f.direction];
    const order=(f.x+dx/2)*depthX+(f.y+dy/2)*depthY+(f.z+dz/2)*depthZ;
    return {f,order};
  }).sort((a,b)=>a.order-b.order);
  let left=0,top=0,right=0,bottom=0;
  const projected=faces.map(({f})=>{
    const {quad,light}=BLOCK_FACES[f.direction];
    const grain=(Math.imul(f.x,31)^Math.imul(f.y,17)^Math.imul(f.z,13))&3;
    const color=faceColor(f.color,light,grain);
    const points=quad.map(([u,v,w])=>{
      const x=f.x+u,y=f.y+v,z=f.z+w;
      const sx=(x*xx+y*yx)*unit,sy=(x*xy+y*yy-z*rise)*unit;
      left=Math.min(left,sx);top=Math.min(top,sy);
      right=Math.max(right,sx);bottom=Math.max(bottom,sy);
      return {x:sx,y:sy};
    });
    return {points,color};
  });
  return {projected,left,top,right,bottom};
}

function paintBlockRaster(ctx:CanvasRenderingContext2D,block:ReturnType<typeof projectBlock>,p:Point){
  const image=ctx.createImageData(ctx.canvas.width,ctx.canvas.height);
  const pixels=new Uint32Array(image.data.buffer);
  for(const {points,color} of block.projected)
    rasterFace(image,points.map(({x,y})=>({x:x+p.x,y:y+p.y})),pixels,color);
  ctx.putImageData(image,0,0);
  return image.data;
}

export function paintBlockModel(ctx:CanvasRenderingContext2D,model:BlockModel,
  p:Point,view:BlockView,unit:number){
  const block=projectBlock(model,view,unit);
  paintBlockRaster(ctx,block,p);
  return {left:block.left+p.x,top:block.top+p.y,right:block.right+p.x,bottom:block.bottom+p.y};
}

const STAMP_DENSITY=4;
export type BlockStamp=BuildingArt&{anchor:Point;density:number};
const propCache=new Map<string,BlockStamp>();
const largePropCache=new Map<string,BlockStamp>();

export function blockBuildingArt(cache:Map<string,BlockStamp>,model:BlockModel,
  view:BlockView,unit:number):BlockStamp|undefined{
  const key=[model.key,view.key,unit].join('|'),cached=cache.get(key);
  if(cached)return cached;
  const density=unit>=10?1:STAMP_DENSITY;
  const block=projectBlock(model,view,unit*density);
  // Size the sprite to the real projected geometry, including extended
  // footings and shore decks beyond their original fixed-size canvas.
  const anchor={x:1-Math.floor(block.left),y:1-Math.floor(block.top)};
  const image=document.createElement('canvas');
  image.width=Math.ceil(block.right)+anchor.x+1;
  image.height=Math.ceil(block.bottom)+anchor.y+1;
  const painter=image.getContext('2d');
  if(!painter)return;
  const pixels=paintBlockRaster(painter,block,anchor);
  const bounds={left:0,top:0,right:image.width,bottom:image.height};
  const art={image,anchor,pixels,bounds,density};
  if(cache.size>=(density===1?4:200))cache.clear();
  cache.set(key,art);
  return art;
}

export function paintBlockScenery(ctx:CanvasRenderingContext2D,model:BlockModel,
  p:Point,view:BlockView,unit:number):void{
  const sprite=blockSceneryArt(model,p,view,unit);
  if(!sprite)return;
  const {art:{image},x,y,scale}=sprite;
  ctx.drawImage(image,x,y,image.width*scale,image.height*scale);
}

export function blockSceneryArt(model:BlockModel,p:Point,view:BlockView,unit:number){
  const art=blockBuildingArt(unit>=10?largePropCache:propCache,model,view,unit);
  return art&&placeBlockArt(art,p,1);
}

export function placeBlockArt(art:BlockStamp,p:Point,unit:number){
  const scale=unit/art.density;
  return {art,x:p.x-art.anchor.x*scale,y:p.y-art.anchor.y*scale,scale};
}

const contactBounds=new WeakMap<BlockModel,{left:number;top:number;right:number;bottom:number}>();
/** A short contact shadow on the ground plane of the overhead scenes. */
export function paintBlockContact(ctx:CanvasRenderingContext2D,model:BlockModel,
  p:Point,view:BlockView,unit:number):void{
  if(!model.feet.length)return;
  let bounds=contactBounds.get(model);
  if(!bounds){
    const xs=model.feet.map(f=>f.x),ys=model.feet.map(f=>f.y);
    bounds={left:Math.min(...xs)-.35,top:Math.min(...ys)-.35,
      right:Math.max(...xs)+1.35,bottom:Math.max(...ys)+1.35};
    contactBounds.set(model,bounds);
  }
  const {left,top,right,bottom}=bounds;
  ctx.fillStyle='#192b2370';
  ctx.beginPath();
  for(const [i,[x,y]] of [[left,top],[right,top],[right,bottom],[left,bottom]].entries()){
    const px=p.x+(x*view.xx+y*view.yx)*unit,py=p.y+(x*view.xy+y*view.yy)*unit;
    if(i)ctx.lineTo(px,py);
    else ctx.moveTo(px,py);
  }
  ctx.closePath();ctx.fill();
}

/** Art and alpha picking use the same source-pixel transform. */
export const blockStampScale=(scale:number)=>scale/STAMP_DENSITY;
