/** Form cues drawn with the existing pixels: a light lip on a drop, a dark
 * contact along a rise, and the same grounding shadow buildings already use.
 * Factors only scale a color that is already on the tile.
 */
import type {PlacedArt} from './atlasBuildingArt';
import {atlasBuildingBounds} from './atlasBuildingArt';

export const RIM_LIGHT=1.14;
export const CONTACT_SHADE=.76;
export const SHADOW_COLOR='#192b2370';

export function insetEdge(ax:number,ay:number,bx:number,by:number,
  cx:number,cy:number,amount=1){
  const mx=(ax+bx)/2,my=(ay+by)/2;
  const dx=cx-mx,dy=cy-my;
  const len=Math.hypot(dx,dy)||1;
  const ox=dx/len*amount,oy=dy/len*amount;
  return {ax:ax+ox,ay:ay+oy,bx:bx+ox,by:by+oy};
}

/** Write a 1px segment. When `only` is set, leave pixels that are not that
 * face color so a lip cannot spill onto a neighbor or the sky. */
export function stampSegment(pixels:Uint32Array,width:number,height:number,
  x0:number,y0:number,x1:number,y1:number,color:number,only?:number):void{
  let x=Math.round(x0),y=Math.round(y0);
  const ex=Math.round(x1),ey=Math.round(y1);
  const dx=Math.abs(ex-x),dy=Math.abs(ey-y);
  const sx=x<ex?1:-1,sy=y<ey?1:-1;
  let err=dx-dy;
  for(let guard=0;guard<width+height+4;guard++){
    if(x>=0&&y>=0&&x<width&&y<height){
      const index=y*width+x;
      if(only===undefined||pixels[index]===only)pixels[index]=color;
    }
    if(x===ex&&y===ey)break;
    const doubled=err*2;
    if(doubled>-dy){err-=dy;x+=sx;}
    if(doubled<dx){err+=dx;y+=sy;}
  }
}

/** Sparse static glints. 0 none, 1 a single crest pixel, 2 a two-pixel sparkle.
 * Positions come from the cell, not from the clock, so the terrain cache stays put. */
export function waterCrest(grain:number,x:number,y:number):0|1|2{
  // One candidate in each 8×8 block, so open water reads as scattered crests.
  if((x&7)||(y&7))return 0;
  let n=Math.imul(x+1,0x9e3779b1)^Math.imul(y+3,0x85ebca6b)^grain;
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=(n^(n>>>15))>>>0;
  if(n%113===0)return 2;
  if(n%47===0)return 1;
  return 0;
}

export type ShadowRect={x:number;y:number;w:number;h:number};
export function footShadowRect(bounds:{left:number;top:number;right:number;bottom:number}):
  ShadowRect|undefined{
  if(bounds.bottom-bounds.top<6)return;
  const w=Math.max(2,Math.round((bounds.right-bounds.left)*.42));
  return {x:Math.round((bounds.left+bounds.right)/2-w/2),
    y:Math.round(bounds.bottom)-1,w,h:2};
}

export function paintFootShadow(ctx:CanvasRenderingContext2D,art:PlacedArt):void{
  const rect=footShadowRect(atlasBuildingBounds(art));
  if(!rect)return;
  ctx.fillStyle=SHADOW_COLOR;
  ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
}
