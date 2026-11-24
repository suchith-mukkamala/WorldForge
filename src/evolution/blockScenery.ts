import type {BuildingArt,PlacedArt} from './atlasBuildingArt';
import {BLOCK_FACES,type BlockModel} from './blockModels';
import type {DepthCamera} from './depthProjection';
import {rasterFace} from './depthTerrain';
import type {Point} from './motion';

export type BlockView={key:string;xx:number;xy:number;yx:number;yy:number;
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
  const cool=Math.max(0,1-light);
  const warm=Math.max(0,light-1);
  const channel=(shift:number,grade:number)=>Math.min(255,Math.round((base>>shift&255)*(factor+grade)));
  const result=(255<<24|channel(0,cool*.19-warm*.095)<<16|
    channel(8,cool*.05)<<8|channel(16,warm*.11-cool*.11))>>>0;
  colorCache.set(key,result);
  return result;
}

function projectBlock(model:BlockModel,view:BlockView,unit:number,trackDepth=false){
  const {xx,xy,yx,yy,rise,frontX,frontY,depthX,depthY,depthZ}=view;
  const faces=model.faces.filter(f=>{
    const {dx,dy,dz}=BLOCK_FACES[f.direction];
    return dz===1||dx*frontX>0||dy*frontY>0;
  }).map(f=>{
    const {dx,dy,dz}=BLOCK_FACES[f.direction];
    const order=(f.x+dx/2)*depthX+(f.y+dy/2)*depthY+(f.z+dz/2)*depthZ;
    return {f,order};
  });
  if(!trackDepth)faces.sort((a,b)=>a.order-b.order);
  let left=0,top=0,right=0,bottom=0;
  const projected=faces.map(({f})=>{
    const {quad,light}=BLOCK_FACES[f.direction];
    const grain=(Math.imul(f.x,31)^Math.imul(f.y,17)^Math.imul(f.z,13))&3;
    const local=light*(1-(f.occlusion??0)*.105);
    const color=model.sculpted?faceColor(f.color,.88+light*.12,1.5):faceColor(f.color,local,grain);
    const points=quad.map(([u,v,w])=>{
      const x=f.x+u,y=f.y+v,z=f.z+w;
      const sx=(x*xx+y*yx)*unit,sy=(x*xy+y*yy-z*rise)*unit;
      left=Math.min(left,sx);top=Math.min(top,sy);
      right=Math.max(right,sx);bottom=Math.max(bottom,sy);
      return {x:sx,y:sy};
    });
    let depth: {origin:number;dx:number;dy:number}|undefined;
    if(trackDepth){
      const [a,b,,d]=points;
      const u={x:b.x-a.x,y:b.y-a.y},v={x:d.x-a.x,y:d.y-a.y};
      const area=u.x*v.y-u.y*v.x;
      if(Math.abs(area)>1e-9){
        const value=([x,y,z]:readonly number[])=>
          ((f.x+x)*depthX+(f.y+y)*depthY+(f.z+z)*depthZ)*unit;
        const start=value(quad[0]),du=value(quad[1])-start,dv=value(quad[3])-start;
        const dx=(du*v.y-dv*u.y)/area,dy=(dv*u.x-du*v.x)/area;
        depth={dx,dy,origin:start-dx*a.x-dy*a.y};
      }
    }
    return {points,color,depth};
  });
  return {projected,left,top,right,bottom};
}

function rasterBlock(frame:{width:number;height:number},pixels:Uint32Array,
  block:ReturnType<typeof projectBlock>,p:Point,
  trackDepth=false){
  const depths=trackDepth?new Float32Array(pixels.length).fill(-Infinity):undefined;
  for(const {points,color,depth} of block.projected){
    if(depths&&!depth)continue;
    rasterFace(frame,points.map(({x,y})=>({x:x+p.x,y:y+p.y})),pixels,color,undefined,0,
      depths&&depth?{...depth,values:depths,origin:depth.origin-depth.dx*p.x-depth.dy*p.y}:undefined);
  }
  return depths;
}

function paintBlockRaster(ctx:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,
  block:ReturnType<typeof projectBlock>,p:Point,
  trackDepth=false){
  const image=ctx.createImageData(ctx.canvas.width,ctx.canvas.height);
  const depth=rasterBlock(image,new Uint32Array(image.data.buffer),block,p,trackDepth);
  ctx.putImageData(image,0,0);
  return {pixels:image.data,depth};
}

/** The SVG settlement preview can share cube art without a browser canvas. */
export function blockRasterPixels(model:BlockModel,view:BlockView,unit:number,
  width:number,height:number,p:Point):Uint32Array{
  const pixels=new Uint32Array(width*height);
  rasterBlock({width,height},pixels,projectBlock(model,view,unit),p);
  return pixels;
}

