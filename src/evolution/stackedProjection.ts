import {createDepthProjector,DEPTH_RISE,type DepthCamera} from './depthProjection';
import type {World} from './engine';
import type {Point} from './motion';
import {SEA_LEVEL} from './topography';

export const STACKED_CAMERA:DepthCamera={yaw:0,pitch:24};
export const STACKED_RELIEF=2.5;
export const STACKED_SEA=SEA_LEVEL-9;
export const REALM_RISE=8;
type Bounds=Pick<World,'width'|'height'|'worldTree'|'skylands'>;
type Grid=Pick<World,'width'|'height'>;
export type RealmProjection={width:number;height:number;crust:number;blockScale:number;origin:Point;
  east:Point;south:Point;rise:number;frontX:number;frontY:number};

export const realmDepthPoint=(p:RealmProjection,x:number,y:number,height:number):Point=>({
  x:p.origin.x+x*p.east.x+y*p.south.x,
  y:p.origin.y+x*p.east.y+y*p.south.y-height*p.rise,
});

export function stackedProjection(world:Bounds,realm:Grid,camera:DepthCamera,
  maxRealmHeight:number,relief=STACKED_RELIEF){
  const surface=createDepthProjector(world,relief,camera);
  const corners=[[-.5,-.5],[world.width-.5,-.5],
    [world.width-.5,world.height-.5],[-.5,world.height-.5]] as const;
  const footprint=corners.map(([x,y])=>surface.projectSmooth(x,y,STACKED_SEA));
  const depths=corners.map(([x,y])=>surface.order(x,y)),groundStart=Math.min(...depths);
  const nearest=Math.min(...footprint.map(p=>p.y)),furthest=Math.max(...footprint.map(p=>p.y));
  const groundSpan=Math.max(...depths)-groundStart;
  const rise=REALM_RISE*surface.riseScale/DEPTH_RISE,underRise=maxRealmHeight*rise;
  const dx=world.width/realm.width,dy=world.height/realm.height,blockScale=Math.min(dx,dy);
  const headroom=Math.ceil(18+blockScale*24);
  const upperCrust=Math.max(83,Math.round(groundSpan*.142));
  const lowerCrust=Math.max(52,Math.round(groundSpan*.086));
  const lowerTop=Math.ceil(Math.max(surface.size.height,furthest+upperCrust)+34);
  // Separate the plates vertically to expose both faces. X and Y always
  // refer to the same world footprint, regardless of camera orientation.
  const shift=lowerTop+underRise+headroom-nearest;
  const datum=STACKED_SEA-shift*DEPTH_RISE/surface.riseScale;
  const lowerHeight=Math.ceil(groundSpan+underRise+lowerCrust+headroom+16);
  // Lower deck coordinates are local to its canvas, so changes in the
  // reserved space for Surface mountains and skylands do not invalidate it.
  const x=(dx-1)/2,y=(dy-1)/2;
  const offset=surface.projectSmooth(0,0,STACKED_SEA).x;
  const lower:RealmProjection={width:surface.size.width,height:lowerHeight,crust:lowerCrust,blockScale,
    frontX:surface.frontX,frontY:surface.frontY,rise,
    origin:{x:surface.projectSmooth(x,y,STACKED_SEA).x,y:surface.order(x,y)-groundStart+underRise+headroom},
    east:{x:surface.projectSmooth(dx,0,STACKED_SEA).x-offset,y:surface.order(dx,0)},
    south:{x:surface.projectSmooth(0,dy,STACKED_SEA).x-offset,y:surface.order(0,dy)},
  };
  const underneath=(x:number,y:number,height:number)=>realmDepthPoint(lower,x,y,height);
  return {surface,footprint,underneath,upperCrust,lowerCrust,lowerTop,lowerHeight,datum,lower,
    size:{width:surface.size.width,height:lowerTop+lowerHeight}};
}
