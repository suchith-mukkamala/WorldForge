/** v2.06 — one projection of the authoritative tile grid, not another world.
 * Height exaggeration changes only the drawn relief, never physical heights.
 */
import type {World} from './engine';
import {SEA_LEVEL} from './topography';

export const DEPTH_TILE_WIDTH=12;
export const DEPTH_TILE_HEIGHT=6;
export const DEPTH_RISE=8;
const MARGIN_X=16,MARGIN_BOTTOM=34,SKIRT=18;
export const RELIEF_LEVELS={natural:1,dramatic:2.5,monumental:4} as const;
export type ReliefLevel=keyof typeof RELIEF_LEVELS;

/** Reserve room for the highest valid peaks and the front-facing earth walls,
 * so changing relief cannot clip the panorama or invalidate click positions. */
export const depthTopMargin=(relief=1)=>
  Math.ceil((255-SEA_LEVEL)/DEPTH_RISE*relief)+20;

export function depthCanvasSize(w:Pick<World,'width'|'height'>,relief=1){
  return {width:(w.width+w.height)*DEPTH_TILE_WIDTH/2+MARGIN_X*2,
    height:Math.ceil((w.width+w.height)*DEPTH_TILE_HEIGHT/2+
      depthTopMargin(relief)+MARGIN_BOTTOM+SKIRT+
      SEA_LEVEL/DEPTH_RISE*relief)};
}
export function projectDepth(w:Pick<World,'width'|'height'>,
  x:number,y:number,elevation:number,relief=1){
  return {x:(x-y)*DEPTH_TILE_WIDTH/2+w.height*DEPTH_TILE_WIDTH/2+MARGIN_X,
    y:(x+y)*DEPTH_TILE_HEIGHT/2+depthTopMargin(relief)-
      Math.round((elevation-SEA_LEVEL)/DEPTH_RISE*relief)};
}
export const depthDrop=(above:number,below:number,relief:number)=>
  Math.max(0,Math.round((above-below)/DEPTH_RISE*relief));
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
