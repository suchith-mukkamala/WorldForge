import {createDepthProjector,DEPTH_RISE,type DepthCamera} from './depthProjection';
import type {World} from './engine';
import {SEA_LEVEL} from './topography';

export const STACKED_CAMERA:DepthCamera={yaw:0,pitch:24};
export const STACKED_RELIEF=2.5;
export const STACKED_SEA=SEA_LEVEL-9;
export const REALM_RISE=8;
type Bounds=Pick<World,'width'|'height'|'worldTree'|'skylands'>;
type Grid=Pick<World,'width'|'height'>;

export function stackedProjection(world:Bounds,realm:Grid,camera:DepthCamera,
  maxRealmHeight:number,relief=STACKED_RELIEF){
  const surface=createDepthProjector(world,relief,camera);
  const corners=[[-.5,-.5],[world.width-.5,-.5],
    [world.width-.5,world.height-.5],[-.5,world.height-.5]] as const;
  const footprint=corners.map(([x,y])=>surface.projectSmooth(x,y,STACKED_SEA));
  const nearest=Math.min(...footprint.map(p=>p.y)),furthest=Math.max(...footprint.map(p=>p.y));
  const groundSpan=furthest-nearest;
  const underRise=maxRealmHeight*REALM_RISE*surface.riseScale/DEPTH_RISE;
  const upperCrust=Math.max(28,Math.round(groundSpan*.08));
  const lowerCrust=Math.max(22,Math.round(groundSpan*.055));
  const lowerTop=Math.ceil(Math.max(surface.size.height,furthest+upperCrust)+34);
  // Separate the plates vertically to expose both faces. X and Y always
  // refer to the same world footprint, regardless of camera orientation.
  const shift=lowerTop+underRise+16-nearest;
  const datum=STACKED_SEA-shift*DEPTH_RISE/surface.riseScale;
  const lowerHeight=Math.ceil(groundSpan+underRise+lowerCrust+32);
  const underneath=(x:number,y:number,height:number)=>{
    const p=surface.projectSmooth((x+.5)*world.width/realm.width-.5,
      (y+.5)*world.height/realm.height-.5,datum+height*REALM_RISE);
    return {x:p.x,y:p.y-lowerTop};
  };
  return {surface,footprint,underneath,upperCrust,lowerCrust,lowerTop,lowerHeight,datum,
    size:{width:surface.size.width,height:lowerTop+lowerHeight}};
}
