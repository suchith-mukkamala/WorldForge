/** v2.0 — one projection of the authoritative tile grid, not another world.
 * A compact 2:1 pixel-isometric view shows relative elevation without WebGL.
 */
import type {World} from './engine';
import {SEA_LEVEL} from './topography';

export const DEPTH_TILE_WIDTH=12;
export const DEPTH_TILE_HEIGHT=6;
export const DEPTH_RISE=8;
const MARGIN_X=16,MARGIN_TOP=44,MARGIN_BOTTOM=36;

export function depthCanvasSize(w:Pick<World,'width'|'height'>){
  return {width:(w.width+w.height)*DEPTH_TILE_WIDTH/2+MARGIN_X*2,
    height:(w.width+w.height)*DEPTH_TILE_HEIGHT/2+MARGIN_TOP+MARGIN_BOTTOM};
}
export function projectDepth(w:Pick<World,'width'|'height'>,
  x:number,y:number,elevation:number){
  return {x:(x-y)*DEPTH_TILE_WIDTH/2+w.height*DEPTH_TILE_WIDTH/2+MARGIN_X,
    y:(x+y)*DEPTH_TILE_HEIGHT/2+MARGIN_TOP-
      Math.round((elevation-SEA_LEVEL)/DEPTH_RISE)};
}
/** The hidden picking surface uses an exact 24-bit tile ID, not heuristics
 * that break when the viewer clicks on steep overlapping mountain tiles.
 */
export function tileHitColor(index:number):string{
  const id=index+1;
  return `rgb(${id&255},${id>>>8&255},${id>>>16&255})`;
}
export function tileFromHit(red:number,green:number,blue:number):number{
  return red+(green<<8)+(blue<<16)-1;
}