export function paintBlockModel(ctx:CanvasRenderingContext2D,model:BlockModel,
  p:Point,view:BlockView,unit:number){
  const block=projectBlock(model,view,unit);
  paintBlockRaster(ctx,block,p);
  return {left:block.left+p.x,top:block.top+p.y,right:block.right+p.x,bottom:block.bottom+p.y};
}

const STAMP_DENSITY=4;
export type BlockImage={image:HTMLCanvasElement;anchor:Point;density:number};
export type BlockStamp=BuildingArt&BlockImage;
const propCache=new Map<string,BlockStamp>();
const largePropCache=new Map<string,BlockStamp>();

export function blockBuildingArt(cache:Map<string,BlockStamp>,model:BlockModel,
  view:BlockView,unit:number,trackDepth=false):BlockStamp|undefined{
  const key=[model.key,view.key,unit,+trackDepth].join('|'),cached=cache.get(key);
  if(cached)return cached;
  const art=createBlockStamp(model,view,unit,trackDepth);
  if(!art)return;
  if(cache.size>=(model.sculpted||art.density===1?5:200))cache.delete(cache.keys().next().value!);
  cache.set(key,art);
  return art;
}

function stampBlock<Canvas extends HTMLCanvasElement|OffscreenCanvas>(model:BlockModel,view:BlockView,
  unit:number,trackDepth:boolean,canvas:()=>Canvas){
  const density=model.sculpted?3:unit>=10?1:STAMP_DENSITY;
  const block=projectBlock(model,view,unit*density,trackDepth);
  // Size the sprite to the real projected geometry, including extended
  // footings and shore decks beyond their original fixed-size canvas.
  const anchor={x:1-Math.floor(block.left),y:1-Math.floor(block.top)};
  const image=canvas();
  image.width=Math.ceil(block.right)+anchor.x+1;
  image.height=Math.ceil(block.bottom)+anchor.y+1;
  const painter=image.getContext('2d') as CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D|null;
  if(!painter)return;
  const raster=paintBlockRaster(painter,block,anchor,trackDepth);
  const bounds={left:0,top:0,right:image.width,bottom:image.height};
  return {image,anchor,...raster,bounds,density};
}

export function createBlockStamp(model:BlockModel,view:BlockView,unit:number,trackDepth=false):BlockStamp|undefined{
  return stampBlock(model,view,unit,trackDepth,()=>document.createElement('canvas'));
}

export function createBlockBitmap(model:BlockModel,view:BlockView,unit:number,trackDepth=false){
  const art=stampBlock(model,view,unit,trackDepth,()=>new OffscreenCanvas(1,1));
  return art&&{...art,image:art.image.transferToImageBitmap()};
}

export function paintBlockScenery(ctx:CanvasRenderingContext2D,model:BlockModel,
  p:Point,view:BlockView,unit:number,waterAt?:(x:number,y:number)=>boolean):void{
  const sprite=blockSceneryArt(model,p,view,unit);
  if(!sprite)return;
  if(waterAt)paintBlockReflection(ctx,sprite,p.y+2,waterAt);
  paintPlacedBlock(ctx,sprite);
}

export function paintPlacedBlock(ctx:CanvasRenderingContext2D,{art:{image},x,y,scale}:
  Pick<PlacedArt,'x'|'y'|'scale'>&{art:Pick<BuildingArt,'image'>}){
  ctx.drawImage(image,x,y,image.width*scale,image.height*scale);
}

export function blockSceneryArt(model:BlockModel,p:Point,view:BlockView,unit:number,trackDepth=false){
  const art=blockBuildingArt(model.sculpted||unit>=10?largePropCache:propCache,model,view,unit,trackDepth);
  return art&&placeBlockArt(art,p,1);
}

export function placeBlockArt<T extends Pick<BlockImage,'anchor'|'density'>>(art:T,p:Point,unit:number){
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

/** Compress the hull and sails into broken square bands below the waterline. */
function paintBlockReflection(ctx:CanvasRenderingContext2D,sprite:PlacedArt,line:number,
  waterAt:(x:number,y:number)=>boolean):void{
  const {art,x,y,scale}=sprite;
  const squeeze=.49,reach=Math.floor(Math.min(17,(line-y)*squeeze));
  const left=Math.floor(x),right=Math.ceil(x+art.image.width*scale),top=Math.round(line);
  if(reach<=0)return;
  ctx.save();ctx.beginPath();
  for(let row=0;row<reach;row+=3){
    const shift=row%6===0?-1:1;
    for(let col=left;col<right;col+=3){
      const x=col+shift,y=top+row;
      if(waterAt(x,y)&&waterAt(x+2.99,y)&&waterAt(x,y+1.99)&&waterAt(x+2.99,y+1.99))
        ctx.rect(x,y,3,2);
    }
  }
  ctx.clip();
  ctx.globalAlpha=.25;
  ctx.transform(1,0,0,-squeeze,0,top*(1+squeeze));
  ctx.drawImage(art.image,x,y,art.image.width*scale,art.image.height*scale);
  ctx.restore();
}
