import type {Building} from './construction';

export type ArtBounds={left:number;top:number;right:number;bottom:number};
export type BuildingArt={image:HTMLCanvasElement;pixels:Uint8ClampedArray;bounds:ArtBounds};
export type AtlasBuilding={building:Building;art:BuildingArt;x:number;y:number;scale:number};

export function cacheBuildingArt(cache:Map<string,BuildingArt>,key:string,size:number,
  paint:(ctx:CanvasRenderingContext2D)=>ArtBounds):BuildingArt|undefined{
  const cached=cache.get(key);
  if(cached)return cached;
  const image=document.createElement('canvas');
  image.width=image.height=size;
  const ctx=image.getContext('2d',{willReadFrequently:true});
  if(!ctx)return;
  const {left,top,right,bottom}=paint(ctx);
  const bounds={left:Math.max(0,Math.floor(left)-1),top:Math.max(0,Math.floor(top)-1),
    right:Math.min(size,Math.ceil(right)+1),bottom:Math.min(size,Math.ceil(bottom)+1)};
  const art={image,pixels:ctx.getImageData(0,0,size,size).data,bounds};
  if(cache.size>=200)cache.clear();
  cache.set(key,art);
  return art;
}

export function atlasBuildingBounds({art,x,y,scale}:AtlasBuilding):ArtBounds{
  const {left,top,right,bottom}=art.bounds;
  return {left:x+left*scale,top:y+top*scale,right:x+right*scale,bottom:y+bottom*scale};
}

export function paintAtlasBuilding(ctx:CanvasRenderingContext2D,placed:AtlasBuilding){
  const {art,x,y,scale}=placed;
  const {left,top,right,bottom}=art.bounds;
  const width=right-left,height=bottom-top;
  ctx.drawImage(art.image,left,top,width,height,x+left*scale,y+top*scale,width*scale,height*scale);
}

/** Pick opaque art in reverse paint order so overlapping roofs select the
 * building the player actually clicked. Transparent edges pass through. */
export function atlasBuildingAt(plots:readonly AtlasBuilding[],x:number,y:number){
  for(let i=plots.length-1;i>=0;i--){
    const {building,art,x:left,y:top,scale}=plots[i];
    const col=Math.floor((x-left)/scale),row=Math.floor((y-top)/scale);
    if(col>=0&&row>=0&&col<art.image.width&&row<art.image.height&&
      art.pixels[(row*art.image.width+col)*4+3]>=128)return building;
  }
}
