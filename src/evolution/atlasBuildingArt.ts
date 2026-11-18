import type {Building} from './construction';

export type BuildingArt={image:HTMLCanvasElement;pixels:Uint8ClampedArray};
export type AtlasBuilding={building:Building;art:BuildingArt;x:number;y:number;scale:number};

export function cacheBuildingArt(cache:Map<string,BuildingArt>,key:string,size:number,
  paint:(ctx:CanvasRenderingContext2D)=>void):BuildingArt|undefined{
  const cached=cache.get(key);
  if(cached)return cached;
  const image=document.createElement('canvas');
  image.width=image.height=size;
  const ctx=image.getContext('2d',{willReadFrequently:true});
  if(!ctx)return;
  paint(ctx);
  const art={image,pixels:ctx.getImageData(0,0,size,size).data};
  if(cache.size>=200)cache.clear();
  cache.set(key,art);
  return art;
}

export function paintAtlasBuilding(ctx:CanvasRenderingContext2D,placed:AtlasBuilding){
  const {art,x,y,scale}=placed;
  ctx.drawImage(art.image,x,y,art.image.width*scale,art.image.height*scale);
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
