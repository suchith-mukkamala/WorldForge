import type {DepthPicking} from './depthTerrain';
import type {ArtBounds} from './atlasBuildingArt';
import type {Point} from './motion';

export type RasterCrop={left:number;top:number;width:number;height:number;density:number};
type Size={width:number;height:number};
type Rect=Size&{left:number;top:number};
const PAD=72;
const MAX_PIXELS=1_850_000;

/** Map the actually visible part of a scrolled sheet to native scene pixels. */
export function atlasViewportBounds(size:Size,sheet:Rect,viewport:Rect):ArtBounds|undefined{
  const sx=sheet.width/size.width,sy=sheet.height/size.height;
  if(sx<=0||sy<=0)return;
  const left=Math.max(0,viewport.left-sheet.left)/sx;
  const top=Math.max(0,viewport.top-sheet.top)/sy;
  const right=Math.min(sheet.width,viewport.left+viewport.width-sheet.left)/sx;
  const bottom=Math.min(sheet.height,viewport.top+viewport.height-sheet.top)/sy;
  if(right<=left||bottom<=top)return;
  return {left,top,right,bottom};
}

export function cropBounds({left,top,width,height,density}:RasterCrop):ArtBounds{
  return {left:left/density,top:top/density,right:(left+width)/density,bottom:(top+height)/density};
}

export function closeAtlasCrop(size:Size,sheet:Rect,viewport:Rect,
  pixelRatio:number,baseDensity:number):{crop:RasterCrop;visible:RasterCrop}|undefined{
  const visible=atlasViewportBounds(size,sheet,viewport);
  if(!visible)return;
  const {left,top,right,bottom}=visible,sx=sheet.width/size.width,sy=sheet.height/size.height;
  const x0=Math.max(0,left-PAD/sx),x1=Math.min(size.width,right+PAD/sx);
  const y0=Math.max(0,top-PAD/sy),y1=Math.min(size.height,bottom+PAD/sy);
  const area=(x1-x0)*(y1-y0);
  let density=Math.floor(Math.min(32,Math.min(sx,sy)*Math.min(2,pixelRatio),
    Math.sqrt(MAX_PIXELS/area))*4)/4;

  const rect=(l:number,t:number,r:number,b:number):RasterCrop=>{
    const left=Math.floor(l*density),top=Math.floor(t*density);
    return {left,top,width:Math.ceil(r*density)-left,height:Math.ceil(b*density)-top,density};
  };
  // Integer pixel bounds can put the first estimate just over budget.
  while(density>=baseDensity*1.15){
    const crop=rect(x0,y0,x1,y1);
    if(crop.width*crop.height<=MAX_PIXELS)return {crop,visible:rect(left,top,right,bottom)};
    density-=.25;
  }
}

export function cropContains(outer:RasterCrop,inner:RasterCrop):boolean{
  return outer.density===inner.density&&outer.left<=inner.left&&outer.top<=inner.top&&
    outer.left+outer.width>=inner.left+inner.width&&outer.top+outer.height>=inner.top+inner.height;
}

export function cropTileAt(crop:RasterCrop,hit:DepthPicking,{x,y}:Point):number|undefined{
  const px=Math.floor(x*crop.density)-crop.left,py=Math.floor(y*crop.density)-crop.top;
  if(px<0||py<0||px>=hit.width||py>=hit.height)return;
  return hit.ids[py*hit.width+px]-1;
}
