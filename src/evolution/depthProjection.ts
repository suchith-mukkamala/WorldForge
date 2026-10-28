/** v2.07 — an orbitable orthographic camera over one authoritative heightfield.
 * Yaw, pitch and relief change only pixels; physics and tile IDs never rotate.
 */
import type {World} from './engine';
import {SEA_LEVEL} from './topography';

export const DEPTH_TILE_WIDTH=12;
export const DEPTH_TILE_HEIGHT=6;
export const DEPTH_RISE=8;
const MARGIN_X=16,MARGIN_BOTTOM=34,SKIRT=18;
export const RELIEF_LEVELS={natural:1,dramatic:2.5,monumental:4} as const;
export type ReliefLevel=keyof typeof RELIEF_LEVELS;
export const CAMERA_PITCHES={low:18,classic:30,high:55} as const;
export type CameraPitch=keyof typeof CAMERA_PITCHES;
export type DepthCamera={yaw:number;pitch:number};
export const DEFAULT_DEPTH_CAMERA:DepthCamera={yaw:0,pitch:30};

type WorldSize=Pick<World,'width'|'height'>;
type Pt={x:number;y:number};
const RAD=Math.PI/180;

/** Project actual square geometry; this projector is shared by terrain,
 * sprites, waterways, highlights and the color-picking surface. */
export function createDepthProjector(w:WorldSize,relief=1,
  camera:DepthCamera=DEFAULT_DEPTH_CAMERA){
  const theta=((camera.yaw%360)+360)%360*RAD;
  const pitch=Math.max(12,Math.min(70,camera.pitch))*RAD;
  const c=Math.cos(theta),s=Math.sin(theta);
  const ground=DEPTH_TILE_WIDTH/2*Math.sin(pitch);
  const horizontal=DEPTH_TILE_WIDTH/2;
  const ux=horizontal*(c-s),vx=-horizontal*(s+c);
  const uy=ground*(s+c),vy=ground*(c-s);
  const vertical=Math.cos(pitch)/Math.cos(30*RAD);
  const corners:[Pt,Pt,Pt,Pt]=[
    {x:-.5,y:-.5},{x:w.width-.5,y:-.5},
    {x:w.width-.5,y:w.height-.5},{x:-.5,y:w.height-.5},
  ];
  const xs=corners.map(p=>p.x*ux+p.y*vx);
  const ys=corners.map(p=>p.x*uy+p.y*vy);
  const minX=Math.min(...xs),maxX=Math.max(...xs);
  const minY=Math.min(...ys),maxY=Math.max(...ys);
  const topMargin=Math.ceil((255-SEA_LEVEL)/DEPTH_RISE*relief*vertical)+20;
  const offsetX=MARGIN_X-minX,offsetY=topMargin-minY;
  const size={width:Math.ceil(maxX-minX+MARGIN_X*2),
    height:Math.ceil(maxY-minY+topMargin+MARGIN_BOTTOM+SKIRT+
      SEA_LEVEL/DEPTH_RISE*relief*vertical)};
  const project=(x:number,y:number,elevation:number):Pt=>({
    x:x*ux+y*vx+offsetX,
    y:x*uy+y*vy+offsetY-
      Math.round((elevation-SEA_LEVEL)/DEPTH_RISE*relief*vertical),
  });
  const tileCorners=(x:number,y:number,elevation:number):[Pt,Pt,Pt,Pt]=>[
    project(x-.5,y-.5,elevation),project(x+.5,y-.5,elevation),
    project(x+.5,y+.5,elevation),project(x-.5,y+.5,elevation),
  ];
  return {project,tileCorners,size,
    frontX:Math.abs(uy)<1e-9?0:Math.sign(uy),
    frontY:Math.abs(vy)<1e-9?0:Math.sign(vy),
    order:(x:number,y:number)=>x*uy+y*vy,
    riseScale:relief*vertical};
}

/** Reserve room for the highest valid peaks and the front-facing earth walls,
 * so changing relief cannot clip the panorama or invalidate click positions. */
export const depthTopMargin=(relief=1,camera:DepthCamera=DEFAULT_DEPTH_CAMERA)=>
  Math.ceil((255-SEA_LEVEL)/DEPTH_RISE*relief*
    Math.cos(Math.max(12,Math.min(70,camera.pitch))*RAD)/Math.cos(30*RAD))+20;

export function depthCanvasSize(w:WorldSize,relief=1,
  camera:DepthCamera=DEFAULT_DEPTH_CAMERA){
  return createDepthProjector(w,relief,camera).size;
}
export function projectDepth(w:Pick<World,'width'|'height'>,
  x:number,y:number,elevation:number,relief=1,
  camera:DepthCamera=DEFAULT_DEPTH_CAMERA){
  return createDepthProjector(w,relief,camera).project(x,y,elevation);
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
