import type {Building} from './construction';

export type ArtBounds={left:number;top:number;right:number;bottom:number};
export type BuildingArt={image:HTMLCanvasElement;pixels:Uint8ClampedArray;bounds:ArtBounds;depth?:Float32Array};
export type PlacedArt={art:BuildingArt;x:number;y:number;scale:number};
export type AtlasBuilding=PlacedArt&{building:Building};

export function atlasBuildingBounds({art,x,y,scale}:PlacedArt):ArtBounds{
  const {left,top,right,bottom}=art.bounds;
  return {left:x+left*scale,top:y+top*scale,right:x+right*scale,bottom:y+bottom*scale};
}

export function paintAtlasBuilding(ctx:CanvasRenderingContext2D,{art,x,y,scale}:PlacedArt,
  offsetX=0,offsetY=0){
  const {left,top,right,bottom}=art.bounds;
  const width=right-left,height=bottom-top;
  // Land the scaled sprite on whole pixels so nearest-neighbor stays sharp.
  ctx.drawImage(art.image,left,top,width,height,
    Math.round(x+left*scale-offsetX),Math.round(y+top*scale-offsetY),
    width*scale,height*scale);
}

export function opaqueArtAt({art,x:left,y:top,scale}:PlacedArt,x:number,y:number){
  const col=Math.floor((x-left)/scale),row=Math.floor((y-top)/scale);
  return col>=0&&row>=0&&col<art.image.width&&row<art.image.height&&
    art.pixels[(row*art.image.width+col)*4+3]>=128;
}

/** Fade foreground foliage only when the actual opaque art overlaps a roof. */
export function overlappingArt(a:PlacedArt,b:PlacedArt){
  const aa=atlasBuildingBounds(a),bb=atlasBuildingBounds(b);
  const left=Math.max(aa.left,bb.left),right=Math.min(aa.right,bb.right);
  const top=Math.max(aa.top,bb.top),bottom=Math.min(aa.bottom,bb.bottom);
  const step=Math.min(a.scale,b.scale)*2;
  for(let y=top+step/2;y<bottom;y+=step)for(let x=left+step/2;x<right;x+=step){
    if(opaqueArtAt(a,x,y)&&opaqueArtAt(b,x,y))return true;
  }
  return false;
}

/** Pick opaque art in reverse paint order so overlapping roofs select the
 * building the player actually clicked. Transparent edges pass through. */
export function atlasBuildingAt(plots:readonly AtlasBuilding[],x:number,y:number){
  for(let i=plots.length-1;i>=0;i--){
    if(opaqueArtAt(plots[i],x,y))return plots[i].building;
  }
}
